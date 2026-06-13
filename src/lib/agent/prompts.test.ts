import { describe, expect, it } from "vitest";
import { releaseNotesPrompt, summarizePrompt } from "./prompts";
import type { PullRequestInput } from "@/types";

const pr: PullRequestInput = {
  number: 7,
  title: "Add OAuth login",
  body: "implements google + github oauth",
  author: "bob",
  mergedAt: null,
};

describe("summarizePrompt", () => {
  it("includes PR number, title, author, body, and the JSON contract", () => {
    const p = summarizePrompt(pr);
    expect(p).toContain("#7");
    expect(p).toContain("Add OAuth login");
    expect(p).toContain("bob");
    expect(p).toContain("implements google + github oauth");
    expect(p).toContain('"changeType"');
    expect(p).toContain('"audience"');
  });

  it("substitutes a placeholder when the body is missing", () => {
    const p = summarizePrompt({ ...pr, body: null });
    expect(p).toContain("(no description)");
  });
});

describe("releaseNotesPrompt", () => {
  it("lists each PR and includes the version when provided", () => {
    const p = releaseNotesPrompt(
      [{ number: 1, summary: "adds caching", changeType: "feat" }],
      "1.2.0",
    );
    expect(p).toContain("for version 1.2.0");
    expect(p).toContain("(#1)");
    expect(p).toContain("[feat]");
    expect(p).toContain("Breaking Changes");
  });

  it("omits the version clause when not provided", () => {
    const p = releaseNotesPrompt([{ number: 2, summary: "fix", changeType: "fix" }]);
    expect(p).not.toContain("for version");
    expect(p).toContain("(#2)");
  });
});
