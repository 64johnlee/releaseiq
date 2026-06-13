import { and, desc, eq, gt, sql } from "drizzle-orm";
import { cosineDistance } from "drizzle-orm";
import { getDb } from "@/db/client";
import { pullRequests } from "@/db/schema";
import type { PullRequestInput, PullRequestSummary, SearchHit } from "@/types";

interface UpsertArgs {
  repoId: number;
  input: PullRequestInput;
  summary: PullRequestSummary;
  embedding: number[];
}

export async function upsertPullRequest({
  repoId,
  input,
  summary,
  embedding,
}: UpsertArgs): Promise<void> {
  const db = getDb();
  await db
    .insert(pullRequests)
    .values({
      repoId,
      number: input.number,
      title: input.title,
      body: input.body,
      author: input.author,
      mergedAt: input.mergedAt ? new Date(input.mergedAt) : null,
      summary: summary.summary,
      changeType: summary.changeType,
      audience: summary.audience,
      embedding,
      raw: input.raw ?? null,
    })
    .onConflictDoUpdate({
      target: [pullRequests.repoId, pullRequests.number],
      set: {
        title: input.title,
        body: input.body,
        summary: summary.summary,
        changeType: summary.changeType,
        audience: summary.audience,
        embedding,
      },
    });
}

/**
 * Semantic similarity search over PR summaries using pgvector cosine distance.
 * Returns hits ordered by similarity (1 - cosine distance), filtered by a floor.
 */
export async function searchSimilar(
  repoId: number,
  queryEmbedding: number[],
  limit = 10,
  minSimilarity = 0.2,
): Promise<SearchHit[]> {
  const db = getDb();
  const similarity = sql<number>`1 - (${cosineDistance(pullRequests.embedding, queryEmbedding)})`;
  const rows = await db
    .select({
      number: pullRequests.number,
      title: pullRequests.title,
      summary: pullRequests.summary,
      changeType: pullRequests.changeType,
      similarity,
    })
    .from(pullRequests)
    .where(and(eq(pullRequests.repoId, repoId), gt(similarity, minSimilarity)))
    .orderBy(desc(similarity))
    .limit(limit);
  return rows;
}

export async function listByRepo(repoId: number, limit = 100) {
  const db = getDb();
  return db
    .select({
      number: pullRequests.number,
      summary: pullRequests.summary,
      changeType: pullRequests.changeType,
    })
    .from(pullRequests)
    .where(eq(pullRequests.repoId, repoId))
    .orderBy(desc(pullRequests.mergedAt))
    .limit(limit);
}
