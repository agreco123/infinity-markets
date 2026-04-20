# Infinity Markets

AI-powered new construction market study platform for Forbes Capretto Homes.

## Stack

- Frontend: React 18 + Vite 5
- Backend: Node.js / Express
- Database: Supabase (PostgreSQL, schema: market_study)
- AI: Claude API (Anthropic)
- Hosting: Render (single web service)

## Development

```bash
# Server
cd server && npm install && node index.js

# Client
cd client && npm install && npm run dev
```

## Deployment

Push to main branch -- Render auto-deploys.

- Build: cd client && npm install && npm run build && cd ../server && npm install
- Start: cd server && node index.js

Important: the build command MUST include the client build step. Without it,
client/dist/ will not exist on the Render server and the SPA will 404 on all routes.

## Report Generation (v2.2)

PDF generation uses puppeteer-core + @sparticuz/chromium (NOT full puppeteer),
because Render /opt/render disk does not persist Chrome per-install cache between builds.

Required server/package.json deps:

- @sparticuz/chromium ^131.0.0
- puppeteer-core ^23.0.0

Endpoints:

- POST /api/deliverables/pdf  -- 14-section institutional report
- POST /api/deliverables/xlsx -- 13-tab data workbook
- POST /api/deliverables/pptx -- 25-slide executive deck
