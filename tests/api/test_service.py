"""The browser runtime calls service.handle(); it must match the HTTP API."""

import json

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

from tests.api.test_career_api import payload
from whatif_engine.api import service
from whatif_engine.api.main import app

client = TestClient(app)


@pytest.mark.parametrize("kind", ["compare", "sensitivity"])
def test_handle_matches_http_api(kind):
    body = payload(employment_gap_months=2)
    http = client.post(f"/api/v1/career/{kind}", json=body).json()
    browser = json.loads(service.handle(kind, json.dumps(body)))
    assert browser["ok"] is True
    assert browser["data"] == http


def test_handle_reports_schema_errors_like_fastapi():
    body = payload(relocation_cost="-5")
    out = json.loads(service.handle("compare", json.dumps(body)))
    assert out["ok"] is False
    assert out["status"] == 422
    http = client.post("/api/v1/career/compare", json=body).json()["detail"]
    assert isinstance(out["detail"], list)
    # FastAPI prefixes locations with "body"; the frontend strips it.
    assert [p for p in http[0]["loc"] if p != "body"] == out["detail"][0]["loc"]
    assert out["detail"][0]["msg"] == http[0]["msg"]


def test_handle_reports_malformed_json():
    out = json.loads(service.handle("compare", "{not json"))
    assert out["ok"] is False
    assert out["status"] == 422


def test_handle_rejects_unknown_kind():
    out = json.loads(service.handle("nope", "{}"))
    assert out == {"ok": False, "status": 404, "detail": "Unknown request."}


def test_service_does_not_import_fastapi():
    import ast
    import pathlib

    tree = ast.parse(pathlib.Path(service.__file__).read_text(encoding="utf-8"))
    imported = {
        n.module if isinstance(n, ast.ImportFrom) else a.name
        for n in ast.walk(tree)
        if isinstance(n, ast.Import | ast.ImportFrom)
        for a in (n.names if isinstance(n, ast.Import) else [None])
    }
    assert not any(m and m.startswith(("fastapi", "starlette")) for m in imported)
