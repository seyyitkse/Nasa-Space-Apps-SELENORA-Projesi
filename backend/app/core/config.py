"""Centralised configuration loaded from environment variables / `.env`.

Secrets are held as `SecretStr` so they never appear in logs or reprs.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]

# Versions recorded in every result and in cache keys (scientific reproducibility).
ALGORITHM_VERSION = "0.1.0-phase1"
API_VERSION = "v1"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        env_prefix="SELENORA_",
        extra="ignore",
    )

    app_name: str = "SELENORA API"
    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    database_url: str = f"sqlite:///{(BACKEND_ROOT / 'data' / 'selenora.db').as_posix()}"
    rate_limit_per_minute: int = Field(default=120, ge=1)

    horizons_base_url: str = "https://ssd.jpl.nasa.gov/api/horizons.api"
    horizons_timeout_seconds: float = Field(default=30.0, gt=0)
    horizons_max_retries: int = Field(default=3, ge=0, le=6)

    # DeepSeek variables intentionally use their conventional names (no prefix).
    deepseek_api_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("DEEPSEEK_API_KEY")
    )
    deepseek_base_url: str = Field(
        default="https://api.deepseek.com", validation_alias=AliasChoices("DEEPSEEK_BASE_URL")
    )
    deepseek_model: str = Field(
        default="deepseek-flash", validation_alias=AliasChoices("DEEPSEEK_MODEL")
    )
    deepseek_timeout_seconds: float = Field(
        default=60.0, gt=0, validation_alias=AliasChoices("DEEPSEEK_TIMEOUT_SECONDS")
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [o.strip() for o in value.split(",") if o.strip()]
        return value

    @field_validator("cors_origins")
    @classmethod
    def _no_wildcard(cls, value: list[str]) -> list[str]:
        if "*" in value:
            raise ValueError("Wildcard CORS origin is not allowed; list explicit origins.")
        return value

    @property
    def deepseek_configured(self) -> bool:
        return bool(self.deepseek_api_key and self.deepseek_api_key.get_secret_value().strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
