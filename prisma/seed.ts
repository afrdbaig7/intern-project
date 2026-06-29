// Seed script: creates demo users, a board (software-sprint template),
// columns, labels, sample cards, and card history for AI heuristics.
// Run with: bun run db:seed
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#0ea5e9"];

async function main() {
  console.log("🌱 Seeding database...");

  // ── Users ──────────────────────────────────────────────────────
  const users = await Promise.all(
    [
      { name: "Aarav Sharma", email: "aarav@kanban.ai", githubUsername: "aaravsharma" },
      { name: "Priya Nair", email: "priya@kanban.ai", githubUsername: "priyanair" },
      { name: "Rohan Mehta", email: "rohan@kanban.ai", githubUsername: "rohanmehta" },
      { name: "Ananya Iyer", email: "ananya@kanban.ai", githubUsername: "ananyaiyer" },
      { name: "Vikram Reddy", email: "vikram@kanban.ai", githubUsername: "vikramreddy" },
    ].map((u, i) =>
      db.user.create({
        data: { ...u, avatarColor: COLORS[i % COLORS.length], passwordHash: "demo" },
      })
    )
  );
  console.log(`  ✓ ${users.length} users`);

  // ── Board (software sprint) ────────────────────────────────────
  const board = await db.board.create({
    data: {
      name: "Q4 Platform Sprint",
      description: "Real-time collaboration + AI project manager rollout.",
      template: "software-sprint",
      sprintStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      sprintEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    },
  });

  // members
  await Promise.all(
    users.map((u, i) =>
      db.boardMember.create({
        data: { boardId: board.id, userId: u.id, role: i === 0 ? "owner" : "member" },
      })
    )
  );
  console.log(`  ✓ Board "${board.name}" with ${users.length} members`);

  // ── Columns ────────────────────────────────────────────────────
  const columnDefs = [
    { name: "Backlog", color: "#64748b", isDone: false },
    { name: "To Do", color: "#0ea5e9", isDone: false },
    { name: "In Progress", color: "#f59e0b", isDone: false },
    { name: "Review", color: "#a855f7", isDone: false },
    { name: "Done", color: "#22c55e", isDone: true },
  ];
  const columns = await Promise.all(
    columnDefs.map((c, i) =>
      db.column.create({ data: { ...c, boardId: board.id, order: i } })
    )
  );

  // ── Labels ─────────────────────────────────────────────────────
  const labelDefs = [
    { name: "bug", color: "#ef4444" },
    { name: "feature", color: "#3b82f6" },
    { name: "refactor", color: "#a855f7" },
    { name: "docs", color: "#64748b" },
    { name: "api", color: "#14b8a6" },
    { name: "frontend", color: "#ec4899" },
    { name: "performance", color: "#f59e0b" },
  ];
  const labels = await Promise.all(
    labelDefs.map((l) => db.label.create({ data: { ...l, boardId: board.id } }))
  );
  console.log(`  ✓ ${columns.length} columns, ${labels.length} labels`);

  // ── Cards ──────────────────────────────────────────────────────
  const labelByName = (name: string) => labels.find((l) => l.name === name)!;

  const cardDefs: {
    columnIdx: number;
    title: string;
    description: string;
    assigneeIdx: number;
    creatorIdx: number;
    labelNames: string[];
    complexity?: number;
    daysAgoCreated?: number;
    daysAgoCompleted?: number;
  }[] = [
    // Backlog
    { columnIdx: 0, title: "Investigate webhook retry backoff strategy", description: "Research exponential backoff vs jittered backoff for failed webhook deliveries. Write a short design doc with a recommendation.", assigneeIdx: -1, creatorIdx: 1, labelNames: ["api", "research" as any], complexity: 3, daysAgoCreated: 2 },
    { columnIdx: 0, title: "Add audit log export to CSV", description: "Allow admins to export the audit log filtered by date range and actor. Streaming response to handle large exports.", assigneeIdx: -1, creatorIdx: 0, labelNames: ["feature"], complexity: 2, daysAgoCreated: 3 },
    // To Do
    { columnIdx: 1, title: "Migrate auth to JWT refresh tokens", description: "Split long-lived access tokens into short-lived access + rotating refresh. Implement refresh endpoint and revoke list. Touches session store, middleware, and both clients.", assigneeIdx: 2, creatorIdx: 0, labelNames: ["api", "refactor"], complexity: 5, daysAgoCreated: 4 },
    { columnIdx: 1, title: "Dark mode polish for charts", description: "Recharts tooltips and gridlines still use light palette in dark mode. Audit every chart and swap to CSS variables.", assigneeIdx: 3, creatorIdx: 3, labelNames: ["frontend"], complexity: 2, daysAgoCreated: 2 },
    { columnIdx: 1, title: "Add rate limiting to import endpoint", description: "GitHub import can be abused. Add a token-bucket limiter per user, 5 imports / hour.", assigneeIdx: 4, creatorIdx: 0, labelNames: ["api", "performance"], complexity: 3, daysAgoCreated: 1 },
    // In Progress (bottleneck: many cards, few leaving)
    { columnIdx: 2, title: "Real-time cursor sharing", description: "Broadcast mouse position over socket.io to other users viewing the same board. Throttle to 30fps and interpolate on the client. Handle viewport scaling for different screen sizes.", assigneeIdx: 1, creatorIdx: 1, labelNames: ["frontend", "feature"], complexity: 4, daysAgoCreated: 6 },
    { columnIdx: 2, title: "Refactor card move to use operational ids", description: "Currently card moves use array index. Move to stable card ids so concurrent moves don't clobber ordering. Add integration test for 10 concurrent drags.", assigneeIdx: 2, creatorIdx: 1, labelNames: ["refactor", "performance"], complexity: 4, daysAgoCreated: 5 },
    { columnIdx: 2, title: "AI bottleneck detector v2", description: "Improve cause attribution: detect overloaded assignees, stuck labels, and cross-column dependency chains. Surface plain-English explanation in the insights panel.", assigneeIdx: 0, creatorIdx: 0, labelNames: ["feature", "api"], complexity: 5, daysAgoCreated: 5 },
    { columnIdx: 2, title: "Fix Safari drag flicker", description: "Cards flicker when dragged between columns in Safari 17. Likely a transform + will-change interaction.", assigneeIdx: 3, creatorIdx: 3, labelNames: ["bug", "frontend"], complexity: 2, daysAgoCreated: 4 },
    { columnIdx: 2, title: "Add keyboard shortcuts for card ops", description: "C to create, E to edit, arrows to move between columns, Delete to archive. Show shortcut hints in tooltips.", assigneeIdx: 4, creatorIdx: 4, labelNames: ["frontend", "feature"], complexity: 3, daysAgoCreated: 3 },
    // Review
    { columnIdx: 3, title: "GitHub import dedup test", description: "Verify running import twice on the same repo produces zero duplicate cards. Add a regression test.", assigneeIdx: 2, creatorIdx: 0, labelNames: ["api"], complexity: 2, daysAgoCreated: 4, daysAgoCompleted: 1 },
    { columnIdx: 3, title: "Complexity inference heuristic", description: "Ship the v1 keyword + length + label heuristic for 1-5 story points. Wire up accept/override UI.", assigneeIdx: 0, creatorIdx: 1, labelNames: ["feature", "api"], complexity: 3, daysAgoCreated: 5, daysAgoCompleted: 1 },
    // Done
    { columnIdx: 4, title: "Board persistence across restarts", description: "Confirmed SQLite file survives process restart. Added migration script.", assigneeIdx: 1, creatorIdx: 1, labelNames: ["api"], complexity: 1, daysAgoCreated: 8, daysAgoCompleted: 5 },
    { columnIdx: 4, title: "Socket.io presence tracking", description: "Track which users are viewing which board. Broadcast join/leave. Show avatars in the header.", assigneeIdx: 3, creatorIdx: 1, labelNames: ["feature", "frontend"], complexity: 3, daysAgoCreated: 7, daysAgoCompleted: 4 },
    { columnIdx: 4, title: "Card detail modal", description: "Show description, assignee, labels, complexity, comments, activity timeline in a polished modal.", assigneeIdx: 4, creatorIdx: 3, labelNames: ["frontend"], complexity: 3, daysAgoCreated: 7, daysAgoCompleted: 3 },
    { columnIdx: 4, title: "Conflict notification toast", description: "When last-write-wins discards an edit, show a toast with both values and a link to re-apply.", assigneeIdx: 2, creatorIdx: 0, labelNames: ["frontend", "bug"], complexity: 2, daysAgoCreated: 6, daysAgoCompleted: 2 },
  ];

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  for (let i = 0; i < cardDefs.length; i++) {
    const c = cardDefs[i];
    const createdAt = new Date(now - (c.daysAgoCreated ?? 1) * day);
    const completedAt = c.daysAgoCompleted != null ? new Date(now - c.daysAgoCompleted * day) : null;
    const assignee = c.assigneeIdx >= 0 ? users[c.assigneeIdx] : null;
    const creator = users[c.creatorIdx];
    const col = columns[c.columnIdx];

    const card = await db.card.create({
      data: {
        boardId: board.id,
        columnId: col.id,
        title: c.title,
        description: c.description,
        order: i,
        complexity: c.complexity ?? null,
        complexityAccepted: c.columnIdx === 4, // done cards accepted
        assigneeId: assignee?.id ?? null,
        creatorId: creator.id,
        createdAt,
        completedAt,
        version: 1,
      },
    });

    // attach labels (filter out invalid "research")
    const validLabels = c.labelNames.filter((n) => labels.some((l) => l.name === n));
    await Promise.all(
      validLabels.map((n) =>
        db.cardLabel.create({ data: { cardId: card.id, labelId: labelByName(n).id } })
      )
    );

    // activity: created
    await db.activity.create({
      data: {
        cardId: card.id,
        boardId: board.id,
        userId: creator.id,
        type: "created",
        summary: `${creator.name} created this card`,
        createdAt,
      },
    });

    if (assignee) {
      await db.activity.create({
        data: {
          cardId: card.id,
          boardId: board.id,
          userId: creator.id,
          type: "assigned",
          summary: `Assigned to ${assignee.name}`,
          createdAt: new Date(createdAt.getTime() + 60_000),
        },
      });
    }
    if (completedAt && col.isDone) {
      await db.activity.create({
        data: {
          cardId: card.id,
          boardId: board.id,
          userId: assignee?.id ?? creator.id,
          type: "completed",
          summary: `Moved to ${col.name}`,
          createdAt: completedAt,
        },
      });
    }

    // card history (training data for AI)
    await db.cardHistory.create({
      data: {
        cardId: card.id,
        boardId: board.id,
        action: "created",
        complexity: c.complexity ?? null,
        assigneeId: assignee?.id ?? null,
        labelNames: validLabels.join(","),
        descriptionLength: c.description.length,
        createdAt,
      },
    });
    if (completedAt && col.isDone) {
      await db.cardHistory.create({
        data: {
          cardId: card.id,
          boardId: board.id,
          action: "completed",
          complexity: c.complexity ?? null,
          assigneeId: assignee?.id ?? null,
          labelNames: validLabels.join(","),
          descriptionLength: c.description.length,
          daysToComplete: Math.round((completedAt.getTime() - createdAt.getTime()) / day),
          createdAt: completedAt,
        },
      });
    }
  }
  console.log(`  ✓ ${cardDefs.length} cards with labels, activity, history`);

  // ── A second board (product roadmap) for variety ───────────────
  const board2 = await db.board.create({
    data: {
      name: "Product Roadmap 2025",
      description: "Quarterly initiatives across growth, retention, and platform.",
      template: "product-roadmap",
    },
  });
  await Promise.all(
    users.map((u, i) =>
      db.boardMember.create({
        data: { boardId: board2.id, userId: u.id, role: i === 0 ? "owner" : "member" },
      })
    )
  );
  const cols2 = await Promise.all(
    [
      { name: "Discovery", color: "#64748b", isDone: false },
      { name: "Now", color: "#ef4444", isDone: false },
      { name: "Next", color: "#f59e0b", isDone: false },
      { name: "Later", color: "#0ea5e9", isDone: false },
      { name: "Shipped", color: "#22c55e", isDone: true },
    ].map((c, i) => db.column.create({ data: { ...c, boardId: board2.id, order: i } }))
  );
  const labels2 = await Promise.all(
    [
      { name: "growth", color: "#22c55e" },
      { name: "retention", color: "#a855f7" },
      { name: "infrastructure", color: "#64748b" },
    ].map((l) => db.label.create({ data: { ...l, boardId: board2.id } }))
  );
  const cards2 = [
    { col: 1, title: "Onboarding redesign", desc: "Reduce time-to-value from 3 days to 1 hour.", a: 1 },
    { col: 1, title: "In-app messaging v2", desc: "Real-time collaboration hints inside the editor.", a: 0 },
    { col: 2, title: "Mobile app v2", desc: "Native rebuild with offline support.", a: 2 },
    { col: 3, title: "AI summarisation", desc: "Auto-summarise long threads in digest.", a: 0 },
    { col: 4, title: "Public board sharing", desc: "Read-only shareable URLs.", a: 3, daysAgo: 6 },
    { col: 4, title: "Board templates", desc: "Sprint, content, roadmap presets.", a: 4, daysAgo: 4 },
  ];
  for (let i = 0; i < cards2.length; i++) {
    const c = cards2[i];
    const assignee = users[c.a];
    await db.card.create({
      data: {
        boardId: board2.id,
        columnId: cols2[c.col].id,
        title: c.title,
        description: c.desc,
        order: i,
        assigneeId: assignee.id,
        creatorId: users[0].id,
        complexity: 3,
        complexityAccepted: c.col === 4,
        completedAt: c.col === 4 ? new Date(now - (c.daysAgo ?? 1) * day) : null,
        createdAt: new Date(now - (c.daysAgo ? c.daysAgo + 3 : 5) * day),
        version: 1,
      },
    });
  }
  console.log(`  ✓ Second board "${board2.name}" with ${cards2.length} cards`);

  console.log("\n✅ Seed complete.");
  console.log(`   Board 1: ${board.id} (${board.name})`);
  console.log(`   Board 2: ${board2.id} (${board2.name})`);
  console.log(`   Demo login: any user, password "demo"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
