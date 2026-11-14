"""Structured (JSON-lines) logging with secret redaction."""

from __future__ import annotations

import json
import logging
import re
import sys
from datetime import UTC, datetime

_SECRET_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"sk-[A-Za-z0-9_\-]{8,}"), "sk-***REDACTED***"),
    (re.compile(r"(?i)(authorization:\s*bearer\s+)[^\s\"']+"), r"\1***REDACTED***"),
    (re.compile(r"(?i)(api[_-]?key[\"'=:\s]+)[^\s\"',}]+"), r"\1***REDACTED***"),
]


def redact(text: str) -> str:
    """Mask anything that looks like an API key / bearer token."""
    for pattern, replacement in _SECRET_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


class JsonFormatter(logging.Formatter):
    _RESERVED = set(vars(logging.LogRecord("", 0, "", 0, "", None, None)).keys()) | {"message"}

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": redact(record.getMessage()),
        }
        for key, value in record.__dict__.items():
            if key not in self._RESERVED and not key.startswith("_"):
                payload[key] = redact(str(value)) if isinstance(value, str) else value
        if record.exc_info:
            payload["exc"] = redact(self.formatException(record.exc_info))
        return json.dumps(payload, default=str, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # Avoid httpx logging full request URLs at INFO (could include query secrets).
    logging.getLogger("httpx").setLevel(logging.WARNING)
