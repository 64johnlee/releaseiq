import { NextResponse } from "next/server";
import { embed } from "@/lib/agent/llm";
import { serverError } from "@/lib/http";
import { clampInt, parseRepo } from "@/lib/params";
import { findRepo } from "@/lib/repositories/repos";
import { searchSimilar } from "@/lib/repositories/pull-requests";

export const dynamic = "force-dynamic";

/** GET /api/search?repo=owner/name&q=...&limit=10 — semantic PR search. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repoParam = searchParams.get("repo");
  const q = searchParams.get("q");
  const limit = clampInt(searchParams.get("limit"), 10, 1, 50);

  const parsed = parseRepo(repoParam);
  if (!parsed || !q) {
    return NextResponse.json(
      { error: "repo=owner/name and q are required" },
      { status: 400 },
    );
  }
  const [owner, name] = parsed;
  try {
    const repo = await findRepo(owner, name);
    if (!repo) {
      return NextResponse.json({ error: "repo not ingested yet" }, { status: 404 });
    }
    const queryEmbedding = await embed(q);
    const hits = await searchSimilar(repo.id, queryEmbedding, limit);
    return NextResponse.json({ query: q, repo: repoParam, hits });
  } catch (err) {
    return serverError(err);
  }
}
