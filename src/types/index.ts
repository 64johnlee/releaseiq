/** A merged pull request as ingested from a provider (e.g. GitHub), before AI processing. */
export interface PullRequestInput {
  number: number;
  title: string;
  body: string | null;
  author: string | null;
  mergedAt: string | null;
  raw?: Record<string, unknown>;
}

export type ChangeType = "feat" | "fix" | "perf" | "docs" | "chore" | "breaking";
export type Audience = "customer" | "internal";

/** Output of the summarization step for a single PR. */
export interface PullRequestSummary {
  summary: string;
  changeType: ChangeType;
  audience: Audience;
}

export interface SearchHit {
  number: number;
  title: string;
  summary: string | null;
  changeType: string | null;
  similarity: number;
}
