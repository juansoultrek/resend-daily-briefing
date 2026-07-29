import type { RawCommit, RawIssue, RawPull } from "./types.js";

const API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly repo: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

interface ClientOptions {
  token?: string;
  /** Optional fetch override (for tests). */
  fetchImpl?: typeof fetch;
}

/**
 * Thin wrapper over the GitHub REST API.
 * Works anonymously for public repos (60 req/hour) or with a token (5,000 req/hour).
 */
export function createGitHubClient(opts: ClientOptions = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;

  function headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "resend-daily-briefing",
      ...extra,
    };
    if (opts.token) h.Authorization = `Bearer ${opts.token}`;
    return h;
  }

  async function getJson<T>(path: string, repo: string): Promise<T> {
    const res = await fetchImpl(`${API}${path}`, { headers: headers() });
    if (res.status === 404) {
      throw new GitHubError(`Not found: ${path}`, 404, repo);
    }
    if (res.status === 403) {
      // Rate limit or abuse detection — surface the reset time if present.
      const remaining = res.headers.get("x-ratelimit-remaining");
      const reset = res.headers.get("x-ratelimit-reset");
      throw new GitHubError(
        `Forbidden (rate limit? remaining=${remaining}, reset=${reset})`,
        403,
        repo,
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GitHubError(
        `GitHub API ${res.status} for ${path}: ${text.slice(0, 200)}`,
        res.status,
        repo,
      );
    }
    return (await res.json()) as T;
  }

  return {
    /**
     * List commits since `since` (ISO 8601). GitHub filters server-side using
     * commit author date, not push date.
     */
    async getCommits(owner: string, repo: string, since: string): Promise<RawCommit[]> {
      const q = new URLSearchParams({
        since,
        per_page: "100",
      });
      return getJson<RawCommit[]>(`/repos/${owner}/${repo}/commits?${q}`, repo);
    },

    /**
     * List pull requests sorted by updated_at desc. GitHub has no `since` param
     * for pulls, so we fetch the most recent page and filter client-side.
     */
    async getPulls(owner: string, repo: string): Promise<RawPull[]> {
      const q = new URLSearchParams({
        state: "all",
        sort: "updated",
        direction: "desc",
        per_page: "100",
      });
      return getJson<RawPull[]>(`/repos/${owner}/${repo}/pulls?${q}`, repo);
    },

    /**
     * List issues updated since `since`. Note: this endpoint also returns PRs
     * (they're issues in GitHub's model); we filter them out in the normalizer.
     */
    async getIssues(owner: string, repo: string, since: string): Promise<RawIssue[]> {
      const q = new URLSearchParams({
        state: "all",
        sort: "updated",
        direction: "desc",
        since,
        per_page: "100",
      });
      return getJson<RawIssue[]>(`/repos/${owner}/${repo}/issues?${q}`, repo);
    },
  };
}

export type GitHubClient = ReturnType<typeof createGitHubClient>;
