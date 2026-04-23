-- Infinity Markets v2.5 — communities table migration
-- Schema for NewHomeSource-seeded new-construction community data.
-- Supports manual entries and scraper-seeded rows, keyed by zip + name to dedupe.

CREATE TABLE IF NOT EXISTS public.communities (
  id                 BIGSERIAL PRIMARY KEY,
  source             TEXT NOT NULL DEFAULT 'newhomesource',  -- 'newhomesource' | 'manual' | 'rapidapi'
  source_url         TEXT,
  name               TEXT NOT NULL,
  community_name     TEXT GENERATED ALWAYS AS (name) STORED,
  builder            TEXT,
  product_type       TEXT,                                    -- 'SFD' | 'TH' | 'Condo'
  plan_count         INTEGER,
  sf_low             INTEGER,
  sf_high            INTEGER,
  price_low          INTEGER,
  price_high         INTEGER,
  price_per_sqft     INTEGER,
  lots_total         INTEGER,
  lots_sold          INTEGER,
  lots_remaining     INTEGER,
  monthly_absorption NUMERIC(6,2),
  open_date          DATE,
  status             TEXT,                                    -- 'active' | 'sold-out' | 'coming-soon'
  address_line       TEXT,
  city               TEXT,
  state              TEXT,
  zip_code           TEXT NOT NULL,
  county             TEXT,
  lat                NUMERIC(9,6),
  lon                NUMERIC(9,6),
  school_district    TEXT,
  hoa                INTEGER,
  incentives         TEXT,
  raw_payload        JSONB,                                   -- full scraper response for audit
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS communities_zip_name_idx
  ON public.communities (zip_code, lower(name));
CREATE INDEX IF NOT EXISTS communities_city_state_idx
  ON public.communities (lower(city), state);
CREATE INDEX IF NOT EXISTS communities_builder_idx
  ON public.communities (lower(builder));
CREATE INDEX IF NOT EXISTS communities_zip_idx
  ON public.communities (zip_code);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_communities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  NEW.last_seen_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS communities_touch ON public.communities;
CREATE TRIGGER communities_touch
  BEFORE UPDATE ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.touch_communities_updated_at();

-- RLS: public read, authenticated write.
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read communities" ON public.communities;
CREATE POLICY "Public read communities" ON public.communities FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service write communities" ON public.communities;
CREATE POLICY "Service write communities" ON public.communities FOR ALL USING (auth.role() = 'service_role');
