"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronDown,
  Clock,
  FileText,
  Gauge,
  Loader2,
  Sparkles,
  TrendingDown,
  UserCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import {
  emitAIRun,
  onAiComplete,
  onAiInsight,
  onAiUpdate,
} from "@/lib/socket";
import { qk } from "@/store/app-store";
import type {
  AIInsightDTO,
  AssignmentSuggestion,
  BottleneckResult,
  ComplexityResult,
  InsightType,
  SprintRiskResult,
} from "@/lib/types";

// ─── Helpers ───────────────────────────────────────────────────────────
type Severity = "info" | "warning" | "critical";
const SEVERITY_BAR: Record<Severity, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-emerald-500",
};
const SEVERITY_TINT: Record<Severity, string> = {
  critical: "bg-red-500/[0.06]",
  warning: "bg-amber-500/[0.06]",
  info: "bg-emerald-500/[0.05]",
};

const TYPE_ICON: Record<InsightType, React.ComponentType<{ className?: string }>> = {
  bottleneck: AlertTriangle,
  sprint_risk: TrendingDown,
  complexity: Brain,
  assignment: UserCheck,
  digest: FileText,
};

const TYPE_LABEL: Record<InsightType, string> = {
  bottleneck: "Bottlenecks",
  sprint_risk: "Sprint risks",
  complexity: "Complexity",
  assignment: "Suggestions",
  digest: "Digest",
};

type Filter = "all" | InsightType;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "bottleneck", label: "Bottlenecks" },
  { id: "sprint_risk", label: "Risks" },
  { id: "assignment", label: "Suggestions" },
  { id: "digest", label: "Digest" },
];

function AIInsightsPanel({ boardId }: { boardId: string }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [aiRunning, setAiRunning] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // ── Query insights (newest first from API) ──
  const { data, isLoading, isError, error } = useQuery<AIInsightDTO[]>({
    queryKey: qk.insights(boardId),
    queryFn: () => api.insights(boardId),
  });

  // ── Socket: streaming insights ──
  useEffect(() => {
    const offInsight = onAiInsight((payload) => {
      const insight = payload as AIInsightDTO;
      if (!insight || insight.boardId !== boardId) return;
      queryClient.setQueryData<AIInsightDTO[]>(qk.insights(boardId), (old) => {
        if (!old) return [insight];
        if (old.some((i) => i.id === insight.id)) return old;
        return [insight, ...old];
      });
      setNewIds((s) => {
        const next = new Set(s);
        next.add(insight.id);
        return next;
      });
      // Auto-clear the highlight pulse after a few seconds
      setTimeout(() => {
        setNewIds((s) => {
          const next = new Set(s);
          next.delete(insight.id);
          return next;
        });
      }, 4000);
    });

    const offUpdate = onAiUpdate((payload) => {
      const p = payload as { status?: string; insightCount?: number };
      if (!p) return;
      if (p.status === "running") setAiRunning(true);
      if (p.status === "complete") {
        setAiRunning(false);
        const n = p.insightCount ?? 0;
        toast.success(`AI analysis complete — ${n} new insight${n === 1 ? "" : "s"}`);
      }
    });

    const offComplete = onAiComplete((payload) => {
      const p = payload as { insightCount?: number };
      setAiRunning(false);
      if (typeof p?.insightCount === "number") {
        // Refresh the digest too — the AI run generates one
        queryClient.invalidateQueries({ queryKey: qk.digest(boardId) });
      }
    });

    return () => {
      offInsight();
      offUpdate();
      offComplete();
    };
  }, [boardId, queryClient]);

  const handleRun = async () => {
    if (aiRunning) return;
    setAiRunning(true);
    toast.message("AI analysis started", {
      description: "Detecting bottlenecks, sprint risks and assignment suggestions…",
    });
    try {
      emitAIRun(boardId);
      await api.runAI(boardId);
    } catch (err) {
      // socket may still be running; only surface hard errors
      if (err instanceof ApiError) {
        toast.error("Couldn't start AI analysis", { description: err.message });
        setAiRunning(false);
      }
    }
  };

  // ── Filter + count by type ──
  const insights = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: insights.length };
    for (const i of insights) c[i.type] = (c[i.type] ?? 0) + 1;
    return c;
  }, [insights]);
  const filtered = useMemo(
    () => (filter === "all" ? insights : insights.filter((i) => i.type === filter)),
    [insights, filter]
  );
  const unreadCount = useMemo(
    () => insights.filter((i) => !i.read).length,
    [insights]
  );

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              AI Insights
              {unreadCount > 0 && (
                <Badge className="border-transparent bg-emerald-500 text-white">
                  {unreadCount} new
                </Badge>
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              {insights.length} {insights.length === 1 ? "insight" : "insights"} ·
              AI runs every 6 hours
            </p>
          </div>
        </div>
        <Button
          onClick={handleRun}
          disabled={aiRunning}
          className="bg-emerald-500 text-white hover:bg-emerald-600"
        >
          {aiRunning ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Run analysis now
        </Button>
      </div>

      {/* Running banner */}
      {aiRunning && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300"
        >
          <Sparkles className="size-4 animate-pulse" />
          <span className="font-medium">AI is analyzing the board…</span>
          <span className="text-muted-foreground">
            New insights will stream in as they&apos;re generated.
          </span>
        </motion.div>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const n = counts[f.id] ?? 0;
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "border-border bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {f.label}
              <span
                className={`tabular-nums ${active ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground/70"}`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* List */}
      <style>{`
        .kb-insights-scroll::-webkit-scrollbar { width: 6px; }
        .kb-insights-scroll::-webkit-scrollbar-track { background: transparent; }
        .kb-insights-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        .kb-insights-scroll::-webkit-scrollbar-thumb:hover { background: var(--muted-foreground); }
      `}</style>
      <div className="kb-insights-scroll -mr-2 max-h-[calc(100vh-14rem)] flex-1 space-y-2.5 overflow-y-auto pr-2 pb-2"
        style={{ scrollbarWidth: "thin" }}
      >
        {isLoading ? (
          <InsightListSkeleton />
        ) : isError ? (
          <InsightError error={error} />
        ) : filtered.length === 0 ? (
          <InsightEmpty
            onRun={handleRun}
            running={aiRunning}
            hasInsights={insights.length > 0}
          />
        ) : (
          <motion.div
            className="space-y-2.5"
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.04 } },
              hidden: {},
            }}
          >
            {filtered.map((insight) => (
              <InsightRow
                key={insight.id}
                insight={insight}
                boardId={boardId}
                isNew={newIds.has(insight.id)}
              />
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ─── Single insight row ───────────────────────────────────────────────
function InsightRow({
  insight,
  boardId,
  isNew,
}: {
  insight: AIInsightDTO;
  boardId: string;
  isNew: boolean;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const Icon = TYPE_ICON[insight.type];
  const truncated = insight.message.length > 180;

  const markRead = async (read: boolean) => {
    // Optimistic update
    queryClient.setQueryData<AIInsightDTO[]>(qk.insights(boardId), (old) =>
      (old ?? []).map((i) => (i.id === insight.id ? { ...i, read } : i))
    );
    try {
      await api.markInsight(boardId, insight.id, read);
    } catch {
      // revert on error
      queryClient.invalidateQueries({ queryKey: qk.insights(boardId) });
    }
  };

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 6 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
      }}
      animate={isNew ? { boxShadow: ["0 0 0 0 rgba(16,185,129,0)", "0 0 0 4px rgba(16,185,129,0.18)", "0 0 0 0 rgba(16,185,129,0)"] } : undefined}
      transition={isNew ? { duration: 1.6 } : undefined}
    >
      <Card
        className={`relative gap-0 overflow-hidden py-0 ${
          insight.read ? "" : SEVERITY_TINT[insight.severity]
        }`}
      >
        {/* Severity left border */}
        <div
          className={`absolute inset-y-0 left-0 w-1 ${SEVERITY_BAR[insight.severity]}`}
        />
        <CardContent className="p-3.5 pl-5">
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md ${SEVERITY_TINT[insight.severity]}`}
            >
              <Icon className={`size-4 ${SEVERITY_BAR[insight.severity].replace("bg-", "text-")}`} />
            </div>

            <div className="min-w-0 flex-1">
              {/* Title row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {!insight.read && (
                    <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                  )}
                  <h4 className="text-sm font-medium leading-snug">{insight.title}</h4>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge
                    variant="outline"
                    className="border-border px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {TYPE_LABEL[insight.type]}
                  </Badge>
                  {!insight.read ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-muted-foreground hover:text-foreground"
                      onClick={() => markRead(true)}
                      title="Mark as read"
                    >
                      <Check className="size-3.5" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-muted-foreground hover:text-foreground"
                      onClick={() => markRead(false)}
                      title="Mark as unread"
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Message (collapsible) */}
              <p
                className={`mt-1 text-sm text-muted-foreground ${
                  expanded ? "" : truncated ? "line-clamp-2" : ""
                }`}
                onClick={() => truncated && setExpanded((e) => !e)}
                role={truncated ? "button" : undefined}
                tabIndex={truncated ? 0 : undefined}
                title={truncated ? "Click to expand" : undefined}
              >
                {insight.message}
              </p>
              {truncated && (
                <button
                  onClick={() => setExpanded((e) => !e)}
                  className="mt-0.5 inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                >
                  {expanded ? "Show less" : "Show more"}
                  <ChevronDown
                    className={`size-3 transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </button>
              )}

              {/* Type-specific metadata */}
              <InsightMetadata insight={insight} />

              {/* Timestamp */}
              <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground/80">
                <Clock className="size-3" />
                {formatDistanceToNow(new Date(insight.createdAt), { addSuffix: true })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Per-type metadata rendering ───────────────────────────────────────
function InsightMetadata({ insight }: { insight: AIInsightDTO }) {
  const m = insight.metadata;
  if (!m) return null;

  if (insight.type === "bottleneck") {
    const b = m as unknown as BottleneckResult;
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        <MetaChip label="Arrived" value={String(b.arrived)} tone="amber" />
        <MetaChip label="Left" value={String(b.left)} tone="sky" />
        <MetaChip label="Ratio" value={`${b.ratio.toFixed(1)}×`} tone="red" />
      </div>
    );
  }

  if (insight.type === "sprint_risk") {
    const r = m as unknown as SprintRiskResult;
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        <MetaChip label="Days left" value={String(r.daysRemaining)} tone="amber" />
        <MetaChip label="Cards remaining" value={String(r.cardsRemaining)} tone="sky" />
        <MetaChip label="Velocity" value={`${r.velocity.toFixed(2)}/day`} tone="emerald" />
        <MetaChip
          label="Projected"
          value={`${r.projectedCompletionDays.toFixed(1)}d`}
          tone={r.willMeetDeadline ? "emerald" : "red"}
        />
      </div>
    );
  }

  if (insight.type === "complexity") {
    const c = m as unknown as ComplexityResult;
    const confPct = Math.round(c.confidence * 100);
    return (
      <div className="mt-2 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          <MetaChip label="Complexity" value={`${c.complexity}/5`} tone="amber" />
          <MetaChip label="Confidence" value={`${confPct}%`} tone="emerald" />
        </div>
        <div className="h-1 w-full max-w-[180px] overflow-hidden rounded-full bg-emerald-500/15">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${confPct}%` }}
          />
        </div>
      </div>
    );
  }

  if (insight.type === "assignment") {
    const a = m as unknown as AssignmentSuggestion;
    return (
      <div className="mt-2 flex items-center gap-2 rounded-md border border-emerald-500/15 bg-emerald-500/[0.06] px-2.5 py-1.5">
        <Avatar className="size-6">
          <AvatarFallback className="bg-emerald-500 text-[10px] font-semibold text-white">
            {a.suggestedUserName?.[0]?.toUpperCase() ?? "?"}
          </AvatarFallback>
        </Avatar>
        <span className="text-xs font-medium">{a.suggestedUserName}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          score <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{a.score.toFixed(0)}</span>
        </span>
      </div>
    );
  }

  return null;
}

function MetaChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "red" | "sky";
}) {
  const toneCls: Record<"emerald" | "amber" | "red" | "sky", string> = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    red: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    sky: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${toneCls[tone]}`}
    >
      <span className="opacity-70">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

// ─── States ────────────────────────────────────────────────────────────
function InsightListSkeleton() {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

function InsightError({ error }: { error: unknown }) {
  const msg = error instanceof ApiError ? error.message : "Failed to load insights";
  return (
    <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="size-10 text-muted-foreground/50" />
      <div className="text-base font-medium">Couldn&apos;t load insights</div>
      <p className="max-w-sm text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}

function InsightEmpty({
  onRun,
  running,
  hasInsights,
}: {
  onRun: () => void;
  running: boolean;
  hasInsights: boolean;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500">
        <Gauge className="size-7" />
      </div>
      <div>
        <div className="text-base font-medium">
          {hasInsights ? "Nothing matches this filter" : "No insights yet"}
        </div>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {hasInsights
            ? "Try switching filters to see other insight types."
            : "Run an analysis to let the AI detect bottlenecks and sprint risks."}
        </p>
      </div>
      {!hasInsights && (
        <Button
          onClick={onRun}
          disabled={running}
          className="bg-emerald-500 text-white hover:bg-emerald-600"
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Run analysis now
        </Button>
      )}
    </div>
  );
}

export { AIInsightsPanel };
export default AIInsightsPanel;
