// Remove the demo seed data (the demo/releaseiq repo; PRs + release notes cascade).
// Run: npm run db:seed:clear   (resolves the DB URL from env or .env.local)
import postgres from "postgres";
import { CONNECTION_STRING_ENV_HINT, resolveConnectionString } from "./db-url.mjs";

const url = resolveConnectionString();
if (!url) {
  console.error(`No DB connection string found (looked for: ${CONNECTION_STRING_ENV_HINT})`);
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  const res = await sql`delete from repos where owner = 'demo' and name = 'releaseiq'`;
  console.log(`Cleared demo/releaseiq (${res.count} repo row(s); PRs + release notes cascade).`);
} finally {
  await sql.end();
}
