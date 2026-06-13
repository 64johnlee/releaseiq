import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { repos, type Repo } from "@/db/schema";

export async function upsertRepo(
  owner: string,
  name: string,
  provider = "github",
): Promise<Repo> {
  const db = getDb();
  const existing = await db
    .select()
    .from(repos)
    .where(and(eq(repos.owner, owner), eq(repos.name, name)))
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db
    .insert(repos)
    .values({ owner, name, provider })
    .returning();
  return inserted[0];
}

export async function findRepo(owner: string, name: string): Promise<Repo | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(repos)
    .where(and(eq(repos.owner, owner), eq(repos.name, name)))
    .limit(1);
  return rows[0] ?? null;
}
