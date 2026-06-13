import { chat } from "@/lib/agent/llm";
import { RELEASE_NOTES_SYSTEM, releaseNotesPrompt } from "@/lib/agent/prompts";
import { findRepo } from "@/lib/repositories/repos";
import { createReleaseNote } from "@/lib/repositories/release-notes";
import { listByRepo } from "@/lib/repositories/pull-requests";
import type { ReleaseNote } from "@/db/schema";

/**
 * Generate grouped Markdown release notes for a repo from its summarized PRs,
 * persist them, and return the stored note. Returns null if the repo is unknown.
 */
export async function generateReleaseNotes(
  owner: string,
  name: string,
  version?: string,
): Promise<ReleaseNote | null> {
  const repo = await findRepo(owner, name);
  if (!repo) return null;

  const prs = await listByRepo(repo.id);
  const items = prs.flatMap((p) =>
    p.summary
      ? [{ number: p.number, summary: p.summary, changeType: p.changeType ?? "chore" }]
      : [],
  );

  if (items.length === 0) {
    return createReleaseNote({
      repoId: repo.id,
      markdown: "_No summarized changes yet._",
      prNumbers: [],
      version,
    });
  }

  const markdown = await chat(releaseNotesPrompt(items, version), {
    system: RELEASE_NOTES_SYSTEM,
    temperature: 0.3,
  });

  return createReleaseNote({
    repoId: repo.id,
    markdown,
    prNumbers: items.map((i) => i.number),
    version,
  });
}
