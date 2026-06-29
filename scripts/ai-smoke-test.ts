// Smoke test for the AI engine.
// Runs runAIAnalysis on the seeded board and prints each insight as it streams in.
// Also exercises the complexity + assignment + digest modules directly.
//
// Run from project root:  bun scripts/ai-smoke-test.ts

import { PrismaClient } from "@prisma/client";
import {
  runAIAnalysis,
  detectBottlenecks,
  assessSprintRisk,
  inferComplexityForCard,
  generateDigest,
  suggestAssignee,
} from "../src/lib/ai/index";

const db = new PrismaClient();
const SEED_BOARD_ID = "cmqzm7z0m0005m76e9g52uth3";

function line(s = "") {
  console.log(s);
}

async function main() {
  // ── Sanity: lookup board ────────────────────────────────────────
  const board = await db.board.findUnique({
    where: { id: SEED_BOARD_ID },
    select: { id: true, name: true, sprintEnd: true },
  });
  if (!board) {
    console.error(`Board ${SEED_BOARD_ID} not found. Aborting.`);
    process.exit(1);
  }
  line(`============================================================`);
  line(`Board: ${board.name} (${board.id})`);
  line(`sprintEnd: ${board.sprintEnd?.toISOString() ?? "n/a"}`);
  line(`============================================================`);

  // ── 1. Direct module calls (without persistence) ────────────────
  line("\n[1] detectBottlenecks() — direct call");
  const bottlenecks = await detectBottlenecks(db, SEED_BOARD_ID);
  console.log(
    "  →",
    bottlenecks.length === 0
      ? "(none — seeded data has no 'moved' activities)"
      : JSON.stringify(bottlenecks, null, 2)
  );

  line("\n[2] assessSprintRisk() — direct call");
  const risk = await assessSprintRisk(db, SEED_BOARD_ID);
  console.log("  →", risk ? JSON.stringify(risk, null, 2) : "null");

  line("\n[3] inferComplexityForCard() — direct call (first card)");
  const sampleCard = await db.card.findFirst({
    where: { boardId: SEED_BOARD_ID },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, description: true },
  });
  if (sampleCard) {
    const cx = await inferComplexityForCard(db, sampleCard.id);
    console.log("  card:", sampleCard.title);
    console.log("  desc:", (sampleCard.description ?? "").slice(0, 80) + "...");
    console.log("  →", JSON.stringify(cx, null, 2));
  }

  line("\n[4] generateDigest() — direct call");
  const digest = await generateDigest(db, SEED_BOARD_ID);
  console.log("  →", JSON.stringify(digest, null, 2));

  line("\n[5] suggestAssignee() — direct call (first unassigned card)");
  const unassigned = await db.card.findFirst({
    where: { boardId: SEED_BOARD_ID, assigneeId: null },
    select: { id: true, title: true },
  });
  if (unassigned) {
    const sug = await suggestAssignee(db, SEED_BOARD_ID, unassigned.id);
    console.log("  card:", unassigned.title);
    console.log("  →", sug ? JSON.stringify(sug, null, 2) : "null");
  } else {
    console.log("  (no unassigned cards to test)");
  }

  // ── 2. runAIAnalysis with streaming callback ────────────────────
  line("\n[6] runAIAnalysis() — streaming insights one at a time");
  const streamOrder: string[] = [];
  const { insights, digest: digestFromRun } = await runAIAnalysis(
    db,
    SEED_BOARD_ID,
    {
      onInsight: (ins) => {
        streamOrder.push(ins.type);
        console.log(
          `  → [${ins.type}/${ins.severity}] ${ins.title}\n     ${ins.message.slice(
            0,
            120
          )}${ins.message.length > 120 ? "..." : ""}`
        );
      },
    }
  );

  line(`\n  Streaming order: ${streamOrder.join(" → ")}`);
  line(`  Total insights created: ${insights.length}`);
  line(`  Digest summary: ${digestFromRun?.summary ?? "n/a"}`);

  // ── 3. Verify rows actually persisted in DB ─────────────────────
  const persistedInsights = await db.aIInsight.count({
    where: { boardId: SEED_BOARD_ID },
  });
  const persistedDigests = await db.digest.count({
    where: { boardId: SEED_BOARD_ID },
  });
  line(`\n[7] Persistence check`);
  line(`  AIInsight rows for board: ${persistedInsights}`);
  line(`  Digest rows for board:    ${persistedDigests}`);

  line("\n============================================================");
  line("Smoke test complete.");
  line("============================================================");
}

main()
  .catch((e) => {
    console.error("SMOKE TEST FAILED:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
