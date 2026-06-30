"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity,
  CheckCircle2,
  Clock,
  FileBarChart,
  Loader2,
  Sparkles,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { emitAIRun, onAiComplete, onAiUpdate } from "@/lib/socket";
import { qk } from "@/store/app-store";
import type { DigestDTO } from "@/lib/types";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function hashToHue(name: string): number {
  return Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}
function barColor(name: string): string {
  return `hsl(${hashToHue(name)} 70% 50%)`;
}

function DigestView({ boardId }: { boardId: string }) {
  const queryClient = useQueryClient();
  const [regenerating, setRegenerating] = useState(false);
  const { data, isLoading, isError, error } = useQuery<DigestDTO | null>({
    queryKey: qk.digest(boardId),
    queryFn: () => api.digest(boardId),
  });

  useEffect(() => {
    const offUpdate = onAiUpdate((payload) => {
      const p = payload as { status?: string };
      if (p?.status === "running") setRegenerating(true);
      if (p?.status === "complete") {
        setRegenerating(false);
        queryClient.invalidateQueries({ queryKey: qk.digest(boardId) });
      }
    });
    const offComplete = onAiComplete(() => {
      setRegenerating(false);
      queryClient.invalidateQueries({ queryKey: qk.digest(boardId) });
    });
    return () => {
      offUpdate();
      offComplete();
    };
  }, [boardId, queryClient]);

  if (isLoading) return <DigestSkeleton />;
  if (isError) return <DigestError error={error} />;
  if (!data) return <DigestEmpty boardId={boardId} />;

  const c = data.content;
  const avgVelocity =
    c.velocityTrend.length > 0
      ? c.velocityTrend.reduce((a, t) => a + (t.completed ?? 0), 0) /
        c.velocityTrend.length
      : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
            <FileBarChart className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Weekly Digest</h2>
            <p className="text-sm text-muted-foreground">
              {format(new Date(data.weekStart), "MMM d")} –{" "}
              {format(new Date(data.weekEnd), "MMM d, yyyy")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          Generated {formatDistanceToNow(new Date(data.createdAt), { addSuffix: true })}
        </div>
      </div>

      {/* Summary callout */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="relative overflow-hidden rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.08] via-emerald-500/[0.04] to-transparent p-4"
      >
        <div className="absolute right-3 top-3 text-emerald-500/40">
          <Sparkles className="size-5" />
        </div>
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          <Sparkles className="size-3.5" />
          Summary
        </div>
        <p className="text-sm leading-relaxed text-foreground/90">{c.summary}</p>
      </motion.div>

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total completed"
          value={c.totalCompleted}
          tone="emerald"
          icon={<CheckCircle2 className="size-4" />}
        />
        <StatCard
          label="Total created"
          value={c.totalCreated}
          tone="sky"
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          label="Avg velocity"
          value={`${avgVelocity.toFixed(1)}/day`}
          tone="violet"
          icon={<Zap className="size-4" />}
        />
        <StatCard
          label="Top bottleneck"
          value={c.topBottleneck ? c.topBottleneck.column : "None detected"}
          tone="amber"
          icon={<Activity className="size-4" />}
          isText
        />
      </div>

      {/* Velocity trend chart */}
      <Card className="gap-0 py-0">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Velocity trend</h3>
              <p className="text-xs text-muted-foreground">
                Cards completed per day · last 7 days
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-500" />
              Completed
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={c.velocityTrend.map((p) => ({
                date: format(new Date(p.date), "MMM d"),
                completed: p.completed ?? 0,
              }))}
              margin={{ top: 6, right: 8, left: -16, bottom: 0 }}
            >
              <defs>
                <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                strokeOpacity={0.4}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.5rem",
                  fontSize: "12px",
                  color: "var(--popover-foreground)",
                }}
                labelStyle={{ color: "var(--muted-foreground)" }}
                cursor={{ stroke: "#10b981", strokeWidth: 1, strokeDasharray: "3 3" }}
              />
              <Area
                type="monotone"
                dataKey="completed"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#velocityGrad)"
                dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#10b981", stroke: "var(--popover)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* By assignee */}
      <Card className="gap-0 py-0">
        <CardContent className="p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Completed by assignee</h3>
            <p className="text-xs text-muted-foreground">
              This week · sorted by contribution
            </p>
          </div>
          {c.byAssignee.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              No completions recorded this week.
            </div>
          ) : (
            <AssigneeBars data={c.byAssignee} />
          )}
        </CardContent>
      </Card>

      {/* Refresh button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={regenerating}
          onClick={async () => {
            setRegenerating(true);
            emitAIRun(boardId);
            try {
              await api.runAI(boardId);
            } catch {
              /* socket path will still fire */
            }
            setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: qk.digest(boardId) });
            }, 5000);
          }}
          className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
        >
          {regenerating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Regenerate digest
        </Button>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
  isText,
}: {
  label: string;
  value: number | string;
  tone: "emerald" | "sky" | "amber" | "violet";
  icon: React.ReactNode;
  isText?: boolean;
}) {
  const toneBorder: Record<"emerald" | "sky" | "amber" | "violet", string> = {
    emerald: "border-emerald-500/30",
    sky: "border-sky-500/30",
    amber: "border-amber-500/30",
    violet: "border-violet-500/30",
  };
  const toneText: Record<"emerald" | "sky" | "amber" | "violet", string> = {
    emerald: "text-emerald-700 dark:text-emerald-300",
    sky: "text-sky-700 dark:text-sky-300",
    amber: "text-amber-700 dark:text-amber-300",
    violet: "text-violet-700 dark:text-violet-300",
  };
  const toneBg: Record<"emerald" | "sky" | "amber" | "violet", string> = {
    emerald: "bg-emerald-500/[0.07]",
    sky: "bg-sky-500/[0.07]",
    amber: "bg-amber-500/[0.07]",
    violet: "bg-violet-500/[0.07]",
  };
  return (
    <Card className={`gap-0 border py-0 ${toneBorder[tone]} ${toneBg[tone]}`}>
      <CardContent className="p-4">
        <div className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide ${toneText[tone]}`}>
          {icon}
          {label}
        </div>
        <div
          className={`mt-1.5 ${isText ? "text-base font-semibold" : "text-2xl font-semibold tabular-nums"}`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function AssigneeBars({
  data,
}: {
  data: { userId: string; name: string; completed: number }[];
}) {
  const sorted = [...data].sort((a, b) => b.completed - a.completed);
  const max = Math.max(1, ...sorted.map((d) => d.completed));
  const leader = sorted[0];

  return (
    <motion.div
      className="space-y-2.5"
      initial="hidden"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: 0.04 } },
        hidden: {},
      }}
    >
      {sorted.map((d, i) => {
        const pct = Math.round((d.completed / max) * 100);
        const isLeader = d.userId === leader?.userId && d.completed > 0;
        return (
          <motion.div
            key={d.userId}
            variants={{
              hidden: { opacity: 0, x: -6 },
              visible: { opacity: 1, x: 0, transition: { duration: 0.18 } },
            }}
            className="flex items-center gap-3"
          >
            <div className="flex w-32 shrink-0 items-center gap-1.5 text-sm">
              <span className="truncate font-medium">{d.name}</span>
              {isLeader && (
                <Trophy className="size-3.5 shrink-0 text-amber-500" />
              )}
            </div>
            <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted/40">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-md"
                style={{ backgroundColor: barColor(d.name) }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 * i }}
              />
            </div>
            <div className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">
              {d.completed}
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function DigestSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-44" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function DigestError({ error }: { error: unknown }) {
  const msg =
    error instanceof ApiError ? error.message : "Failed to load digest";
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
      <FileBarChart className="size-10 text-muted-foreground/50" />
      <div className="text-base font-medium">Couldn&apos;t load the digest</div>
      <p className="max-w-sm text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}

function DigestEmpty({ boardId }: { boardId: string }) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (running) return;
    setRunning(true);
    emitAIRun(boardId);
    try {
      await api.runAI(boardId);
    } catch {
      /* socket path will still fire */
    }
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: qk.digest(boardId) });
      setRunning(false);
    }, 4000);
  };

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500">
        <FileBarChart className="size-7" />
      </div>
      <div>
        <div className="text-base font-medium">No weekly digest generated yet</div>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          The AI generates one every 6 hours, or run an analysis now to produce
          a fresh digest with velocity trends, top contributors, and bottleneck
          highlights.
        </p>
      </div>
      <Button
        onClick={run}
        disabled={running}
        className="bg-emerald-500 text-white hover:bg-emerald-600"
      >
        {running ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Sparkles className="size-4" />
        )}
        Run analysis now
      </Button>
    </div>
  );
}

export { DigestView };
export default DigestView;
