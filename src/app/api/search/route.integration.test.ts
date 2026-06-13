import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/db/client", () => ({ getDb: () => h.db }));
// Query embedding fixed to [1,0,0] so PR #1 (same vector) ranks first.
vi.mock("@/lib/agent/llm", () => ({ embed: vi.fn(async () => [1, 0, 0]) }));

import { GET } from "./route";
import { upsertRepo } from "@/lib/repositories/repos";
import { upsertPullRequest } from "@/lib/repositories/pull-requests";

let client: PGlite;

beforeAll(async () => {
  client = new PGlite({ extensions: { vector } });
  await client.exec(`
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE TABLE repos (
      id serial PRIMARY KEY,
      owner text NOT NULL,
      name text NOT NULL,
      provider text NOT NULL DEFAULT 'github',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX repos_owner_name_idx ON repos (owner, name);
    CREATE TABLE pull_requests (
      id serial PRIMARY KEY,
      repo_id integer NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      number integer NOT NULL,
      title text NOT NULL,
      body text,
      author text,
      merged_at timestamptz,
      summary text,
      change_type text,
      audience text,
      embedding vector(3),
      raw jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX pr_repo_number_idx ON pull_requests (repo_id, number);
  `);
  h.db = drizzle(client, { schema });
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await client.exec(`TRUNCATE pull_requests, repos RESTART IDENTITY CASCADE;`);
});

function req(qs: string): Request {
  return new Request(`http://localhost/api/search?${qs}`);
}

async function seed() {
  const repo = await upsertRepo("acme", "web");
  await upsertPullRequest({
    repoId: repo.id,
    input: { number: 1, title: "PR 1", body: null, author: null, mergedAt: null },
    summary: { summary: "adds caching", changeType: "feat", audience: "customer" },
    embedding: [1, 0, 0],
  });
  await upsertPullRequest({
    repoId: repo.id,
    input: { number: 2, title: "PR 2", body: null, author: null, mergedAt: null },
    summary: { summary: "orthogonal change", changeType: "fix", audience: "internal" },
    embedding: [0, 1, 0],
  });
}

describe("GET /api/search", () => {
  it("returns 400 when repo or q is missing or malformed", async () => {
    expect((await GET(req("repo=acme/web"))).status).toBe(400);
    expect((await GET(req("q=cache"))).status).toBe(400);
    expect((await GET(req("repo=noslash&q=cache"))).status).toBe(400);
  });

  it("returns 404 when the repo has not been ingested", async () => {
    const res = await GET(req("repo=acme/web&q=cache"));
    expect(res.status).toBe(404);
  });

  it("returns 200 with cosine-ranked hits when ingested", async () => {
    await seed();
    const res = await GET(req("repo=acme/web&q=cache"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.repo).toBe("acme/web");
    expect(json.hits[0].number).toBe(1);
    expect(json.hits.map((hit: { number: number }) => hit.number)).not.toContain(2);
  });

  it("clamps an out-of-range or non-numeric limit instead of failing", async () => {
    await seed();
    expect((await GET(req("repo=acme/web&q=cache&limit=abc"))).status).toBe(200);
    expect((await GET(req("repo=acme/web&q=cache&limit=9999"))).status).toBe(200);
  });
});
