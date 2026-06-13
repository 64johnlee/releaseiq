import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMergedPRs } from "./ingest";

afterEach(() => vi.unstubAllGlobals());

describe("fetchMergedPRs", () => {
  it("filters out unmerged PRs and maps fields", async () => {
    const payload = [
      {
        number: 1,
        title: "Merged one",
        body: "body",
        merged_at: "2026-01-01T00:00:00Z",
        html_url: "https://gh/1",
        user: { login: "alice" },
      },
      {
        number: 2,
        title: "Closed not merged",
        body: null,
        merged_at: null,
        html_url: "https://gh/2",
        user: null,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );

    const prs = await fetchMergedPRs("owner", "repo");
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({
      number: 1,
      title: "Merged one",
      author: "alice",
      mergedAt: "2026-01-01T00:00:00Z",
    });
    expect(prs[0].raw).toEqual({ url: "https://gh/1" });
  });

  it("maps a null user to a null author", async () => {
    const payload = [
      { number: 3, title: "T", body: null, merged_at: "2026-02-02T00:00:00Z", html_url: "u", user: null },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
    const prs = await fetchMergedPRs("o", "r");
    expect(prs[0].author).toBeNull();
  });

  it("throws on a non-ok GitHub response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    await expect(fetchMergedPRs("o", "r")).rejects.toThrow(/GitHub API 404/);
  });
});
