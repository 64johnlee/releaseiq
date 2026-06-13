import { NextResponse } from "next/server";
import { listRepos } from "@/lib/repositories/repos";

export const dynamic = "force-dynamic";

/** GET /api/repos — list ingested repos with PR counts (newest first). */
export async function GET() {
  try {
    const repos = await listRepos();
    return NextResponse.json({ repos });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
