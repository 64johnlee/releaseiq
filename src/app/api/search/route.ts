import { NextResponse } from "next/server";
import { embed } from "@/lib/agent/llm";
import { findRepo } from "@/lib/repositories/repos";
import { searchSimilar } from "@/lib/repositories/pull-requests";

export const dynamic = "force-dynamic";

/** GET /api/search?repo=owner/name&q=...&limit=10 — semantic PR search. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repoParam = searchParams.get("repo");
  const q = searchParams.get("q");
  const limit = Number(searchParams.get("limit") ?? "10");

  if (!repoParam || !repoParam.includes("/") || !q) {
    return NextResponse.json(
      { error: "repo=owner/name and q are required" },
      { status: 400 },
    );
  }

  const [owner, name] = repoParam.split("/");
  try {
    const repo = await findRepo(owner, name);
    if (!repo) {
      return NextResponse.json({ error: "repo not ingested yet" }, { status: 404 });
    }
    const queryEmbedding = await embed(q);
    const hits = await searchSimilar(repo.id, queryEmbedding, limit);
    return NextResponse.json({ query: q, repo: repoParam, hits });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
