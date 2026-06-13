import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";

// Hoisted holder so the vi.mock factory can resolve the test db lazily at call time.
const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/db/client", () => ({ getDb: () => h.db }));

import { findRepo, upsertRepo } from "./repos";
import { listByRepo, searchSimilar, upsertPullRequest } from "./pull-requests";
import { createReleaseNote, latestReleaseNote } from "./release-notes";

let client: PGlite;

beforeAll(async () => {
  client = new PGlite({ extensions: { vector } });
  // Real schema against in-process Postgres. Small vector dim keeps fixtures tiny;
  // HNSW index is omitted (not required for cosine-search correctness).
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
    CREATE TABLE release_notes (
      id serial PRIMARY KEY,
      repo_id integer NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      version text,
      markdown text NOT NULL,
      pr_numbers jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  h.db = drizzle(client, { schema });
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await client.exec(`TRUNCATE release_notes, pull_requests, repos RESTART IDENTITY CASCADE;`);
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
