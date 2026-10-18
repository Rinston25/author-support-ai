# BookLeaf Author Support & Communication Portal

Author portal + admin portal with AI-assisted ticket classification and reply drafting.

> Work in progress. Sections below are filled in as each step lands.

## Stack
Nuxt 3 · Fastify 4 · PostgreSQL (plain SQL) · Anthropic Claude Haiku · SSE

## Run locally
```bash
docker compose up -d                 # Postgres on :5432
cd backend
cp .env.example .env                 # then set JWT_SECRET (and ANTHROPIC_API_KEY, optional)
npm install
npm run dev                          # http://localhost:3001/api/health
```

## Test credentials
TODO (added with the seed step)

## Architecture
TODO

## AI integration
TODO

## API
TODO (Swagger UI at `/docs`)

## Known limitations
TODO
