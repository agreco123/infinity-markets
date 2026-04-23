-- Infinity Markets v4.1 / V41-4 — provenance persistence for R-4.
--
-- Every field rendered in the underwriting PDF now carries a provenance
-- envelope: { value, provenance, source_url, fetched_at, confidence }.
-- The render path (server/routes/deliverables/pdf.js, provChip()) already
-- looks at study._env (top-level dotted paths) AND study.<bucket>._env
-- (per-bucket sub-paths). This migration gives us durable storage for
-- those envelopes alongside each cached dataset.
--
-- Design:
--   1. Per-table `_env` JSONB — one row's envelopes live next to its data,
--      so rebuilding a study from Supabase caches reconstitutes chips.
--      JSONB shape:
--        { "<canonical.path>": { "provenance": "...", "source_url": "...",
--                                 "fetched_at": "...", "confidence": "..." }, ... }
--      Storage is keyed by the field path RELATIVE to the bucket the table
--      serves (so census_demographics rows carry 'population', 'mhi', etc.
--      NOT 'demographics.population').
--
--   2. `market_study.provenance_log` — append-only audit table: every
--      time an enricher writes a value, it can also drop one row here
--      for cross-study querying ("every place we used the census acs5
--      endpoint in the last 30 days"). Useful for the fail-loud work in
--      V41-5 (H-3 enricher fail-loud).
--
-- Additive: every column NULLABLE; every existing writer keeps working
-- whether or not it populates `_env`. GIN indexes on the JSONB columns
-- support queries like "show me every row where provenance=modeled".
--
-- Schema target: market_study (see 002_redfin_full_columns.sql header note).

------------------------------------------------------------------------
-- 1. Per-table _env JSONB columns on every data-bearing cache table.
------------------------------------------------------------------------

ALTER TABLE market_study.census_demographics
  ADD COLUMN IF NOT EXISTS _env JSONB;
CREATE INDEX IF NOT EXISTS census_demographics_env_gin
  ON market_study.census_demographics USING GIN (_env jsonb_path_ops);

ALTER TABLE market_study.redfin_monthly
  ADD COLUMN IF NOT EXISTS _env JSONB;
CREATE INDEX IF NOT EXISTS redfin_monthly_env_gin
  ON market_study.redfin_monthly USING GIN (_env jsonb_path_ops);

ALTER TABLE market_study.builder_profiles
  ADD COLUMN IF NOT EXISTS _env JSONB;
CREATE INDEX IF NOT EXISTS builder_profiles_env_gin
  ON market_study.builder_profiles USING GIN (_env jsonb_path_ops);

ALTER TABLE market_study.communities
  ADD COLUMN IF NOT EXISTS _env JSONB;
CREATE INDEX IF NOT EXISTS communities_env_gin
  ON market_study.communities USING GIN (_env jsonb_path_ops);

ALTER TABLE market_study.fred_timeseries
  ADD COLUMN IF NOT EXISTS _env JSONB;
CREATE INDEX IF NOT EXISTS fred_timeseries_env_gin
  ON market_study.fred_timeseries USING GIN (_env jsonb_path_ops);

ALTER TABLE market_study.building_permits
  ADD COLUMN IF NOT EXISTS _env JSONB;
CREATE INDEX IF NOT EXISTS building_permits_env_gin
  ON market_study.building_permits USING GIN (_env jsonb_path_ops);

ALTER TABLE market_study.scorecard
  ADD COLUMN IF NOT EXISTS _env JSONB;
CREATE INDEX IF NOT EXISTS scorecard_env_gin
  ON market_study.scorecard USING GIN (_env jsonb_path_ops);

ALTER TABLE market_study.proforma_scenarios
  ADD COLUMN IF NOT EXISTS _env JSONB;
CREATE INDEX IF NOT EXISTS proforma_scenarios_env_gin
  ON market_study.proforma_scenarios USING GIN (_env jsonb_path_ops);

COMMENT ON COLUMN market_study.census_demographics._env IS
  'Provenance envelopes keyed by canonical field path (e.g. "population", "mhi"). Shape: { "<path>": { provenance, source_url, fetched_at, confidence } }.';
COMMENT ON COLUMN market_study.redfin_monthly._env IS
  'Provenance envelopes keyed by canonical field path (e.g. "medianListPrice", "daysOnMarket").';
COMMENT ON COLUMN market_study.builder_profiles._env IS
  'Provenance envelopes keyed by canonical field path (e.g. "revenue_usd", "gross_margin_pct").';
COMMENT ON COLUMN market_study.communities._env IS
  'Provenance envelopes keyed by canonical field path (e.g. "price_low", "sf_high").';
COMMENT ON COLUMN market_study.fred_timeseries._env IS
  'Provenance envelopes keyed by canonical series id / field path.';
COMMENT ON COLUMN market_study.building_permits._env IS
  'Provenance envelopes keyed by canonical field path (e.g. "annual_permits", "multifamily_share").';
COMMENT ON COLUMN market_study.scorecard._env IS
  'Provenance envelopes keyed by scorecard row name → field (e.g. "Population Growth.value").';
COMMENT ON COLUMN market_study.proforma_scenarios._env IS
  'Provenance envelopes keyed by scenario-field path (e.g. "baseCase.targetPrice").';

------------------------------------------------------------------------
-- 2. Append-only provenance audit log.
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS market_study.provenance_log (
  id              BIGSERIAL PRIMARY KEY,
  study_target    TEXT,                     -- e.g. 'Cranberry Township, PA'
  bucket          TEXT NOT NULL,            -- 'demographics' | 'housing' | 'competition' | 'analysis' | ...
  field_path      TEXT NOT NULL,            -- canonical dotted path e.g. 'demographics.population'
  value_text      TEXT,                     -- scalar value stringified for audit (JSON-encoded if non-scalar)
  provenance      TEXT NOT NULL
                    CHECK (provenance IN ('measured','derived','modeled','llm','missing')),
  source_url      TEXT,
  fetched_at      TIMESTAMPTZ,
  confidence      TEXT
                    CHECK (confidence IS NULL OR confidence IN ('high','medium','low')),
  step_tag        TEXT,                     -- enricher step tag e.g. 'v4.1.demographics.acs5.county-fallback'
  context         TEXT,                     -- free-text context e.g. request id, hot-path label
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS provenance_log_study_field_idx
  ON market_study.provenance_log (study_target, field_path, created_at DESC);
CREATE INDEX IF NOT EXISTS provenance_log_bucket_prov_idx
  ON market_study.provenance_log (bucket, provenance, created_at DESC);
CREATE INDEX IF NOT EXISTS provenance_log_source_idx
  ON market_study.provenance_log (source_url)
  WHERE source_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS provenance_log_created_at_idx
  ON market_study.provenance_log (created_at DESC);

COMMENT ON TABLE market_study.provenance_log IS
  'V41-4 append-only audit log. Every provenance envelope written by an enricher is mirrored here so we can query "every place endpoint X was used in the last N days" or "every modeled field across all studies".';

-- RLS: service writes, read is scoped via the same pattern as other
-- market_study.* tables (no extra policy needed here — ownership is
-- controlled at the schema GRANT level in Supabase).

------------------------------------------------------------------------
-- 3. Convenience view: latest envelope per (study, field).
------------------------------------------------------------------------

CREATE OR REPLACE VIEW market_study.provenance_latest AS
SELECT DISTINCT ON (study_target, field_path)
  study_target,
  bucket,
  field_path,
  value_text,
  provenance,
  source_url,
  fetched_at,
  confidence,
  step_tag,
  created_at
FROM market_study.provenance_log
ORDER BY study_target, field_path, created_at DESC;

COMMENT ON VIEW market_study.provenance_latest IS
  'Latest provenance envelope per (study_target, field_path). Use this instead of provenance_log when you only care about "what do we believe today".';
