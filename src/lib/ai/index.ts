// AI engine — orchestration entrypoint.
//
// Re-exports the five heuristic modules and provides `runAIAnalysis` which
// runs them in sequence, persisting each as an AIInsight row and streaming
// it to an optional onInsight callback (this is the "streaming" behaviour
// the assignment requires — insights appear one at a time, not all at once).
//
// All AI here is CPU-bound heuristics. No external LLM is called.

import { PrismaClient } from "@prisma/client";
import type {
  AIInsightDTO,
  AssignmentSuggestion,
  BottleneckResult,
  ComplexityResult,
  DigestContent,
  InsightType,
  SprintRiskResult,
} from "../types";

import { detectBottlenecks } from "./bottleneck";
import { assessSprintRisk } from "./risk";
import { inferComplexity } from "./complexity";
import { generateDigest } from "./digest";
import { suggestAssignee } from "./assignment";

// ── Re-exports ───────────────────────────────────────────────────
export { detectBottlenecks } from "./bottleneck";
export { assessSprintRisk } from "./risk";
export { inferComplexity } from "./complexity";
export { generateDigest } from "./digest";
export { suggestAssignee } from "./assignment";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ASSIGNMENT_INSIGHTS = 10; // cap per run to avoid spamming the feed

interface RunAIOptions {
  onInsight?: (insight: AIInsightDTO) => void;
}

/** Map sprint risk level -> insight severity. */
function severityFromRisk(
  level: SprintRiskResult["riskLevel"]
): "info" | "warning" | "critical" {
  if (level === "low") return "info";
  if (level === "medium") return "warning";
  return "critical";
}

/** Convert a Prisma AIInsight row to the DTO (parsing metadata safely). */
function toDTO(ins: {
  id: string;
  boardId: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  metadata: string | null;
  read: boolean;
  createdAt: Date;
}): AIInsightDTO {
  let metadata: Record<string, unknown> | null = null;
  if (ins.metadata) {
    try {
      const parsed = JSON.parse(ins.metadata);
      metadata =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
    } catch {
      metadata = null;
    }
  }
  return {
    id: ins.id,
    boardId: ins.boardId,
    type: ins.type as InsightType,
    severity: ins.severity as "info" | "warning" | "critical",
    title: ins.title,
    message: ins.message,
    metadata,
    read: ins.read,
    createdAt: ins.createdAt.toISOString(),
  };
}

/**
 * Run the full AI analysis pipeline for a board.
 *
 * Modules run IN SEQUENCE so that each insight can be persisted and
 * streamed via onInsight before the next module starts. This is the
 * "streaming" behaviour required by the assignment.
 *
 * Returns the list of created AIInsight DTOs plus the generated Digest.
 */
export async function runAIAnalysis(
  db: PrismaClient,
  boardId: string,
  opts: RunAIOptions = {}
): Promise<{ insights: AIInsightDTO[]; digest: DigestContent | null }> {
  const insights: AIInsightDTO[] = [];
  const onInsight = opts.onInsight ?? (() => {});

  // ── 1. Bottleneck detection ────────────────────────────────────
  try {
    const bottlenecks: BottleneckResult[] = await detectBottlenecks(db, boardId);
    for (const b of bottlenecks) {
      const created = await db.aIInsight.create({
        data: {
          boardId,
          type: "bottleneck",
          severity: b.severity,
          title: `Bottleneck in ${b.columnName}`,
          message: `${b.columnName} is accumulating cards: ${b.arrived} arrived, ${b.left} left (ratio ${b.ratio.toFixed(
            1
          )}x). ${b.likelyCause}.`,
          metadata: JSON.stringify(b),
        },
      });
      const dto = toDTO(created);
      insights.push(dto);
      onInsight(dto);
    }
  } catch (err) {
    console.error("[ai] bottleneck detection failed:", err);
  }

  // ── 2. Sprint risk assessment ──────────────────────────────────
  try {
    const risk: SprintRiskResult | null = await assessSprintRisk(db, boardId);
    if (risk) {
      const sev = severityFromRisk(risk.riskLevel);
      const created = await db.aIInsight.create({
        data: {
          boardId,
          type: "sprint_risk",
          severity: sev,
          title: `Sprint risk: ${risk.riskLevel.toUpperCase()}`,
          message: risk.summary,
          metadata: JSON.stringify(risk),
        },
      });
      const dto = toDTO(created);
      insights.push(dto);
      onInsight(dto);
    }
  } catch (err) {
    console.error("[ai] sprint risk failed:", err);
  }

  // ── 3. Assignment suggestions (for unassigned, non-done cards) ──
  try {
    const nonDoneCols = await db.column.findMany({
      where: { boardId, isDone: false },
      select: { id: true },
    });
    const nonDoneColIds = nonDoneCols.map((c) => c.id);
    const cardsNeedingAssign = await db.card.findMany({
      where: { boardId, columnId: { in: nonDoneColIds }, assigneeId: null },
      take: MAX_ASSIGNMENT_INSIGHTS,
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true },
    });

    for (const c of cardsNeedingAssign) {
      const sug: AssignmentSuggestion | null = await suggestAssignee(
        db,
        boardId,
        c.id
      );
      if (!sug) continue;
      const created = await db.aIInsight.create({
        data: {
          boardId,
          type: "assignment",
          severity: "info",
          title: `Suggested assignee for "${c.title}"`,
          message: `Suggest ${sug.suggestedUserName} (score ${sug.score}). ${sug.reasons.join(
            "; "
          )}.`,
          metadata: JSON.stringify(sug),
        },
      });
      const dto = toDTO(created);
      insights.push(dto);
      onInsight(dto);
    }
  } catch (err) {
    console.error("[ai] assignment failed:", err);
  }

  // ── 4. Digest ──────────────────────────────────────────────────
  // (Complexity is handled separately on card creation, not in this
  // scheduled run — but we do emit a digest insight summarising the week.)
  let digest: DigestContent | null = null;
  try {
    digest = await generateDigest(db, boardId);
    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * DAY_MS);
    await db.digest.create({
      data: {
        boardId,
        weekStart,
        weekEnd: now,
        content: JSON.stringify(digest),
      },
    });
    const created = await db.aIInsight.create({
      data: {
        boardId,
        type: "digest",
        severity: "info",
        title: `Weekly digest — ${digest.totalCompleted} card(s) completed`,
        message: digest.summary,
        metadata: JSON.stringify(digest),
      },
    });
    const dto = toDTO(created);
    insights.push(dto);
    onInsight(dto);
  } catch (err) {
    console.error("[ai] digest failed:", err);
  }

  return { insights, digest };
}

/**
 * Convenience wrapper: load a card's title/description/labels and run
 * inferComplexity on it. Does NOT persist the result — the caller
 * (e.g. an API route on card-create) is responsible for persisting
 * once the user accepts.
 */
export async function inferComplexityForCard(
  db: PrismaClient,
  cardId: string
): Promise<ComplexityResult> {
  const card = await db.card.findUnique({
    where: { id: cardId },
    include: { labels: { include: { label: { select: { name: true } } } } },
  });
  if (!card) {
    return {
      complexity: 2,
      confidence: 0,
      reasons: ["Card not found — returning default score"],
    };
  }
  const labelNames = card.labels.map((cl) => cl.label.name);
  return inferComplexity(db, card.boardId, {
    title: card.title,
    description: card.description ?? "",
    labelNames,
  });
}
