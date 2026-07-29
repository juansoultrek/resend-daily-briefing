/**
 * Unified event shape produced by the normalizer.
 * Consumed by the AI analyzer (added in a later commit).
 */
export type RepoEventKind = "commit" | "pull" | "issue";

export interface RepoEvent {
  repo: string;            // "owner/repo"
  kind: RepoEventKind;
  id: string;              // GitHub node_id (stable across API versions)
  number?: number;          // PR/issue number; commits have none
  title: string;            // commit subject / PR title / issue title
  body?: string;            // PR/issue body, or full commit message
  author: string;          // GitHub login of the actor/author
  url: string;             // html_url
  createdAt: string;       // ISO 8601
  updatedAt?: string;      // ISO 8601 (PRs/issues only)
  state?: "open" | "closed" | "merged";
  labels?: string[];
  additions?: number;       // PRs only
  deletions?: number;       // PRs only
  filesChanged?: number;    // PRs only
}

/** Subset of the GitHub REST response shapes — only the fields we read. */
export interface RawCommit {
  sha: string;
  node_id: string;
  commit: {
    message: string;
    author: { date: string; name: string };
  };
  html_url: string;
  author: { login: string; html_url: string } | null;
}

export interface RawPull {
  id: number;
  node_id: string;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  merged_at: string | null;
  user: { login: string; html_url: string } | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  labels: { name: string }[];
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface RawIssue {
  id: number;
  node_id: string;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  user: { login: string; html_url: string } | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  labels: { name: string }[];
  pull_request?: unknown;  // present when the issue is actually a PR; we filter these out
}
