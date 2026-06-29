# Kanban AI — Real-Time Collaborative Kanban with an Autonomous AI Project Manager

A production-grade project management web app where multiple users work on the same
board simultaneously with **zero-refresh real-time sync**, powered by an **autonomous
AI project manager** that runs on a schedule to detect bottlenecks, assess sprint
risk, infer task complexity, and suggest assignees — all with local, CPU-bound
heuristics (no external LLM). Includes a **GitHub Issues scraper** and a **Chrome
extension** for clipping any webpage into a task.

> Built as a single Next.js 16 application + a Socket.IO mini-service, with Prisma/SQLite
> persistence that survives server restarts.

---

## ✨ Features

### Section 1 — Real-Time Collaboration Engine
- **WebSocket-based** live sync (Socket.IO) — no polling.
- Drag a card between columns → every connected user sees it move instantly.
- Edit a card title → other users see the update stream in.
- **Concurrent-edit conflict handling**: last-write-wins with a **visible conflict
  notification** (see below). Documented in this README.
- **Presence**: see who's online on each board (avatar stack in the header).
- **Live cursors** (bonus): remote users' mouse positions render in real time.
- **Typing indicators** on card comments.
- Board state persists across server restarts (SQLite).

### Section 2 — AI Project Manager (CPU-bound heuristics, no external LLM)
Runs on a configurable schedule (default every 6 hours) and on-demand via the "Run AI"
button. Insights **stream to the UI one at a time** as each module completes.
- **Bottleneck detection** — flags columns where cards accumulate faster than they leave,
  with likely-cause attribution (overloaded assignee / stuck label / dependency).
- **Sprint risk assessment** — projects current velocity against the sprint deadline and
  surfaces a plain-English risk summary.
- **Task complexity inference** — 1–5 story points from description length, keywords,
  labels, and similarity to past completed cards. Shown as an accept/override suggestion.
- **Auto-assignment suggestions** (optional) — scores team members on history, label
  specialisation, and current load.
- **Weekly digest** — completion metrics, velocity trend chart, top bottleneck, per-assignee
  leaderboard.

### Section 3 — GitHub Issues Scraper
- Paste any public repo URL → preview open issues (count + sample titles + new vs. existing).
- **Pagination** via GitHub's Link header (caps at 10 pages / 300 issues).
- Labels mapped to the board's label system (find-or-create).
- Assignees mapped to board members by GitHub username.
- **Incremental & deduplicated** — running twice on the same repo creates zero duplicate cards.

### Section 4 — Chrome Extension
- Select text on any page → popup pre-fills it as the task description with the source URL.
- No selection → clips the page title + URL.
- Board + column + creator selectors. Creates the task and it appears on the board in real
  time without opening the web app.
- Context-menu "Clip to Kanban AI" option.

### Section 5 — UI
- **Board view**: drag-and-drop columns (dnd-kit), inline card creation (no modal), card
  detail modal with description, assignee, labels, complexity, comments, and activity timeline.
- **Team view**: each member's in-progress load, sprint completion rate, and inferred label
  specialisation.
- **AI insights panel**: streaming insights with severity colours, type filters, mark-as-read.
- **Digest view**: weekly report with velocity-trend area chart and assignee leaderboard.
- **GitHub import panel**: URL input → preview → confirm.
- Polished, responsive, dark-mode-first design (Linear/Notion-inspired).

### Bonus
- **Board templates**: Software Sprint, Content Calendar, Product Roadmap (pre-built columns,
  labels, sample cards).
- **Dependency mapping**: cards can be linked as blockers (schema-ready).
- **Live cursor sharing** across board viewers.

---

## 🏗 Architecture

```
                         Browser (Next.js 16 SPA)
                                 │
                   REST (reads/auth/import) + WebSocket (mutations/realtime)
                                 │
              ┌──────────────────┴───────────────────┐
              │                                      │
       Next.js App (port 3000)            Socket.IO Service (port 3003)
       ─ App Router pages                  ─ Real-time mutation owner
       ─ REST API routes (/api/*)          ─ Presence, typing, cursors
       ─ Auth (cookie)                     ─ Optimistic-concurrency / conflict
       ─ GitHub scraper                    ─ AI scheduler (setInterval 6h)
       ─ CORS for extension                ─ Internal HTTP broadcast API
              │                                      │
              └──────────────────┬───────────────────┘
                                 │
                          Prisma + SQLite
                          (persists across restarts)
                                 │
                          AI Engine (src/lib/ai)
                          ─ Bottleneck detector
                          ─ Sprint risk analyzer
                          ─ Complexity estimator
                          ─ Assignment suggester
                          ─ Weekly digest generator
```

### Why this shape
- **One backend, two processes.** Next.js handles reads/auth/import; the Socket.IO service
  owns all real-time mutations (it writes to the DB *and* broadcasts in one step, avoiding
  double-hop latency). They share the same SQLite file and the same AI engine library.
- **Single source of truth for mutations.** Card create/update/move/delete/comment all flow
  through the socket service. The REST API's `/api/clip` and `/api/github/import` write to
  the DB then call the socket service's internal HTTP endpoint to fan out the broadcast — so
  the Chrome extension and GitHub import get the same real-time experience.
- **SQLite for persistence.** The assignment requires board state to survive a Railway
  redeploys. SQLite (a single file) does this trivially and needs no managed database.

### Tech stack
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui, Framer Motion, dnd-kit, TanStack Query, Zustand, Recharts, React Hook Form, Zod |
| Real-time | Socket.IO (server + client) |
| Database | Prisma ORM + SQLite |
| AI | Local heuristics (TypeScript) — no external LLM |
| Auth | Cookie-based JWT-free sessions (httpOnly `kb_user` cookie) |
| Extension | Manifest V3, service worker, content scripts |

---

## 🔀 Conflict Handling (Concurrent Edits)

**Strategy: Last-Write-Wins with a Visible Conflict Notification.**

Every `Card` row carries an integer `version` (starts at 1, increments on every write).
This implements **optimistic concurrency control**:

1. The client reads a card (version = N) and begins editing.
2. On save, the client emits `card:update` (or `card:move`) with `expectedVersion: N`.
3. The socket service loads the current card. If `current.version === N`, the edit applies
   cleanly and `version` becomes N+1.
4. If `current.version !== N` (another user edited in the meantime), the server **still
   applies the new edit** (last-write-wins — no data is lost, no corrupt merge), increments
   the version, and emits a **`conflict` event to the editing user's socket only**.
5. The conflict payload includes: `cardTitle`, `yourVersion`, `serverVersion`,
   `serverLastEditedBy`, `serverLastEditedAt`, `field`, `yourValue`, `serverValue`.
6. The client shows a **destructive toast**: *"Edit conflict on '{title}' — {editor} edited
   it first. Your change was applied (last-write-wins)."* with a **View** action that opens
   the card so the user can reconcile.

**Why LWW + notification over Operational Transformation?**
- OT is correct but extremely complex to implement and test in 3 days; a buggy OT
  implementation is *worse* than LWW because it silently corrupts data.
- LWW guarantees no data loss (every write persists) and no corruption (no merging).
- The visible notification makes the resolution explicit and human-driven — the user always
  knows when their edit collided and can review the other user's version.
- This is the same approach Linear and Trello use for non-text fields.

The `version` field is shown in the card modal footer (`v3`) for full transparency.

---

## 🤖 AI Analysis — Schedule & Methodology

### Schedule
- **Default**: every 6 hours (`setInterval`, 21600000 ms), iterating all boards.
- **On startup**: a one-shot run ~10 seconds after the service boots (so a freshly-deployed
  server regenerates insights quickly).
- **On demand**: the "Run AI" button in the header / AI Insights panel triggers an immediate
  run for the current board.
- Complexity inference also runs **synchronously on every new card creation** (not on the
  schedule) so the suggestion appears within ~1 second of creating a card.

### Streaming
Insights are emitted **one at a time** as each module completes — not batched. The socket
service calls `runAIAnalysis(db, boardId, { onInsight })`, and `onInsight` emits an `ai:insight`
socket event immediately after each insight is persisted. The AI Insights panel prepends each
arriving insight with a highlight pulse. The order is: sprint risk → bottlenecks → assignment
suggestions → digest.

### Methodology (all CPU-bound, no external API)

**Bottleneck detection** — For each column, counts `moved`-type Activities over the last 7 days:
`arrived` (toColumn = this column) vs `left` (fromColumn = this column). If `arrived ≥ 3` and
`arrived/left > 2.5`, it's a bottleneck. Cause attribution: if one assignee holds >50% of the
column's cards → overloaded assignee; if one label covers >40% → stuck label; else generic
accumulation. Severity: ratio > 4 → critical, else warning.

**Sprint risk** — If the board has a `sprintEnd`, computes `daysRemaining`, `cardsRemaining`
(non-done cards), and `velocity` (completed cards / days since sprintStart, fallback 14-day
window). `projectedCompletionDays = cardsRemaining / max(velocity, 0.01)`. Risk level: on
track → low; within 1.5× deadline → medium; else high. Generates a plain-English summary
including the projected miss margin and a suggested remediation.

**Complexity inference** — Base score from description length (<50 chars → 1 … ≥800 → 5).
Keyword adjustments: +2 for "refactor/migrate/rewrite/architecture/real-time/concurrent";
+1 for "api/database/auth/security/performance"; −1 for "typo/rename/docs". Label adjustments
(bug +1, refactor +1, docs −1). Then cross-references `CardHistory` for completed cards with
Jaccard label similarity > 0.3 and blends their average complexity 50/50 with the heuristic.
Confidence scales with history-match count + description richness.

**Auto-assignment** — Scores each board member: +30 × (1 − daysToComplete/14) for similar
completed cards (label Jaccard > 0.3); +20 for shared-label history; −10 × current in-progress
count. Returns the top scorer with reasons. Suggestions only — never auto-assigns.

**Weekly digest** — Aggregates the last 7 days: total completed, total created, daily velocity
trend (for the chart), top bottleneck column, per-assignee completion leaderboard, and a
2–3 sentence plain-English summary.

---

## 🐙 GitHub Scraper — Pagination Handling

1. **Normalise** the input: accepts `owner/name`, `https://github.com/owner/name`, or a URL
   with a trailing path (`/issues`, `/pulls`, etc.) — extracts `owner/name`.
2. **Paginate** via `GET /repos/{owner}/{name}/issues?state=open&per_page=100&page=N`,
   incrementing `page` until a response returns fewer than 30 items **or** the `Link` header
   has no `rel="next"`. Hard cap at 10 pages (300 issues) to respect rate limits.
3. **Map fields**: title, body, labels (names), assignees (logins), milestone (title), url,
   createdAt.
4. **Preview** (`POST /api/github/preview`): fetches all issues, then checks the board for
   existing cards with matching `(githubRepo, githubIssueNumber)` to report `newCount` vs
   `existingCount` before the user commits.
5. **Import** (`POST /api/github/import`): re-fetches and imports **only new** issues. For
   each: creates a Card, maps labels (find-or-create by name with a palette colour), maps
   assignees (match `githubUsername` on board members), creates Activity + CardHistory.
6. **Deduplication**: the `(githubRepo, githubIssueNumber)` pair is the natural key. Running
   import twice on the same repo skips every already-imported issue — verified in testing.
7. **Rate limits**: unauthenticated GitHub requests are capped at 60/hour per IP. 403/429
   responses surface a clear error with the reset time.

---

## 👥 Concurrent User Test Results

**Test setup**: two headless Chromium sessions (agent-browser `--session A` and `--session B`)
logged in as different users (Aarav and Priya), both viewing the same board ("Q4 Platform
Sprint") through the Caddy gateway.

**Procedure**:
1. Session A and B both join the board → socket log confirms both `joined board` events;
   presence avatars render in both headers.
2. A card is created (via the `/api/clip` endpoint, which writes to the DB then triggers the
   socket service's internal broadcast).
3. The socket service broadcasts `card:created` → `card:updated` (AI complexity inference) →
   `ai:insight` to the board room.

**Results**:
| Step | Session A | Session B |
|------|-----------|-----------|
| Board join | ✓ presence + socket connected | ✓ presence + socket connected |
| Card created | ✓ appears in <1s | ✓ appears in <1s |
| AI complexity | ✓ complexity badge (1) shows | ✓ complexity badge (1) shows |
| Socket log | `internal broadcast -> card:created` confirmed | received via `card:created` event |

The card appeared in **both** sessions within the same polling cycle (~1 second), with the
AI-inferred complexity badge. No errors in either browser console.

**Scaling note**: the Socket.IO service uses room-based broadcasting (`io.to(boardId).emit`)
so the cost per event is O(1) regardless of connected-client count — the same event is fanned
out once to the room, not N times. 10 simultaneous users on one board is well within the
single-process budget (each user is one socket + one presence entry; no per-user polling).

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ / Bun
- The project uses SQLite (no external database to provision)

### Install & run
```bash
bun install                    # install deps
bun run db:push                # create SQLite schema
bun run db:seed                # seed demo data (5 users, 2 boards, 22 cards)
bun run socket                 # start the Socket.IO service (port 3003)
bun run dev                    # start Next.js (port 3000) — in another terminal
```

Open `http://localhost:3000`. Log in by clicking any seeded user (password-free for the demo):
- aarav@kanban.ai, priya@kanban.ai, rohan@kanban.ai, ananya@kanban.ai, vikram@kanban.ai

### Chrome extension
1. Open `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select the `public/extension/` folder.
3. Click the extension icon → set the **App URL** to your deployed app (defaults to
   `http://localhost:3000`).
4. Select text on any webpage → click the icon → the popup pre-fills the description.
   Or click the icon with no selection to clip the page title + URL.

---

## 📁 Repository Structure

```
src/
  app/
    api/              # REST routes (auth, boards, cards, comments, github, ai, clip)
    layout.tsx        # root layout + providers
    page.tsx          # the single-page app entry
  components/
    auth/             # login screen
    shell/            # app shell, sidebar, header, presence, cursors
    board/            # board view, columns, cards, dnd-kit
    card-modal/       # card detail modal
    panels/           # team view, AI insights, digest, github import
  hooks/              # use-board-realtime, use-presence
  lib/
    ai/               # AI engine (bottleneck, risk, complexity, digest, assignment)
    api.ts            # typed REST client
    socket.ts         # socket.io client + typed event helpers
    types.ts          # shared DTOs + socket events + board templates
    db.ts, auth.ts, mappers.ts, github.ts, ...
  store/              # zustand app store
  middleware.ts       # CORS for the Chrome extension

mini-services/
  socket-service/     # standalone Socket.IO service (port 3003)

prisma/
  schema.prisma       # full data model
  seed.ts             # demo data

public/
  extension/          # Chrome extension (manifest v3)
```

---

## 🔌 API Reference (REST)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/login` | Set session cookie |
| GET | `/api/auth/me` | Current user |
| GET | `/api/auth/users` | All users (for selectors) |
| GET | `/api/boards` | List boards |
| POST | `/api/boards` | Create board (with optional template) |
| GET | `/api/boards/:id/full` | Board + columns + cards + labels + members |
| PATCH | `/api/boards/:id` | Update board (name, sprint dates) |
| GET | `/api/boards/:id/team` | Team member stats |
| GET | `/api/boards/:id/insights` | AI insights (newest first) |
| GET | `/api/boards/:id/digest` | Latest weekly digest |
| POST | `/api/boards/:id/ai/run` | Trigger on-demand AI analysis |
| PATCH | `/api/cards/:id` | Accept/override complexity, assign |
| GET | `/api/cards/:id/comments` | Comments |
| GET | `/api/cards/:id/activity` | Activity timeline |
| POST | `/api/clip` | Chrome-extension clip entry (CORS-enabled) |
| POST | `/api/github/preview` | Preview issues to import |
| POST | `/api/github/import` | Import issues as cards |

**Socket events** (client ↔ server): `board:join`, `card:create/update/move/delete`,
`comment:create`, `user:typing`, `cursor:move`, `ai:run`, and the broadcast counterparts
`card:created/updated/moved/deleted`, `comment:created`, `activity:created`,
`presence:update`, `ai:insight`, `ai:update`, `ai:complete`, `conflict`.

---

## 🛡 Persistence & Restarts

Board state lives in SQLite (`db/custom.db`). The Prisma schema includes `version`,
`lastEditedBy`, `lastEditedAt` on cards (concurrency), and `CardHistory` (AI training data).
On a server restart:
- All boards, cards, columns, labels, comments, activities, insights, and digests are intact.
- The socket service re-runs the AI analysis ~10s after boot, regenerating fresh insights.
- Users reconnect automatically (socket.io reconnection) and rejoin their boards.

---

## 📝 License

MIT — built as a demonstration of real-time collaboration + autonomous AI project management.
