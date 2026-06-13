import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/db/client", () => ({ getDb: () => h.db }));
vi.mock("@/lib/agent/llm", () => ({
  chat: vi.fn(async () => "## Features\n- (#1) adds caching"),
  embed: vi.fn(async () => [1, 0, 0]),
}));

import { createTestDb, resetTestDb } from "@/test/pglite";
import { GET, POST } from "./route";
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

function get(qs: string): Request {
  return new Request(`http://localhost/api/release-notes?${qs}`);
}

function post(body: string): Request {
  return new Request("http://localhost/api/release-notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

async function seedSummarizedPr() {
  const repo = await upsertRepo("acme", "web");
  await upsertPullRequest({
    repoId: repo.id,
    input: { number: 1, title: "PR 1", body: null, author: null, mergedAt: null },
    summary: { summary: "adds caching", changeType: "feat", audience: "customer" },
    embedding: [1, 0, 0],
  });
}

describe("GET /api/release-notes", () => {
  it("returns 400 when repo is missing", async () => {
    expect((await GET(get(""))).status).toBe(400);
  });

  it("returns 404 when the repo has not been ingested", async () => {
    expect((await GET(get("repo=acme/web"))).status).toBe(404);
  });

  it("returns 404 when no notes have been generated yet", async () => {
    await upsertRepo("acme", "web");
    expect((await GET(get("repo=acme/web"))).status).toBe(404);
  });

  it("returns 200 with the latest note after generation", async () => {
    await seedSummarizedPr();
    await POST(post(JSON.stringify({ owner: "acme", name: "web", version: "1.0.0" })));
    const res = await GET(get("repo=acme/web"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.markdown).toContain("Features");
    expect(json.version).toBe("1.0.0");
  });
});

describe("POST /api/release-notes", () => {
  it("returns 400 when owner or name is missing", async () => {
    expect((await POST(post(JSON.stringify({ owner: "acme" })))).status).toBe(400);
  });

  it("returns 404 when the repo has not been ingested", async () => {
    expect((await POST(post(JSON.stringify({ owner: "acme", name: "web" })))).status).toBe(404);
  });

  it("generates and stores notes from summarized PRs", async () => {
    await seedSummarizedPr();
    const res = await POST(post(JSON.stringify({ owner: "acme", name: "web" })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.prNumbers).toEqual([1]);
    expect(json.markdown).toContain("Features");
  });
});
