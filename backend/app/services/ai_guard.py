"""Guards that keep the AI layer explanatory-only.

``find_unsupported_numbers`` flags any number in AI text that does not appear
(at some reasonable rounding) in the computed analysis. Flagged reports are
returned with the list so the UI can warn, or rejected by policy.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any

from app.schemas.analysis import AIMissionReport

_NUMBER = re.compile(r"(?<![\w.])-?\d+(?:[.,]\d+)?")
# Small integers (counts, ordinals, "Site 2") are not treated as measurements.
_TRIVIAL_MAX = 10


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
        for digits in (0, 1, 2, 3):
            allowed.add(f"{round(v, digits):.{digits}f}")
            allowed.add(f"{round(abs(v), digits):.{digits}f}")
    return allowed


def _report_text(report: AIMissionReport) -> list[str]:
    parts = [report.summary, report.comparison_explanation]
    parts += report.key_findings + report.scientific_limitations + report.data_quality_notes
    for items in list(report.site_advantages.values()) + list(report.site_disadvantages.values()):
        parts += items
    return parts


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
