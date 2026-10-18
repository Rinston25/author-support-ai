# BookLeaf Author Support & Communication Portal

Author portal + admin portal with AI-assisted ticket classification and reply drafting.

Repository is public at BookLeaf HR's request.

> Work in progress. Sections below are filled in as each step lands.

## Stack
Nuxt 3 · Fastify 4 · PostgreSQL (plain SQL) · Anthropic Claude Haiku · SSE

## Run locally
```bash
docker compose up -d                 # Postgres on localhost:5433 (5433 avoids clashing with a local install)
cd backend
cp .env.example .env                 # then set JWT_SECRET (and ANTHROPIC_API_KEY, optional)
npm install
npm run db:reset                     # drop, migrate, seed (prints test logins)
npm run dev                          # API on http://localhost:3001, health at /api/health
```

## Test credentials
- Admin: `admin@bookleaf.com` or `ops@bookleaf.com` / `Admin@123`
- Author: any author email in the dataset, e.g. `priya.sharma@email.com` / `Author@123`

Copy the bookleaf_sample_data.json provided by BookLeaf into the repo root before running db:reset (or point `SEED_DATA_PATH` at it). It is deliberately not committed.

## Architecture
- Money is stored as whole-rupee integers: the dataset has no paise, and integers avoid float rounding issues.

TODO

## AI integration
TODO

## API
TODO (Swagger UI at `/docs`)

## Known limitations
TODO
