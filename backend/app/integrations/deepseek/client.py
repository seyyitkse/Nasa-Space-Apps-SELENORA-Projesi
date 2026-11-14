"""DeepSeek client (OpenAI-compatible API).

Secrets come only from backend settings. If no key is configured the client
reports NOT_CONFIGURED and every call raises ``ServiceNotConfiguredError`` —
the scientific pipeline is unaffected.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Literal, Protocol

from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import ExternalServiceError, ServiceNotConfiguredError
from app.integrations.deepseek.prompts import SYSTEM_PROMPT, build_user_message
from app.schemas.analysis import AIMissionReport

logger = logging.getLogger("selenora.deepseek")


class DeepSeekError(ExternalServiceError):
    code = "AI_PROVIDER_ERROR"


class ChatCompletionsBackend(Protocol):
    """Minimal surface we use from the OpenAI SDK (eases test doubles)."""

    async def create(self, **kwargs: Any) -> Any: ...


class DeepSeekClient:
    def __init__(self, settings: Settings, completions: ChatCompletionsBackend | None = None) -> None:
        self._settings = settings
        self._completions = completions
        if completions is None and settings.deepseek_configured:
            from openai import AsyncOpenAI

            sdk = AsyncOpenAI(
                api_key=settings.deepseek_api_key.get_secret_value(),  # type: ignore[union-attr]
                base_url=settings.deepseek_base_url,
                timeout=settings.deepseek_timeout_seconds,
                max_retries=2,
            )
            self._completions = sdk.chat.completions

    @property
    def configured(self) -> bool:
        return self._completions is not None

    @property
    def model(self) -> str:
        return self._settings.deepseek_model

    async def generate_report(
        self, analysis: dict[str, Any], language: Literal["en", "tr"]
    ) -> AIMissionReport:
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
                    {"role": "user", "content": build_user_message(analysis, language)},
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
            )
        except Exception as exc:  # SDK raises many types; normalise them.
            logger.warning("deepseek_call_failed", extra={"error_type": type(exc).__name__})
            raise DeepSeekError(f"AI provider request failed ({type(exc).__name__}).") from exc

        try:
            content = response.choices[0].message.content or ""
            return AIMissionReport.model_validate(json.loads(content))
        except (json.JSONDecodeError, ValidationError, IndexError, AttributeError) as exc:
            raise DeepSeekError("AI provider returned an invalid structured report.") from exc
