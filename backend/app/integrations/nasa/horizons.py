"""JPL Horizons API client (topocentric observer on the lunar surface).

Reference: https://ssd-api.jpl.nasa.gov/doc/horizons.html

Observer definition
-------------------
* ``CENTER='coord@301'`` — a surface site on body 301 (Moon).
* ``COORD_TYPE='GEODETIC'``, ``SITE_COORD='<E-lon>,<lat>,<alt_km>'`` — the Moon
  rotates prograde, so Horizons expects **east-positive** longitude in degrees.
  SELENORA stores longitude in -180..180 east-positive and passes it as-is.
* Targets: ``'10'`` = Sun, ``'399'`` = Earth.
* ``QUANTITIES='4'`` — apparent azimuth & elevation (Horizons applies no
  atmospheric refraction for an airless observer). Azimuth is measured
  clockwise from local north; elevation is relative to the local *geometric*
  (smooth reference-surface) horizon — terrain is NOT considered.
* Time scale of the returned table: UT (``Date__(UT)__HR:MN``).

The parsing functions are pure and unit-tested against fixtures; the network
layer adds timeout, bounded retries with exponential back-off and clear errors.

Verified against the live API (2026-11-14, API v1.2): Horizons reports
``Center pole/equ : MEAN_ME (high precision)`` and a spherical Moon of radius
1737.4 km for ``coord@301`` sites; ephemerides come from DE441. A west
longitude such as -166.0 is echoed as 194.0 E. The column headers are
``Azi_(a-app)`` / ``Elev_(a-app)`` (airless apparent, deg).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

import httpx

from app.core.errors import ExternalServiceError

logger = logging.getLogger("selenora.horizons")

TargetBody = Literal["SUN", "EARTH"]
TARGET_IDS: dict[TargetBody, str] = {"SUN": "10", "EARTH": "399"}
MOON_ID = "301"

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class HorizonsError(ExternalServiceError):
    code = "HORIZONS_ERROR"


@dataclass(frozen=True, slots=True)
class EphemerisSample:
    time_utc: datetime
    azimuth_deg: float
    elevation_deg: float


@dataclass(frozen=True, slots=True)
class EphemerisResult:
    target: TargetBody
    latitude_deg: float
    longitude_deg: float
    samples: list[EphemerisSample]
    api_version: str | None
    retrieved_at: datetime


def build_observer_query(
    *,
    target: TargetBody,
    latitude_deg: float,
    longitude_deg: float,
    start_utc: datetime,
    stop_utc: datetime,
    step_minutes: int,
    altitude_km: float = 0.0,
) -> dict[str, str]:
    """Build Horizons API query parameters (values are quoted as Horizons expects)."""
    if not -90 <= latitude_deg <= 90:
        raise ValueError("latitude_deg out of range")
    if not -180 <= longitude_deg <= 180:
        raise ValueError("longitude_deg out of range")
    if stop_utc <= start_utc:
        raise ValueError("stop_utc must be after start_utc")
    if step_minutes < 1:
        raise ValueError("step_minutes must be >= 1")

    def fmt(dt: datetime) -> str:
        return dt.astimezone(UTC).strftime("%Y-%m-%d %H:%M")

    def q(value: str) -> str:
        return f"'{value}'"

    return {
        "format": "json",
        "COMMAND": q(TARGET_IDS[target]),
        "OBJ_DATA": q("NO"),
        "MAKE_EPHEM": q("YES"),
        "EPHEM_TYPE": q("OBSERVER"),
        "CENTER": q(f"coord@{MOON_ID}"),
        "COORD_TYPE": q("GEODETIC"),
        "SITE_COORD": q(f"{longitude_deg:.6f},{latitude_deg:.6f},{altitude_km:.4f}"),
        "START_TIME": q(fmt(start_utc)),
        "STOP_TIME": q(fmt(stop_utc)),
        "STEP_SIZE": q(f"{step_minutes} m"),
        "QUANTITIES": q("4"),
        "ANG_FORMAT": q("DEG"),
        "CSV_FORMAT": q("YES"),
        "TIME_DIGITS": q("MINUTES"),
    }


def _parse_time(text: str) -> datetime:
    text = text.strip()
    for fmt in ("%Y-%b-%d %H:%M", "%Y-%b-%d %H:%M:%S", "%Y-%b-%d %H:%M:%S.%f"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    raise HorizonsError(f"Unrecognised Horizons timestamp: {text!r}")


def parse_observer_table(result_text: str) -> list[EphemerisSample]:
    """Parse the CSV ephemeris table embedded in Horizons' ``result`` string.

    Column positions are taken from the header line immediately preceding the
    ``$$SOE`` marker, so extra flag columns (solar/lunar presence) are handled.
    """
    lines = result_text.splitlines()
    try:
        soe = next(i for i, line in enumerate(lines) if line.strip() == "$$SOE")
        eoe = next(i for i, line in enumerate(lines) if line.strip() == "$$EOE")
    except StopIteration as exc:
        raise HorizonsError("Horizons response does not contain an ephemeris table ($$SOE/$$EOE).") from exc

    header_line = next(
        (lines[i] for i in range(soe - 1, -1, -1) if "Date" in lines[i] and "," in lines[i]),
        None,
    )
    if header_line is None:
        raise HorizonsError("Horizons ephemeris header line not found.")
    headers = [h.strip() for h in header_line.split(",")]
    try:
        az_idx = next(i for i, h in enumerate(headers) if h.lower().startswith("azi"))
        el_idx = next(i for i, h in enumerate(headers) if h.lower().startswith("elev"))
    except StopIteration as exc:
        raise HorizonsError(f"Azimuth/Elevation columns not found in header: {headers}") from exc

    samples: list[EphemerisSample] = []
    for raw in lines[soe + 1 : eoe]:
        if not raw.strip():
            continue
        cells = [c.strip() for c in raw.split(",")]
        try:
            samples.append(
                EphemerisSample(
                    time_utc=_parse_time(cells[0]),
                    azimuth_deg=float(cells[az_idx]),
                    elevation_deg=float(cells[el_idx]),
                )
            )
        except (IndexError, ValueError) as exc:
            raise HorizonsError(f"Malformed Horizons ephemeris row: {raw!r}") from exc
    if not samples:
        raise HorizonsError("Horizons returned an empty ephemeris table.")
    return samples


def parse_api_payload(payload: dict[str, Any]) -> tuple[list[EphemerisSample], str | None]:
    if "error" in payload:
        raise HorizonsError(f"Horizons API error: {payload['error']}")
    result = payload.get("result")
    if not isinstance(result, str):
        raise HorizonsError("Horizons response missing 'result' text.")
    version = (payload.get("signature") or {}).get("version")
    return parse_observer_table(result), version


class HorizonsClient:
    """Async client. Inject a shared ``httpx.AsyncClient`` for connection pooling."""

    def __init__(
        self,
        http: httpx.AsyncClient,
        *,
        base_url: str,
        max_retries: int = 3,
        backoff_seconds: float = 0.75,
    ) -> None:
        self._http = http
        self._base_url = base_url
        self._max_retries = max_retries
        self._backoff = backoff_seconds

    async def _get(self, params: dict[str, str]) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(self._max_retries + 1):
            try:
                response = await self._http.get(self._base_url, params=params)
                if response.status_code in _RETRYABLE_STATUS:
                    last_error = HorizonsError(f"Horizons HTTP {response.status_code}")
                elif response.status_code >= 400:
                    raise HorizonsError(
                        f"Horizons HTTP {response.status_code}",
                        details={"body": response.text[:500]},
                    )
                else:
                    return response.json()
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_error = exc
            except ValueError as exc:  # invalid JSON
                raise HorizonsError("Horizons returned invalid JSON.") from exc
            if attempt < self._max_retries:
                delay = self._backoff * (2**attempt)
                logger.warning(
                    "horizons_retry", extra={"attempt": attempt + 1, "delay_s": delay, "error": str(last_error)}
                )
                await asyncio.sleep(delay)
        raise HorizonsError(
            f"JPL Horizons unavailable after {self._max_retries + 1} attempts: {last_error}"
        )

    async def observer_ephemeris(
        self,
        *,
        target: TargetBody,
        latitude_deg: float,
        longitude_deg: float,
        start_utc: datetime,
        stop_utc: datetime,
        step_minutes: int = 60,
    ) -> EphemerisResult:
        params = build_observer_query(
            target=target,
            latitude_deg=latitude_deg,
            longitude_deg=longitude_deg,
            start_utc=start_utc,
            stop_utc=stop_utc,
            step_minutes=step_minutes,
        )
        payload = await self._get(params)
        samples, version = parse_api_payload(payload)
        return EphemerisResult(
            target=target,
            latitude_deg=latitude_deg,
            longitude_deg=longitude_deg,
            samples=samples,
            api_version=version,
            retrieved_at=datetime.now(UTC),
        )
