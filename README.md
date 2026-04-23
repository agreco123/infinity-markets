# Infinity Markets

Land-underwriting instrument for Forbes Capretto Homes. Produces GO/NO-GO decision memos with measured-first provenance, a full market study PDF, and post-deploy operational runners.

## Repo layout

```
./
├── render.yaml          Render blueprint (buildCommand + startCommand + env)
├── package.json         Monorepo root (scripts: build, start, test)
├── .nvmrc               Node 22.22.0
├── client/              React + Vite frontend
├── server/              Express API + deliverables renderers
│   ├── routes/          API endpoints
│   ├── lib/             Shared utilities (supabase, cache, schema, forecaster)
│   ├── migrations/      Supabase SQL migrations (001–005)
│   ├── scripts/         CLI seeders + test harnesses
│   └── package.json     Server dependency manifest (version pinned 4.1.3)
└── ops/
    └── deploy_v4_1_3_ops.sh   Post-deploy seeder runner (V41P-3/4/5)
```

## Deploy to Render

This repo ships a `render.yaml` blueprint. On first deploy:

1. Push to GitHub main.
2. In Render dashboard, click **New → Blueprint** → select this repo.
3. Render reads `render.yaml`, creates the `infinity-markets` web service, prompts for the secret env vars listed in the blueprint (ANTHROPIC_API_KEY, SUPABASE_URL, etc).
4. Auto-deploy fires on subsequent pushes to main.

**Build command** (from render.yaml):
```bash
cd client && npm ci && npm run build && cd ../server && npm ci
```

**Start command**:
```bash
cd server && node index.js
```

## Post-deploy ops (run once per deploy with new data)

```bash
# From repo root in Render shell or local machine with env set
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export CENSUS_API_KEY=...

./ops/deploy_v4_1_3_ops.sh --dry-run --verbose     # plan preview
./ops/deploy_v4_1_3_ops.sh --verbose                # all three ops live
./ops/deploy_v4_1_3_ops.sh --only=edgar --verbose   # one at a time
```

The three ops the bundler runs:
- **V41P-3** — Erie + Butler ACS re-sweep (warms `market_study.census_demogra