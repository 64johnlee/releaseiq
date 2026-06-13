import type { PullRequestInput } from "@/types";

/**
 * Fetch recently merged PRs from GitHub. No auth works (low rate limit);
 * set GITHUB_TOKEN to raise it. This is the provider adapter — swap per SCM.
 */
export async function fetchMergedPRs(
  owner: string,
  name: string,
  limit = 30,
): Promise<PullRequestInput[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `https://api.github.com/repos/${owner}/${name}/pulls?state=closed&per_page=${limit}&sort=updated&direction=desc`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as Array<{
    number: number;
    title: string;
    body: string | null;
    merged_at: string | null;
    html_url: string;
    user: { login: string } | null;
  }>;

  return data
    .filter((pr) => pr.merged_at !== null)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      body: pr.body,
      author: pr.user?.login ?? null,
      mergedAt: pr.merged_at,
      raw: { url: pr.html_url },
    }));
}
