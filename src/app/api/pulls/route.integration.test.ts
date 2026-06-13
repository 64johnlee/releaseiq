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

function req(qs: string): Request {
  return new Request(`http://localhost/api/pulls?${qs}`);
}

describe("GET /api/pulls", () => {
  it("returns 400 when repo is missing or malformed", async () => {
    expect((await GET(req(""))).status).toBe(400);
    expect((await GET(req("repo=noslash"))).status).toBe(400);
  });

  it("returns 404 when the repo has not been ingested", async () => {
    expect((await GET(req("repo=acme/web"))).status).toBe(404);
  });

  it("returns the enriched PR list for an ingested repo", async () => {
    const repo = await upsertRepo("acme", "web");
    await upsertPullRequest({
      repoId: repo.id,
      input: { number: 7, title: "Add OAuth", body: null, author: "bob", mergedAt: null, raw: { url: "https://gh/pr/7" } },
      summary: { summary: "adds oauth", changeType: "feat", audience: "customer" },
      embedding: [1, 0, 0],
    });
    const res = await GET(req("repo=acme/web"));
    expect(res.status).toBe(200);
    const { repo: repoName, pullRequests } = await res.json();
    expect(repoName).toBe("acme/web");
    expect(pullRequests).toHaveLength(1);
    expect(pullRequests[0]).toMatchObject({
      number: 7,
      title: "Add OAuth",
      changeType: "feat",
      audience: "customer",
      url: "https://gh/pr/7",
    });
  });
});
