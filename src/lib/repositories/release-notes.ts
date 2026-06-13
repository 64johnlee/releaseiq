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
