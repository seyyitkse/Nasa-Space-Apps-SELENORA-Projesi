"""AI Mission Analyst orchestration — explain stored analyses via DeepSeek."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import AI_PROMPT_VERSION
from app.core.errors import NotFoundError, ServiceNotConfiguredError
from app.integrations.deepseek.client import DeepSeekClient, DeepSeekError
from app.models.analysis import AIReport, MissionAnalysis
from app.schemas.analysis import AnalysisResult, ExplainRequest, ExplainResponse
from app.services import analysis_service
from app.services.ai_guard import find_unsupported_numbers, ranking_contradicts
from app.services.evidence_package import ALLOWED_QUALITIES_FOR_EXPLAIN, build_evidence_package

logger = logging.getLogger("selenora.explain")

# Soft policy: warn in response; hard-reject only when ranking contradicts.
MAX_UNSUPPORTED_SOFT = 8


def _explain_cache_key(
    *,
    analysis_id: str,
    language: str,
    model: str,
    prompt_version: str,
    evidence: dict,
) -> str:
    content = json.dumps(
        {
            "analysis_id": analysis_id,
            "language": language,
            "model": model,
            "prompt_version": prompt_version,
            "evidence": evidence,
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    ).encode()
    return hashlib.sha256(content).hexdigest()


def _require_completed(row: MissionAnalysis) -> AnalysisResult:
    if row.status != "COMPLETED" or not row.result_json:
        raise NotFoundError(
            f"Analysis '{row.id}' is not available for explanation "
            f"(status={row.status}). Complete a scientific analysis first."
        )
    result = analysis_service.load_result(row)
    if result.data_quality not in ALLOWED_QUALITIES_FOR_EXPLAIN:
        raise NotFoundError(
            f"Analysis '{row.id}' has data_quality={result.data_quality} and cannot be explained."
        )
    return result


def _to_response(
    *,
    analysis_id: str,
    language: Literal["en", "tr"],
    model: str,
    recommended: str | None,
    report_dict: dict,
    unsupported: list[str],
    generated_at: datetime,
    cached: bool,
) -> ExplainResponse:
    from app.schemas.analysis import AIMissionReport

    return ExplainResponse(
        analysis_id=analysis_id,
        language=language,
        model=model,
        prompt_version=AI_PROMPT_VERSION,
        recommended_site_label=recommended,
        report=AIMissionReport.model_validate(report_dict),
        unsupported_numbers=unsupported,
        cached=cached,
        generated_at=generated_at,
    )


async def explain_analysis(
    session: Session,
    client: DeepSeekClient,
    analysis_id: str,
    body: ExplainRequest,
) -> ExplainResponse:
    row = session.get(MissionAnalysis, analysis_id)
    if row is None:
        raise NotFoundError(f"Analysis '{analysis_id}' not found.")
    result = _require_completed(row)
    evidence = build_evidence_package(result)
    cache_key = _explain_cache_key(
        analysis_id=analysis_id,
        language=body.language,
        model=client.model if client.configured else "unconfigured",
        prompt_version=AI_PROMPT_VERSION,
        evidence=evidence,
    )

    if not body.regenerate:
        existing = session.scalars(
            select(AIReport)
            .where(AIReport.cache_key == cache_key)
            .order_by(AIReport.created_at.desc())
        ).first()
        if existing is not None:
            return _to_response(
                analysis_id=analysis_id,
                language=body.language,  # type: ignore[arg-type]
                model=existing.model,
                recommended=result.recommended_site_label,
                report_dict=existing.report,
                unsupported=list(existing.unsupported_numbers or []),
                generated_at=existing.created_at,
                cached=True,
            )

    if not client.configured:
        raise ServiceNotConfiguredError(
            "AI explanation is not configured (DEEPSEEK_API_KEY missing). "
            "Scientific results remain available."
        )

    generated = await client.generate_report(evidence, body.language)
    report = generated.report

    if ranking_contradicts(report, result.recommended_site_label):
        raise DeepSeekError(
            "AI report contradicted the deterministic recommendation and was rejected. "
            "Scientific results were not modified."
        )

    unsupported = find_unsupported_numbers(report, evidence)
    if len(unsupported) > MAX_UNSUPPORTED_SOFT:
        raise DeepSeekError(
            "AI report contained too many unsupported numeric claims and was rejected. "
            "Scientific results were not modified.",
            details={"unsupported_numbers": unsupported},
        )

    now = datetime.now(UTC)
    row_ai = AIReport(
        analysis_id=analysis_id,
        language=body.language,
        model=generated.model,
        report=report.model_dump(),
        prompt_version=AI_PROMPT_VERSION,
        unsupported_numbers=unsupported,
        cache_key=cache_key,
        token_usage=generated.token_usage,
        created_at=now,
    )
    session.add(row_ai)
    session.commit()
    logger.info(
        "ai_report_stored",
        extra={
            "analysis_id": analysis_id,
            "language": body.language,
            "unsupported": len(unsupported),
            "tokens": (generated.token_usage or {}).get("total_tokens"),
        },
    )
    return _to_response(
        analysis_id=analysis_id,
        language=body.language,
        model=generated.model,
        recommended=result.recommended_site_label,
        report_dict=report.model_dump(),
        unsupported=unsupported,
        generated_at=now,
        cached=False,
    )


def get_latest_explanation(
    session: Session, analysis_id: str, language: Literal["en", "tr"] | None = None
) -> ExplainResponse | None:
    row = session.get(MissionAnalysis, analysis_id)
    if row is None or row.status != "COMPLETED" or not row.result_json:
        return None
    result = analysis_service.load_result(row)
    q = select(AIReport).where(AIReport.analysis_id == analysis_id)
    if language:
        q = q.where(AIReport.language == language)
    existing = session.scalars(q.order_by(AIReport.created_at.desc())).first()
    if existing is None:
        return None
    return _to_response(
        analysis_id=analysis_id,
        language=existing.language,  # type: ignore[arg-type]
        model=existing.model,
        recommended=result.recommended_site_label,
        report_dict=existing.report,
        unsupported=list(existing.unsupported_numbers or []),
        generated_at=existing.created_at,
        cached=True,
    )
