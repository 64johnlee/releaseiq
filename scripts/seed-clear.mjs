// Remove the demo seed data (the demo/releaseiq repo; PRs + release notes cascade).
// Run: npm run db:seed:clear   (reads DATABASE_URL from .env.local)
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
try {
  const res = await sql`delete from repos where owner = 'demo' and name = 'releaseiq'`;
  console.log(`Cleared demo/releaseiq (${res.count} repo row(s); PRs + release notes cascade).`);
} finally {
  await sql.end();
}
