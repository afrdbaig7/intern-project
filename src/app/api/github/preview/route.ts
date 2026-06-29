import type { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { fetchOpenIssues, normalizeRepo } from "@/lib/github";
import { err, ok, parseBody } from "@/lib/api-helpers";
import type { GitHubImportPreview, GitHubIssue } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/github/preview — fetch open issues for a repo and compute
// newCount / existingCount against the target board.
// Body: { repo, boardId? }
//
// repo can be "owner/name", "https://github.com/owner/name",
// "https://github.com/owner/name/issues", etc.
//
// If boardId is provided, we check existing cards (githubRepo + githubIssueNumber)
// to compute newCount vs existingCount. Otherwise newCount = totalIssues and
// existingCount = 0.
export async function POST(req: NextRequest) {
  const body = await parseBody<{ repo?: string; boardId?: string }>(req);
  const repoInput = (body.repo ?? "").trim();
  if (!repoInput) {
    return err("`repo` is required", 400);
  }

  const repo = normalizeRepo(repoInput);
  if (!repo) {
    return err(
      `Could not parse repo from "${repoInput}". Expected "owner/name" or a github.com URL.`,
      400,
    );
  }

  const result = await fetchOpenIssues(repo);
  if (!result.ok) {
    return err(result.error, result.status, { repo });
  }

  const issues: GitHubIssue[] = result.issues;
  const totalIssues = issues.length;

  let existingIssueNumbers = new Set<number>();
  if (body.boardId) {
    const existing = await db.card.findMany({
      where: { boardId: body.boardId, githubRepo: repo },
      select: { githubIssueNumber: true },
    });
    existingIssueNumbers = new Set(
      existing
        .map((c) => c.githubIssueNumber)
        .filter((n): n is number => n != null),
    );
  }
  const existingCount = issues.filter((i) =>
    existingIssueNumbers.has(i.number),
  ).length;
  const newCount = totalIssues - existingCount;

  const preview: GitHubImportPreview = {
    repo,
    totalIssues,
    issues,
    newCount,
    existingCount,
  };
  return ok(preview);
}
