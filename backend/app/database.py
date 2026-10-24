"""Small PostgreSQL persistence layer for privacy-preserving analysis history."""

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
            risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100)
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


def save_analysis_summary(result: dict[str, Any]) -> int:
    """Store aggregate counts only; never persist configs, probes, or finding evidence."""
    with _connect() as conn, conn.cursor() as cursor:
        _ensure_table(cursor)
        cursor.execute(
            """
            INSERT INTO analysis_history
                (rules_version, finding_count, high_severity_count, change_count, probe_count, risk_score)
            VALUES (%s, %s, %s, %s, %s, %s)
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
            ),
        )
        return cursor.fetchone()["id"]


def list_analysis_history(limit: int = 20) -> list[dict[str, Any]]:
    with _connect() as conn, conn.cursor() as cursor:
        _ensure_table(cursor)
        cursor.execute(
            """
            SELECT id, created_at, rules_version, finding_count, high_severity_count,
                   change_count, probe_count, risk_score
            FROM analysis_history
            ORDER BY created_at DESC, id DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cursor.fetchall()
        return [{**row, "created_at": row["created_at"].isoformat()} for row in rows]
