# ReleaseIQ — 3-Minute Demo Script (H0 submission video)

**Target:** < 3:00 · **Live URL:** https://releaseiq.vercel.app
**Format:** screen recording + voiceover. Have a terminal + browser ready; pre-open the architecture diagram.

> Tip: pre-run an ingest once before recording so the DB is warm, then re-run live (idempotent upsert) so the "processed" result appears instantly without waiting on cold start.

---

### 0:00–0:15 — Hook (the problem)
**Voiceover:**
> "Every team ships dozens of merged PRs a week. Then someone has to figure out: what actually changed, what do we tell customers, which fixes matter to support. Today that's manual and from memory. ReleaseIQ makes it a query."

**On screen:** title card → `releaseiq.vercel.app`.

### 0:15–0:35 — What it is
**Voiceover:**
> "Point it at a repo's merged PRs. An agent summarizes and classifies each one, embeds it, and stores it in Aurora Postgres with pgvector — so the whole history becomes semantically searchable, plus auto-generated release notes."

**On screen:** the architecture diagram (`docs/ARCHITECTURE.md`) — trace GitHub → pipeline → Vertex AI / Aurora → search.

### 0:35–1:05 — Live: it's actually up
**Voiceover:**
> "This is live in production. Health check — database connected, pgvector ready."

**On screen — run:**
```bash
curl https://releaseiq.vercel.app/api/health
# {"status":"ok","database":"connected","pgvector":true}
```

### 1:05–1:45 — Live: ingest real PRs
**Voiceover:**
> "Let's ingest the last few merged PRs from vercel/next.js. Each one is summarized and classified by Gemini, embedded, and stored — in one batched call, with per-PR failures isolated."

**On screen — run:**
```bash
curl -X POST https://releaseiq.vercel.app/api/ingest \
  -H 'content-type: application/json' \
  -d '{"owner":"vercel","name":"next.js","fetchLimit":5}'
# {"processed":4,"failed":0,"prNumbers":[94964,94974,94766,94952]}
```
> "Four processed, zero failed — billed to a Google Cloud credit."

### 1:45–2:20 — Live: semantic search (the payoff)
**Voiceover:**
> "Now the payoff. I'll ask 'what changed about caching' — not keyword match, semantic search over the embeddings."

**On screen — run:**
```bash
curl 'https://releaseiq.vercel.app/api/search?repo=vercel/next.js&q=caching%20improvements'
```
> "Ranked by cosine similarity, each hit has an AI summary, a change type, an audience tag — customer vs internal — and the PR link. That's the support/PM/sales view of a changelog, generated automatically."

**On screen:** highlight one hit's `summary`, `changeType`, `audience`, `similarity`.

### 2:20–2:50 — The technical edge
**Voiceover:**
> "Two things I'm proud of. First — it's *keyless on both halves of the stack*. Aurora authenticates with short-lived AWS IAM tokens over OIDC, no connection string. And the model provider authenticates the same way — a service-account JWT signed locally, exchanged for a short-lived OAuth token. No static credentials in the request path. Second — the provider layer is production-grade: retry with backoff, honors Retry-After, single-flight token minting, batched embeddings — and 118 tests gating every push."

**On screen:** split — `selectConnectionMode()` / `google-auth.ts` snippet, and the green CI check / test count.

### 2:50–3:00 — Close
**Voiceover:**
> "ReleaseIQ — release intelligence on the zero stack. Live at releaseiq dot vercel dot app. Thanks."

**On screen:** live URL + "Vercel v0 + AWS Databases · Vertex AI".

---

## Shot checklist
- [ ] Terminal font large enough to read at 1080p
- [ ] Health / ingest / search run on camera (or pre-warmed + re-run)
- [ ] Architecture diagram visible once
- [ ] One code snippet each for keyless DB + keyless LLM
- [ ] CI green / "118 tests" on screen
- [ ] Live URL shown at start and end
- [ ] Total under 3:00 (Devpost cap)

## Required H0 deliverables (track alongside the video)
- [x] Deployed Vercel link — https://releaseiq.vercel.app
- [ ] < 3-min demo video (this script) — upload **Unlisted** to YouTube
- [ ] Architecture diagram image (export `docs/ARCHITECTURE.md` mermaid)
- [ ] AWS DB-usage screenshot (Aurora in Vercel Storage / AWS console)
- [ ] Vercel Team ID — `team_sEqStNiZyvnebztGeaAFNUCp`
- [ ] Text writeup — `docs/SUBMISSION.md`
