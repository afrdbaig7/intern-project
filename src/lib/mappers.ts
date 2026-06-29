// Prisma model → DTO mappers. Every API response goes through these so the
// shape is guaranteed to match the shared DTOs in src/lib/types.ts.

import type {
  Activity,
  AIInsight,
  Board,
  BoardMember,
  Card,
  CardLabel,
  Column,
  Comment,
  Digest,
  Label,
  User,
} from "@prisma/client";

import type {
  ActivityDTO,
  ActivityType,
  AIInsightDTO,
  BoardDTO,
  BoardDetailDTO,
  BoardMemberDTO,
  CardDTO,
  ColumnDTO,
  CommentDTO,
  DigestContent,
  DigestDTO,
  InsightType,
  LabelDTO,
  UserDTO,
} from "@/lib/types";

// ─── JSON helpers ──────────────────────────────────────────────────────────
export function safeJsonParse<T = Record<string, unknown> | null>(
  raw: string | null | undefined,
  fallback: T = null as T,
): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ─── Primitive mappers ─────────────────────────────────────────────────────
export function toUserDTO(u: User): UserDTO {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarColor: u.avatarColor,
    githubUsername: u.githubUsername,
  };
}

export function toColumnDTO(c: Column): ColumnDTO {
  return {
    id: c.id,
    boardId: c.boardId,
    name: c.name,
    order: c.order,
    color: c.color,
    wipLimit: c.wipLimit,
    isDone: c.isDone,
  };
}

export function toLabelDTO(l: Label): LabelDTO {
  return {
    id: l.id,
    boardId: l.boardId,
    name: l.name,
    color: l.color,
  };
}

// ─── Relational mappers ────────────────────────────────────────────────────
export type MemberWithUser = BoardMember & { user: User };
export function toMemberDTO(m: MemberWithUser): BoardMemberDTO {
  return {
    ...toUserDTO(m.user),
    role: m.role as "owner" | "member",
    joinedAt: m.joinedAt.toISOString(),
  };
}

export type CardWithRelations = Card & {
  assignee: User | null;
  creator: User | null;
  labels: (CardLabel & { label: Label })[];
};

export function toCardDTO(c: CardWithRelations): CardDTO {
  return {
    id: c.id,
    boardId: c.boardId,
    columnId: c.columnId,
    title: c.title,
    description: c.description,
    order: c.order,
    complexity: c.complexity,
    complexityAccepted: c.complexityAccepted,
    dueDate: c.dueDate ? c.dueDate.toISOString() : null,
    githubIssueNumber: c.githubIssueNumber,
    githubRepo: c.githubRepo,
    sourceUrl: c.sourceUrl,
    version: c.version,
    lastEditedBy: c.lastEditedBy,
    lastEditedAt: c.lastEditedAt ? c.lastEditedAt.toISOString() : null,
    assigneeId: c.assigneeId,
    creatorId: c.creatorId,
    assignee: c.assignee ? toUserDTO(c.assignee) : null,
    creator: c.creator ? toUserDTO(c.creator) : null,
    labels: c.labels.map((cl) => toLabelDTO(cl.label)),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    completedAt: c.completedAt ? c.completedAt.toISOString() : null,
  };
}

export type BoardWithRelations = Board & {
  members: MemberWithUser[];
  columns: Column[];
  labels: Label[];
};

export function toBoardDTO(b: BoardWithRelations): BoardDTO {
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    sprintStart: b.sprintStart ? b.sprintStart.toISOString() : null,
    sprintEnd: b.sprintEnd ? b.sprintEnd.toISOString() : null,
    template: b.template,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    members: b.members.map(toMemberDTO),
    columns: b.columns.map(toColumnDTO),
    labels: b.labels.map(toLabelDTO),
  };
}

export type BoardDetailWithRelations = BoardWithRelations & {
  cards: CardWithRelations[];
};

export function toBoardDetailDTO(b: BoardDetailWithRelations): BoardDetailDTO {
  return {
    ...toBoardDTO(b),
    cards: b.cards.map(toCardDTO),
  };
}

export type CommentWithUser = Comment & { user: User };
export function toCommentDTO(c: CommentWithUser): CommentDTO {
  return {
    id: c.id,
    cardId: c.cardId,
    userId: c.userId,
    text: c.text,
    createdAt: c.createdAt.toISOString(),
    user: toUserDTO(c.user),
  };
}

export type ActivityWithUser = Activity & { user: User };
export function toActivityDTO(a: ActivityWithUser): ActivityDTO {
  return {
    id: a.id,
    cardId: a.cardId,
    boardId: a.boardId,
    userId: a.userId,
    type: a.type as ActivityType,
    summary: a.summary,
    metadata: safeJsonParse(a.metadata, null),
    createdAt: a.createdAt.toISOString(),
    user: toUserDTO(a.user),
  };
}

const INSIGHT_TYPES = new Set<InsightType>([
  "bottleneck",
  "sprint_risk",
  "complexity",
  "assignment",
  "digest",
]);

export function toInsightDTO(i: AIInsight): AIInsightDTO {
  const type = INSIGHT_TYPES.has(i.type as InsightType)
    ? (i.type as InsightType)
    : "bottleneck";
  const severity =
    i.severity === "warning" || i.severity === "critical"
      ? i.severity
      : "info";
  return {
    id: i.id,
    boardId: i.boardId,
    type,
    severity,
    title: i.title,
    message: i.message,
    metadata: safeJsonParse(i.metadata, null),
    read: i.read,
    createdAt: i.createdAt.toISOString(),
  };
}

export function toDigestDTO(d: Digest): DigestDTO {
  return {
    id: d.id,
    boardId: d.boardId,
    weekStart: d.weekStart.toISOString(),
    weekEnd: d.weekEnd.toISOString(),
    content: safeJsonParse<DigestContent>(d.content, {
      totalCompleted: 0,
      totalCreated: 0,
      velocityTrend: [],
      topBottleneck: null,
      byAssignee: [],
      summary: "",
    }),
    createdAt: d.createdAt.toISOString(),
  };
}

// ─── Prisma include helpers (single source of truth) ───────────────────────
export const CARD_INCLUDE = {
  assignee: true,
  creator: true,
  labels: { include: { label: true } },
} as const;

export const BOARD_INCLUDE = {
  members: { include: { user: true } },
  columns: true,
  labels: true,
} as const;

export const BOARD_DETAIL_INCLUDE = {
  ...BOARD_INCLUDE,
  cards: { include: CARD_INCLUDE },
} as const;
