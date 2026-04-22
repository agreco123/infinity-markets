-- Infinity Markets v3.0 Step 7 — widen market_study.builder_profiles with SEC EDGAR benchmarks.
-- Additive: every new column is nullable; existing dataCache insert keeps working.

ALTER TABLE market_study.builder_profiles
  ADD COLUMN IF NOT EXISTS cik                    text,
  ADD COLUMN IF NOT EXISTS revenue_usd            numeric,
  ADD COLUMN IF NOT EXISTS gross_profit_usd       numeric,
  ADD COLUMN IF NOT EXISTS gross_margin_pct       numeric,
  ADD COLUMN IF NOT EXISTS net_income_usd         numeric,
  ADD COLUMN IF NOT EXISTS homes_delivered        integer,
  ADD COLUMN IF NOT EXISTS average_selling_price  numeric,
  ADD COLUMN IF NOT EXISTS cancellation_rate_pct  numeric,
  ADD COLUMN IF NOT EXISTS backlog_units          integer,
  ADD COLUMN IF NOT EXISTS backlog_value_usd      numeric,
  ADD COLUMN IF NOT EXISTS segment_name           text,
  ADD COLUMN IF NOT EXISTS segment_revenue_usd    numeric,
  ADD COLUMN IF NOT EXISTS segment_margin_pct     numeric,
  ADD COLUMN IF NOT EXISTS filing_period_end      date,
  ADD COLUMN IF NOT EXISTS filing_form            text,
  ADD COLUMN IF NOT EXISTS source_url             text,
  ADD COLUMN IF NOT EXISTS _step_tag              text;

CREATE INDEX IF NOT EXISTS builder_profiles_cik_period_idx
  ON market_study.builder_profiles (cik, filing_period_end DESC);
