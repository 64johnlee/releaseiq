import { NextResponse } from "next/server";
import { serverError } from "@/lib/http";
import { listRepos } from "@/lib/repositories/repos";

export const dynamic = "force-dynamic";

/** GET /api/repos — list ingested repos with PR counts (newest first). */
export async function GET() {
  try {
    const repos = await listRepos();
    return NextResponse.json({ repos });
  } catch (err) {
    return serverError(err);
  }
}
