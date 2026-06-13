import { readFileSync } from "node:fs";
import type { Config } from "drizzle-kit";

// drizzle-kit doesn't load .env.local (a Next.js convention), so load it here
// without adding a dotenv dependency. Existing process.env values win.
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // no .env.local — rely on the ambient environment
}

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config;
