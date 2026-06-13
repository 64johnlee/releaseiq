import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { releaseNotes, type ReleaseNote } from "@/db/schema";

export async function createReleaseNote(args: {
  repoId: number;
  markdown: string;
  prNumbers: number[];
  version?: string;
}): Promise<ReleaseNote> {
  const db = getDb();
  const rows = await db
    .insert(releaseNotes)
    .values({
      repoId: args.repoId,
      markdown: args.markdown,
      prNumbers: args.prNumbers,
      version: args.version ?? null,
    })
    .returning();
  return rows[0];
}

export async function latestReleaseNote(repoId: number): Promise<ReleaseNote | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(releaseNotes)
    .where(eq(releaseNotes.repoId, repoId))
    .orderBy(desc(releaseNotes.createdAt))
    .limit(1);
  return rows[0] ?? null;
}
