import { NextResponse } from "next/server";
import { serverError } from "@/lib/http";
import { parseRepo } from "@/lib/params";
import { findRepo } from "@/lib/repositories/repos";
import { latestReleaseNote } from "@/lib/repositories/release-notes";
import { generateReleaseNotes } from "@/lib/pipeline/release-notes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/release-notes?repo=owner/name — latest stored release notes. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repoParam = searchParams.get("repo");
  const parsed = parseRepo(repoParam);
  if (!parsed) {
    return NextResponse.json({ error: "repo=owner/name is required" }, { status: 400 });
  }
  const [owner, name] = parsed;
  try {
    const repo = await findRepo(owner, name);
    if (!repo) {
      return NextResponse.json({ error: "repo not ingested yet" }, { status: 404 });
    }
    const note = await latestReleaseNote(repo.id);
    if (!note) {
      return NextResponse.json({ error: "no release notes generated yet" }, { status: 404 });
    }
    return NextResponse.json({
      repo: repoParam,
      version: note.version,
      markdown: note.markdown,
      prNumbers: note.prNumbers ?? [],
    });
  } catch (err) {
    return serverError(err);
  }
}

interface GenerateBody {
  owner: string;
  name: string;
  version?: string;
}

/** POST /api/release-notes — generate + store release notes from current PRs. */
export async function POST(request: Request) {
  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.owner || !body.name) {
    return NextResponse.json({ error: "owner and name are required" }, { status: 400 });
  }
  try {
    const note = await generateReleaseNotes(body.owner, body.name, body.version);
    if (!note) {
      return NextResponse.json({ error: "repo not ingested yet" }, { status: 404 });
    }
    return NextResponse.json({
      repo: `${body.owner}/${body.name}`,
      version: note.version,
      markdown: note.markdown,
      prNumbers: note.prNumbers ?? [],
    });
  } catch (err) {
    return serverError(err);
  }
}
