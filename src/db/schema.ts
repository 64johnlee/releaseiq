import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  vector,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Embedding dimension. Must equal the output dimension of LLM_EMBED_MODEL.
 * OpenAI text-embedding-3-small = 1536; Qwen text-embedding-v4 supports 1536.
 * (Qwen text-embedding-v3 maxes at 1024 — incompatible with this schema.)
 * Changing this value requires regenerating the migration (the vector(N) column).
 */
export const EMBEDDING_DIM = 1536;

export const repos = pgTable(
  "repos",
  {
    id: serial("id").primaryKey(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    provider: text("provider").notNull().default("github"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    repoUnique: uniqueIndex("repos_owner_name_idx").on(t.owner, t.name),
  }),
);

export const pullRequests = pgTable(
  "pull_requests",
  {
    id: serial("id").primaryKey(),
    repoId: integer("repo_id")
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    author: text("author"),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    // AI-generated fields (populated by the pipeline)
    summary: text("summary"),
    changeType: text("change_type"), // feat | fix | perf | docs | chore | breaking
    audience: text("audience"), // customer | internal
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    prUnique: uniqueIndex("pr_repo_number_idx").on(t.repoId, t.number),
    // HNSW index for cosine similarity search — the semantic-search centerpiece.
    embeddingIdx: index("pr_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  }),
);

export const releaseNotes = pgTable("release_notes", {
  id: serial("id").primaryKey(),
  repoId: integer("repo_id")
    .notNull()
    .references(() => repos.id, { onDelete: "cascade" }),
  version: text("version"),
  markdown: text("markdown").notNull(),
  prNumbers: jsonb("pr_numbers").$type<number[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Repo = typeof repos.$inferSelect;
export type PullRequest = typeof pullRequests.$inferSelect;
export type ReleaseNote = typeof releaseNotes.$inferSelect;
