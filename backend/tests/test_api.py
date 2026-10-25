import asyncio
import json

import httpx
import pytest

from app import main
from app.main import LOCAL_CORS_ORIGINS, DistributedRateLimitMiddleware, app, parse_cors_origins, rate_limit_settings

SAMPLE = {
    "default_policy": "deny",
    "rules": [
        {"id": "web", "source": "*", "destination": "192.0.2.10", "protocol": "tcp", "port": 443, "action": "allow"}
    ],
}


def request(method: str, path: str, **kwargs) -> httpx.Response:
    """Exercise the ASGI application without Starlette's deprecated synchronous TestClient."""

    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def test_cors_origin_configuration_accepts_exact_http_origins_only():
    assert parse_cors_origins(None) == LOCAL_CORS_ORIGINS
    assert parse_cors_origins("https://demo.example, https://api.example/") == [
        "https://demo.example",
        "https://api.example",
    ]
    with pytest.raises(ValueError):
        parse_cors_origins("*")
    with pytest.raises(ValueError):
        parse_cors_origins("https://demo.example/path")


def test_rate_limit_settings_enable_production_and_bound_operator_values(monkeypatch):
    monkeypatch.setenv("CONDUITGUARD_ENV", "production")
    monkeypatch.setenv("RATE_LIMIT_REQUESTS", "999")
    monkeypatch.setenv("RATE_LIMIT_WINDOW_SECONDS", "9999")
    monkeypatch.delenv("REDIS_URL", raising=False)
    assert rate_limit_settings() == (True, True, 300, 3600, None)


def test_distributed_rate_limiter_rejects_after_shared_limit(monkeypatch):
    monkeypatch.setenv("CONDUITGUARD_ENV", "development")

    async def downstream(_: dict, __, send):
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    class FakeRedis:
        calls = 0

        async def eval(self, *_):
            self.calls += 1
            return self.calls

    limiter = DistributedRateLimitMiddleware(downstream)
    limiter.enabled = True
    limiter.production = True
    limiter.requests = 1
    limiter.window = 60
    limiter.client = FakeRedis()
    scope = {"type": "http", "method": "POST", "path": "/api/analyze", "headers": [], "client": ("203.0.113.1", 0)}

    async def invoke() -> list[int]:
        statuses: list[int] = []

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message):
            if message["type"] == "http.response.start":
                statuses.append(message["status"])

        await limiter(scope, receive, send)
        await limiter(scope, receive, send)
        return statuses

    assert asyncio.run(invoke()) == [204, 429]


def test_health_and_openapi():
    assert request("GET", "/api/health").json()["status"] == "ok"
    assert request("GET", "/openapi.json").status_code == 200


def test_validate_empty_bad_json_and_valid_config():
    assert request("POST", "/api/validate", content=b"").status_code == 400
    assert request("POST", "/api/validate", content=b"{").json()["error"]["code"] == "invalid_json"
    assert request("POST", "/api/validate", json=SAMPLE).json() == {"valid": True, "rule_count": 1}


def test_analyze_and_schema_failure():
    payload = {"before": SAMPLE, "after": SAMPLE, "probes": []}
    result = request("POST", "/api/analyze", json=payload)
    assert result.status_code == 200 and result.json()["findings"] == []
    bad = request(
        "POST",
        "/api/analyze",
        content=json.dumps({"before": SAMPLE, "after": {}}),
        headers={"content-type": "application/json"},
    )
    assert bad.status_code == 422
    assert "traceback" not in bad.text.lower()


def test_history_has_explicit_unconfigured_and_database_error_states(monkeypatch):
    monkeypatch.setattr(main, "database_url", lambda: None)
    missing = request("GET", "/api/history")
    assert missing.status_code == 503
    assert missing.json()["error"]["code"] == "database_not_configured"

    monkeypatch.setattr(main, "database_url", lambda: "postgresql://unavailable")

    def unavailable(**_kwargs):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(main, "list_analysis_history", unavailable)
    unavailable_response = request("GET", "/api/history")
    assert unavailable_response.status_code == 503
    assert unavailable_response.json()["error"]["code"] == "database_unavailable"


def test_history_pagination_and_detail_endpoints(monkeypatch):
    monkeypatch.setattr(main, "database_url", lambda: "postgresql://configured")
    page_data = {
        "items": [
            {
                "id": 2,
                "created_at": "2026-10-25T04:00:00+00:00",
                "rules_version": "1.1.0",
                "finding_count": 1,
                "high_severity_count": 1,
                "change_count": 1,
                "probe_count": 1,
                "risk_score": 20,
                "has_details": True,
            }
        ],
        "page": 2,
        "page_size": 1,
        "total": 2,
        "total_pages": 2,
    }
    monkeypatch.setattr(
        main,
        "list_analysis_history",
        lambda page, page_size: {
            **page_data,
            "page": page,
            "page_size": page_size,
        },
    )
    response = request("GET", "/api/history?page=2&page_size=1")
    assert response.status_code == 200
    assert response.json()["page"] == 2
    assert response.json()["total"] == 2
    assert response.json()["items"][0]["id"] == 2

    monkeypatch.setattr(
        main,
        "get_analysis_history",
        lambda history_id: {"id": history_id, "detail_json": {"findings": []}} if history_id == 2 else None,
    )
    assert request("GET", "/api/history/2").json()["detail_json"] == {"findings": []}
    missing = request("GET", "/api/history/999")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "history_not_found"


def test_analyze_remains_available_when_history_save_fails(monkeypatch):
    monkeypatch.setattr(main, "database_url", lambda: "postgresql://unavailable")

    def unavailable(_: dict):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(main, "save_analysis_summary", unavailable)
    response = request("POST", "/api/analyze", json={"before": SAMPLE, "after": SAMPLE, "probes": []})
    assert response.status_code == 200
    assert response.json()["history_status"] == "unavailable"


def test_body_limit():
    response = request(
        "POST",
        "/api/validate",
        content=b" " * (256 * 1024 + 1),
        headers={"Origin": "http://localhost:3000"},
    )
    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_end_to_end_demo_analysis_and_invalid_input():
    demo = request("GET", "/api/examples/demo")
    assert demo.status_code == 200
    result = request("POST", "/api/analyze", json=demo.json())
    assert result.status_code == 200
    body = result.json()
    assert [x["id"] for x in body["changes"]["added"]] == ["temporary-remote-admin"]
    assert len(body["simulation"]["before"]) == len(demo.json()["probes"])
    assert len(body["simulation"]["after"]) == len(demo.json()["probes"])
    assert any(f["id"] == "CG-POL-002" for f in body["findings"])
    assert body["risk"]["model"] == "heuristic-v1"
    assert 0 <= body["risk"]["score"] <= 100
    invalid = request("POST", "/api/analyze", content=b"{not-json", headers={"content-type": "application/json"})
    assert invalid.status_code == 422
