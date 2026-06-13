import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";

/**
 * In-process Postgres + pgvector for integration tests. Mirrors src/db/schema.ts
 * but uses a 3-dim vector to keep fixtures tiny, and omits the HNSW index
 * (not required for cosine-search correctness). Pair with a vi.mock of
 * "@/db/client" whose getDb returns the `db` returned here.
 */
const SCHEMA_DDL = `
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
`;

export async function createTestDb() {
  const client = new PGlite({ extensions: { vector } });
  await client.exec(SCHEMA_DDL);
  const db = drizzle(client, { schema });
  return { client, db };
}

export async function resetTestDb(client: PGlite): Promise<void> {
  await client.exec(`TRUNCATE release_notes, pull_requests, repos RESTART IDENTITY CASCADE;`);
}
