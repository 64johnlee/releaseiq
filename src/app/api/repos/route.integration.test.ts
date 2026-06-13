import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/db/client", () => ({ getDb: () => h.db }));

import { createTestDb, resetTestDb } from "@/test/pglite";
import { GET } from "./route";
import { upsertRepo } from "@/lib/repositories/repos";
import { upsertPullRequest } from "@/lib/repositories/pull-requests";

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

describe("GET /api/repos", () => {
  it("returns an empty list when nothing is ingested", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).repos).toEqual([]);
  });

  it("lists ingested repos with PR counts", async () => {
    const web = await upsertRepo("acme", "web");
    await upsertPullRequest({
      repoId: web.id,
      input: { number: 1, title: "PR 1", body: null, author: null, mergedAt: null },
      summary: { summary: "s1", changeType: "feat", audience: "customer" },
      embedding: [1, 0, 0],
    });
    await upsertPullRequest({
      repoId: web.id,
      input: { number: 2, title: "PR 2", body: null, author: null, mergedAt: null },
      summary: { summary: "s2", changeType: "fix", audience: "internal" },
      embedding: [0, 1, 0],
    });
    await upsertRepo("acme", "api"); // no PRs

    const res = await GET();
    expect(res.status).toBe(200);
    const { repos } = await res.json();
    const web2 = repos.find((r: { name: string }) => r.name === "web");
    const api = repos.find((r: { name: string }) => r.name === "api");
    expect(web2.prCount).toBe(2);
    expect(api.prCount).toBe(0);
  });
});
