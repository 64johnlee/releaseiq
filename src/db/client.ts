import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

let _db: DB | null = null;
let _client: ReturnType<typeof postgres> | null = null;

/**
 * Lazy singleton so `next build` does not require DATABASE_URL at module load.
 * Serverless-friendly: small pool, prepared statements disabled for pooled/Aurora.
 */
export function getDb(): DB {
  if (_db) return _db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  _client = postgres(connectionString, { max: 5, prepare: false });
  _db = drizzle(_client, { schema });
  return _db;
}

export function getClient(): ReturnType<typeof postgres> {
  if (!_client) getDb();
  return _client!;
}
