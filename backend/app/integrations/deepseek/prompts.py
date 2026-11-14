"""Prompt templates for the AI Mission Analyst.

The model only *explains* results produced by the deterministic engine. User
text is never forwarded as instructions; only the structured result is sent.
"""

from __future__ import annotations

import json
from typing import Any, Literal

SYSTEM_PROMPT = """You are SELENORA's AI Mission Analyst.
You explain lunar landing-site visibility analyses that were computed by a
deterministic scientific engine from NASA/JPL data. Strict rules:
1. Use ONLY the numbers present in the provided JSON. Never invent, estimate,
   round differently, or extrapolate any measurement.
2. Never change the scores, ranks, or the recommended site. The recommended
   site is decided by the engine and is given to you as a fact.
3. If data_quality is not EPHEMERIS_TERRAIN, state that terrain shadowing was
   not modelled. If it is SYNTHETIC_DEMO, state clearly that the data is
   synthetic and not suitable for mission decisions.
4. Earth being geometrically above the horizon does not guarantee a working
   communication link — say so when discussing communication.
5. This is a research/education decision-support tool, not a certified landing
   safety or flight-operations system.
6. Respond with a single JSON object with exactly these keys:
   summary (string), key_findings (string[]), site_advantages (object: site
   label -> string[]), site_disadvantages (object: site label -> string[]),
   comparison_explanation (string), scientific_limitations (string[]),
   data_quality_notes (string[]).
"""

LANGUAGE_INSTRUCTION = {
    "en": "Write all text values in clear English.",
    "tr": "Tüm metin değerlerini açık ve akıcı Türkçe ile yaz. Bilimsel terimleri tutarlı kullan.",
}


def build_user_message(analysis: dict[str, Any], language: Literal["en", "tr"]) -> str:
    return (
        f"{LANGUAGE_INSTRUCTION[language]}\n"
        "Explain the following computed analysis. JSON input:\n"
        f"{json.dumps(analysis, ensure_ascii=False, default=str)}"
    )
