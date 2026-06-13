import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/llm", () => ({ chat: vi.fn() }));
vi.mock("@/lib/repositories/repos", () => ({ findRepo: vi.fn() }));
vi.mock("@/lib/repositories/pull-requests", () => ({ listByRepo: vi.fn() }));
vi.mock("@/lib/repositories/release-notes", () => ({ createReleaseNote: vi.fn() }));

import { chat } from "@/lib/agent/llm";
import { findRepo } from "@/lib/repositories/repos";
import { listByRepo } from "@/lib/repositories/pull-requests";
import { createReleaseNote } from "@/lib/repositories/release-notes";
import { generateReleaseNotes } from "./release-notes";

// listByRepo returns enriched rows; release-notes generation only reads
// number/summary/changeType, so fill the rest with nulls for the fixtures.
const row = (number: number, summary: string | null, changeType: string | null) => ({
  number,
  title: `PR ${number}`,
  summary,
  changeType,
  audience: null,
  mergedAt: null,
  url: null,
});

const repo = {
  id: 7,
  owner: "o",
  name: "r",
  provider: "github",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  vi.mocked(findRepo).mockReset().mockResolvedValue(repo);
  vi.mocked(listByRepo).mockReset();
  vi.mocked(chat).mockReset().mockResolvedValue("## Features\n- (#1) thing");
  vi.mocked(createReleaseNote)
    .mockReset()
    .mockImplementation(async (a) => ({
      id: 1,
      repoId: a.repoId,
      version: a.version ?? null,
      markdown: a.markdown,
      prNumbers: a.prNumbers,
      createdAt: new Date("2026-01-02T00:00:00Z"),
    }));
});

describe("generateReleaseNotes", () => {
  it("returns null when the repo is not ingested", async () => {
    vi.mocked(findRepo).mockResolvedValue(null);
    const note = await generateReleaseNotes("o", "r");
    expect(note).toBeNull();
    expect(chat).not.toHaveBeenCalled();
    expect(createReleaseNote).not.toHaveBeenCalled();
  });

  it("generates and stores notes from summarized PRs", async () => {
    vi.mocked(listByRepo).mockResolvedValue([
      row(1, "adds caching", "feat"),
      row(2, "fixes a bug", "fix"),
    ]);
    const note = await generateReleaseNotes("o", "r", "1.0.0");
    expect(chat).toHaveBeenCalledTimes(1);
    expect(createReleaseNote).toHaveBeenCalledWith({
      repoId: 7,
      markdown: "## Features\n- (#1) thing",
      prNumbers: [1, 2],
      version: "1.0.0",
    });
    expect(note?.prNumbers).toEqual([1, 2]);
  });

  it("skips PRs without a summary and defaults a missing change type to chore", async () => {
    vi.mocked(listByRepo).mockResolvedValue([
      row(1, "kept", null),
      row(2, null, "fix"),
    ]);
    await generateReleaseNotes("o", "r");
    const prompt = vi.mocked(chat).mock.calls[0][0];
    expect(prompt).toContain("(#1) [chore] kept");
    expect(prompt).not.toContain("#2");
    const stored = vi.mocked(createReleaseNote).mock.calls[0][0];
    expect(stored.prNumbers).toEqual([1]);
  });

  it("short-circuits without calling the LLM when no summarized PRs exist", async () => {
    vi.mocked(listByRepo).mockResolvedValue([row(2, null, "fix")]);
    const note = await generateReleaseNotes("o", "r");
    expect(chat).not.toHaveBeenCalled();
    expect(createReleaseNote).toHaveBeenCalledWith({
      repoId: 7,
      markdown: "_No summarized changes yet._",
      prNumbers: [],
      version: undefined,
    });
    expect(note?.markdown).toContain("No summarized changes");
  });
});
