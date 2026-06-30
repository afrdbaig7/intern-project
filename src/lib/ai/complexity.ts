
import { PrismaClient } from "@prisma/client";
import type { ComplexityResult } from "../types";

export interface InferComplexityInput {
  title: string;
  description: string;
  labelNames: string[];
}

const HIGH_RISK_KEYWORDS = [
  "refactor",
  "migrate",
  "rewrite",
  "architecture",
  "real-time",
  "concurrent",
  "distributed",
];

const MED_KEYWORDS = [
  "api",
  "endpoint",
  "database",
  "auth",
  "security",
  "performance",
  "optimization",
];

const LOW_KEYWORDS = [
  "typo",
  "rename",
  "text",
  "label",
  "copy",
  "docs",
  "readme",
];

const LABEL_ADJUST: Record<string, number> = {
  bug: 1,
  refactor: 1,
  docs: -1,
  frontend: 0,
  feature: 1,
};

const HISTORY_SIMILARITY_THRESHOLD = 0.3;

/** Jaccard similarity between two label-name lists (case-insensitive). */
function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a.map((s) => s.toLowerCase()));
  const sb = new Set(b.map((s) => s.toLowerCase()));
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/**
 * Infer a 1-5 complexity score for a would-be card.
 */
export async function inferComplexity(
  db: PrismaClient,
  boardId: string,
  data: InferComplexityInput
): Promise<ComplexityResult> {
  const { title, description, labelNames } = data;
  const text = `${title} ${description}`.toLowerCase();
  const descLen = description.length;
  const reasons: string[] = [];

  let base: number;
  let descLenFactor: number; // 0.2..1.0, used later for confidence
  if (descLen < 50) {
    base = 1;
    descLenFactor = 0.2;
    reasons.push("Description is very short");
  } else if (descLen < 150) {
    base = 2;
    descLenFactor = 0.4;
    reasons.push("Description is short");
  } else if (descLen < 400) {
    base = 3;
    descLenFactor = 0.6;
    reasons.push("Description is moderately long");
  } else if (descLen < 800) {
    base = 4;
    descLenFactor = 0.8;
    reasons.push("Description is long");
  } else {
    base = 5;
    descLenFactor = 1.0;
    reasons.push("Description is very long");
  }

  let highHit: string | null = null;
  for (const kw of HIGH_RISK_KEYWORDS) {
    if (text.includes(kw)) {
      highHit = kw;
      break;
    }
  }
  if (highHit) {
    base += 2;
    reasons.push(`Contains keyword '${highHit}' (+2)`);
  }

  let medHit: string | null = null;
  for (const kw of MED_KEYWORDS) {
    if (text.includes(kw)) {
      medHit = kw;
      break;
    }
  }
  if (medHit) {
    base += 1;
    reasons.push(`Contains keyword '${medHit}' (+1)`);
  }

  let lowHit: string | null = null;
  for (const kw of LOW_KEYWORDS) {
    if (text.includes(kw)) {
      lowHit = kw;
      break;
    }
  }
  if (lowHit) {
    base -= 1;
    reasons.push(`Contains keyword '${lowHit}' (-1)`);
  }

  for (const label of labelNames.map((l) => l.toLowerCase())) {
    const adj = LABEL_ADJUST[label];
    if (adj === undefined) continue;
    base += adj;
    const sign = adj > 0 ? `(+${adj})` : adj < 0 ? `(${adj})` : "(+0)";
    reasons.push(`Label '${label}' ${sign}`);
  }

  const history = await db.cardHistory.findMany({
    where: { boardId, action: "completed" },
    select: { labelNames: true, complexity: true },
  });
  const similar = history.filter((h) => {
    const hLabels = (h.labelNames ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return (
      jaccard(labelNames, hLabels) > HISTORY_SIMILARITY_THRESHOLD
    );
  });
  const similarComplexities = similar
    .map((s) => s.complexity)
    .filter((c): c is number => c != null);

  let historyAvg = 0;
  if (similarComplexities.length > 0) {
    historyAvg =
      similarComplexities.reduce((a, b) => a + b, 0) /
      similarComplexities.length;
    reasons.push(
      `${similarComplexities.length} similar past card(s) averaged ${historyAvg.toFixed(
        1
      )} points`
    );
  }

  const heuristicScore = clamp(base, 1, 5);
  const blended =
    historyAvg > 0 ? (heuristicScore + historyAvg) / 2 : heuristicScore;
  const complexity = clamp(Math.round(blended), 1, 5);

  const confidence = clamp(
    0.5 + 0.3 * (similarComplexities.length / 5) + 0.2 * descLenFactor,
    0,
    1
  );

  return { complexity, confidence, reasons };
}
