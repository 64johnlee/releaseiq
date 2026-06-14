import { embedMany } from "@/lib/agent/llm";
import { upsertRepo } from "@/lib/repositories/repos";
import { upsertPullRequest } from "@/lib/repositories/pull-requests";
import { summarizePR } from "./summarize";
import { fetchMergedPRs } from "./ingest";
import type { PullRequestInput, PullRequestSummary } from "@/types";

export interface ProcessResult {
  repoId: number;
  processed: number;
  /** PRs whose summarize/embed/store failed; the rest still succeed. */
  failed: number;
  prNumbers: number[];
}

/**
 * Batch size: PRs summarized concurrently and embedded together in one call.
 * Bounded so a large repo fits the serverless function time limit, stays within
 * the embedding model's per-request instance cap, and avoids LLM rate limits.
 */
const INGEST_CONCURRENCY = 5;

interface BatchOutcome {
  /** PR numbers that fully succeeded (summarized, embedded, stored), in input order. */
  ok: number[];
  /** Count of PRs in this batch that failed at any stage. */
  failed: number;
}

/**
 * Process one bounded batch: summarize each PR independently, embed all successful
 * summaries in a SINGLE provider call, then store each. Summarize and store failures
 * are isolated per-PR; an embed failure (one shared call) fails the batch's ready PRs
 * together — an accepted trade for far fewer embedding round-trips.
 */
async function processBatch(repoId: number, batch: PullRequestInput[]): Promise<BatchOutcome> {
  let failed = 0;

  const summarized = await Promise.allSettled(batch.map((pr) => summarizePR(pr)));
  const ready: { pr: PullRequestInput; summary: PullRequestSummary }[] = [];
  summarized.forEach((result, i) => {
    if (result.status === "fulfilled") ready.push({ pr: batch[i], summary: result.value });
    else failed += 1;
  });
  if (ready.length === 0) return { ok: [], failed };

  let embeddings: number[][];
  try {
    embeddings = await embedMany(ready.map(({ pr, summary }) => `${pr.title}\n\n${summary.summary}`));
  } catch {
    return { ok: [], failed: failed + ready.length };
  }

  const stored = await Promise.allSettled(
    ready.map(({ pr, summary }, i) =>
      upsertPullRequest({ repoId, input: pr, summary, embedding: embeddings[i] }).then(
        () => pr.number,
      ),
    ),
  );
  const ok: number[] = [];
  stored.forEach((result) => {
    if (result.status === "fulfilled") ok.push(result.value);
    else failed += 1;
  });
  return { ok, failed };
}

/**
 * Core spine: ingest -> summarize -> embed -> store.
 * Accepts pre-supplied PRs (e.g. from request body) or fetches from GitHub when omitted.
 * PRs run in bounded-concurrency batches; result order matches input order.
 * A single PR's failure is isolated (counted in `failed`) so the rest still succeed.
 */
export async function processRepo(
  owner: string,
  name: string,
  prs?: PullRequestInput[],
  fetchLimit = 30,
): Promise<ProcessResult> {
  const repo = await upsertRepo(owner, name);
  const inputs = prs ?? (await fetchMergedPRs(owner, name, fetchLimit));

  const prNumbers: number[] = [];
  let failed = 0;
  for (let i = 0; i < inputs.length; i += INGEST_CONCURRENCY) {
    const batch = inputs.slice(i, i + INGEST_CONCURRENCY);
    const outcome = await processBatch(repo.id, batch);
    prNumbers.push(...outcome.ok);
    failed += outcome.failed;
  }

  return { repoId: repo.id, processed: prNumbers.length, failed, prNumbers };
}
