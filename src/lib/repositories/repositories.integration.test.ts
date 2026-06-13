import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

// Hoisted holder so the vi.mock factory can resolve the test db lazily at call time.
const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/db/client", () => ({ getDb: () => h.db }));

import { createTestDb, resetTestDb } from "@/test/pglite";
import { findRepo, upsertRepo } from "./repos";
import { listByRepo, searchSimilar, upsertPullRequest } from "./pull-requests";
import { createReleaseNote, latestReleaseNote } from "./release-notes";

let client: PGlite;

beforeAll(async () => {
  const t = await createTestDb();
  client = t.client;
  h.db = t.db;
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await resetTestDb(client);
});

function pr(number: number, summary: string, changeType: string, embedding: number[]) {
  return {
    repoId: 1,
    input: { number, title: `PR ${number}`, body: null, author: "a", mergedAt: null },
    summary: { summary, changeType: changeType as "feat", audience: "customer" as const },
    embedding,
  };
}

describe("repos repository", () => {
  it("upsertRepo is idempotent and findRepo locates it", async () => {
    const a = await upsertRepo("acme", "web");
    const b = await upsertRepo("acme", "web");
    expect(a.id).toBe(b.id);
    expect(await findRepo("acme", "web")).not.toBeNull();
    expect(await findRepo("acme", "missing")).toBeNull();
  });
});

describe("pull_requests repository", () => {
  it("inserts, lists, and updates on conflict", async () => {
    const repo = await upsertRepo("acme", "web");
    await upsertPullRequest(pr(1, "first summary", "feat", [1, 0, 0]));
    let rows = await listByRepo(repo.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toBe("first summary");

    await upsertPullRequest(pr(1, "updated summary", "fix", [0, 1, 0]));
    rows = await listByRepo(repo.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toBe("updated summary");
    expect(rows[0].changeType).toBe("fix");
  });

  it("searchSimilar ranks by cosine similarity and filters distant hits", async () => {
    await upsertRepo("acme", "web");
    await upsertPullRequest(pr(1, "exact match", "feat", [1, 0, 0]));
    await upsertPullRequest(pr(2, "near match", "feat", [0.9, 0.1, 0]));
    await upsertPullRequest(pr(3, "orthogonal", "feat", [0, 1, 0]));

    const hits = await searchSimilar(1, [1, 0, 0], 10);
    const numbers = hits.map((hh) => hh.number);
    expect(numbers[0]).toBe(1);
    expect(numbers).toContain(2);
    expect(numbers).not.toContain(3);
    expect(hits[0].similarity).toBeGreaterThan(0.99);
    expect(hits[0].similarity).toBeLessThanOrEqual(1.0001);
  });
});

describe("release_notes repository", () => {
  it("createReleaseNote stores and latestReleaseNote returns the newest", async () => {
    const repo = await upsertRepo("acme", "web");
    await createReleaseNote({ repoId: repo.id, markdown: "v1 notes", prNumbers: [1], version: "1.0.0" });
    const second = await createReleaseNote({
      repoId: repo.id,
      markdown: "v2 notes",
      prNumbers: [1, 2],
      version: "2.0.0",
    });
    const latest = await latestReleaseNote(repo.id);
    expect(latest?.id).toBe(second.id);
    expect(latest?.markdown).toBe("v2 notes");
    expect(latest?.prNumbers).toEqual([1, 2]);
  });
});
