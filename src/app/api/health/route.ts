import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export const dynamic = "force-dynamic";

/** Row count from a drizzle execute result — array-like on postgres-js, `{rows}` on others. */
function rowCount(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  const rows = (result as { rows?: unknown[] }).rows;
  return Array.isArray(rows) ? rows.length : 0;
}

/** Liveness + DB + pgvector readiness probe. */
export async function GET() {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    const ext = await db.execute(
      sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
    );
    const pgvector = rowCount(ext) > 0;
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
