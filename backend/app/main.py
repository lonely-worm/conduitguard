"""FastAPI application and public error handling."""

import json
import logging
import os
from hashlib import sha256
from typing import Any
from urllib.parse import urlsplit

import redis.asyncio as redis
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from redis.exceptions import RedisError

from .analysis import RULES_VERSION, analyze
from .database import database_url, list_analysis_history, save_analysis_summary
from .models import AnalyzeRequest

MAX_BODY_BYTES = 256 * 1024
LOCAL_CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
RATE_LIMIT_PATHS = {"/api/analyze", "/api/validate"}
RATE_LIMIT_LUA = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
"""
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("conduitguard")
app = FastAPI(
    title="ConduitGuard API",
    version="1.0.0",
    description="Offline firewall policy validation and connectivity simulation.",
)


class BodyLimitMiddleware:
    """Pure ASGI limiter; buffers at most MAX_BODY_BYTES before app validation."""

    def __init__(self, application: Any):
        self.application = application

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            await self.application(scope, receive, send)
            return
        length = next(
            (value.decode() for key, value in scope.get("headers", []) if key.lower() == b"content-length"), ""
        )
        if length.isdigit() and int(length) > MAX_BODY_BYTES:
            response = JSONResponse(
                status_code=413,
                content={"error": {"code": "request_too_large", "message": "Request body exceeds 256 KiB."}},
            )
            await response(scope, receive, send)
            return
        chunks: list[bytes] = []
        total = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            total += len(chunk)
            if total > MAX_BODY_BYTES:
                response = JSONResponse(
                    status_code=413,
                    content={"error": {"code": "request_too_large", "message": "Request body exceeds 256 KiB."}},
                )
                await response(scope, receive, send)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        body = b"".join(chunks)
        replayed = False

        async def replay_receive():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.application(scope, replay_receive, send)


def is_truthy(value: str | None) -> bool:
    return value is not None and value.strip().lower() in {"1", "true", "yes", "on"}


def rate_limit_settings() -> tuple[bool, bool, int, int, str | None]:
    """Read rate-limit settings without exposing the Redis connection value."""
    environment = os.getenv("CONDUITGUARD_ENV", "development").strip().lower()
    production = environment == "production"
    enabled = is_truthy(os.getenv("RATE_LIMIT_ENABLED")) or production
    requests = max(1, min(int(os.getenv("RATE_LIMIT_REQUESTS", "30")), 300))
    window = max(1, min(int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60")), 3600))
    return enabled, production, requests, window, os.getenv("REDIS_URL", "").strip() or None


class DistributedRateLimitMiddleware:
    """Redis-backed fixed-window limiter shared by every API instance.

    Production fails closed when its required Redis dependency is absent or unavailable.
    Local development remains usable without a Redis service unless explicitly enabled.
    """

    def __init__(self, application: Any):
        self.application = application
        enabled, production, self.requests, self.window, redis_url = rate_limit_settings()
        self.enabled = enabled
        self.production = production
        self.trust_proxy_headers = is_truthy(os.getenv("TRUST_PROXY_HEADERS"))
        self.client = redis.Redis.from_url(redis_url, decode_responses=True) if enabled and redis_url else None

    @staticmethod
    def _header(scope: dict[str, Any], name: bytes) -> str | None:
        return next((value.decode("latin-1") for key, value in scope.get("headers", []) if key.lower() == name), None)

    def _client_key(self, scope: dict[str, Any]) -> str:
        forwarded = self._header(scope, b"x-forwarded-for") if self.trust_proxy_headers else None
        client_ip = forwarded.split(",", 1)[0].strip() if forwarded else (scope.get("client") or ("unknown", 0))[0]
        # Hash the IP before forming the Redis key so it is not stored as readable data.
        return sha256(str(client_ip).encode("utf-8")).hexdigest()

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http" or scope["method"] != "POST" or scope.get("path") not in RATE_LIMIT_PATHS:
            await self.application(scope, receive, send)
            return
        if not self.enabled:
            await self.application(scope, receive, send)
            return
        if self.client is None:
            response = JSONResponse(
                status_code=503,
                content={
                    "error": {
                        "code": "rate_limiter_unavailable",
                        "message": "The public demo is temporarily unavailable.",
                    }
                },
            )
            await response(scope, receive, send)
            return
        key = f"conduitguard:rate-limit:{scope['path']}:{self._client_key(scope)}"
        try:
            count = int(await self.client.eval(RATE_LIMIT_LUA, 1, key, self.window))
        except RedisError:
            logger.warning("Rate limiter unavailable for public analysis endpoint")
            if self.production:
                response = JSONResponse(
                    status_code=503,
                    content={
                        "error": {
                            "code": "rate_limiter_unavailable",
                            "message": "The public demo is temporarily unavailable.",
                        }
                    },
                )
                await response(scope, receive, send)
                return
            await self.application(scope, receive, send)
            return
        if count > self.requests:
            response = JSONResponse(
                status_code=429,
                headers={"Retry-After": str(self.window)},
                content={
                    "error": {"code": "rate_limited", "message": "Too many analysis requests. Please retry shortly."}
                },
            )
            await response(scope, receive, send)
            return
        await self.application(scope, receive, send)


def parse_cors_origins(value: str | None) -> list[str]:
    """Parse exact browser origins, retaining safe localhost defaults for development."""
    if value is None or not value.strip():
        return LOCAL_CORS_ORIGINS.copy()

    origins: list[str] = []
    for item in value.split(","):
        origin = item.strip().rstrip("/")
        parsed = urlsplit(origin)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("CORS_ALLOWED_ORIGINS must contain comma-separated HTTP(S) origins without paths.")
        if origin not in origins:
            origins.append(origin)
    return origins


app.add_middleware(BodyLimitMiddleware)
app.add_middleware(DistributedRateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(os.getenv("CORS_ALLOWED_ORIGINS")),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    details = [
        {
            "loc": list(error.get("loc", [])),
            "msg": error.get("msg", "Invalid value"),
            "type": error.get("type", "validation_error"),
        }
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": "Request does not match the API schema.",
                "details": details,
            }
        },
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(_: Request, exc: Exception):
    logger.error("Unhandled request error: %s", type(exc).__name__)
    return JSONResponse(
        status_code=500, content={"error": {"code": "internal_error", "message": "The request could not be processed."}}
    )


@app.get("/api/health")
def health():
    return {"status": "ok", "rules_version": RULES_VERSION, "database_configured": database_url() is not None}


@app.get("/api/examples/demo")
def demo_example():
    return {
        "before": {
            "default_policy": "deny",
            "rules": [
                {
                    "id": "allow-hmi-historian",
                    "source": "10.70.20.0/24",
                    "destination": "10.70.40.10",
                    "protocol": "tcp",
                    "port": 443,
                    "action": "allow",
                    "priority": 100,
                    "description": "HMI access to historian service",
                },
                {
                    "id": "allow-engineering-controller",
                    "source": "10.70.10.0/24",
                    "destination": "10.70.30.20",
                    "protocol": "udp",
                    "port": 161,
                    "action": "allow",
                    "priority": 100,
                    "description": "Engineering workstation monitoring path",
                },
            ],
        },
        "after": {
            "default_policy": "deny",
            "rules": [
                {
                    "id": "allow-hmi-historian",
                    "source": "10.70.20.0/24",
                    "destination": "10.70.40.10",
                    "protocol": "tcp",
                    "port": 443,
                    "action": "allow",
                    "priority": 100,
                    "description": "HMI access to historian service",
                },
                {
                    "id": "allow-engineering-controller",
                    "source": "10.70.10.0/24",
                    "destination": "10.70.30.20",
                    "protocol": "udp",
                    "port": 161,
                    "action": "allow",
                    "priority": 100,
                    "description": "Engineering workstation monitoring path",
                },
                {
                    "id": "temporary-remote-admin",
                    "source": "*",
                    "destination": "10.70.30.20",
                    "protocol": "tcp",
                    "port": 3389,
                    "action": "allow",
                    "priority": 100,
                    "description": "Temporary remote administration to control zone",
                },
            ],
        },
        "probes": [
            {
                "label": "HMI ke historian",
                "source": "10.70.20.15",
                "destination": "10.70.40.10",
                "protocol": "tcp",
                "port": 443,
            },
            {
                "label": "Akses RDP dari alamat eksternal",
                "source": "198.51.100.25",
                "destination": "10.70.30.20",
                "protocol": "tcp",
                "port": 3389,
            },
            {
                "label": "Engineering workstation ke kontrol",
                "source": "10.70.10.11",
                "destination": "10.70.30.20",
                "protocol": "udp",
                "port": 161,
            },
        ],
    }


@app.post("/api/analyze")
def analyze_configuration(payload: AnalyzeRequest):
    result = analyze(payload)
    result["history_id"] = None
    result["history_status"] = "disabled"
    if database_url():
        try:
            result["history_id"] = save_analysis_summary(result)
            result["history_status"] = "saved"
        except Exception as exc:
            logger.error("Analysis history could not be saved: %s", type(exc).__name__)
            result["history_status"] = "unavailable"
    return result


@app.get("/api/history")
def analysis_history(limit: int = 20):
    if not database_url():
        return JSONResponse(
            status_code=503,
            content={"error": {"code": "database_not_configured", "message": "Analysis history is not configured."}},
        )
    try:
        return {"items": list_analysis_history(limit=max(1, min(limit, 50)))}
    except Exception as exc:
        logger.error("Analysis history could not be loaded: %s", type(exc).__name__)
        return JSONResponse(
            status_code=503,
            content={
                "error": {"code": "database_unavailable", "message": "Analysis history is temporarily unavailable."}
            },
        )


@app.post("/api/validate")
async def validate_configuration(request: Request):
    try:
        raw = await request.body()
        if not raw:
            return JSONResponse(
                status_code=400,
                content={"error": {"code": "empty_input", "message": "Configuration body must not be empty."}},
            )
        parsed = json.loads(raw)
        from .models import FirewallConfig

        config = FirewallConfig.model_validate(parsed)
        return {"valid": True, "rule_count": len(config.rules)}
    except json.JSONDecodeError:
        return JSONResponse(
            status_code=400, content={"error": {"code": "invalid_json", "message": "Request body is not valid JSON."}}
        )
    except ValidationError as exc:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "Configuration does not match the schema.",
                    "details": [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()],
                }
            },
        )
