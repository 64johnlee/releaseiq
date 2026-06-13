import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/llm", () => ({ chat: vi.fn() }));

import { chat } from "@/lib/agent/llm";
import { summarizePR } from "./summarize";
import type { PullRequestInput } from "@/types";

const pr: PullRequestInput = {
  number: 1,
  title: "Add Redis caching",
  body: "Speeds up reads",
  author: "alice",
  mergedAt: null,
};

describe("summarizePR", () => {
  beforeEach(() => vi.mocked(chat).mockReset());

  it("parses a valid JSON response", async () => {
    vi.mocked(chat).mockResolvedValue(
      JSON.stringify({ summary: "Adds Redis caching", changeType: "perf", audience: "customer" }),
    );
    const result = await summarizePR(pr);
    expect(result).toEqual({
      summary: "Adds Redis caching",
      changeType: "perf",
      audience: "customer",
    });
  });

  it("falls back to raw text as summary when JSON is invalid", async () => {
    vi.mocked(chat).mockResolvedValue("not json at all");
    const result = await summarizePR(pr);
    expect(result.summary).toBe("not json at all");
    expect(result.changeType).toBe("chore");
    expect(result.audience).toBe("internal");
  });

  it("coerces invalid enum values to safe defaults", async () => {
    vi.mocked(chat).mockResolvedValue(
      JSON.stringify({ summary: "x", changeType: "banana", audience: "aliens" }),
    );
    const result = await summarizePR(pr);
    expect(result.changeType).toBe("chore");
    expect(result.audience).toBe("internal");
  });

  it("uses the PR title when the model returns an empty summary", async () => {
    vi.mocked(chat).mockResolvedValue(
      JSON.stringify({ summary: "   ", changeType: "fix", audience: "customer" }),
    );
    const result = await summarizePR(pr);
    expect(result.summary).toBe("Add Redis caching");
  });
});
