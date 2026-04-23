-- Infinity Markets v4.1 / V41-11 — schema-version tracking (H-5).
--
-- Purpose:
--   Provide a durable, queryable record of which migrations have been
--   applied so the server can refuse to boot against an outdated schema.
--   Before this migration, the 4 prior migrations (001-004) were
--   applied by hand with no version check; a deploy could silently
--   land against stale schema and produce silent write failures.
--
-- Design:
--   - market_study.schema_version is a simple version -> applied_at log.
--   - Each migration file seeds a row for its own version on apply.
--   - Server lib (server/lib/schemaVersion.js) exposes
--     assertSchemaVersion(supa, expectedMin) which SELECTs MAX(version)
--     and throws loud when actual < expected.
--   - EXPECTED_SCHEMA_VERSION constant in schemaVersion.js is bumped
--     alongside every future migration file.
--
-- Backfill:
--   This migration seeds versions 1..5 so existing deploys snap to the
--   correct baseline on first apply.
--
-- Safety:
--   Additive-only. Every column NULLABLE except version PK. RLS left
--   to existing market_study.* schema-level GRANTs.

CREATE TABLE IF NOT EXISTS market_study.schema_version (
  version     INTEGER     PRIMARY KEY CHECK (version > 0),
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT
);

COMMENT ON TABLE market_study.schema_version IS
  'V41-11 / H-5 — record of applied migrations. Server lib/schemaVersion.js asserts MAX(version) >= EXPECTED_SCHEMA_VERSION on boot.';

-- Backfill rows for migrations 001..005 (idempotent via ON CONFLICT DO NOTHING).
INSERT INTO market_study.schema_version (version, description) VALUES
  (1, '001_communities — communities, builder_profiles, scorecard, proforma_scenarios baselines'),
  (2, '002_redfin_full_columns — Redfin widened columns on redfin_monthly'),
  (3, '003_builder_profiles_edgar — EDGAR builder financial columns'),
  (4, '004_provenance_columns — V41-4 _env JSONB on 8 tables + provenance_log audit + provenance_latest view'),
  (5, '005_schema_version — this migration')
ON CONFLICT (version) DO NOTHING;

COMMENT ON COLUMN market_study.schema_version.version IS
  'Monotonically increasing integer matching migration file prefix (001 -> 1, 002 -> 2, ...).';
COMMENT ON COLUMN market_study.schema_version.applied_at IS
  'Timestamp the migration landed. Default NOW() captures hand-apply timing.';
COMMENT ON COLUMN market_study.schema_version.description IS
  'Human-readable summary — ties back to the file name + purpose.';
