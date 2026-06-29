// GitHub issue fetching utilities. Public repos only — no auth token.
// Used by /api/github/preview and /api/github/import.

import type { GitHubIssue } from "./types";

const GITHUB_API = "https://api.github.com";
const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);
const MAX_PAGES = 10; // cap at 10 pages × 100 = 1000 issues, well above the 300 cap

/**
 * Normalize a user-provided repo input into "owner/name".
 *
 * Accepts:
 *   - "owner/name"
 *   - "https://github.com/owner/name"
 *   - "https://github.com/owner/name/issues"
 *   - "github.com/owner/name"
 *   - "https://github.com/owner/name/tree/main"
 *
 * Returns null if the input can't be parsed.
 */
export function normalizeRepo(input: string): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;

  // Bare "owner/name" (no slashes in either part, no scheme).
  if (/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(s)) {
    return s;
  }

  // Otherwise treat as URL. Add a scheme if missing so URL() doesn't choke.
  const urlStr = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return null;
  }

  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  const name = parts[1];
  // Strip trailing .git if present
  const cleanName = name.endsWith(".git") ? name.slice(0, -4) : name;
  return `${owner}/${cleanName}`;
}

type FetchResult =
  | { ok: true; issues: GitHubIssue[] }
  | { ok: false; status: number; error: string };

/**
 * Fetch all open issues for a public repo, following pagination via the Link
 * header AND falling back to a page loop. Skips pull requests (the issues
 * endpoint returns them too).
 */
export async function fetchOpenIssues(repo: string): Promise<FetchResult> {
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    return { ok: false, status: 400, error: `Invalid repo: "${repo}"` };
  }

  const all: GitHubIssue[] = [];
  const seen = new Set<number>();

  let page = 1;
  while (page <= MAX_PAGES) {
    const url = `${GITHUB_API}/repos/${owner}/${name}/issues?state=open&per_page=100&page=${page}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "KanbanAI/1.0",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      return {
        ok: false,
        status: 502,
        error: `Failed to reach GitHub: ${(e as Error).message}`,
      };
    }

    if (res.status === 404) {
      return {
        ok: false,
        status: 404,
        error: `Repository "${repo}" not found (or it is private).`,
      };
    }
    if (res.status === 403) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      if (remaining === "0") {
        const reset = res.headers.get("x-ratelimit-reset");
        const resetIn = reset
          ? Math.max(0, Math.round((Number(reset) * 1000 - Date.now()) / 60000))
          : null;
        return {
          ok: false,
          status: 429,
          error:
            resetIn != null
              ? `GitHub rate limit exceeded. Resets in ~${resetIn} min.`
              : "GitHub rate limit exceeded. Try again later.",
        };
      }
      return {
        ok: false,
        status: 403,
        error: "GitHub API returned 403 Forbidden (rate limit or access block).",
      };
    }
    if (!res.ok) {
      let detail = "";
      try {
        const body = (await res.json()) as { message?: string };
        detail = body?.message ?? "";
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        status: res.status,
        error: `GitHub API error ${res.status}${detail ? `: ${detail}` : ""}`,
      };
    }

    let pageItems: unknown;
    try {
      pageItems = await res.json();
    } catch {
      return {
        ok: false,
        status: 502,
        error: "Failed to parse GitHub response.",
      };
    }
    if (!Array.isArray(pageItems)) {
      return {
        ok: false,
        status: 502,
        error: "Unexpected GitHub response shape.",
      };
    }

    // PRs come back in the issues API — filter them out.
    const issuesOnly = pageItems.filter(
      (i) => i && typeof i === "object" && !("pull_request" in (i as object)),
    );

    for (const raw of issuesOnly) {
      const i = raw as Record<string, unknown>;
      const number = i.number as number | undefined;
      if (number == null || seen.has(number)) continue;
      seen.add(number);

      const labels = Array.isArray(i.labels)
        ? (i.labels as Array<Record<string, unknown>>)
            .map((l) => (typeof l === "string" ? l : (l.name as string)))
            .filter((n): n is string => typeof n === "string" && n.length > 0)
        : [];

      const assignees = Array.isArray(i.assignees)
        ? (i.assignees as Array<Record<string, unknown>>)
            .map((a) => a.login as string)
            .filter((n): n is string => typeof n === "string" && n.length > 0)
        : [];

      const milestone = i.milestone as
        | { title?: string }
        | null
        | undefined;

      all.push({
        number,
        title: (i.title as string) ?? "",
        body: (i.body as string) ?? "",
        labels,
        assignees,
        milestone: milestone?.title ?? null,
        url: (i.html_url as string) ?? "",
        createdAt: (i.created_at as string) ?? "",
      });
    }

    // Stop early if the page was short (end of results).
    if (pageItems.length < 30) break;

    // Otherwise advance, but prefer the Link header — if there's no rel="next"
    // we're done even if the page was exactly 100.
    const link = res.headers.get("link") ?? "";
    if (!link.includes('rel="next"')) break;

    page += 1;
  }

  return { ok: true, issues: all };
}

// ─── Label color palette for new labels created during import ──────────────
const LABEL_PALETTE = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#64748b",
  "#84cc16",
];

export function pickLabelColor(seedIndex: number): string {
  return LABEL_PALETTE[seedIndex % LABEL_PALETTE.length];
}
