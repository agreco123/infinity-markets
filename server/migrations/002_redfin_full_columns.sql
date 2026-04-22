-- Infinity Markets v3.0 Phase 2 Step 4 — widen redfin_monthly schema
-- Target schema: market_study (NOT public — all Infinity Markets tables live under
-- the market_study schema; the Supabase client is configured with
-- `{ db: { schema: 'market_study' } }` in server/lib/supabase.js).
--
-- Additive, backward-compatible. Every new column nullable. Existing 65 rows
-- (5 ZIPs x 13 months) remain valid — new columns fill NULL until the next
-- ETL run populates them from the widened Redfin TSV extract.

ALTER TABLE market_study.redfin_monthly
  ADD COLUMN IF NOT EXISTS median_list_ppsf         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pending_sales            INTEGER,
  ADD COLUMN IF NOT EXISTS homes_sold_yoy           NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS new_listings_yoy         NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS pending_sales_yoy        NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS median_sale_price_yoy    NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS median_list_price_yoy    NUMERIC(7,2);

-- Composite index to accelerate 13-month rolling-window series pulls
-- by (zip_code, period_end DESC) in fetchRedfin().
CREATE INDEX IF NOT EXISTS redfin_monthly_zip_period_idx
  ON market_study.redfin_monthly (zip_code, period_end DESC);
