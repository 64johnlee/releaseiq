import { NextResponse } from "next/server";
import { serverError } from "@/lib/http";
import { processRepo } from "@/lib/pipeline";
import { clampInt } from "@/lib/params";
import type { PullRequestInput } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cap on caller-supplied PRs per request, to bound work within maxDuration. */
const MAX_INGEST_PRS = 200;

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

  if (body.pullRequests !== undefined) {
    if (!Array.isArray(body.pullRequests)) {
      return NextResponse.json({ error: "pullRequests must be an array" }, { status: 400 });
    }
    if (body.pullRequests.length > MAX_INGEST_PRS) {
      return NextResponse.json(
        { error: `pullRequests cannot exceed ${MAX_INGEST_PRS} items` },
        { status: 400 },
      );
    }
    const bad = (body.pullRequests as unknown[]).find((pr) => {
      const p = pr as { number?: unknown; title?: unknown };
      return typeof p.number !== "number" || typeof p.title !== "string";
    });
    if (bad !== undefined) {
      return NextResponse.json(
        { error: "each pull request needs a numeric `number` and string `title`" },
        { status: 400 },
      );
    }
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
    return serverError(err);
  }
}
