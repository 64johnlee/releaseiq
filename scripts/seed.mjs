// Demo seed: inserts a sample repo + PRs + release note into the DB so the
// repos / pulls / release-notes views are demoable without an LLM key.
// Run: npm run db:seed   (reads DATABASE_URL from .env.local)
// Clear: delete the "demo/releaseiq" repo (cascades) — see README.
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

const EMBEDDING_DIM = 1536;

/** Deterministic, normalized pseudo-embedding from text — valid vectors, no LLM. */
function embed(text) {
  let seed = 0;
  for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  let x = seed || 1;
  const v = new Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    x = (1103515245 * x + 12345) >>> 0;
    v[i] = (x / 4294967296) * 2 - 1;
  }
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((z) => z / norm);
}

const REPO = { owner: "demo", name: "releaseiq" };
const PRS = [
  { number: 101, title: "Add dark mode toggle", summary: "Adds a dark mode toggle to settings.", changeType: "feat", audience: "customer" },
  { number: 102, title: "Fix login redirect loop", summary: "Fixes an infinite redirect loop on login.", changeType: "fix", audience: "customer" },
  { number: 103, title: "Speed up dashboard query", summary: "Optimizes the dashboard query (~3x faster).", changeType: "perf", audience: "customer" },
  { number: 104, title: "Bump Next.js to 15.1", summary: "Routine dependency bump.", changeType: "chore", audience: "internal" },
  { number: 105, title: "Document the public API", summary: "Adds reference docs for the REST API.", changeType: "docs", audience: "internal" },
  { number: 106, title: "Remove legacy v1 endpoints", summary: "Removes the deprecated v1 API.", changeType: "breaking", audience: "customer" },
];

const sql = postgres(url, { max: 1 });

try {
  const [repo] = await sql`
    insert into repos (owner, name, provider) values (${REPO.owner}, ${REPO.name}, 'github')
    on conflict (owner, name) do update set owner = excluded.owner
    returning id`;

  for (const pr of PRS) {
    const vec = `[${embed(`${pr.title}\n\n${pr.summary}`).join(",")}]`;
    const rawUrl = `https://github.com/${REPO.owner}/${REPO.name}/pull/${pr.number}`;
    await sql`
      insert into pull_requests (repo_id, number, title, summary, change_type, audience, embedding, raw, merged_at)
      values (${repo.id}, ${pr.number}, ${pr.title}, ${pr.summary}, ${pr.changeType}, ${pr.audience},
              ${vec}::vector, ${sql.json({ url: rawUrl })}, now())
      on conflict (repo_id, number) do update set
        title = excluded.title, summary = excluded.summary, change_type = excluded.change_type,
        audience = excluded.audience, embedding = excluded.embedding, raw = excluded.raw`;
  }

  const markdown = "## Features\n- (#101) Adds a dark mode toggle.\n\n## Fixes\n- (#102) Fixes a login redirect loop.\n\n## Performance\n- (#103) ~3x faster dashboard.\n\n## Breaking Changes\n- (#106) Removes the v1 API.";
  await sql`
    insert into release_notes (repo_id, version, markdown, pr_numbers)
    values (${repo.id}, 'demo-1.0', ${markdown}, ${sql.json(PRS.map((p) => p.number))})`;

  const [{ count }] = await sql`select count(*)::int as count from pull_requests where repo_id = ${repo.id}`;
  console.log(`Seeded ${REPO.owner}/${REPO.name}: ${count} PRs + 1 release note.`);
} finally {
  await sql.end();
}
