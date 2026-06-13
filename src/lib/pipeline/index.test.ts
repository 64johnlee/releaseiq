import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/llm", () => ({ embed: vi.fn() }));
vi.mock("@/lib/repositories/repos", () => ({ upsertRepo: vi.fn() }));
vi.mock("@/lib/repositories/pull-requests", () => ({ upsertPullRequest: vi.fn() }));
vi.mock("./summarize", () => ({ summarizePR: vi.fn() }));
vi.mock("./ingest", () => ({ fetchMergedPRs: vi.fn() }));

import { embed } from "@/lib/agent/llm";
import { upsertRepo } from "@/lib/repositories/repos";
import { upsertPullRequest } from "@/lib/repositories/pull-requests";
import { summarizePR } from "./summarize";
import { fetchMergedPRs } from "./ingest";
import { processRepo } from "./index";
import type { PullRequestInput, PullRequestSummary } from "@/types";

const summary: PullRequestSummary = {
  summary: "did a thing",
  changeType: "feat",
  audience: "customer",
};

const prs: PullRequestInput[] = [
  { number: 10, title: "Feature A", body: "b", author: "a", mergedAt: null },
  { number: 11, title: "Fix B", body: null, author: null, mergedAt: null },
];

beforeEach(() => {
  vi.mocked(upsertRepo)
    .mockReset()
    .mockResolvedValue({
      id: 42,
      owner: "o",
      name: "r",
      provider: "github",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
  vi.mocked(summarizePR).mockReset().mockResolvedValue(summary);
  vi.mocked(embed).mockReset().mockResolvedValue(new Array(1536).fill(0));
  vi.mocked(upsertPullRequest).mockReset().mockResolvedValue(undefined);
  vi.mocked(fetchMergedPRs).mockReset().mockResolvedValue(prs);
});

describe("processRepo", () => {
  it("processes provided PRs without fetching from GitHub", async () => {
    const result = await processRepo("o", "r", prs);
    expect(fetchMergedPRs).not.toHaveBeenCalled();
    expect(upsertRepo).toHaveBeenCalledWith("o", "r");
    expect(summarizePR).toHaveBeenCalledTimes(2);
    expect(embed).toHaveBeenCalledTimes(2);
    expect(embed).toHaveBeenCalledWith("Feature A\n\ndid a thing");
    expect(upsertPullRequest).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ repoId: 42, processed: 2, prNumbers: [10, 11] });
  });

  it("fetches from GitHub when PRs are not provided", async () => {
    const result = await processRepo("o", "r", undefined, 15);
    expect(fetchMergedPRs).toHaveBeenCalledWith("o", "r", 15);
    expect(result.processed).toBe(2);
  });

  it("threads the summary and embedding into the upsert", async () => {
    await processRepo("o", "r", [prs[0]]);
    expect(upsertPullRequest).toHaveBeenCalledWith({
      repoId: 42,
      input: prs[0],
      summary,
      embedding: expect.any(Array),
    });
  });

  it("returns zero for an empty PR list", async () => {
    const result = await processRepo("o", "r", []);
    expect(result).toEqual({ repoId: 42, processed: 0, prNumbers: [] });
    expect(summarizePR).not.toHaveBeenCalled();
  });

  it("processes more PRs than the concurrency limit, preserving input order", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      number: i + 1,
      title: `PR ${i + 1}`,
      body: null,
      author: null,
      mergedAt: null,
    }));
    const result = await processRepo("o", "r", many);
    expect(result.processed).toBe(12);
    expect(result.prNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(summarizePR).toHaveBeenCalledTimes(12);
    expect(upsertPullRequest).toHaveBeenCalledTimes(12);
  });
});
