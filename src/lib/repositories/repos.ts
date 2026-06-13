import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { pullRequests, repos, type Repo } from "@/db/schema";

export interface RepoSummary {
  owner: string;
  name: string;
  prCount: number;
  createdAt: Date;
}

/** All ingested repos with their PR counts, newest first. */
export async function listRepos(): Promise<RepoSummary[]> {
  const db = getDb();
  return db
    .select({
      owner: repos.owner,
      name: repos.name,
      prCount: sql<number>`count(${pullRequests.id})::int`,
      createdAt: repos.createdAt,
    })
    .from(repos)
    .leftJoin(pullRequests, eq(pullRequests.repoId, repos.id))
    .groupBy(repos.id)
    .orderBy(desc(repos.createdAt));
}

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
