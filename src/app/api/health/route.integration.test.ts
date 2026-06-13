import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/db/client", () => ({ getDb: () => h.db }));

import { createTestDb } from "@/test/pglite";
import { GET } from "./route";

let client: PGlite;
let liveDb: unknown;

beforeAll(async () => {
  const t = await createTestDb();
  client = t.client;
  liveDb = t.db;
  h.db = liveDb;
});

afterAll(async () => {
  await client.close();
});

describe("GET /api/health", () => {
  it("returns 200 with database connected and pgvector detected", async () => {
    h.db = liveDb;
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.database).toBe("connected");
    expect(json.pgvector).toBe(true);
  });

  it("returns 503 when the database is unreachable", async () => {
    h.db = {
      execute: async () => {
        throw new Error("connection refused");
      },
    };
    const res = await GET();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe("error");
    h.db = liveDb;
  });
});
