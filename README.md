# Infinity Markets — v4.0.0

Land-underwriting instrument for Forbes Capretto Homes. Produces a GO/NO-GO
recommendation for a specific parcel at a specific price, backed by measured
inputs with transparent provenance. The printable market study is a by-product.

**Governing directive:** `INFINITY_MARKETS_v4_0_MASTER_DIRECTIVE.md`
(see §1 Immutable Laws, §7 Phases).

## Stack

- **Frontend:** React 18 + Vite 5
- **Backend:** Node.js / Express
- **Database:** Supabase (PostgreSQL, schema: `market_study`)
- **AI:** Claude API (Anthropic)
- **Hosting:** Render (single web service)

## v4.0.0 — Phase 3 Step 9 (this release)

Schema enforcement at the render boundary. Non-breaking foundation for the
rest of Phase 3.

- `studySchema.js` bumped to `SCHEMA_VERSION = '4.0.0'`.
- Added `normalizeAndEnvelope()`, `collectProvenance()`, `unwrapEnvelope()`,
  `attachBareMirror()`, `enforceSchema()`, `LAWS_OF_V4`.
- `deliverables.js` now runs `normalizeStudy()` + `unwrapEnvelope()` at the
  entry to `buildPDFHTML()`, closing the Supabase-regeneration path that
  skipped the client-side normalizer (Cranberry em-dash root cause).
- Strict mode via `INFINITY_STRICT_SCHEMA=1` env flag — unknown field names
  throw; loose mode warns.
- Legacy test suites (`test_schema.js`, `test_schema_wired.js`) pass
  unchanged; new `test_schema_v4_envelope.js` covers envelope + provenance
  machinery (45 assertions).

Deferred to v4.0.1+: DTI-based affordability (Step 10), months-supply default
removal (Step 11), provenance-aware PDF rendering (Step 12).

## Development

```bash
# Server
cd server && npm install && node index.js

# Client
cd client && npm install && npm run dev

# Schema tests
cd server && node scripts/test_schema.js
cd server && node scripts/test_schema_wired.js
cd server && node scripts/test_schema_v4_envelope.js
```

## Deployment

Push to `main` branch — Render auto-deploys.

- **Build:** `cd server && npm install`
- **Start:** `cd server && node index.js`
- **Strict schema:** set `INFINITY_STRICT_SCHEMA=1` on the service to
  throw on unknown field names (default: warn-only).
