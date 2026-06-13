import { NextResponse } from "next/server";
import { clampInt, parseRepo } from "@/lib/params";
import { findRepo } from "@/lib/repositories/repos";
import { listByRepo } from "@/lib/repositories/pull-requests";

export const dynamic = "force-dynamic";

/** GET /api/pulls?repo=owner/name&limit=100 — ingested PRs for a repo (newest first). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repoParam = searchParams.get("repo");
  const parsed = parseRepo(repoParam);
  if (!parsed) {
    return NextResponse.json({ error: "repo=owner/name is required" }, { status: 400 });
  }
  const [owner, name] = parsed;
  const limit = clampInt(searchParams.get("limit"), 100, 1, 200);
  try {
    const repo = await findRepo(owner, name);
    if (!repo) {
      return NextResponse.json({ error: "repo not ingested yet" }, { status: 404 });
    }
    const pullRequests = await listByRepo(repo.id, limit);
    return NextResponse.json({ repo: repoParam, pullRequests });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
