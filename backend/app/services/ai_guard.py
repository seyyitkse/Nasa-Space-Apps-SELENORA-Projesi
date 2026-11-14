"""Guards that keep the AI layer explanatory-only.

``find_unsupported_numbers`` flags any number in AI text that does not appear
(at some reasonable rounding) in the computed analysis. ``ranking_contradicts``
rejects reports that name a different winner than the deterministic engine.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any

from app.schemas.analysis import AIMissionReport

_NUMBER = re.compile(r"(?<![\w.])-?\d+(?:[.,]\d+)?")
# ISO-8601 datetimes in AI prose (provenance copy) are not numeric claims.
_ISO_DT = re.compile(
    r"\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?"
)
# Small integers (counts, ordinals, "Site 2") are not treated as measurements.
_TRIVIAL_MAX = 10

# EN + TR phrases that assert a preferred / recommended site.
_RECOMMEND_PREFIX = re.compile(
    r"(?:"
    r"recommend(?:s|ed)?|"
    r"recommendation|"
    r"preferred\s+site|"
    r"best\s+site|"
    r"ranks?\s*#?\s*1|"
    r"rank\s*1|"
    r"first\s+place|"
    r"öner(?:i(?:len)?|iyor|ir)|"
    r"tavsiye\s+edi(?:len|yoruz|yor)|"
    r"tercih\s+edi(?:len|yoruz)|"
    r"birinci|"
    r"en\s+uygun|"
    r"kazanan"
    r")\s*[:\-]?\s*",
    flags=re.IGNORECASE,
)


def _walk_numbers(obj: Any) -> Iterable[float]:
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        yield float(obj)
    elif isinstance(obj, str):
        for m in _NUMBER.findall(obj):
            yield float(m.replace(",", "."))
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _walk_numbers(v)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            yield from _walk_numbers(v)


def _allowed_forms(values: Iterable[float]) -> set[str]:
    allowed: set[str] = set()
    for v in values:
        for digits in range(0, 7):
            allowed.add(f"{round(v, digits):.{digits}f}")
            allowed.add(f"{round(abs(v), digits):.{digits}f}")
    return allowed


def _report_text(report: AIMissionReport) -> list[str]:
    parts = [report.summary, report.comparison_explanation]
    parts += report.key_findings + report.scientific_limitations + report.data_quality_notes
    parts += list(report.mission_tradeoffs)
    for items in list(report.site_advantages.values()) + list(report.site_disadvantages.values()):
        parts += items
    # Drop ISO timestamps so fractional seconds are not treated as measurements.
    return [_ISO_DT.sub(" ", p) for p in parts]


def find_unsupported_numbers(report: AIMissionReport, analysis: dict[str, Any]) -> list[str]:
    allowed = _allowed_forms(_walk_numbers(analysis))
    unsupported: list[str] = []
    for text in _report_text(report):
        for raw in _NUMBER.findall(text):
            normalized = raw.replace(",", ".")
            value = float(normalized)
            if value.is_integer() and abs(value) <= _TRIVIAL_MAX:
                continue
            decimals = len(normalized.split(".")[1]) if "." in normalized else 0
            if f"{abs(value):.{decimals}f}" not in allowed and raw not in unsupported:
                unsupported.append(raw)
    return unsupported


def ranking_contradicts(report: AIMissionReport, recommended_site_label: str | None) -> bool:
    """True if the AI text clearly asserts a different single winner.

    Tie / no-recommendation cases (`recommended_site_label is None`) never contradict.
    Mentions of another site without a recommend/prefer phrase are allowed.
    """
    if not recommended_site_label:
        return False
    blob = " ".join(_report_text(report))
    winner = recommended_site_label
    other_labels = {
        k
        for k in list(report.site_advantages) + list(report.site_disadvantages)
        if k.casefold() != winner.casefold()
    }
    # Also scan free text for known other labels if advantages empty.
    if not other_labels:
        return False

    winner_asserted = bool(
        re.search(_RECOMMEND_PREFIX.pattern + re.escape(winner), blob, flags=re.IGNORECASE)
    )
    for other in other_labels:
        if re.search(_RECOMMEND_PREFIX.pattern + re.escape(other), blob, flags=re.IGNORECASE):
            if not winner_asserted:
                return True
    return False
