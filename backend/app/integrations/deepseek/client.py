"""DeepSeek client (OpenAI-compatible API).

Secrets come only from backend settings. If no key is configured the client
reports NOT_CONFIGURED and every call raises ``ServiceNotConfiguredError`` —
the scientific pipeline is unaffected.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import ExternalServiceError, ServiceNotConfiguredError
from app.integrations.deepseek.prompts import SYSTEM_PROMPT, build_user_message
from app.schemas.analysis import AIMissionReport

logger = logging.getLogger("selenora.deepseek")

MAX_OUTPUT_TOKENS = 2048


class DeepSeekError(ExternalServiceError):
    code = "AI_PROVIDER_ERROR"


class ChatCompletionsBackend(Protocol):
    """Minimal surface we use from the OpenAI SDK (eases test doubles)."""

    async def create(self, **kwargs: Any) -> Any: ...


@dataclass(frozen=True, slots=True)
class GeneratedReport:
    report: AIMissionReport
    model: str
    token_usage: dict[str, int] | None


class DeepSeekClient:
    def __init__(self, settings: Settings, completions: ChatCompletionsBackend | None = None) -> None:
        self._settings = settings
        self._completions = completions
        self._sdk = None
        if completions is None and settings.deepseek_configured:
            from openai import AsyncOpenAI

            self._sdk = AsyncOpenAI(
                api_key=settings.deepseek_api_key.get_secret_value(),  # type: ignore[union-attr]
                base_url=settings.deepseek_base_url,
                timeout=settings.deepseek_timeout_seconds,
                max_retries=2,
            )
            self._completions = self._sdk.chat.completions

    @property
    def configured(self) -> bool:
        return self._completions is not None

    @property
    def model(self) -> str:
        return self._settings.deepseek_model

    async def list_model_ids(self) -> list[str]:
        """Optional live check against GET /models (never logs secrets)."""
        if self._sdk is None:
            raise ServiceNotConfiguredError("DEEPSEEK_API_KEY not set.")
        try:
            page = await self._sdk.models.list()
            return [m.id for m in page.data]
        except Exception as exc:
            logger.warning("deepseek_models_failed", extra={"error_type": type(exc).__name__})
            raise DeepSeekError(f"Failed to list models ({type(exc).__name__}).") from exc

    async def generate_report(
        self, evidence: dict[str, Any], language: Literal["en", "tr"]
    ) -> GeneratedReport:
        if self._completions is None:
            raise ServiceNotConfiguredError(
                "AI explanation is not configured (DEEPSEEK_API_KEY missing). "
                "Scientific results remain available."
            )
        try:
            response = await self._completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": build_user_message(evidence, language)},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
                max_tokens=MAX_OUTPUT_TOKENS,
                extra_body={"thinking": {"type": "disabled"}},
            )
        except TypeError:
            # Older SDK doubles / fakes may not accept extra_body / max_tokens.
            try:
                response = await self._completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": build_user_message(evidence, language)},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=MAX_OUTPUT_TOKENS,
                )
            except Exception as exc:
                logger.warning("deepseek_call_failed", extra={"error_type": type(exc).__name__})
                raise DeepSeekError(f"AI provider request failed ({type(exc).__name__}).") from exc
        except Exception as exc:
            logger.warning("deepseek_call_failed", extra={"error_type": type(exc).__name__})
            raise DeepSeekError(f"AI provider request failed ({type(exc).__name__}).") from exc

        try:
            content = response.choices[0].message.content or ""
            if not content.strip():
                raise DeepSeekError("AI provider returned empty content.")
            report = AIMissionReport.model_validate(json.loads(content))
        except DeepSeekError:
            raise
        except (json.JSONDecodeError, ValidationError, IndexError, AttributeError, TypeError) as exc:
            raise DeepSeekError("AI provider returned an invalid structured report.") from exc

        usage = None
        raw_usage = getattr(response, "usage", None)
        if raw_usage is not None:
            usage = {
                "prompt_tokens": int(getattr(raw_usage, "prompt_tokens", 0) or 0),
                "completion_tokens": int(getattr(raw_usage, "completion_tokens", 0) or 0),
                "total_tokens": int(getattr(raw_usage, "total_tokens", 0) or 0),
            }
            logger.info(
                "deepseek_usage",
                extra={"model": self.model, "total_tokens": usage["total_tokens"]},
            )

        return GeneratedReport(report=report, model=self.model, token_usage=usage)
