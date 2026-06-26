import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { repos, pullRequests, releaseNotes } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const EMBEDDING_DIM = 1536;

function embed(text: string): number[] {
  let seed = 0;
  for (let i = 0; i < text.length; i++)
    seed = (((seed * 31) >>> 0) + text.charCodeAt(i)) >>> 0;
  let x = seed || 1;
  const v = new Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    x = (1103515245 * x + 12345) >>> 0;
    v[i] = (x / 4294967296) * 2 - 1;
  }
  const norm = Math.sqrt(v.reduce((a: number, b: number) => a + b * b, 0)) || 1;
  return v.map((z: number) => z / norm);
}

/** POST /api/seed-demo — one-shot demo seed. Remove after use. */
export async function POST() {
  const db = getDb();

  const PRS = [
    { number: 101, title: "Add dark mode toggle", summary: "Adds a dark mode toggle to settings.", changeType: "feat", audience: "customer" },
    { number: 102, title: "Fix login redirect loop", summary: "Fixes an infinite redirect loop on login.", changeType: "fix", audience: "customer" },
    { number: 103, title: "Speed up dashboard query", summary: "Optimises the dashboard query (~3x faster).", changeType: "perf", audience: "customer" },
    { number: 104, title: "Bump Next.js to 15.1", summary: "Routine dependency bump.", changeType: "chore", audience: "internal" },
    { number: 105, title: "Document the public API", summary: "Adds reference docs for the REST API.", changeType: "docs", audience: "internal" },
    { number: 106, title: "Remove legacy v1 endpoints", summary: "Removes the deprecated v1 API.", changeType: "breaking", audience: "customer" },
  ];

  const [repo] = await db
    .insert(repos)
    .values({ owner: "demo", name: "releaseiq", provider: "github" })
    .onConflictDoUpdate({ target: [repos.owner, repos.name], set: { owner: "demo" } })
    .returning();

  for (const pr of PRS) {
    const vec = `[${embed(`${pr.title}\n\n${pr.summary}`).join(",")}]`;
    await db
      .insert(pullRequests)
      .values({
        repoId: repo.id,
        number: pr.number,
        title: pr.title,
        summary: pr.summary,
        changeType: pr.changeType,
        audience: pr.audience,
        embedding: sql`${vec}::vector`,
        raw: { url: `https://github.com/demo/releaseiq/pull/${pr.number}` },
        mergedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [pullRequests.repoId, pullRequests.number],
        set: { title: pr.title, summary: pr.summary, changeType: pr.changeType, audience: pr.audience },
      });
  }

  const markdown =
    "## Features\n- (#101) Adds a dark mode toggle.\n\n## Fixes\n- (#102) Fixes a login redirect loop.\n\n## Performance\n- (#103) ~3x faster dashboard.\n\n## Breaking Changes\n- (#106) Removes the v1 API.";

  await db
    .insert(releaseNotes)
    .values({
      repoId: repo.id,
      version: "demo-1.0",
      markdown,
      prNumbers: PRS.map((p) => p.number),
    })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true, repo: "demo/releaseiq", prs: PRS.length });
}
