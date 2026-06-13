import { embed } from "@/lib/agent/llm";
import { upsertRepo } from "@/lib/repositories/repos";
import { upsertPullRequest } from "@/lib/repositories/pull-requests";
import { summarizePR } from "./summarize";
import { fetchMergedPRs } from "./ingest";
import type { PullRequestInput } from "@/types";

export interface ProcessResult {
  repoId: number;
  processed: number;
  prNumbers: number[];
}

/**
 * Max PRs summarized + embedded concurrently. Bounded so a large repo fits the
 * serverless function time limit without tripping LLM provider rate limits.
 */
const INGEST_CONCURRENCY = 5;

async function processOne(repoId: number, pr: PullRequestInput): Promise<number> {
  const summary = await summarizePR(pr);
  const embedding = await embed(`${pr.title}\n\n${summary.summary}`);
  await upsertPullRequest({ repoId, input: pr, summary, embedding });
  return pr.number;
}

/**
 * Core spine: ingest -> summarize -> embed -> store.
 * Accepts pre-supplied PRs (e.g. from request body) or fetches from GitHub when omitted.
 * PRs run in bounded-concurrency batches; result order matches input order.
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
  for (let i = 0; i < inputs.length; i += INGEST_CONCURRENCY) {
    const batch = inputs.slice(i, i + INGEST_CONCURRENCY);
    const nums = await Promise.all(batch.map((pr) => processOne(repo.id, pr)));
    prNumbers.push(...nums);
  }

  return { repoId: repo.id, processed: prNumbers.length, prNumbers };
}
