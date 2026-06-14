# v0 prompt — regenerate the Release Notes surface against live Aurora

Use this in [v0.dev](https://v0.dev) for the H0 demo. It exercises the on-theme
path the judges want to see: **v0 building a real surface against a live AWS
Aurora PostgreSQL database**, importing this repo and reusing its schema + API.

## Before you paste

1. In the v0 chat, connect the GitHub repo (`releaseiq`) via the Git panel so v0
   imports the existing Next.js 15 + Drizzle code and the API routes.
2. Attach the **Aurora PostgreSQL** database from the Vercel Marketplace
   integration to the project. v0 auto-injects the connection string env var
   (`DATABASE_URL` / `POSTGRES_URL`) — the app already resolves whichever is set
   (`src/db/connection-string.ts`), so no code change is needed.
3. Make sure the `release_notes` and `pull_requests` tables are seeded
   (`npm run db:seed`) so the page renders real rows in the demo.

## The prompt

> Build a **Release Notes** page for this Next.js 15 (App Router) project. Import
> the existing repo — reuse the Drizzle schema in `src/db/schema.ts` and the
> existing API route `GET /api/release-notes?repo={owner}/{name}` (it returns the
> standard envelope `{ success, data, error }` where `data` is the generated
> release-notes markdown plus the source pull requests). Connect to the attached
> AWS Aurora PostgreSQL database; do not hardcode credentials — read the
> connection string from the injected env var.
>
> Page layout (route `/release-notes`):
> - A repo selector at the top (chips, one per row in the `repos` table; fetch
>   from `GET /api/repos`). Selecting a repo loads its latest release notes.
> - A main editorial column rendering the release-notes markdown: a clear version
>   header, then grouped sections. Render each source PR as a compact card showing
>   title, PR number (linked to its GitHub URL), merge date, and an **audience
>   badge** (one of `developer`, `end-user`, `internal`) color-coded semantically
>   — not decoratively.
> - A right rail with quick stats: PR count, date range covered, and an
>   "audience mix" breakdown.
>
> States: a skeleton loader while fetching, a friendly empty state when a repo has
> no release notes yet ("No release notes generated for this repo yet"), and an
> inline error state if the API returns `success: false` (show `error`).
>
> Design direction: **editorial / magazine**, not a default dashboard. Strong
> typographic hierarchy through scale contrast, intentional spacing rhythm (not
> uniform padding), one disciplined accent color used semantically for the
> audience badges, and designed hover/focus states on the PR cards and repo chips.
> Use Tailwind + shadcn/ui primitives but do not ship them looking like defaults.
> Semantic HTML (`<main>`, `<section aria-labelledby>`, real headings). Animate
> only `transform`/`opacity`. Must look believable in a real product screenshot.
>
> Keep it a server component for the initial data fetch where possible; make the
> repo selector a small client component. Do not invent new API routes — use the
> two that exist.

## After v0 generates

- Open the PR from v0's Git panel against `main`, review the diff, and deploy on
  merge — that full v0 → branch → PR → deploy loop on live Aurora is the moment
  to capture in the demo video.
- Note: end-to-end generation of *new* release notes still needs a working LLM
  embedding/chat key (the Qwen key is dead — 401). For the demo, seeded rows
  render the surface without needing a live key.
