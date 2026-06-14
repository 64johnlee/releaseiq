import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export const dynamic = "force-dynamic";

/**
 * One-shot, secret-guarded schema migration.
 *
 * The Vercel-managed Aurora Query editor is read-only and the endpoint is only
 * reachable via Vercel OIDC, so DDL cannot be applied from the dashboard or
 * locally. This route runs the (idempotent) statements from drizzle/0000_init.sql
 * through the app's own writable IAM connection, guaranteeing the schema lands in
 * the exact database the app uses.
 *
 * Guarded by MIGRATE_SECRET (sent as `x-migrate-secret`). Safe to re-run.
 */
const STATEMENTS: string[] = [
  `CREATE EXTENSION IF NOT EXISTS vector`,
  `CREATE TABLE IF NOT EXISTS "repos" (
    "id" serial PRIMARY KEY NOT NULL,
    "owner" text NOT NULL,
    "name" text NOT NULL,
    "provider" text DEFAULT 'github' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "pull_requests" (
    "id" serial PRIMARY KEY NOT NULL,
    "repo_id" integer NOT NULL,
    "number" integer NOT NULL,
    "title" text NOT NULL,
    "body" text,
    "author" text,
    "merged_at" timestamp with time zone,
    "summary" text,
    "change_type" text,
    "audience" text,
    "embedding" vector(1536),
    "raw" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "release_notes" (
    "id" serial PRIMARY KEY NOT NULL,
    "repo_id" integer NOT NULL,
    "version" text,
    "markdown" text NOT NULL,
    "pr_numbers" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `DO $$ BEGIN
    ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `DO $$ BEGIN
    ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "pr_repo_number_idx" ON "pull_requests" USING btree ("repo_id","number")`,
  `CREATE INDEX IF NOT EXISTS "pr_embedding_idx" ON "pull_requests" USING hnsw ("embedding" vector_cosine_ops)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "repos_owner_name_idx" ON "repos" USING btree ("owner","name")`,
];

export async function POST(request: Request) {
  const secret = process.env.MIGRATE_SECRET;
  if (!secret || request.headers.get("x-migrate-secret") !== secret) {
    return NextResponse.json({ status: "forbidden" }, { status: 403 });
  }

  const db = getDb();
  const applied: string[] = [];
  try {
    for (const stmt of STATEMENTS) {
      await db.execute(sql.raw(stmt));
      applied.push(stmt.split("\n")[0].slice(0, 60));
    }
    const ext = await db.execute(
      sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
    );
    const version = Array.isArray(ext) && ext[0] ? (ext[0] as { extversion?: string }).extversion : null;
    return NextResponse.json({ status: "ok", applied, pgvectorVersion: version });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        applied,
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
