// Kanban Socket.IO Mini-Service
//
// Owns all real-time card/comment MUTATIONS for the collaborative Kanban app.
// The Next.js API handles reads + auth + GitHub import; after writing it calls
// this service's internal HTTP endpoints to fan out broadcasts.
//
// Bootstrap mirrors examples/websocket/server.ts exactly:
//   - path: "/"  (used by Caddy)
//   - cors: "*"
//   - port 3003
//   - graceful SIGTERM/SIGINT

import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { PrismaClient, type Card } from '@prisma/client'
import { Server } from 'socket.io'
import {
  SOCKET_EVENTS,
  type SocketUser,
  type PresenceUser,
  type CardCreatePayload,
  type CardUpdatePayload,
  type CardMovePayload,
  type CardDeletePayload,
  type CommentCreatePayload,
  type ConflictNotification,
  type CardDTO,
  type CommentDTO,
  type ActivityDTO,
  type AIInsightDTO,
} from '../../src/lib/types'

const db = new PrismaClient()

// ─── In-memory state ────────────────────────────────────────────────
// boardId -> socketId -> PresenceUser
const presence = new Map<string, Map<string, PresenceUser>>()
// boardId -> cardId -> userId -> { user, last (ms ts) }
const typing = new Map<string, Map<string, Map<string, { user: SocketUser; last: number }>>>()
// boardId -> socketId -> { x, y, userId }
const cursors = new Map<string, Map<string, { x: number; y: number; userId: string }>>()
// socketId -> set of boardIds (for disconnect cleanup)
const socketBoards = new Map<string, Set<string>>()
// socketId -> last known SocketUser (for activity logging on disconnect)
const socketUserMap = new Map<string, SocketUser>()
// socketId -> last cursor broadcast ts (ms) for 50ms throttle
const lastCursorBroadcast = new Map<string, number>()

// ─── HTTP server + Socket.IO bootstrap ──────────────────────────────
// With `path: '/'` (required by Caddy), engine.io's `attach()` REMOVES all
// pre-existing 'request' listeners and installs its own. That listener's
// path check (`path === req.url.slice(0, path.length)` with path '/') is
// always true, so engine.io intercepts every HTTP request and returns 400
// "Transport unknown" for non-engine.io URLs.
//
// To serve our own internal HTTP routes we let engine.io attach, then
// RE-WRAP the request listeners: capture engine.io's listener, replace it
// with our own that short-circuits /, /internal/broadcast, /internal/ai-run
// and otherwise delegates to engine.io.
const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// Capture engine.io's request listener(s) and re-wrap so our internal HTTP
// routes take precedence.
const engineRequestListeners = httpServer.listeners('request').slice(0)
httpServer.removeAllListeners('request')
httpServer.on('request', async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const url = req.url || ''
    const qIdx = url.indexOf('?')
    const pathname = qIdx >= 0 ? url.slice(0, qIdx) : url
    const hasEIO = qIdx >= 0 && url.slice(qIdx + 1).includes('EIO=')

    // Health check: bare GET / with no socket.io query
    if (req.method === 'GET' && pathname === '/' && !hasEIO) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          status: 'ok',
          connections: io.engine.clientsCount,
        }),
      )
      return
    }

    // POST /internal/broadcast  { boardId, event, payload }
    if (req.method === 'POST' && pathname === '/internal/broadcast') {
      const body = await readBody(req)
      let parsed: { boardId?: string; event?: string; payload?: unknown }
      try {
        parsed = JSON.parse(body || '{}')
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }))
        return
      }
      const { boardId, event, payload } = parsed
      if (!boardId || !event) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'boardId and event required' }))
        return
      }
      io.to(boardId).emit(event, payload)
      console.log(`[socket] internal broadcast -> ${boardId} ${event}`)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    // POST /internal/ai-run  { boardId }
    if (req.method === 'POST' && pathname === '/internal/ai-run') {
      const body = await readBody(req)
      let parsed: { boardId?: string }
      try {
        parsed = JSON.parse(body || '{}')
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }))
        return
      }
      const { boardId } = parsed
      if (!boardId) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'boardId required' }))
        return
      }
      // Fire-and-forget; respond immediately so the caller isn't blocked
      runBoardAI(boardId).catch((e) =>
        console.error(`[socket:error] /internal/ai-run failed: ${String(e)}`),
      )
      console.log(`[socket] internal ai-run triggered for board ${boardId}`)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    // Not our route — delegate to engine.io's listener(s).
    for (const l of engineRequestListeners) {
      l.call(httpServer, req, res)
    }
  } catch (e) {
    console.error('[socket:error] http handler', e)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: String(e) }))
    }
  }
})

// ─── AI module (dynamic, optional) ──────────────────────────────────
// Task 2-b creates src/lib/ai.ts. If it isn't there yet (or fails to load),
// the service still starts and handles all non-AI events.
type AIComplexityResult = {
  complexity: number
  confidence: number
  reasons: string[]
}
type AIAnalysisResult = {
  insights: AIInsightDTO[]
  digest: unknown
}
type AIModule = {
  runAIAnalysis?: (
    db: PrismaClient,
    boardId: string,
    opts?: { onInsight?: (insight: AIInsightDTO) => void },
  ) => Promise<AIAnalysisResult>
  inferComplexityForCard?: (
    db: PrismaClient,
    cardId: string,
  ) => Promise<AIComplexityResult | null>
}

let aiModulePromise: Promise<AIModule | null> | null = null
function loadAIModule(): Promise<AIModule | null> {
  if (aiModulePromise) return aiModulePromise
  aiModulePromise = (async () => {
    try {
      const mod = (await import('../../src/lib/ai')) as AIModule
      console.log('[socket] AI module loaded')
      return mod
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[socket] AI module not available, AI features disabled: ${msg}`)
      return null
    }
  })()
  return aiModulePromise
}

// ─── Helpers ────────────────────────────────────────────────────────
function getPresenceList(boardId: string): PresenceUser[] {
  return Array.from((presence.get(boardId) ?? new Map()).values())
}

function broadcastPresence(boardId: string) {
  io.to(boardId).emit(SOCKET_EVENTS.PRESENCE_UPDATE, {
    boardId,
    users: getPresenceList(boardId),
  })
}

function userToDTO(u: {
  id: string
  name: string
  email: string
  avatarColor: string
  githubUsername: string | null
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarColor: u.avatarColor,
    githubUsername: u.githubUsername,
  }
}

function toCardDTO(card: Card & {
  assignee: { id: string; name: string; email: string; avatarColor: string; githubUsername: string | null } | null
  creator: { id: string; name: string; email: string; avatarColor: string; githubUsername: string | null } | null
  labels: { label: { id: string; boardId: string; name: string; color: string } }[]
}): CardDTO {
  return {
    id: card.id,
    boardId: card.boardId,
    columnId: card.columnId,
    title: card.title,
    description: card.description,
    order: card.order,
    complexity: card.complexity,
    complexityAccepted: card.complexityAccepted,
    dueDate: card.dueDate ? new Date(card.dueDate).toISOString() : null,
    githubIssueNumber: card.githubIssueNumber,
    githubRepo: card.githubRepo,
    sourceUrl: card.sourceUrl,
    version: card.version,
    lastEditedBy: card.lastEditedBy,
    lastEditedAt: card.lastEditedAt ? new Date(card.lastEditedAt).toISOString() : null,
    assigneeId: card.assigneeId,
    creatorId: card.creatorId,
    assignee: card.assignee ? userToDTO(card.assignee) : null,
    creator: card.creator ? userToDTO(card.creator) : null,
    labels: (card.labels ?? []).map((l) => ({
      id: l.label.id,
      boardId: l.label.boardId,
      name: l.label.name,
      color: l.label.color,
    })),
    createdAt: new Date(card.createdAt).toISOString(),
    updatedAt: new Date(card.updatedAt).toISOString(),
    completedAt: card.completedAt ? new Date(card.completedAt).toISOString() : null,
  }
}

function toCommentDTO(c: {
  id: string
  cardId: string
  userId: string
  text: string
  createdAt: Date
  user: { id: string; name: string; email: string; avatarColor: string; githubUsername: string | null }
}): CommentDTO {
  return {
    id: c.id,
    cardId: c.cardId,
    userId: c.userId,
    text: c.text,
    createdAt: new Date(c.createdAt).toISOString(),
    user: userToDTO(c.user),
  }
}

function toActivityDTO(a: {
  id: string
  cardId: string
  boardId: string
  userId: string
  type: string
  summary: string
  metadata: string | null
  createdAt: Date
  user: { id: string; name: string; email: string; avatarColor: string; githubUsername: string | null }
}): ActivityDTO {
  return {
    id: a.id,
    cardId: a.cardId,
    boardId: a.boardId,
    userId: a.userId,
    type: a.type as ActivityDTO['type'],
    summary: a.summary,
    metadata: a.metadata ? JSON.parse(a.metadata) : null,
    createdAt: new Date(a.createdAt).toISOString(),
    user: userToDTO(a.user),
  }
}

function toInsightDTO(i: {
  id: string
  boardId: string
  type: string
  severity: string
  title: string
  message: string
  metadata: string | null
  read: boolean
  createdAt: Date
}): AIInsightDTO {
  return {
    id: i.id,
    boardId: i.boardId,
    type: i.type as AIInsightDTO['type'],
    severity: i.severity as AIInsightDTO['severity'],
    title: i.title,
    message: i.message,
    metadata: i.metadata ? JSON.parse(i.metadata) : null,
    read: i.read,
    createdAt: new Date(i.createdAt).toISOString(),
  }
}

const CARD_INCLUDE = {
  assignee: true,
  creator: true,
  labels: { include: { label: true } },
} as const

async function createActivity(params: {
  cardId: string
  boardId: string
  userId: string
  type: string
  summary: string
  metadata?: Record<string, unknown>
}) {
  const a = await db.activity.create({
    data: {
      cardId: params.cardId,
      boardId: params.boardId,
      userId: params.userId,
      type: params.type,
      summary: params.summary,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
    include: { user: true },
  })
  return a
}

async function broadcastActivity(boardId: string, activity: Awaited<ReturnType<typeof createActivity>>) {
  io.to(boardId).emit(SOCKET_EVENTS.ACTIVITY_CREATED, toActivityDTO(activity))
}

// Pick the most specific activity type for an update patch.
function pickUpdateActivityType(
  patch: CardUpdatePayload['patch'],
  card: { complexityAccepted: boolean; assigneeId: string | null },
): { type: string; field: string } {
  if (patch.complexityAccepted !== undefined && patch.complexityAccepted !== card.complexityAccepted) {
    return { type: 'complexity_set', field: 'complexityAccepted' }
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== card.assigneeId) {
    return { type: 'assigned', field: 'assigneeId' }
  }
  // pick first changed field for the conflict notification
  const fields = ['complexityAccepted', 'assigneeId', 'complexity', 'title', 'description', 'dueDate'] as const
  for (const f of fields) {
    if (patch[f] !== undefined) return { type: 'updated', field: f }
  }
  return { type: 'updated', field: 'title' }
}

// ─── AI scheduler ───────────────────────────────────────────────────
async function runBoardAI(boardId: string) {
  io.to(boardId).emit(SOCKET_EVENTS.AI_UPDATE, { boardId, status: 'running' })
  try {
    const mod = await loadAIModule()
    if (!mod || typeof mod.runAIAnalysis !== 'function') {
      console.log(`[socket] AI module not available — skipping run for board ${boardId}`)
      io.to(boardId).emit(SOCKET_EVENTS.AI_UPDATE, {
        boardId,
        status: 'complete',
        insightCount: 0,
        skipped: true,
      })
      return { insights: [], digest: null }
    }
    const result = await mod.runAIAnalysis(db, boardId, {
      onInsight: (insight) => {
        io.to(boardId).emit(SOCKET_EVENTS.AI_INSIGHT, insight)
      },
    })
    const insightCount = Array.isArray(result.insights) ? result.insights.length : 0
    io.to(boardId).emit(SOCKET_EVENTS.AI_UPDATE, {
      boardId,
      status: 'complete',
      insightCount,
    })
    io.to(boardId).emit(SOCKET_EVENTS.AI_COMPLETE, {
      boardId,
      insights: result.insights ?? [],
      digest: result.digest ?? null,
    })
    return result
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[socket:error] AI run failed for board ${boardId}: ${msg}`)
    io.to(boardId).emit(SOCKET_EVENTS.AI_UPDATE, {
      boardId,
      status: 'error',
      error: msg,
    })
    return { insights: [], digest: null }
  }
}

// ─── Typing auto-clear sweep ────────────────────────────────────────
const TYPING_TIMEOUT_MS = 3000
setInterval(() => {
  const now = Date.now()
  for (const [boardId, cards] of typing.entries()) {
    for (const [cardId, users] of cards.entries()) {
      const removed: string[] = []
      for (const [userId, info] of users.entries()) {
        if (now - info.last > TYPING_TIMEOUT_MS) {
          users.delete(userId)
          removed.push(userId)
        }
      }
      if (removed.length > 0) {
        const typers = Array.from(users.values()).map((u) => u.user)
        io.to(boardId).emit(SOCKET_EVENTS.TYPING_UPDATE, { boardId, cardId, users: typers })
      }
      if (users.size === 0) cards.delete(cardId)
    }
    if (cards.size === 0) typing.delete(boardId)
  }
}, 1000).unref()

// ─── Socket event handlers ──────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`)
  socketBoards.set(socket.id, new Set())

  // ── board:join ──────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.BOARD_JOIN, (payload: { boardId: string; user: SocketUser }) => {
    try {
      const { boardId, user } = payload
      if (!boardId || !user?.id) {
        socket.emit(SOCKET_EVENTS.ERROR, { error: 'invalid board:join payload' })
        return
      }
      socket.join(boardId)
      socketUserMap.set(socket.id, user)
      socketBoards.get(socket.id)?.add(boardId)

      if (!presence.has(boardId)) presence.set(boardId, new Map())
      const presenceUser: PresenceUser = {
        id: user.id,
        name: user.name,
        avatarColor: user.avatarColor,
        socketId: socket.id,
        cursor: null,
      }
      presence.get(boardId)!.set(socket.id, presenceUser)

      console.log(`[socket] ${user.name} joined board ${boardId}`)
      broadcastPresence(boardId)
    } catch (e) {
      console.error('[socket:error] board:join', e)
    }
  })

  // ── board:leave ─────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.BOARD_LEAVE, (payload: { boardId: string }) => {
    try {
      const { boardId } = payload
      leaveBoard(socket.id, boardId)
    } catch (e) {
      console.error('[socket:error] board:leave', e)
    }
  })

  // ── card:create ─────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.CARD_CREATE, async (payload: CardCreatePayload) => {
    try {
      const {
        boardId, columnId, title, description, creatorId,
        sourceUrl, githubIssueNumber, githubRepo, labelIds, assigneeId,
      } = payload
      if (!boardId || !columnId || !title || !creatorId) {
        socket.emit(SOCKET_EVENTS.ERROR, { error: 'invalid card:create payload' })
        return
      }

      // Determine order = max order in column + 1
      const existing = await db.card.findFirst({
        where: { columnId },
        orderBy: { order: 'desc' },
        select: { order: true },
      })
      const newOrder = (existing?.order ?? -1) + 1

      // Fetch label names (for CardHistory)
      let labelNames: string[] = []
      if (labelIds && labelIds.length > 0) {
        const labels = await db.label.findMany({ where: { id: { in: labelIds } }, select: { name: true } })
        labelNames = labels.map((l) => l.name)
      }

      const created = await db.card.create({
        data: {
          boardId,
          columnId,
          title,
          description: description ?? null,
          order: newOrder,
          version: 1,
          creatorId,
          assigneeId: assigneeId ?? null,
          sourceUrl: sourceUrl ?? null,
          githubIssueNumber: githubIssueNumber ?? null,
          githubRepo: githubRepo ?? null,
          labels: labelIds && labelIds.length > 0
            ? { create: labelIds.map((labelId) => ({ labelId })) }
            : undefined,
        },
        include: CARD_INCLUDE,
      })

      // Activity: created
      const creator = await db.user.findUnique({ where: { id: creatorId } })
      const creatorName = creator?.name ?? 'Someone'
      const activity = await createActivity({
        cardId: created.id,
        boardId,
        userId: creatorId,
        type: 'created',
        summary: `${creatorName} created this card`,
      })

      // CardHistory: created
      await db.cardHistory.create({
        data: {
          cardId: created.id,
          boardId,
          action: 'created',
          fromColumnId: columnId,
          toColumnId: columnId,
          assigneeId: assigneeId ?? null,
          labelNames: labelNames.join(','),
          descriptionLength: description?.length ?? 0,
        },
      })

      const cardDTO = toCardDTO(created)
      io.to(boardId).emit(SOCKET_EVENTS.CARD_CREATED, cardDTO)
      await broadcastActivity(boardId, activity)
      console.log(`[socket] card created ${created.id} in board ${boardId}`)

      // AI complexity inference (best-effort)
      try {
        const mod = await loadAIModule()
        if (mod && typeof mod.inferComplexityForCard === 'function') {
          const result = await mod.inferComplexityForCard(db, created.id)
          if (result) {
            // store suggested complexity (complexityAccepted stays false)
            const updated = await db.card.update({
              where: { id: created.id },
              data: {
                complexity: result.complexity,
                version: { increment: 1 },
                lastEditedBy: creatorId,
                lastEditedAt: new Date(),
              },
              include: CARD_INCLUDE,
            })
            const insight = await db.aIInsight.create({
              data: {
                boardId,
                type: 'complexity',
                severity: 'info',
                title: 'Complexity suggestion',
                message: `Suggested complexity ${result.complexity}/5 (confidence ${Math.round(result.confidence * 100)}%). Reasons: ${result.reasons.join('; ')}`,
                metadata: JSON.stringify({
                  cardId: created.id,
                  complexity: result.complexity,
                  confidence: result.confidence,
                  reasons: result.reasons,
                }),
              },
            })
            io.to(boardId).emit(SOCKET_EVENTS.AI_INSIGHT, toInsightDTO(insight))
            io.to(boardId).emit(SOCKET_EVENTS.CARD_UPDATED, toCardDTO(updated))
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`[socket] complexity inference skipped: ${msg}`)
      }
    } catch (e) {
      console.error('[socket:error] card:create', e)
      socket.emit(SOCKET_EVENTS.ERROR, { error: 'card:create failed', detail: String(e) })
    }
  })

  // ── card:update ─────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.CARD_UPDATE, async (payload: CardUpdatePayload) => {
    try {
      const { boardId, cardId, expectedVersion, patch, editor } = payload
      if (!boardId || !cardId || !editor?.id) {
        socket.emit(SOCKET_EVENTS.ERROR, { error: 'invalid card:update payload' })
        return
      }

      const current = await db.card.findUnique({
        where: { id: cardId },
        include: CARD_INCLUDE,
      })
      if (!current) {
        socket.emit(SOCKET_EVENTS.ERROR, { error: 'card not found', cardId })
        return
      }

      const conflict = current.version !== expectedVersion
      const { type: activityType, field: conflictField } = pickUpdateActivityType(patch, current)

      // Build update data from patch (only fields actually in the patch)
      const data: Record<string, unknown> = {
        version: { increment: 1 },
        lastEditedBy: editor.id,
        lastEditedAt: new Date(),
      }
      if (patch.title !== undefined) data.title = patch.title
      if (patch.description !== undefined) data.description = patch.description
      if (patch.complexity !== undefined) data.complexity = patch.complexity
      if (patch.complexityAccepted !== undefined) data.complexityAccepted = patch.complexityAccepted
      if (patch.assigneeId !== undefined) data.assigneeId = patch.assigneeId
      if (patch.dueDate !== undefined) {
        data.dueDate = patch.dueDate ? new Date(patch.dueDate) : null
      }

      const updated = await db.card.update({
        where: { id: cardId },
        data,
        include: CARD_INCLUDE,
      })

      // Conflict notification: emit ONLY to the editing socket
      if (conflict) {
        const conflictNotif: ConflictNotification = {
          cardId,
          cardTitle: current.title,
          yourVersion: expectedVersion,
          serverVersion: current.version,
          serverLastEditedBy: current.lastEditedBy,
          serverLastEditedAt: current.lastEditedAt ? new Date(current.lastEditedAt).toISOString() : null,
          field: conflictField,
          yourValue: (patch as Record<string, unknown>)[conflictField],
          serverValue: (current as unknown as Record<string, unknown>)[conflictField],
        }
        socket.emit(SOCKET_EVENTS.CONFLICT, conflictNotif)
        console.log(`[socket] conflict on card ${cardId}: editor v${expectedVersion} vs server v${current.version}`)
      }

      // Activity
      const summaryParts: string[] = [`${editor.name}`]
      if (activityType === 'assigned') {
        const newAssignee = patch.assigneeId
          ? (await db.user.findUnique({ where: { id: patch.assigneeId } }))?.name ?? 'someone'
          : 'unassigned'
        summaryParts.push(`assigned this card to ${newAssignee}`)
      } else if (activityType === 'complexity_set') {
        summaryParts.push(`accepted complexity ${patch.complexity ?? current.complexity ?? '?'}`)
      } else {
        summaryParts.push(`updated ${conflictField}`)
      }
      const activity = await createActivity({
        cardId,
        boardId,
        userId: editor.id,
        type: activityType,
        summary: summaryParts.join(' '),
        metadata: { fields: Object.keys(patch), conflict },
      })
      await broadcastActivity(boardId, activity)

      io.to(boardId).emit(SOCKET_EVENTS.CARD_UPDATED, toCardDTO(updated))
      console.log(`[socket] card updated ${cardId} (v${updated.version}${conflict ? ', conflict' : ''})`)
    } catch (e) {
      console.error('[socket:error] card:update', e)
      socket.emit(SOCKET_EVENTS.ERROR, { error: 'card:update failed', detail: String(e) })
    }
  })

  // ── card:move ───────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.CARD_MOVE, async (payload: CardMovePayload) => {
    try {
      const { boardId, cardId, fromColumnId, toColumnId, newOrder, expectedVersion, editor } = payload
      if (!boardId || !cardId || !fromColumnId || !toColumnId || !editor?.id) {
        socket.emit(SOCKET_EVENTS.ERROR, { error: 'invalid card:move payload' })
        return
      }

      const current = await db.card.findUnique({
        where: { id: cardId },
        include: CARD_INCLUDE,
      })
      if (!current) {
        socket.emit(SOCKET_EVENTS.ERROR, { error: 'card not found', cardId })
        return
      }

      const conflict = current.version !== expectedVersion

      const fromColumn = await db.column.findUnique({ where: { id: fromColumnId } })
      const toColumn = await db.column.findUnique({ where: { id: toColumnId } })
      if (!fromColumn || !toColumn) {
        socket.emit(SOCKET_EVENTS.ERROR, { error: 'column not found' })
        return
      }

      const oldOrder = current.order
      const now = new Date()
      const movingToDone = toColumn.isDone && !current.completedAt
      const movingOutOfDone = !toColumn.isDone && current.completedAt && fromColumn.isDone

      // Perform the move + reorder in a transaction
      const updated = await db.$transaction(async (tx) => {
        if (fromColumnId === toColumnId) {
          // Within-column reorder: load all cards in column except this one,
          // insert at newOrder position, reassign contiguous orders 0..n-1.
          const others = await tx.card.findMany({
            where: { columnId: fromColumnId, id: { not: cardId } },
            orderBy: { order: 'asc' },
            select: { id: true, order: true },
          })
          const clampedIndex = Math.max(0, Math.min(newOrder, others.length))
          others.splice(clampedIndex, 0, { id: cardId, order: -1 })
          for (let i = 0; i < others.length; i++) {
            await tx.card.update({
              where: { id: others[i].id },
              data: {
                order: i,
                version: { increment: others[i].id === cardId ? 1 : 0 },
                ...(others[i].id === cardId && {
                  lastEditedBy: editor.id,
                  lastEditedAt: now,
                  completedAt: movingToDone ? now : movingOutOfDone ? null : current.completedAt,
                }),
              },
            })
          }
        } else {
          // Cross-column: shift down cards in source column after the old position,
          // shift up cards in target column at or after newOrder, then move the card.
          await tx.card.updateMany({
            where: { columnId: fromColumnId, order: { gt: oldOrder } },
            data: { order: { decrement: 1 } },
          })
          await tx.card.updateMany({
            where: { columnId: toColumnId, order: { gte: newOrder } },
            data: { order: { increment: 1 } },
          })
          await tx.card.update({
            where: { id: cardId },
            data: {
              columnId: toColumnId,
              order: newOrder,
              version: { increment: 1 },
              lastEditedBy: editor.id,
              lastEditedAt: now,
              completedAt: movingToDone ? now : movingOutOfDone ? null : current.completedAt,
            },
          })
        }

        return tx.card.findUnique({
          where: { id: cardId },
          include: CARD_INCLUDE,
        })
      })

      if (!updated) {
        socket.emit(SOCKET_EVENTS.ERROR, { error: 'card vanished during move' })
        return
      }

      // Conflict notification (same handling as update)
      if (conflict) {
        const conflictNotif: ConflictNotification = {
          cardId,
          cardTitle: current.title,
          yourVersion: expectedVersion,
          serverVersion: current.version,
          serverLastEditedBy: current.lastEditedBy,
          serverLastEditedAt: current.lastEditedAt ? new Date(current.lastEditedAt).toISOString() : null,
          field: 'move',
          yourValue: { fromColumnId, toColumnId, newOrder },
          serverValue: { columnId: current.columnId, order: current.order },
        }
        socket.emit(SOCKET_EVENTS.CONFLICT, conflictNotif)
        console.log(`[socket] move conflict on card ${cardId}`)
      }

      // Activity: moved
      const moveActivity = await createActivity({
        cardId,
        boardId,
        userId: editor.id,
        type: 'moved',
        summary: `${editor.name} moved this card from ${fromColumn.name} to ${toColumn.name}`,
        metadata: { fromColumnId, toColumnId, oldOrder, newOrder, conflict },
      })
      await broadcastActivity(boardId, moveActivity)

      // Activity + history: completed (if moved to done)
      if (movingToDone) {
        const daysToComplete = Math.max(
          0,
          Math.round((now.getTime() - new Date(current.createdAt).getTime()) / 86400000),
        )
        const doneActivity = await createActivity({
          cardId,
          boardId,
          userId: editor.id,
          type: 'completed',
          summary: `${editor.name} completed this card (${daysToComplete}d)`,
          metadata: { daysToComplete, fromColumnId, toColumnId },
        })
        await db.cardHistory.create({
          data: {
            cardId,
            boardId,
            action: 'completed',
            fromColumnId,
            toColumnId,
            assigneeId: current.assigneeId,
            complexity: current.complexity,
            daysToComplete,
          },
        })
        await broadcastActivity(boardId, doneActivity)
      }

      io.to(boardId).emit(SOCKET_EVENTS.CARD_MOVED, {
        cardId,
        fromColumnId,
        toColumnId,
        newOrder,
        card: toCardDTO(updated),
      })
      console.log(`[socket] card moved ${cardId} ${fromColumnId}->${toColumnId}@${newOrder}`)
    } catch (e) {
      console.error('[socket:error] card:move', e)
      socket.emit(SOCKET_EVENTS.ERROR, { error: 'card:move failed', detail: String(e) })
    }
  })

  // ── card:delete ─────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.CARD_DELETE, async (payload: CardDeletePayload) => {
    try {
      const { boardId, cardId, editor } = payload
      if (!boardId || !cardId) {
        socket.emit(SOCKET_EVENTS.ERROR, { error: 'invalid card:delete payload' })
        return
      }
      await db.card.delete({ where: { id: cardId } })
      io.to(boardId).emit(SOCKET_EVENTS.CARD_DELETED, { cardId })
      console.log(`[socket] card deleted ${cardId} by ${editor?.name ?? 'unknown'}`)
    } catch (e) {
      console.error('[socket:error] card:delete', e)
      socket.emit(SOCKET_EVENTS.ERROR, { error: 'card:delete failed', detail: String(e) })
    }
  })

  // ── comment:create ──────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.COMMENT_CREATE, async (payload: CommentCreatePayload) => {
    try {
      const { boardId, cardId, text, user } = payload
      if (!boardId || !cardId || !text || !user?.id) {
        socket.emit(SOCKET_EVENTS.ERROR, { error: 'invalid comment:create payload' })
        return
      }
      const created = await db.comment.create({
        data: { cardId, userId: user.id, text },
        include: { user: true },
      })
      const commentDTO = toCommentDTO(created)
      const summary = `${user.name} commented: ${text.slice(0, 50)}${text.length > 50 ? '…' : ''}`
      const activity = await createActivity({
        cardId,
        boardId,
        userId: user.id,
        type: 'commented',
        summary,
        metadata: { commentId: created.id },
      })
      io.to(boardId).emit(SOCKET_EVENTS.COMMENT_CREATED, commentDTO)
      await broadcastActivity(boardId, activity)
    } catch (e) {
      console.error('[socket:error] comment:create', e)
      socket.emit(SOCKET_EVENTS.ERROR, { error: 'comment:create failed', detail: String(e) })
    }
  })

  // ── user:typing ─────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.USER_TYPING, (payload: { boardId: string; cardId: string; user: SocketUser }) => {
    try {
      const { boardId, cardId, user } = payload
      if (!boardId || !cardId || !user?.id) return
      if (!typing.has(boardId)) typing.set(boardId, new Map())
      const cards = typing.get(boardId)!
      if (!cards.has(cardId)) cards.set(cardId, new Map())
      const users = cards.get(cardId)!
      users.set(user.id, { user, last: Date.now() })
      const typers = Array.from(users.values()).map((u) => u.user)
      io.to(boardId).emit(SOCKET_EVENTS.TYPING_UPDATE, { boardId, cardId, users: typers })
    } catch (e) {
      console.error('[socket:error] user:typing', e)
    }
  })

  // ── cursor:move (50ms throttle per socket) ──────────────────────
  socket.on(SOCKET_EVENTS.CURSOR_MOVE, (payload: { boardId: string; x: number; y: number; user: SocketUser }) => {
    try {
      const { boardId, x, y, user } = payload
      if (!boardId || !user?.id) return
      const now = Date.now()
      const last = lastCursorBroadcast.get(socket.id) ?? 0
      if (now - last < 50) return
      lastCursorBroadcast.set(socket.id, now)

      if (!cursors.has(boardId)) cursors.set(boardId, new Map())
      cursors.get(boardId)!.set(socket.id, { x, y, userId: user.id })

      // Update presence cursor too
      const boardPresence = presence.get(boardId)
      if (boardPresence?.has(socket.id)) {
        const p = boardPresence.get(socket.id)!
        p.cursor = { x, y }
      }

      socket.to(boardId).emit(SOCKET_EVENTS.CURSOR_UPDATE, {
        boardId,
        socketId: socket.id,
        userId: user.id,
        name: user.name,
        avatarColor: user.avatarColor,
        x,
        y,
      })
    } catch (e) {
      console.error('[socket:error] cursor:move', e)
    }
  })

  // ── ai:run (on-demand) ──────────────────────────────────────────
  socket.on(SOCKET_EVENTS.AI_RUN, (payload: { boardId: string }) => {
    try {
      const { boardId } = payload
      if (!boardId) return
      console.log(`[socket] ai:run triggered for board ${boardId}`)
      runBoardAI(boardId).catch((e) =>
        console.error(`[socket:error] ai:run failed: ${String(e)}`),
      )
    } catch (e) {
      console.error('[socket:error] ai:run', e)
    }
  })

  // ── ai:subscribe ────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.AI_SUBSCRIBE, (payload: { boardId: string }) => {
    try {
      const { boardId } = payload
      if (!boardId) return
      socket.join(`ai:${boardId}`)
      console.log(`[socket] socket ${socket.id} subscribed to ai:${boardId}`)
    } catch (e) {
      console.error('[socket:error] ai:subscribe', e)
    }
  })

  // ── disconnect ──────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`)
    const boards = socketBoards.get(socket.id)
    if (boards) {
      for (const boardId of boards) {
        leaveBoard(socket.id, boardId)
      }
    }
    socketBoards.delete(socket.id)
    socketUserMap.delete(socket.id)
    lastCursorBroadcast.delete(socket.id)
  })

  socket.on('error', (error: unknown) => {
    console.error(`[socket:error] socket ${socket.id}:`, error)
  })
})

function leaveBoard(socketId: string, boardId: string) {
  const boardPresence = presence.get(boardId)
  boardPresence?.delete(socketId)
  if (boardPresence && boardPresence.size === 0) presence.delete(boardId)

  const boardCursors = cursors.get(boardId)
  boardCursors?.delete(socketId)
  if (boardCursors && boardCursors.size === 0) cursors.delete(boardId)

  // Remove typers for this socket's user from all cards in the board
  const cards = typing.get(boardId)
  if (cards) {
    for (const [cardId, users] of cards.entries()) {
      const before = users.size
      // remove by matching socketId isn't possible (keyed by userId); instead remove by user
      const user = socketUserMap.get(socketId)
      if (user) users.delete(user.id)
      if (users.size !== before) {
        const typers = Array.from(users.values()).map((u) => u.user)
        io.to(boardId).emit(SOCKET_EVENTS.TYPING_UPDATE, { boardId, cardId, users: typers })
      }
      if (users.size === 0) cards.delete(cardId)
    }
    if (cards.size === 0) typing.delete(boardId)
  }

  socketBoards.get(socketId)?.delete(boardId)
  // Use io.sockets (the socket may already be disconnected; emit to room anyway)
  broadcastPresence(boardId)
}

// ─── readBody helper (used by the internal HTTP handler above) ───────
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// ─── AI scheduler: periodic + initial run ───────────────────────────
const SIX_HOURS_MS = 6 * 60 * 60 * 1000

async function runAIForAllBoards() {
  try {
    const boards = await db.board.findMany({ select: { id: true, name: true } })
    console.log(`[socket] scheduled AI run for ${boards.length} board(s)`)
    for (const b of boards) {
      await runBoardAI(b.id).catch((e) =>
        console.error(`[socket:error] scheduled AI run failed for ${b.id}: ${String(e)}`),
      )
    }
  } catch (e) {
    console.error(`[socket:error] runAIForAllBoards: ${String(e)}`)
  }
}

const schedulerTimer = setInterval(runAIForAllBoards, SIX_HOURS_MS)
schedulerTimer.unref()

// Initial run ~10s after startup (so a freshly started server regenerates insights quickly)
setTimeout(() => {
  runAIForAllBoards().catch((e) =>
    console.error(`[socket:error] initial AI run failed: ${String(e)}`),
  )
}, 10_000).unref()

// ─── Start ───────────────────────────────────────────────────────────
const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[socket] server listening on port ${PORT}`)
  // Kick off AI module load (async, non-blocking)
  loadAIModule()
})

// ─── Graceful shutdown ──────────────────────────────────────────────
async function shutdown(signal: string) {
  console.log(`[socket] ${signal} received, shutting down...`)
  try {
    clearInterval(schedulerTimer)
    io.close()
    httpServer.close()
    await db.$disconnect()
    console.log('[socket] closed')
  } catch (e) {
    console.error('[socket:error] shutdown', e)
  }
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
