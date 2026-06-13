import { NextResponse } from "next/server";
import { processRepo } from "@/lib/pipeline";
import { clampInt } from "@/lib/params";
import type { PullRequestInput } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface IngestBody {
  owner: string;
  name: string;
  pullRequests?: PullRequestInput[];
  fetchLimit?: number;
}

/** POST /api/ingest — ingest, summarize, embed, and store a repo's merged PRs. */
export async function POST(request: Request) {
  let body: IngestBody;
  try {
    body = (await request.json()) as IngestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.owner || !body.name) {
    return NextResponse.json({ error: "owner and name are required" }, { status: 400 });
  }

  try {
    const result = await processRepo(
      body.owner,
      body.name,
      body.pullRequests,
      clampInt(body.fetchLimit, 30, 1, 100),
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
