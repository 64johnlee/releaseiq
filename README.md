# ReleaseIQ

AI release-intelligence for the **H0: Hack the Zero Stack** hackathon (Vercel v0 + AWS Databases).

Point it at a repo's merged PRs. An agent summarizes each PR, classifies it, embeds it, and stores it in
**Aurora PostgreSQL + pgvector** — giving you auto-generated release notes and a semantic
"what changed and why" search for support, PM, and sales teams.

## Stack

- **Frontend / deploy:** Next.js 15 (App Router) on Vercel
- **Backend DB:** Aurora PostgreSQL + `pgvector` (HNSW cosine index) via Drizzle ORM
- **AI:** provider-agnostic OpenAI-compatible LLM client (Qwen DashScope / OpenAI) for summarize + embed

## Backend spine (this phase)

```
src/db/              Drizzle schema (repos, pull_requests + vector, release_notes) + lazy client
src/lib/agent/       LLM client (chat + embed) + prompts
src/lib/pipeline/    ingest (GitHub) -> summarize -> embed -> store
src/lib/repositories/ data access incl. pgvector cosine search
src/app/api/         health, ingest, search routes
```

## Setup

```bash
npm install
cp .env.example .env.local   # fill DATABASE_URL + LLM_* 
# one-time on the Aurora DB:  CREATE EXTENSION IF NOT EXISTS vector;
npm run db:push              # apply schema
npm run dev
```

## API

```bash
# health
curl localhost:3000/api/health

# ingest a repo's merged PRs (fetched from GitHub when pullRequests omitted)
curl -X POST localhost:3000/api/ingest -H 'content-type: application/json' \
  -d '{"owner":"vercel","name":"next.js","fetchLimit":20}'

# semantic search
curl 'localhost:3000/api/search?repo=vercel/next.js&q=caching%20improvements'
```

> Deploy gate: request AWS + v0 credits by **Jun 26, 2026 (EOD SGT)**. Submission **Jun 30 8am SGT**.
