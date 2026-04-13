# Infinity Markets

Institutional-grade new construction market studies for any US location.

**10 phases · 29 data sources · 3 deliverables (PDF, XLSX, PPTX)**

Built for Forbes Capretto Homes — Land Acquisition & Strategic Planning.

## Architecture

```
client/          React 18 (Vite) SPA
server/          Node.js / Express API proxy
Database:        Supabase (PostgreSQL) — market_study schema
AI Engine:       Anthropic Claude API
Deployment:      Render (static site + web service)
```

## Quick Start

### Prerequisites
- Node.js 18+
- Supabase project with `market_study` schema deployed
- API keys stored in `market_study.config` table

### Environment Variables (server)

| Variable | Source |
|----------|--------|
| `SUPABASE_URL` | Supabase project settings |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `ANTHROPIC_API_KEY` | Anthropic console |

All other API keys (Census, FRED, BLS, BEA, HUD, RapidAPI, etc.) are loaded from the `market_study.config` Supabase table at startup.

### Local Development

```bash
# Server (port 4000)
cd server && npm install && npm start

# Client (port 5173, proxies /api → localhost:4000)
cd client && npm install && npm run dev
```

### Deploy to Render

Use the `render.yaml` blueprint or create two services manually:
1. **Web Service** — `server/` directory, Node runtime
2. **Static Site** — `client/` directory, build command `npm run build`, publish `dist/`

Add rewrite rule: `/api/*` → `https://infinity-markets-api.onrender.com/api/*`

## Data Flow

1. User enters location → Census Geocoder returns FIPS codes
2. Parallel data pulls: Census ACS, FRED, BLS, BEA, Redfin, Zillow, HUD, HMDA, FHFA, LODES
3. Competition: RapidAPI Realtor, NewHomeSource, SEC EDGAR
4. Claude API analysis: absorption, pricing, land, proforma, regulatory, scorecard, SWOT
5. Deliverable generation: PDF (Puppeteer), XLSX (ExcelJS), PPTX (PptxGenJS)

## Supabase

- Project ID: `cmymmhsdvrcjdyutjpnw`
- Schema: `market_study` (19 tables, 271 columns — pre-deployed)
- Do NOT recreate tables — they exist and contain reference data
