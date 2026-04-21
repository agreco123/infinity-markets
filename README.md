# Infinity Markets

AI-powered new construction market study platform for Forbes Capretto Homes.

## Stack

- **Frontend:** React 18 + Vite 5
- **Backend:** Node.js / Express
- **Database:** Supabase (PostgreSQL, schema: `market_study`)
- **AI:** Claude API (Anthropic)
- **Hosting:** Render (single web service)

## Development

```bash
# Server
cd server && npm install && node index.js

# Client
cd client && npm install && npm run dev
```

## Deployment

Push to `main` branch — Render auto-deploys.

- **Build:** `cd server && npm install`
- **Start:** `cd server && node index.js`
