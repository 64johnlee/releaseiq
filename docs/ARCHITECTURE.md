# ReleaseIQ — Architecture

AI release-intelligence on the **Vercel v0 + AWS Databases** stack. A repo's merged PRs are
summarized, classified, and embedded by an LLM, then stored in **Aurora PostgreSQL + pgvector**
for semantic "what changed and why" search and auto-generated release notes.

```mermaid
flowchart LR
  UI["v0 / Next.js UI<br/>(Vercel)"]

  subgraph API["Next.js API routes (Vercel)"]
    ING["POST /api/ingest"]
    SR["GET /api/search"]
    RN["/api/release-notes"]
    LIST["GET /api/repos<br/>GET /api/pulls"]
    H["GET /api/health"]
  end

  subgraph PIPE["Pipeline (bounded concurrency)"]
    SUM["summarize + classify"]
    EMB["embed"]
  end

  GH["GitHub merged PRs"]
  LLM["LLM<br/>OpenAI-compatible<br/>(Qwen DashScope / OpenAI)<br/>30s timeout"]
  DB[("Aurora PostgreSQL<br/>+ pgvector — HNSW cosine")]

  UI --> ING & SR & RN & LIST & H
  GH --> ING
  ING --> SUM --> LLM
  ING --> EMB --> LLM
  ING --> DB
  SR --> EMB
  SR -. cosine search .-> DB
  RN --> LLM
  RN --> DB
  LIST --> DB
  H -. SELECT 1 + pg_extension .-> DB
```

## Data flow

1. **Ingest** (`POST /api/ingest`) — fetches merged PRs from GitHub (or accepts them in the body),
   then for each PR (in bounded-concurrency batches, per-PR failures isolated): an LLM **summarizes +
   classifies** it (`feat`/`fix`/`perf`/`docs`/`chore`/`breaking`, `customer`/`internal`) and **embeds**
   the summary; the row + 1536-d vector is upserted into Postgres.
2. **Search** (`GET /api/search`) — embeds the query and runs a **pgvector cosine** search (HNSW index),
   returning ranked PRs with change-type, audience, and PR link.
3. **Release notes** (`/api/release-notes`) — POST generates grouped Markdown notes from the stored PR
   summaries via the LLM; GET returns the latest stored note.
4. **Browse** (`/api/repos`, `/api/pulls`) — ingested repos with PR counts, and per-repo PR lists.
5. **Health** (`/api/health`) — DB connectivity + pgvector readiness probe.

## Stack notes

- **Frontend/deploy:** Next.js 15 (App Router) on Vercel.
- **DB:** Amazon Aurora PostgreSQL with `pgvector` (HNSW cosine index). A free **Neon** Postgres is
  used as a dev stand-in; the submission targets an AWS database.
- **AI:** provider-agnostic, OpenAI-compatible LLM client (chat + embeddings) — works with Qwen
  DashScope or OpenAI via env; 30s request timeout.
- **Verification:** 63 tests (unit + PGlite integration against real pgvector), CI-gated at 80% coverage.
