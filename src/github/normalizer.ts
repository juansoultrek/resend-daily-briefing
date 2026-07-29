import type { RawCommit, RawIssue, RawPull, RepoEvent } from "./types.js";

/**
 * Split "owner/repo" into [owner, repo]. Throws if malformed.
 */
export function splitRepo(repo: string): [string, string] {
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo identifier: "${repo}". Expected "owner/repo".`);
  }
  return [parts[0]!, parts[1]!];
}

function firstLine(message: string): string {
  const nl = message.indexOf("\n");
  return nl === -1 ? message : message.slice(0, nl);
}

function restOfMessage(message: string): string | undefined {
  const nl = message.indexOf("\n");
  if (nl === -1) return undefined;
  const rest = message.slice(nl + 1).trim();
  return rest.length > 0 ? rest : undefined;
}

function withinWindow(iso: string, since: Date): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= since.getTime();
}

/**
 * Merge raw commits/pulls/issues into a single sorted list of RepoEvent
 * within the [since, now) window. PRs and issues are filtered by `updated_at`
 * (so we catch closed/reopened items), commits by author date.
 */
export function normalizeEvents(
  repo: string,
  rawCommits: RawCommit[],
  rawPulls: RawPull[],
  rawIssues: RawIssue[],
  since: Date,
): RepoEvent[] {
  const events: RepoEvent[] = [];

  for (const c of rawCommits) {
    const createdAt = c.commit.author.date;
    if (!withinWindow(createdAt, since)) continue;
    events.push({
      repo,
      kind: "commit",
      id: c.node_id,
      title: firstLine(c.commit.message),
      body: restOfMessage(c.commit.message),
      author: c.author?.login ?? c.commit.author.name,
      url: c.html_url,
      createdAt,
    });
  }

  for (const p of rawPulls) {
    if (!withinWindow(p.updated_at, since)) continue;
    events.push({
      repo,
      kind: "pull",
      id: p.node_id,
      number: p.number,
      title: p.title,
      body: p.body ?? undefined,
      author: p.user?.login ?? "unknown",
      url: p.html_url,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      state: p.merged_at ? "merged" : p.state,
      labels: p.labels.map((l) => l.name),
      additions: p.additions,
      deletions: p.deletions,
      filesChanged: p.changed_files,
    });
  }

  for (const i of rawIssues) {
    // The issues endpoint also returns PRs — drop them.
    if (i.pull_request) continue;
    if (!withinWindow(i.updated_at, since)) continue;
    events.push({
      repo,
      kind: "issue",
      id: i.node_id,
      number: i.number,
      title: i.title,
      body: i.body ?? undefined,
      author: i.user?.login ?? "unknown",
      url: i.html_url,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      state: i.state,
      labels: i.labels.map((l) => l.name),
    });
  }

  // Newest first.
  events.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return events;
}

/**
 * Convenience: collect events for a single repo, returning only items within
 * the last `windowHours`. The actual fetch is done by the caller (or a higher
 * layer) so this stays pure and testable.
 */
export function collectForRepo(
  repo: string,
  raw: { commits: RawCommit[]; pulls: RawPull[]; issues: RawIssue[] },
  windowHours = 24,
): RepoEvent[] {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  return normalizeEvents(repo, raw.commits, raw.pulls, raw.issues, since);
}
