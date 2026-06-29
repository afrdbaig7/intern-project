"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Sparkles, Users } from "lucide-react";
import { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError } from "@/lib/api";
import { emitAIRun } from "@/lib/socket";
import { qk } from "@/store/app-store";
import type { TeamMemberStats } from "@/lib/types";

// Consistent label color from a string hash → hsl hue.
function hashToHue(name: string): number {
  return Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}
function labelColor(name: string): string {
  return `hsl(${hashToHue(name)} 70% 50%)`;
}
function labelBg(name: string): string {
  return `hsl(${hashToHue(name)} 70% 50% / 0.14)`;
}

function initial(name: string): string {
  return (name?.trim()?.[0] ?? "?").toUpperCase();
}

function TeamView({ boardId }: { boardId: string }) {
  const runAI = useRunAI(boardId);
  const { data, isLoading, isError, error } = useQuery<TeamMemberStats[]>({
    queryKey: qk.team(boardId),
    queryFn: () => api.team(boardId),
  });

  if (isLoading) return <TeamSkeleton />;
  if (isError) return <TeamError error={error} />;
  if (!data || data.length === 0) return <TeamEmpty onRun={runAI.run} running={runAI.running} />;

  const maxInProgress = Math.max(1, ...data.map((m) => m.inProgressCount));
  const totalInProgress = data.reduce((a, m) => a + m.inProgressCount, 0);
  const totalCompleted = data.reduce((a, m) => a + m.completedThisSprint, 0);
  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
            <Users className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Team</h2>
            <p className="text-sm text-muted-foreground">
              {data.length} {data.length === 1 ? "member" : "members"} on this board
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SummaryPill label="In progress" value={totalInProgress} tone="emerald" />
          <SummaryPill label="Done this sprint" value={totalCompleted} tone="sky" icon />
          <Button
            variant="outline"
            size="sm"
            onClick={runAI.run}
            disabled={runAI.running}
            className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
          >
            {runAI.running ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Run analysis
          </Button>
        </div>
      </div>

      {/* Member grid */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
          hidden: {},
        }}
      >
        {data.map((m) => (
          <motion.div
            key={m.user.id}
            variants={{
              hidden: { opacity: 0, y: 8 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
            }}
          >
            <MemberCard member={m} maxInProgress={maxInProgress} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

// ─── Member card ───────────────────────────────────────────────────────
function MemberCard({
  member,
  maxInProgress,
}: {
  member: TeamMemberStats;
  maxInProgress: number;
}) {
  const pct = Math.round((member.inProgressCount / maxInProgress) * 100);
  return (
    <Card className="gap-0 overflow-hidden p-0 py-0">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Avatar className="size-11 border-2" style={{ borderColor: member.user.avatarColor }}>
            <AvatarFallback
              className="font-semibold text-white"
              style={{ backgroundColor: member.user.avatarColor }}
            >
              {initial(member.user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{member.user.name}</div>
            <div className="truncate text-xs text-muted-foreground">{member.user.email}</div>
          </div>
        </div>

        {/* In-progress stat with progress bar relative to team max */}
        <div className="mt-5 space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              In Progress
            </span>
            <span className="text-2xl font-semibold tabular-nums">
              {member.inProgressCount}
            </span>
          </div>
          <Progress value={pct} className="h-1.5 bg-emerald-500/15 [&>div]:bg-emerald-500" />
        </div>

        {/* Completed this sprint */}
        <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5" />
            Completed this sprint
          </span>
          <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
            {member.completedThisSprint}
          </span>
        </div>

        {/* Specialisation */}
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Specialisation
          </div>
          {member.labelSpecialisation.length === 0 ? (
            <span className="text-xs text-muted-foreground/70">
              No completed-card history yet
            </span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {member.labelSpecialisation.slice(0, 3).map((l) => (
                <Badge
                  key={l.label}
                  variant="outline"
                  className="gap-1 border-transparent px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: labelBg(l.label),
                    color: labelColor(l.label),
                  }}
                >
                  {l.label}
                  <span className="opacity-70">·{l.count}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Small summary pill ────────────────────────────────────────────────
function SummaryPill({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "emerald" | "sky";
  icon?: boolean;
}) {
  const toneCls =
    tone === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${toneCls}`}
    >
      <span className="font-medium uppercase tracking-wide opacity-80">{label}</span>
      <span className="flex items-center gap-1 text-sm font-semibold tabular-nums">
        {icon && <CheckCircle2 className="size-3.5" />}
        {value}
      </span>
    </div>
  );
}

// ─── Hook: trigger AI run ──────────────────────────────────────────────
function useRunAI(boardId: string) {
  const [running, setRunning] = useState(false);
  return {
    running,
    run: async () => {
      if (running) return;
      setRunning(true);
      try {
        emitAIRun(boardId);
        await api.runAI(boardId);
      } catch {
        // socket path will still fire; ignore REST fallback error
      } finally {
        // Brief cooldown so the user sees the spinner even on fast responses
        setTimeout(() => setRunning(false), 2500);
      }
    },
  };
}

// ─── Loading / error / empty states ────────────────────────────────────
function TeamSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full" />
        ))}
      </div>
    </div>
  );
}

function TeamError({ error }: { error: unknown }) {
  const msg =
    error instanceof ApiError ? error.message : "Failed to load team data";
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
      <Users className="size-10 text-muted-foreground/50" />
      <div className="text-base font-medium">Couldn&apos;t load team data</div>
      <p className="max-w-sm text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}

function TeamEmpty({ onRun, running }: { onRun: () => void; running: boolean }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500">
        <Users className="size-7" />
      </div>
      <div>
        <div className="text-base font-medium">No team members yet</div>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Once members join this board, their workload and specialisations
          will show up here.
        </p>
      </div>
      <Button
        onClick={onRun}
        disabled={running}
        className="bg-emerald-500 text-white hover:bg-emerald-600"
      >
        {running ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        Run AI analysis
      </Button>
    </div>
  );
}

export { TeamView };
export default TeamView;
