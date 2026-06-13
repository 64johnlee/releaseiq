import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export const dynamic = "force-dynamic";

/** Liveness + DB + pgvector readiness probe. */
export async function GET() {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    const ext = await db.execute(
      sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
    );
    const pgvector = (ext as unknown as { length: number }).length > 0;
    return NextResponse.json({
      status: "ok",
      database: "connected",
      pgvector,
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
