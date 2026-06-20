# ReleaseIQ — AI Release-Intelligence on the Zero Stack

**H0: Hack the Zero Stack with Vercel v0 + AWS Databases**

🔗 **Live:** https://releaseiq.vercel.app · **Track:** Monetizable B2B

---

## Inspiration

Every team ships merged PRs all week, and every week someone has to answer the same questions: *What actually changed? What do we tell customers? Which of these 40 PRs matter to support?* That work is manual, repetitive, and usually done from memory.

ReleaseIQ turns a repo's merged PRs into **release intelligence**: point it at a repository, and an agent summarizes and classifies every PR, embeds it, and makes the whole history **semantically searchable** — plus auto-generates customer-facing release notes. "What did we change about caching?" becomes a query, not an archaeology dig.

## What It Does

Point it at a repo's merged PRs and it runs a four-stage pipeline:

1. **Ingest** (`POST /api/ingest`) — pulls merged PRs from GitHub.
2. **Summarize + classify** — an LLM writes a plain-English summary and tags each PR (`feat`/`fix`/`perf`/`docs`/`chore`/`breaking`, and `customer` vs `internal`).
3. **Embed** — every summary becomes a 1536-dim vector.
4. **Store** — rows + vectors land in Aurora PostgreSQL with a pgvector HNSW cosine index.

On top of that store:
- **Semantic search** (`GET /api/search`) — "what changed and why," ranked by cosine similarity, for support / PM / sales.
- **Release notes** (`/api/release-notes`) — grouped Markdown notes generated from the stored summaries.
- **Browse / health** (`/api/repos`, `/api/pulls`, `/api/health`).

## Live Demo

The deployment is live and billed to a Google Cloud credit. Anyone can reproduce it:

```bash
# Health — DB + pgvector readiness
curl https://releaseiq.vercel.app/api/health
# → {"status":"ok","database":"connected","pgvector":true}

# Ingest 5 merged PRs from vercel/next.js (summarize → embed → store)
curl -X POST https://releaseiq.vercel.app/api/ingest \
  -H 'content-type: application/json' \
  -d '{"owner":"vercel","name":"next.js","fetchLimit":5}'
# → {"repoId":1,"processed":4,"failed":0,"prNumbers":[94964,94974,94766,94952]}

# Semantic search over what was just ingested
curl 'https://releaseiq.vercel.app/api/search?repo=vercel/next.js&q=caching%20improvements'
```

Search returns ranked, classified, AI-summarized hits — e.g.:

| sim | PR | title | type / audience |
|-----|----|-------|-----------------|
| 0.618 | #94766 | router instrumentation: add transition start context | feat / customer |
| 0.616 | #94974 | fix: after(callback) called after response end | fix / internal |
| 0.603 | #94964 | fix: request APIs in promises passed to after() | fix / internal |
| 0.601 | #94952 | typegen: default to Turbopack | chore / internal |

Each hit carries a model-written summary, change type, audience, the PR link, and its similarity score.

## How I Built It

**Frontend / deploy:** Next.js 15 (App Router) on Vercel.
**Database (the AWS half of the stack):** Amazon Aurora PostgreSQL + `pgvector` 0.8 (HNSW cosine), provisioned through the Vercel AWS Marketplace integration.
**AI:** Google Vertex AI — `gemini-2.5-flash` for summarize/classify, `gemini-embedding-001` for 1536-dim embeddings.
**ORM / pipeline:** Drizzle ORM; an ingest pipeline with bounded concurrency and isolated per-PR failure handling.

Two design decisions carry the project:

**1. Keyless database auth (no connection string).** The Aurora integration is **IAM/OIDC**, not a password — it injects `PGHOST`/`PGUSER`/`AWS_ROLE_ARN` and *no* `DATABASE_URL`. The app mints a short-lived RDS auth token at connect time via `@aws-sdk/rds-signer` + Vercel OIDC federation (`@vercel/functions/oidc`), so no AWS credentials are ever stored. A small `selectConnectionMode()` picks `url` (local dev) → `iam` (Aurora) → `none`, so the same code runs locally on a Postgres URL and in production on keyless Aurora.

**2. A provider-agnostic LLM layer that's also keyless on the AI side.** The LLM client is an OpenAI-compatible facade made provider-selectable via `LLM_PROVIDER`. The **Vertex provider** authenticates the same keyless way as the DB: it signs a service-account JWT locally (`node:crypto`) and exchanges it for a short-lived OAuth token — no static API key in the request path. Chat goes through Vertex's OpenAI-compatible endpoint; **embeddings go through the native `:predict` API**, because only it reliably honors `outputDimensionality=1536` to match the `vector(1536)` schema.

The provider is hardened for production: transient-failure retry with exponential backoff, honoring the provider's `Retry-After`, single-flight token minting (no cold-start stampede), clipped error bodies, env-value trimming, and input validation. Embeddings are **batched** — a whole concurrency window of PRs is embedded in one `:predict` call (~5× fewer round-trips and tokens).

## Architecture

```
GitHub merged PRs
      │  POST /api/ingest
      ▼
 ┌──────────────────────────────────────────┐
 │  Pipeline (bounded concurrency)           │
 │   summarize + classify ─┐                 │
 │   batch embed ──────────┤── Vertex AI     │  gemini-2.5-flash
 │                          │   (keyless OAuth)│  gemini-embedding-001
 └──────────┬───────────────┘                 │
            ▼ upsert (row + 1536-d vector)
   Aurora PostgreSQL + pgvector  ◄── keyless IAM/OIDC (RDS token)
            ▲   HNSW cosine
            │  GET /api/search  (embed query → cosine top-k)
            │  /api/release-notes (grouped notes from summaries)
   Next.js API routes on Vercel ── v0/Next.js UI
```

## Challenges

- **Vercel-managed Aurora's Query editor is read-only.** The schema looked applied but wasn't — `CREATE` statements were silently dropped. Fixed by running the idempotent DDL through the app's own writable IAM connection.
- **Embedding dimensions on Vertex.** Vertex's OpenAI-compatible embeddings endpoint ignores the `dimensions` param, which would yield 3072-dim vectors that fail to insert into `vector(1536)`. Solved by calling the native `:predict` API with `outputDimensionality=1536`.
- **Stale model names.** After switching providers, the old Qwen model ids (`qwen-plus`, `text-embedding-v4`) 404 on Vertex — they had to become `gemini-2.5-flash` / `gemini-embedding-001`. The hardened error messages (`Vertex embed 404: Publisher Model ... not found`) made this a 30-second diagnosis instead of a guessing game.

## Accomplishments

- A **fully keyless** path to both halves of the stack: AWS Aurora via IAM/OIDC, and Vertex AI via a locally-signed service-account JWT → short-lived OAuth token.
- Live, reproducible end-to-end demo: real PRs in, ranked semantic search out.
- Production-grade provider layer (retry/backoff, Retry-After, token single-flight, batched embeddings) — not a happy-path prototype.
- **118 tests** (unit + in-process Postgres/pgvector integration via PGlite), CI-gated at 80% coverage; green on every push.

## What I Learned

The most interesting engineering wasn't the AI — it was making credentials disappear. Both the database and the model provider authenticate without a stored secret in the request path (OIDC-federated RDS tokens on one side, locally-signed SA JWTs on the other). That pattern is the real "zero stack" story: zero stored credentials, short-lived tokens minted on demand.

I also learned how much a hardened provider layer pays off in ops: every failure surfaced with a precise, prefixed error (`Vertex embed 404 …`, `Google token exchange 401 …`), which turned what could have been hours of log-spelunking into instant diagnoses.

## What's Next

- v0-generated UI surfacing search + release notes (API-first today).
- Webhook-driven incremental ingest on merge, instead of on-demand batches.
- Aurora DSQL evaluation for the max-technical track.
- Multi-repo dashboards and per-audience release-note views.

## Built With

Next.js 15 · Vercel · Amazon Aurora PostgreSQL · pgvector (HNSW) · Drizzle ORM · Google Vertex AI (Gemini 2.5 Flash, gemini-embedding-001) · AWS IAM/OIDC (`@aws-sdk/rds-signer`, `@vercel/functions/oidc`) · TypeScript · Vitest / PGlite
