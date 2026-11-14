from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from app.core.config import Settings
from app.core.errors import ServiceNotConfiguredError
from app.core.logging import redact
from app.integrations.deepseek.client import DeepSeekClient, DeepSeekError
from app.integrations.nasa.horizons import (
    HorizonsClient,
    HorizonsError,
    build_observer_query,
    parse_api_payload,
    parse_observer_table,
)
from app.schemas.analysis import AIMissionReport
from app.services.ai_guard import find_unsupported_numbers

# Fixture shaped like a Horizons CSV observer table (quantity 4). Values are
# illustrative test values, NOT real ephemeris output.
FIXTURE_RESULT = """\
*******************************************************************************
Ephemeris / API_USER
Center geodetic : 194.000000,-89.680000,0.0000000 {E-lon(deg),Lat(deg),Alt(km)}
*******************************************************************************
 Date__(UT)__HR:MN, , ,Azi_(a-app), Elev_(a-app),
***************************************************************
$$SOE
 2026-Dec-01 00:00, , ,  101.123456,   1.234567,
 2026-Dec-01 01:00, , ,  101.623456,   0.934567,
 2026-Dec-01 02:00,*, ,  102.123456,  -0.134567,
$$EOE
*******************************************************************************
"""


def run(coro):  # type: ignore[no-untyped-def]
    return asyncio.run(coro)


def test_query_builder_uses_moon_topocentric_observer() -> None:
    q = build_observer_query(
        target="EARTH",
        latitude_deg=-89.68,
        longitude_deg=-166.0,
        start_utc=datetime(2026, 12, 1, tzinfo=UTC),
        stop_utc=datetime(2026, 12, 2, tzinfo=UTC),
        step_minutes=60,
    )
    assert q["CENTER"] == "'coord@301'"
    assert q["COMMAND"] == "'399'"
    assert q["SITE_COORD"] == "'-166.000000,-89.680000,0.0000'"
    assert q["QUANTITIES"] == "'4'"
    assert q["STEP_SIZE"] == "'60 m'"
    with pytest.raises(ValueError):
        build_observer_query(
            target="SUN",
            latitude_deg=-95,
            longitude_deg=0,
            start_utc=datetime(2026, 12, 1, tzinfo=UTC),
            stop_utc=datetime(2026, 12, 2, tzinfo=UTC),
            step_minutes=60,
        )


def test_parse_observer_table_with_flag_columns() -> None:
    samples = parse_observer_table(FIXTURE_RESULT)
    assert len(samples) == 3
    assert samples[0].time_utc == datetime(2026, 12, 1, 0, 0, tzinfo=UTC)
    assert samples[1].azimuth_deg == pytest.approx(101.623456)
    assert samples[2].elevation_deg == pytest.approx(-0.134567)


def test_parse_errors_are_explicit() -> None:
    with pytest.raises(HorizonsError):
        parse_observer_table("no table here")
    with pytest.raises(HorizonsError):
        parse_api_payload({"error": "Cannot interpret date"})
    with pytest.raises(HorizonsError):
        parse_api_payload({"signature": {"version": "1.2"}})
    broken = FIXTURE_RESULT.replace("101.623456", "abc")
    with pytest.raises(HorizonsError):
        parse_observer_table(broken)


def _client(handler) -> HorizonsClient:  # type: ignore[no-untyped-def]
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return HorizonsClient(http, base_url="https://example.test/api", max_retries=2, backoff_seconds=0)


def test_horizons_client_retries_then_succeeds() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(503)
        return httpx.Response(200, json={"signature": {"version": "1.2"}, "result": FIXTURE_RESULT})

    result = run(
        _client(handler).observer_ephemeris(
            target="SUN",
            latitude_deg=-89.68,
            longitude_deg=-166.0,
            start_utc=datetime(2026, 12, 1, tzinfo=UTC),
            stop_utc=datetime(2026, 12, 1, 2, tzinfo=UTC),
        )
    )
    assert calls["n"] == 3
    assert result.api_version == "1.2" and len(result.samples) == 3


def test_horizons_client_gives_up_on_timeouts() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timeout", request=request)

    with pytest.raises(HorizonsError, match="unavailable after 3 attempts"):
        run(
            _client(handler).observer_ephemeris(
                target="SUN",
                latitude_deg=-89.0,
                longitude_deg=0.0,
                start_utc=datetime(2026, 12, 1, tzinfo=UTC),
                stop_utc=datetime(2026, 12, 2, tzinfo=UTC),
            )
        )


def test_horizons_client_does_not_retry_client_errors() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400, text="bad request")

    with pytest.raises(HorizonsError):
        run(
            _client(handler).observer_ephemeris(
                target="SUN",
                latitude_deg=-89.0,
                longitude_deg=0.0,
                start_utc=datetime(2026, 12, 1, tzinfo=UTC),
                stop_utc=datetime(2026, 12, 2, tzinfo=UTC),
            )
        )
    assert calls["n"] == 1


# ---------------------------------------------------------------- DeepSeek


class FakeCompletions:
    def __init__(self, content: str | Exception) -> None:
        self.content = content
        self.kwargs: dict[str, Any] = {}

    async def create(self, **kwargs: Any) -> Any:
        self.kwargs = kwargs
        if isinstance(self.content, Exception):
            raise self.content
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=self.content))])


def _settings() -> Settings:
    return Settings(_env_file=None, DEEPSEEK_API_KEY=None)  # type: ignore[call-arg]


def test_deepseek_not_configured_raises_clear_error() -> None:
    client = DeepSeekClient(_settings())
    assert client.configured is False
    with pytest.raises(ServiceNotConfiguredError):
        run(client.generate_report({}, "en"))


def test_deepseek_valid_json_is_validated() -> None:
    report = {"summary": "Site A has more sunlight.", "key_findings": ["Sun 62.5%"]}
    fake = FakeCompletions(json.dumps(report))
    out = run(DeepSeekClient(_settings(), completions=fake).generate_report({"x": 62.5}, "tr"))
    assert out.report.summary.startswith("Site A")
    assert fake.kwargs["response_format"] == {"type": "json_object"}
    assert "Türkçe" in fake.kwargs["messages"][1]["content"]


@pytest.mark.parametrize("content", ["not json", json.dumps({"key_findings": []}), RuntimeError("boom")])
def test_deepseek_failures_are_normalised(content: str | Exception) -> None:
    with pytest.raises(DeepSeekError):
        run(DeepSeekClient(_settings(), completions=FakeCompletions(content)).generate_report({}, "en"))


def test_deepseek_empty_content_is_rejected() -> None:
    with pytest.raises(DeepSeekError):
        run(DeepSeekClient(_settings(), completions=FakeCompletions("")).generate_report({}, "en"))


def test_ai_guard_flags_invented_numbers() -> None:
    analysis = {"sites": [{"metrics": {"sun_visibility_pct": 62.534, "longest_darkness_hours": 41.0}}]}
    report = AIMissionReport(
        summary="Site A sees the Sun 62.5% of the time; darkness lasts 41 hours, unlike 87.2% at B.",
        key_findings=["2 sites compared"],
    )
    assert find_unsupported_numbers(report, analysis) == ["87.2"]


def test_secret_redaction() -> None:
    assert "sk-abcdef123456" not in redact("key sk-abcdef123456 used")
    assert "secret-token" not in redact("Authorization: Bearer secret-token")
    assert "zzz" not in redact('api_key="zzz"')


@pytest.mark.live
def test_live_horizons_sun_elevation_at_south_pole() -> None:
    """Calls the real JPL Horizons API. Run explicitly: pytest -m live"""

    async def go():  # type: ignore[no-untyped-def]
        async with httpx.AsyncClient(timeout=60) as http:
            client = HorizonsClient(http, base_url="https://ssd.jpl.nasa.gov/api/horizons.api")
            return await client.observer_ephemeris(
                target="SUN",
                latitude_deg=-89.68,
                longitude_deg=-166.0,
                start_utc=datetime(2026, 12, 1, tzinfo=UTC),
                stop_utc=datetime(2026, 12, 2, tzinfo=UTC),
                step_minutes=360,
            )

    result = run(go())
    assert len(result.samples) == 5
    # At ~89.7°S the Sun can only graze the horizon: |elevation| stays small.
    assert all(abs(s.elevation_deg) < 3.0 for s in result.samples)


# Real JPL Horizons responses captured 2026-11-14 (see tests/fixtures/README.md).
FIXTURES = __import__("pathlib").Path(__file__).parent / "fixtures"


@pytest.mark.parametrize(
    ("name", "first_az", "first_el"),
    [
        ("horizons_sun_shackleton_a_2026-12-01.json", 86.072059, 1.492078),
        ("horizons_earth_shackleton_a_2026-12-01.json", 172.668454, -1.927529),
    ],
)
def test_parse_real_horizons_fixture(name: str, first_az: float, first_el: float) -> None:
    payload = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
    samples, version = parse_api_payload(payload)
    assert version == "1.2"
    assert len(samples) == 5
    assert samples[0].time_utc == datetime(2026, 12, 1, tzinfo=UTC)
    assert samples[0].azimuth_deg == pytest.approx(first_az)
    assert samples[0].elevation_deg == pytest.approx(first_el)
    assert "MEAN_ME" in payload["result"]  # lunar body-fixed frame used by Horizons
