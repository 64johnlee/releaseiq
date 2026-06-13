import { chat } from "@/lib/agent/llm";
import { SUMMARIZE_SYSTEM, summarizePrompt } from "@/lib/agent/prompts";
import type { Audience, ChangeType, PullRequestInput, PullRequestSummary } from "@/types";

const CHANGE_TYPES: ChangeType[] = ["feat", "fix", "perf", "docs", "chore", "breaking"];
const AUDIENCES: Audience[] = ["customer", "internal"];

export async function summarizePR(pr: PullRequestInput): Promise<PullRequestSummary> {
  const raw = await chat(summarizePrompt(pr), {
    system: SUMMARIZE_SYSTEM,
    json: true,
    temperature: 0.2,
  });

  let parsed: Partial<PullRequestSummary>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fallback: treat the raw text as the summary if the model didn't return JSON.
    parsed = { summary: raw.trim().slice(0, 500) };
  }

  const changeType = CHANGE_TYPES.includes(parsed.changeType as ChangeType)
    ? (parsed.changeType as ChangeType)
    : "chore";
  const audience = AUDIENCES.includes(parsed.audience as Audience)
    ? (parsed.audience as Audience)
    : "internal";

  return {
    summary: parsed.summary?.trim() || pr.title,
    changeType,
    audience,
  };
}
