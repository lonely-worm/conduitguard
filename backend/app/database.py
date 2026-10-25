"""PostgreSQL persistence for privacy-preserving analysis history."""

import json
import os
from typing import Any

import psycopg
from psycopg.rows import dict_row


def database_url() -> str | None:
    """Read the provider URL without requiring a database for local use."""
    value = os.getenv("DATABASE_URL", "").strip()
    if not value:
        return None
    if value.startswith("postgres://"):
        value = "postgresql://" + value.removeprefix("postgres://")
    return value


def _connect() -> psycopg.Connection[Any]:
    url = database_url()
    if not url:
        raise RuntimeError("DATABASE_URL is not configured")
    return psycopg.connect(url, connect_timeout=5, row_factory=dict_row)


def _ensure_table(cursor: psycopg.Cursor[Any]) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS analysis_history (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            rules_version TEXT NOT NULL,
            finding_count INTEGER NOT NULL CHECK (finding_count >= 0),
            high_severity_count INTEGER NOT NULL CHECK (high_severity_count >= 0),
            change_count INTEGER NOT NULL CHECK (change_count >= 0),
            probe_count INTEGER NOT NULL CHECK (probe_count >= 0),
            risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
            detail_json JSONB
        )
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS analysis_history_created_at_idx ON analysis_history (created_at DESC, id DESC)"
    )
    cursor.execute(
        "ALTER TABLE analysis_history ADD COLUMN IF NOT EXISTS risk_score "
        "INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100)"
    )
    cursor.execute("ALTER TABLE analysis_history ADD COLUMN IF NOT EXISTS detail_json JSONB")


def _safe_detail(result: dict[str, Any]) -> dict[str, Any]:
    """Persist useful report detail while omitting network addresses, raw evidence, and probe endpoints."""
    changes = result["changes"]
    findings = result["findings"]
    before_decisions = result["simulation"]["before"]
    after_decisions = result["simulation"]["after"]

    def decision_counts(items: list[dict[str, Any]]) -> dict[str, int]:
        return {
            "allow": sum(item["decision"] == "allow" for item in items),
            "deny": sum(item["decision"] == "deny" for item in items),
            "total": len(items),
        }

    return {
        "changes": {
            "added": [item["id"] for item in changes["added"]],
            "removed": [item["id"] for item in changes["removed"]],
            "changed": [
                {
                    "id": item["id"],
                    "fields": sorted(
                        key
                        for key in set(item["before"]) | set(item["after"])
                        if item["before"].get(key) != item["after"].get(key)
                    ),
                }
                for item in changes["changed"]
            ],
            "unchanged": changes["unchanged"],
            "default_policy_changed": changes["default_policy"] is not None,
        },
        "findings": [
            {
                "id": item["id"],
                "severity": item["severity"],
                "title": item["title"],
                "rule_ids": item["rule_ids"],
                "explanation": item["explanation"],
                "mitigation": item["mitigation"],
            }
            for item in findings
        ],
        "risk": result["risk"],
        "simulation": {
            "before": decision_counts(before_decisions),
            "after": decision_counts(after_decisions),
            "decision_changes": sum(
                before.get("decision") != after.get("decision")
                for before, after in zip(before_decisions, after_decisions)
            ),
        },
        "recommendations": result["recommendations"],
        "assumptions": result["assumptions"],
        "limitations": result["limitations"],
    }


def save_analysis_summary(result: dict[str, Any]) -> int:
    """Store aggregate counts and a redacted report; omit configs, addresses, probes, and evidence."""
    detail_json = json.dumps(_safe_detail(result))
    with _connect() as conn, conn.cursor() as cursor:
        _ensure_table(cursor)
        cursor.execute(
            """
            INSERT INTO analysis_history
                (rules_version, finding_count, high_severity_count, change_count, probe_count, risk_score, detail_json)
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
            RETURNING id
            """,
            (
                result["rules_version"],
                len(result["findings"]),
                sum(item["severity"] in {"critical", "high"} for item in result["findings"]),
                len(result["changes"]["added"])
                + len(result["changes"]["removed"])
                + len(result["changes"]["changed"])
                + int(result["changes"]["default_policy"] is not None),
                len(result["simulation"]["after"]),
                result["risk"]["score"],
                detail_json,
            ),
        )
        return cursor.fetchone()["id"]


def list_analysis_history(page: int = 1, page_size: int = 10) -> dict[str, Any]:
    offset = (page - 1) * page_size
    with _connect() as conn, conn.cursor() as cursor:
        _ensure_table(cursor)
        cursor.execute("SELECT COUNT(*) AS total FROM analysis_history")
        total = cursor.fetchone()["total"]
        cursor.execute(
            """
            SELECT id, created_at, rules_version, finding_count, high_severity_count,
                   change_count, probe_count, risk_score, detail_json IS NOT NULL AS has_details
            FROM analysis_history
            ORDER BY created_at DESC, id DESC
            LIMIT %s OFFSET %s
            """,
            (page_size, offset),
        )
        rows = cursor.fetchall()
        items = [{**row, "created_at": row["created_at"].isoformat()} for row in rows]
        return {
            "items": items,
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": max(1, (total + page_size - 1) // page_size),
        }


def get_analysis_history(history_id: int) -> dict[str, Any] | None:
    with _connect() as conn, conn.cursor() as cursor:
        _ensure_table(cursor)
        cursor.execute(
            """
            SELECT id, created_at, rules_version, finding_count, high_severity_count,
                   change_count, probe_count, risk_score, detail_json
            FROM analysis_history WHERE id = %s
            """,
            (history_id,),
        )
        row = cursor.fetchone()
        if row is None:
            return None
        return {**row, "created_at": row["created_at"].isoformat()}
