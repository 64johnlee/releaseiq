// Connection-string resolver for the standalone seed scripts (.mjs).
//
// Mirrors src/db/connection-string.ts so `npm run db:seed` works against the
// same providers the app does: a local `.env.local` (DATABASE_URL), a Neon dev
// stand-in, or a Vercel-managed Aurora/Postgres integration that injects the
// connection string into the environment under a different var name.
//
// `.mjs` can't import the TS module without a loader, so the priority list is
// duplicated here. Keep the two in sync.
import { readFileSync } from "node:fs";

const CONNECTION_STRING_ENV_VARS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
];

/** Parse a `.env.local` file into a plain object, or {} if it is absent. */
function readDotEnvLocal() {
  try {
    const out = {};
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Resolve the DB connection string. Real environment variables win (so a
 * Vercel/Aurora-injected value is used in CI/deploy); `.env.local` is the local
 * fallback. Returns the trimmed string, or undefined if none are set.
 */
export function resolveConnectionString() {
  const dotenv = readDotEnvLocal();
  for (const key of CONNECTION_STRING_ENV_VARS) {
    const value = process.env[key] ?? dotenv[key];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

/** Comma-separated list of the env vars checked, for error messages. */
export const CONNECTION_STRING_ENV_HINT = CONNECTION_STRING_ENV_VARS.join(", ");
