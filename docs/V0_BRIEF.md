# ReleaseIQ — v0 Frontend Brief

Paste-ready brief for **v0.dev** to generate the ReleaseIQ frontend. Built on the existing
Next.js 15 (App Router) backend spine. Target deploy: **Vercel** (H0 hackathon).

> **Judging context:** Design is 1 of 4 equally weighted criteria. The default v0 output
> (shadcn cards on a gray page) loses this axis. This brief pushes for an opinionated,
> editorial, motion-aware UI that reads as a real product in a screenshot.

---

## 1. Paste this into v0.dev

> Build **ReleaseIQ**, an AI release-intelligence web app for engineering and product teams.
> You connect a GitHub repo; an agent has already summarized, classified, and embedded its
> merged PRs into a vector database. The UI lets a user (1) connect a repo, (2) **semantically
> search** "what changed and why," and (3) read **auto-grouped release notes**.
>
> **Design direction — "Signal": technical editorial, light-primary with an intentional dark mode.**
> NOT a generic dashboard. Use strong scale contrast (oversized grotesk display headings against
> small monospace metadata), a single confident accent used *semantically*, a bento/editorial
> composition that breaks the uniform grid, layered surfaces with subtle depth, and purposeful
> motion (staggered result reveals, animated similarity meters). Avoid uniform card grids, uniform
> radii/shadows, and gray-on-white safety. Typography: **Geist** (display/body) + **Geist Mono**
> (PR numbers, change-type tags, similarity %).
>
> **Three surfaces:** a Connect entry, a Repo workspace (search is the hero), and a Release Notes
> panel. Wire to the API contract in section 5. Use React Server Components for data fetching and
> client components for the search box and interactions. Animate with CSS transforms/opacity only.

---

## 2. Design system (define as CSS custom properties — do not hardcode)

```css
:root {
  /* light */
  --bg:        oklch(98.5% 0.004 270);
  --surface:   oklch(100% 0 0);
  --surface-2: oklch(96% 0.006 270);
  --text:      oklch(22% 0.02 270);
  --muted:     oklch(55% 0.02 270);
  --border:    oklch(90% 0.008 270);
  --accent:    oklch(58% 0.20 262);   /* "signal" — used semantically, not decoratively */

  /* change-type semantics (badges, meters) */
  --c-feat:     oklch(68% 0.16 150);
  --c-fix:      oklch(76% 0.14 80);
  --c-perf:     oklch(62% 0.20 300);
  --c-breaking: oklch(60% 0.22 25);
  --c-docs:     oklch(66% 0.10 230);
  --c-chore:    oklch(70% 0.02 270);

  --text-display: clamp(2.5rem, 1rem + 6vw, 5.5rem);
  --text-h2:      clamp(1.4rem, 1rem + 1.5vw, 2rem);
  --space-section: clamp(3rem, 2rem + 4vw, 7rem);
  --radius:    14px;
  --ease:      cubic-bezier(0.16, 1, 0.3, 1);
  --dur:       320ms;
}
:root[data-theme="dark"] {
  --bg:        oklch(16% 0.012 270);
  --surface:   oklch(20% 0.015 270);
  --surface-2: oklch(24% 0.018 270);
  --text:      oklch(95% 0.01 270);
  --muted:     oklch(68% 0.02 270);
  --border:    oklch(30% 0.02 270);
  --accent:    oklch(70% 0.18 262);
}
```

- Both themes must feel intentional. Add a quiet theme toggle. Do **not** default to dark blindly.
- Subtle grain/noise overlay on the hero only. Respect `prefers-reduced-motion`.

---

## 3. Screens & components

### A. Connect (entry / empty state)
- Oversized editorial hero: "Know what shipped — and why." Monospace eyebrow label above it.
- Single focal input: `owner/repo` (e.g. `vercel/next.js`) + "Analyze" button → `POST /api/ingest`.
- While processing: deliberate loading state with the live **processed count** (the response
  returns `{ processed, prNumbers }`). Animate to a success state, then route to the workspace.
- Footer strip: tiny `/api/health` status dot (green when `database:"connected"` && `pgvector:true`).

### B. Repo workspace (the core screen — search is the hero)
- **Search bar, front and center:** "Ask what changed and why…" → `GET /api/search`.
  Deliberate focus transition; results stagger in.
- **Result cards** (one per `SearchHit`), bento rhythm — not uniform:
  - `#<number>` in mono, linked to the GitHub PR.
  - Title (display weight) + AI `summary`.
  - **Change-type badge** colored by the semantic tokens (`feat`/`fix`/`perf`/`breaking`/`docs`/`chore`).
  - **Similarity meter:** render `similarity` (0–1) as an animated horizontal precision bar +
    mono `%`. This is a signature visual — make it feel like instrumentation.
- A compact **stats strip**: total PRs, breakdown by change type (small bar/segmented control).

### C. Release Notes panel
- Grouped Markdown: **Features → Fixes → Performance → Breaking Changes → Other** (omit empty groups).
- Each line references its PR `(#number)`. A "Copy as Markdown" action.
- **NOTE:** this needs a `GET /api/release-notes?repo=owner/name` endpoint that does not exist yet
  (data lives in the `release_notes` table: `{ markdown, prNumbers, version }`). v0 should build the
  view against the shape below and stub the fetch; I'll add the endpoint in the backend.

---

## 4. Interaction & motion
- Result reveal: staggered (40ms/item) fade + 8px rise, transform/opacity only.
- Similarity meters animate width on mount with `--ease`.
- Search submit: input lifts/focuses, results region transitions in; no layout shift (reserve space).
- Hover/focus/active states on every interactive element — designed, not default.

---

## 5. API contract (already built unless noted)

```ts
// GET /api/health
{ status: "ok", database: "connected", pgvector: boolean }   // or 503 { status:"error", message }

// POST /api/ingest   body: { owner, name, pullRequests?, fetchLimit?=30 }
{ repoId: number, processed: number, prNumbers: number[] }    // or { error }

// GET /api/search?repo=owner/name&q=...&limit=10
{
  query: string,
  repo: string,            // "owner/name"
  hits: SearchHit[]
}
interface SearchHit {
  number: number;
  title: string;
  summary: string | null;
  changeType: "feat"|"fix"|"perf"|"docs"|"chore"|"breaking" | null;
  similarity: number;      // 0..1, higher = closer
}

// GET /api/release-notes?repo=owner/name   *** NOT YET BUILT — stub against this shape ***
{ repo: string, version: string | null, markdown: string, prNumbers: number[] }
```

Constraints: Next.js 15 App Router, RSC for fetches + client components for search/interactions,
Tailwind allowed but **driven by the tokens above** (no stock shadcn look), deploys cleanly on Vercel.

---

## 6. Acceptance checklist
- [ ] Doesn't look like a default Tailwind/shadcn template
- [ ] Clear hierarchy via scale contrast (display vs mono metadata)
- [ ] Change-type color is semantic, consistent across badges + meters
- [ ] Similarity rendered as an animated meter, not just a number
- [ ] Designed hover/focus/active states everywhere
- [ ] Both light + dark feel intentional; reduced-motion respected
- [ ] No layout shift on search; transform/opacity-only motion
- [ ] Believable as a real product screenshot for the demo video
