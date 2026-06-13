import type { PullRequestInput } from "@/types";

export const SUMMARIZE_SYSTEM = `You are ReleaseIQ, a release-intelligence agent.
You read a merged pull request and produce a concise, customer-facing summary plus structured metadata.
Be precise and factual. Never invent features not present in the PR.
Respond with a single JSON object and nothing else.`;

export function summarizePrompt(pr: PullRequestInput): string {
  return `Summarize this merged pull request for a release-notes knowledge base.

PR #${pr.number}: ${pr.title}
Author: ${pr.author ?? "unknown"}
Description:
${(pr.body ?? "").slice(0, 4000) || "(no description)"}

Return JSON with exactly these keys:
{
  "summary": "1-2 sentence customer-facing description of what changed and why it matters",
  "changeType": "one of: feat | fix | perf | docs | chore | breaking",
  "audience": "one of: customer | internal"
}`;
}

export const RELEASE_NOTES_SYSTEM = `You are ReleaseIQ. You compose clean, grouped release notes in Markdown
from a set of PR summaries. Group by change type, lead with customer-impacting items, and keep it skimmable.`;

export function releaseNotesPrompt(
  items: { number: number; summary: string; changeType: string }[],
  version?: string,
): string {
  const lines = items
    .map((i) => `- (#${i.number}) [${i.changeType}] ${i.summary}`)
    .join("\n");
  return `Compose Markdown release notes${version ? ` for version ${version}` : ""} from these PR summaries:

${lines}

Group under headings (Features, Fixes, Performance, Breaking Changes, Other).
Omit empty groups. Reference PRs as (#number).`;
}
