"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Github,
  Loader2,
  Search,
  Tag,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { qk, useAppStore } from "@/store/app-store";
import type { BoardDetailDTO, GitHubImportPreview } from "@/lib/types";

function hashToHue(name: string): number {
  return Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}
function labelColor(name: string): string {
  return `hsl(${hashToHue(name)} 65% 45%)`;
}
function labelBg(name: string): string {
  return `hsl(${hashToHue(name)} 65% 45% / 0.16)`;
}

function isValidRepoInput(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  if (/^https?:\/\/github\.com\//i.test(s)) return true;
  return /^[\w.-]+\/[\w.-]+$/.test(s);
}

type Phase = "idle" | "previewing" | "previewed" | "importing" | "imported";

function GitHubImportPanel({ boardId }: { boardId: string }) {
  const user = useAppStore((s) => s.user);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const queryClient = useQueryClient();

  const [repoInput, setRepoInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<GitHubImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [columnId, setColumnId] = useState<string>("");
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    total: number;
    repo: string;
  } | null>(null);

  const { data: board, isLoading: boardLoading } = useQuery<BoardDetailDTO>({
    queryKey: qk.fullBoard(boardId),
    queryFn: () => api.getFullBoard(boardId),
  });

  const defaultColumnId = useMemo(() => {
    if (!board) return "";
    const firstNonDone = board.columns.find((c) => !c.isDone);
    return (firstNonDone ?? board.columns[0])?.id ?? "";
  }, [board]);
  const effectiveColumnId = columnId || defaultColumnId;

  const handlePreview = async () => {
    if (!isValidRepoInput(repoInput)) {
      setPreviewError("Enter a repo as owner/name (e.g. facebook/react) or a GitHub URL.");
      return;
    }
    setPhase("previewing");
    setPreviewError(null);
    setPreview(null);
    try {
      const result = await api.githubPreview({ repo: repoInput.trim(), boardId });
      setPreview(result);
      setPhase("previewed");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to fetch issues from GitHub.";
      setPreviewError(msg);
      setPhase("idle");
    }
  };

  const handleImport = async () => {
    if (!preview || !effectiveColumnId) return;
    setPhase("importing");
    try {
      const result = await api.githubImport({
        repo: preview.repo,
        boardId,
        columnId: effectiveColumnId,
        creatorId: user?.id,
      });
      setImportResult({ ...result, repo: preview.repo });
      setPhase("imported");
      toast.success(
        `Imported ${result.imported} issue${result.imported === 1 ? "" : "s"} from ${preview.repo}`,
        {
          description:
            result.skipped > 0
              ? `${result.skipped} already existed and were skipped.`
              : undefined,
        }
      );
      queryClient.invalidateQueries({ queryKey: qk.fullBoard(boardId) });
      queryClient.invalidateQueries({ queryKey: qk.team(boardId) });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Import failed.";
      toast.error("Import failed", { description: msg });
      setPhase("previewed");
    }
  };

  const reset = () => {
    setPhase("idle");
    setPreview(null);
    setPreviewError(null);
    setImportResult(null);
    setRepoInput("");
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
          <Github className="size-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">GitHub Import</h2>
          <p className="text-sm text-muted-foreground">
            Import open issues from any public repository as cards. Incremental
            — running twice won&apos;t create duplicates.
          </p>
        </div>
      </div>

      {/* Input row */}
      <Card className="gap-0 py-0">
        <CardContent className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && phase !== "previewing") handlePreview();
              }}
              placeholder="e.g. facebook/react or https://github.com/facebook/react"
              className="flex-1 font-mono text-sm"
              disabled={phase === "importing"}
            />
            <Button
              onClick={handlePreview}
              disabled={phase === "previewing" || phase === "importing" || !repoInput.trim()}
              variant="outline"
              className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
            >
              {phase === "previewing" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              Preview
            </Button>
          </div>
          {previewError && (
            <Alert variant="destructive" className="mt-3">
              <AlertCircle className="size-4" />
              <AlertTitle>Preview failed</AlertTitle>
              <AlertDescription>{previewError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Body */}
      {phase === "idle" && !preview && !importResult && (
        <EmptyState />
      )}

      {phase === "previewed" && preview && (
        <PreviewCard
          preview={preview}
          board={board}
          boardLoading={boardLoading}
          columnId={effectiveColumnId}
          setColumnId={setColumnId}
          onImport={handleImport}
        />
      )}

      {phase === "importing" && preview && (
        <ImportingCard repo={preview.repo} newCount={preview.newCount} />
      )}

      {phase === "imported" && importResult && (
        <ImportedCard
          result={importResult}
          onViewBoard={() => setActiveTab("board")}
          onImportAnother={reset}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
        <Github className="size-8" />
      </div>
      <div>
        <div className="text-base font-medium">Import issues from GitHub</div>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Paste a public repository URL or <code className="rounded bg-muted px-1 py-0.5 text-xs">owner/name</code>{" "}
          above and click Preview. We&apos;ll show you what&apos;s new and let
          you import them into any column.
        </p>
      </div>
    </div>
  );
}

function PreviewCard({
  preview,
  board,
  boardLoading,
  columnId,
  setColumnId,
  onImport,
}: {
  preview: GitHubImportPreview;
  board: BoardDetailDTO | undefined;
  boardLoading: boolean;
  columnId: string;
  setColumnId: (id: string) => void;
  onImport: () => void;
}) {
  const sample = useMemo(() => preview.issues.slice(0, 8), [preview.issues]);
  const columns = board?.columns ?? [];
  const canImport = preview.newCount > 0 && !!columnId;

  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
              <Github className="size-5" />
            </div>
            <div>
              <div className="font-mono text-sm font-semibold">{preview.repo}</div>
              <div className="text-xs text-muted-foreground">
                {preview.totalIssues} open issue{preview.totalIssues === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              {preview.newCount} new
            </Badge>
            {preview.existingCount > 0 && (
              <Badge variant="outline" className="text-muted-foreground">
                {preview.existingCount} already imported
              </Badge>
            )}
          </div>
        </div>

        {/* Sample list */}
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sample of {preview.issues.length} issue{preview.issues.length === 1 ? "" : "s"}
          </div>
          <div
            className="kb-github-scroll -mr-2 max-h-72 space-y-1.5 overflow-y-auto pr-2"
            style={{ scrollbarWidth: "thin" }}
          >
            <style>{`
              .kb-github-scroll::-webkit-scrollbar { width: 6px; }
              .kb-github-scroll::-webkit-scrollbar-track { background: transparent; }
              .kb-github-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
              .kb-github-scroll::-webkit-scrollbar-thumb:hover { background: var(--muted-foreground); }
            `}</style>
            {sample.map((issue) => (
              <div
                key={issue.number}
                className="rounded-lg border border-border/60 bg-card/50 p-2.5"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                    #{issue.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-medium">{issue.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {issue.labels.slice(0, 3).map((l) => (
                        <span
                          key={l}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: labelBg(l), color: labelColor(l) }}
                        >
                          <Tag className="size-2.5" />
                          {l}
                        </span>
                      ))}
                      {issue.labels.length > 3 && (
                        <span className="text-[10px]">+{issue.labels.length - 3}</span>
                      )}
                      {issue.assignees.length > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Users className="size-3" />
                          {issue.assignees.length}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Column selector + Import */}
        <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Import into column
            </label>
            {boardLoading ? (
              <Skeleton className="h-9 w-44" />
            ) : (
              <Select value={columnId} onValueChange={setColumnId}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder="Select a column" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span
                        className="mr-1.5 inline-block size-2 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                      {c.isDone && <span className="text-xs text-muted-foreground"> (done)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {preview.newCount === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4" />
              All issues already imported
            </div>
          ) : (
            <Button
              onClick={onImport}
              disabled={!canImport}
              className="bg-emerald-500 text-white hover:bg-emerald-600"
            >
              <Download className="size-4" />
              Import {preview.newCount} issue{preview.newCount === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ImportingCard({ repo, newCount }: { repo: string; newCount: number }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
        <Loader2 className="size-8 animate-spin text-emerald-500" />
        <div>
          <div className="text-base font-medium">
            Importing {newCount} issue{newCount === 1 ? "" : "s"}…
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Creating cards for <span className="font-mono">{repo}</span> · please wait
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ImportedCard({
  result,
  onViewBoard,
  onImportAnother,
}: {
  result: {
    imported: number;
    skipped: number;
    total: number;
    repo: string;
  };
  onViewBoard: () => void;
  onImportAnother: () => void;
}) {
  return (
    <Card className="gap-0 border-emerald-500/40 py-0">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
            <CheckCircle2 className="size-6" />
          </div>
          <div className="flex-1">
            <div className="text-base font-semibold">
              Imported {result.imported} issue{result.imported === 1 ? "" : "s"}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              From <span className="font-mono">{result.repo}</span>
              {result.skipped > 0 && ` · ${result.skipped} already existed and were skipped.`}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={onViewBoard}
                className="bg-emerald-500 text-white hover:bg-emerald-600"
              >
                View board
              </Button>
              <Button variant="outline" onClick={onImportAnother}>
                <ArrowLeft className="size-4" />
                Import another repo
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export { GitHubImportPanel };
export default GitHubImportPanel;
