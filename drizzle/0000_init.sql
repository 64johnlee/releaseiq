CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pull_requests" (
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
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "release_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"repo_id" integer NOT NULL,
	"version" text,
	"markdown" text NOT NULL,
	"pr_numbers" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "repos" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"provider" text DEFAULT 'github' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pr_repo_number_idx" ON "pull_requests" USING btree ("repo_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_embedding_idx" ON "pull_requests" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "repos_owner_name_idx" ON "repos" USING btree ("owner","name");