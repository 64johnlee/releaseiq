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
 * Core spine: ingest -> summarize -> embed -> store.
 * Accepts pre-supplied PRs (e.g. from request body) or fetches from GitHub when omitted.
 */
export async function processRepo(
  owner: string,
  name: string,
  prs?: PullRequestInput[],
  fetchLimit = 30,
): Promise<ProcessResult> {
  const repo = await upsertRepo(owner, name);
  const inputs = prs ?? (await fetchMergedPRs(owner, name, fetchLimit));

  const done: number[] = [];
  for (const pr of inputs) {
    const summary = await summarizePR(pr);
    const embedding = await embed(`${pr.title}\n\n${summary.summary}`);
    await upsertPullRequest({ repoId: repo.id, input: pr, summary, embedding });
    done.push(pr.number);
  }

  return { repoId: repo.id, processed: done.length, prNumbers: done };
}
