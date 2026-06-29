// Shared TypeScript types used across the Next.js app, Socket.IO service, and AI engine.

// ─── Entity Types ────────────────────────────────────────────────
export interface UserDTO {
  id: string
  name: string
  email: string
  avatarColor: string
  githubUsername: string | null
}

export interface BoardMemberDTO extends UserDTO {
  role: "owner" | "member"
  joinedAt: string
}

export interface ColumnDTO {
  id: string
  boardId: string
  name: string
  order: number
  color: string
  wipLimit: number | null
  isDone: boolean
}

export interface LabelDTO {
  id: string
  boardId: string
  name: string
  color: string
}

export interface CardDTO {
  id: string
  boardId: string
  columnId: string
  title: string
  description: string | null
  order: number
  complexity: number | null
  complexityAccepted: boolean
  dueDate: string | null
  githubIssueNumber: number | null
  githubRepo: string | null
  sourceUrl: string | null
  version: number
  lastEditedBy: string | null
  lastEditedAt: string | null
  assigneeId: string | null
  creatorId: string | null
  assignee: UserDTO | null
  creator: UserDTO | null
  labels: LabelDTO[]
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface CommentDTO {
  id: string
  cardId: string
  userId: string
  text: string
  createdAt: string
  user: UserDTO
}

export interface ActivityDTO {
  id: string
  cardId: string
  boardId: string
  userId: string
  type: ActivityType
  summary: string
  metadata: Record<string, unknown> | null
  createdAt: string
  user: UserDTO
}

export type ActivityType =
  | "created"
  | "moved"
  | "updated"
  | "assigned"
  | "commented"
  | "complexity_set"
  | "completed"
  | "archived"

export interface BoardDTO {
  id: string
  name: string
  description: string | null
  sprintStart: string | null
  sprintEnd: string | null
  template: string | null
  createdAt: string
  updatedAt: string
  members: BoardMemberDTO[]
  columns: ColumnDTO[]
  labels: LabelDTO[]
}

export interface BoardDetailDTO extends BoardDTO {
  cards: CardDTO[]
}

// ─── AI Types ────────────────────────────────────────────────────
export type InsightType = "bottleneck" | "sprint_risk" | "complexity" | "assignment" | "digest"

export interface AIInsightDTO {
  id: string
  boardId: string
  type: InsightType
  severity: "info" | "warning" | "critical"
  title: string
  message: string
  metadata: Record<string, unknown> | null
  read: boolean
  createdAt: string
}

export interface DigestDTO {
  id: string
  boardId: string
  weekStart: string
  weekEnd: string
  content: DigestContent
  createdAt: string
}

export interface DigestContent {
  totalCompleted: number
  totalCreated: number
  velocityTrend: { date: string; completed: number }[]
  topBottleneck: { column: string; ratio: number } | null
  byAssignee: { userId: string; name: string; completed: number }[]
  summary: string
}

export interface TeamMemberStats {
  user: UserDTO
  inProgressCount: number
  completedThisSprint: number
  labelSpecialisation: { label: string; count: number }[]
}

// ─── Socket Events ───────────────────────────────────────────────
export const SOCKET_EVENTS = {
  // Client -> Server
  BOARD_JOIN: "board:join",
  BOARD_LEAVE: "board:leave",
  CARD_CREATE: "card:create",
  CARD_UPDATE: "card:update",
  CARD_MOVE: "card:move",
  CARD_DELETE: "card:delete",
  COMMENT_CREATE: "comment:create",
  USER_TYPING: "user:typing",
  CURSOR_MOVE: "cursor:move",
  AI_RUN: "ai:run",
  AI_SUBSCRIBE: "ai:subscribe",

  // Server -> Client
  CARD_CREATED: "card:created",
  CARD_UPDATED: "card:updated",
  CARD_MOVED: "card:moved",
  CARD_DELETED: "card:deleted",
  COMMENT_CREATED: "comment:created",
  ACTIVITY_CREATED: "activity:created",
  PRESENCE_UPDATE: "presence:update",
  TYPING_UPDATE: "typing:update",
  CURSOR_UPDATE: "cursor:update",
  AI_UPDATE: "ai:update",
  AI_INSIGHT: "ai:insight",
  AI_COMPLETE: "ai:complete",
  CONFLICT: "conflict",
  ERROR: "error",
} as const

// ─── Socket Payloads ─────────────────────────────────────────────
export interface SocketUser {
  id: string
  name: string
  avatarColor: string
}

export interface PresenceUser extends SocketUser {
  socketId: string
  cursor?: { x: number; y: number } | null
}

export interface CardCreatePayload {
  boardId: string
  columnId: string
  title: string
  description?: string
  creatorId: string
  sourceUrl?: string
  githubIssueNumber?: number
  githubRepo?: string
  labelIds?: string[]
  assigneeId?: string
}

export interface CardUpdatePayload {
  boardId: string
  cardId: string
  // optimistic concurrency: client sends the version it last saw
  expectedVersion: number
  patch: Partial<{
    title: string
    description: string
    complexity: number | null
    complexityAccepted: boolean
    assigneeId: string | null
    dueDate: string | null
  }>
  editor: SocketUser
}

export interface CardMovePayload {
  boardId: string
  cardId: string
  fromColumnId: string
  toColumnId: string
  newOrder: number
  expectedVersion: number
  editor: SocketUser
}

export interface CardDeletePayload {
  boardId: string
  cardId: string
  editor: SocketUser
}

export interface CommentCreatePayload {
  boardId: string
  cardId: string
  text: string
  user: SocketUser
}

// conflict notification (last-write-wins with visible warning)
export interface ConflictNotification {
  cardId: string
  cardTitle: string
  yourVersion: number
  serverVersion: number
  serverLastEditedBy: string | null
  serverLastEditedAt: string | null
  field: string
  yourValue: unknown
  serverValue: unknown
}

// ─── AI Engine Types ─────────────────────────────────────────────
export interface BottleneckResult {
  columnId: string
  columnName: string
  arrived: number
  left: number
  ratio: number
  likelyCause: string
  severity: "warning" | "critical"
}

export interface SprintRiskResult {
  daysRemaining: number
  cardsRemaining: number
  velocity: number // cards/day
  projectedCompletionDays: number
  willMeetDeadline: boolean
  riskLevel: "low" | "medium" | "high"
  summary: string
}

export interface ComplexityResult {
  complexity: number // 1-5
  confidence: number // 0-1
  reasons: string[]
}

export interface AssignmentSuggestion {
  cardId: string
  suggestedUserId: string
  suggestedUserName: string
  score: number
  reasons: string[]
}

// ─── GitHub Import Types ─────────────────────────────────────────
export interface GitHubIssue {
  number: number
  title: string
  body: string
  labels: string[]
  assignees: string[]
  milestone: string | null
  url: string
  createdAt: string
}

export interface GitHubImportPreview {
  repo: string
  totalIssues: number
  issues: GitHubIssue[]
  newCount: number
  existingCount: number
}

// ─── Board Templates (bonus) ─────────────────────────────────────
export interface BoardTemplate {
  id: string
  name: string
  description: string
  columns: { name: string; color: string; isDone: boolean }[]
  labels: { name: string; color: string }[]
  sampleCards?: { column: number; title: string; description: string }[]
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: "software-sprint",
    name: "Software Sprint",
    description: "Backlog → In Progress → Review → Done with engineering labels",
    columns: [
      { name: "Backlog", color: "#64748b", isDone: false },
      { name: "To Do", color: "#0ea5e9", isDone: false },
      { name: "In Progress", color: "#f59e0b", isDone: false },
      { name: "Review", color: "#a855f7", isDone: false },
      { name: "Done", color: "#22c55e", isDone: true },
    ],
    labels: [
      { name: "bug", color: "#ef4444" },
      { name: "feature", color: "#3b82f6" },
      { name: "refactor", color: "#a855f7" },
      { name: "docs", color: "#64748b" },
      { name: "api", color: "#14b8a6" },
    ],
    sampleCards: [
      { column: 1, title: "Implement OAuth login", description: "Add Google + GitHub OAuth providers with secure session handling." },
      { column: 2, title: "Fix drag flicker on Safari", description: "Cards flicker when dragged between columns in Safari 17." },
      { column: 2, title: "Add dark mode toggle", description: "Persist theme preference and respect system setting." },
    ],
  },
  {
    id: "content-calendar",
    name: "Content Calendar",
    description: "Idea → Drafting → Editing → Published for content teams",
    columns: [
      { name: "Ideas", color: "#64748b", isDone: false },
      { name: "Drafting", color: "#0ea5e9", isDone: false },
      { name: "Editing", color: "#f59e0b", isDone: false },
      { name: "Scheduled", color: "#a855f7", isDone: false },
      { name: "Published", color: "#22c55e", isDone: true },
    ],
    labels: [
      { name: "blog", color: "#3b82f6" },
      { name: "video", color: "#ef4444" },
      { name: "newsletter", color: "#a855f7" },
      { name: "social", color: "#14b8a6" },
    ],
    sampleCards: [
      { column: 0, title: "Q4 product launch announcement", description: "Coordinated blog + newsletter + social campaign." },
      { column: 1, title: "Engineering culture deep-dive", description: "Interview 3 engineers about what makes the team work." },
    ],
  },
  {
    id: "product-roadmap",
    name: "Product Roadmap",
    description: "Now → Next → Later with initiative tracking",
    columns: [
      { name: "Discovery", color: "#64748b", isDone: false },
      { name: "Now", color: "#ef4444", isDone: false },
      { name: "Next", color: "#f59e0b", isDone: false },
      { name: "Later", color: "#0ea5e9", isDone: false },
      { name: "Shipped", color: "#22c55e", isDone: true },
    ],
    labels: [
      { name: "growth", color: "#22c55e" },
      { name: "retention", color: "#a855f7" },
      { name: "infrastructure", color: "#64748b" },
      { name: "research", color: "#14b8a6" },
    ],
    sampleCards: [
      { column: 1, title: "Onboarding redesign", description: "Reduce time-to-value for new signups from 3 days to under 1 hour." },
      { column: 2, title: "Mobile app v2", description: "Native React Native rebuild with offline support." },
    ],
  },
]
