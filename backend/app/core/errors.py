"""Centralised error model and FastAPI exception handlers.

Every error response has the shape::

    {"error": {"code": "...", "message": "...", "details": ..., "request_id": "..."}}
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("selenora.errors")


class AppError(Exception):
    status_code = 500
    code = "INTERNAL_ERROR"

    def __init__(self, message: str, *, details: Any = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"


class NotImplementedYetError(AppError):
    """A documented API contract whose implementation is scheduled for a later phase."""

    status_code = 501
    code = "NOT_IMPLEMENTED"


class ExternalServiceError(AppError):
    status_code = 502
    code = "EXTERNAL_SERVICE_ERROR"


class ServiceNotConfiguredError(AppError):
    status_code = 503
    code = "SERVICE_NOT_CONFIGURED"


class RateLimitedError(AppError):
    status_code = 429
    code = "RATE_LIMITED"


class TerrainUnavailableError(AppError):
    """Requested TERRAIN mode but LOLA coverage/horizon is insufficient."""

    status_code = 422
    code = "TERRAIN_UNAVAILABLE"


def _body(request: Request, code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "request_id": getattr(request.state, "request_id", None),
        }
    }


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        log = logger.warning if exc.status_code < 500 or exc.status_code == 501 else logger.error
        log("app_error", extra={"code": exc.code, "path": request.url.path})
        return JSONResponse(
            status_code=exc.status_code, content=_body(request, exc.code, exc.message, exc.details)
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"loc": list(e.get("loc", [])), "msg": e.get("msg"), "type": e.get("type")}
            for e in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=_body(request, "VALIDATION_ERROR", "Request validation failed.", details),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "HTTP_ERROR")
        return JSONResponse(
            status_code=exc.status_code, content=_body(request, code, str(exc.detail))
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_error", extra={"path": request.url.path})
        return JSONResponse(
            status_code=500,
            content=_body(request, "INTERNAL_ERROR", "An unexpected server error occurred."),
        )
