import type { PrismaClient } from "@prisma/client";

export interface ComplexitySuggestion {
  complexity: number;
  confidence: number;
  reasons: string[];
}

type AnyModule = Record<string, unknown>;
type InferComplexityFn = (
  db: PrismaClient,
  boardId: string,
  data: { title: string; description: string; labelNames: string[] },
) => Promise<ComplexitySuggestion | null>;
type InferComplexityForCardFn = (
  db: PrismaClient,
  cardId: string,
) => Promise<ComplexitySuggestion | null>;

let cached: AnyModule | null | undefined;

export async function loadAI(): Promise<AnyModule | null> {
  if (cached !== undefined) return cached;
  try {
    const mod = (await import("@/lib/ai")) as AnyModule;
    cached = mod;
    return mod;
  } catch (e) {
    console.warn(
      "[ai-loader] AI module not available:",
      (e as Error).message,
    );
    cached = null;
    return null;
  }
}

/**
 * Try to infer complexity for a card that has already been created.
 * Returns null if the AI module isn't available or doesn't expose a
 * complexity function.
 */
export async function inferComplexityForCard(
  db: PrismaClient,
  cardId: string,
): Promise<ComplexitySuggestion | null> {
  const ai = await loadAI();
  if (!ai) return null;

  const forCard = ai.inferComplexityForCard as InferComplexityForCardFn | undefined;
  if (typeof forCard === "function") {
    try {
      const result = await forCard(db, cardId);
      return normalizeSuggestion(result);
    } catch (e) {
      console.warn(
        "[ai-loader] inferComplexityForCard threw:",
        (e as Error).message,
      );
      return null;
    }
  }

  return null;
}

/**
 * Try to infer complexity from in-memory card fields (no DB lookup needed).
 * Falls back to the db+boardId form if the module only exposes that.
 */
export async function inferComplexityFromFields(
  db: PrismaClient,
  boardId: string,
  card: {
    title: string;
    description?: string | null;
    labels?: string[];
  },
): Promise<ComplexitySuggestion | null> {
  const ai = await loadAI();
  if (!ai) return null;

  const fn = ai.inferComplexity as InferComplexityFn | undefined;
  if (typeof fn !== "function") return null;

  try {
    const result = await fn(db, boardId, {
      title: card.title,
      description: card.description ?? "",
      labelNames: card.labels ?? [],
    });
    return normalizeSuggestion(result);
  } catch (e) {
    console.warn(
      "[ai-loader] inferComplexity threw:",
      (e as Error).message,
    );
    return null;
  }
}

function normalizeSuggestion(
  result: unknown,
): ComplexitySuggestion | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Partial<ComplexitySuggestion>;
  if (
    typeof r.complexity === "number" &&
    r.complexity >= 1 &&
    r.complexity <= 5
  ) {
    return {
      complexity: r.complexity,
      confidence: typeof r.confidence === "number" ? r.confidence : 0.5,
      reasons: Array.isArray(r.reasons) ? r.reasons : [],
    };
  }
  return null;
}

export async function inferComplexity(
  card: {
    title: string;
    description?: string | null;
    labels?: string[];
  },
  db?: PrismaClient,
  boardId?: string,
): Promise<ComplexitySuggestion | null> {
  if (db && boardId) {
    return inferComplexityFromFields(db, boardId, card);
  }
  return null;
}
