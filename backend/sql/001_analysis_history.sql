-- Run this once while connected to the conduitguard database as conduitguard_app.
-- The API can also create this table on first use when DATABASE_URL is configured.
CREATE TABLE IF NOT EXISTS analysis_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rules_version TEXT NOT NULL,
    finding_count INTEGER NOT NULL CHECK (finding_count >= 0),
    high_severity_count INTEGER NOT NULL CHECK (high_severity_count >= 0),
    change_count INTEGER NOT NULL CHECK (change_count >= 0),
    probe_count INTEGER NOT NULL CHECK (probe_count >= 0),
    risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS analysis_history_created_at_idx
    ON analysis_history (created_at DESC, id DESC);
