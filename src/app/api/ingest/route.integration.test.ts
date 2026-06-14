import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/db/client", () => ({ getDb: () => h.db }));
vi.mock("@/lib/agent/llm", () => ({
  chat: vi.fn(async () =>
    JSON.stringify({ summary: "s", changeType: "feat", audience: "customer" }),
  ),
  embedMany: vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0])),
}));

import { createTestDb, resetTestDb } from "@/test/pglite";
import { POST } from "./route";

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

function post(body: string): Request {
  return new Request("http://localhost/api/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/ingest", () => {
  it("returns 400 on an invalid JSON body", async () => {
    expect((await POST(post("not json"))).status).toBe(400);
  });

  it("returns 400 when owner or name is missing", async () => {
    expect((await POST(post(JSON.stringify({ owner: "acme" })))).status).toBe(400);
  });

  it("ingests provided PRs and returns the processed result", async () => {
    const body = JSON.stringify({
      owner: "acme",
      name: "web",
      pullRequests: [
        { number: 1, title: "PR 1", body: null, author: null, mergedAt: null },
        { number: 2, title: "PR 2", body: null, author: null, mergedAt: null },
      ],
    });
    const res = await POST(post(body));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.processed).toBe(2);
    expect(json.prNumbers).toEqual([1, 2]);
  });

  it("returns 400 when pullRequests is not an array", async () => {
    const res = await POST(post(JSON.stringify({ owner: "a", name: "b", pullRequests: "nope" })));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a pull request is malformed", async () => {
    const res = await POST(
      post(JSON.stringify({ owner: "a", name: "b", pullRequests: [{ title: "no number" }] })),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when too many pull requests are supplied", async () => {
    const many = Array.from({ length: 201 }, (_, i) => ({ number: i, title: "x" }));
    const res = await POST(post(JSON.stringify({ owner: "a", name: "b", pullRequests: many })));
    expect(res.status).toBe(400);
  });
});
