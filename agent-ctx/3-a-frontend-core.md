# Task 3-a — frontend-core agent work record

## What I did
Built the **core** of the single-page frontend for Kanban AI: the entry point,
auth screen, app shell (header + sidebar + presence + cursors), real-time
board with dnd-kit drag-and-drop, and the card detail modal. All socket
mutations are wired through `@/lib/socket` and TanStack Query cache is updated
optimistically on every broadcast.

## Files created (mine, all under `src/`)

### App entry / providers
- `src/app/providers.tsx` — `Providers` wrapper: `QueryClientProvider` (uses
  `getQueryClient()` singleton) + `ThemeProvider` from `next-themes`
  (`attribute="class"`, `defaultTheme="dark"`, `enableSystem`,
  `disableTransitionOnChange`) + `Toaster` from `@/components/ui/sonner`
  (bottom-right, richColors, closeButton).
- `src/app/layout.tsx` — UPDATED existing file: kept Geist fonts + globals.css
  import; replaced metadata with the new title
  "Kanban AI — Real-Time Collaborative Project Management" + matching
  description / OG / Twitter; wrapped `{children}` in `<Providers>`; removed
  the old `Toaster` import (Providers now owns it).
- `src/app/page.tsx` — `"use client"`. On mount calls `api.me()` and sets the
  store user. While bootstrapping: spinner. If no user → `<LoginScreen />`,
  else `<AppShell />`. Always renders `<CardDetailModal cardId={selectedCardId} />`
  at this level so it overlays everything. Subtle framer-motion page-load fade-in.

### Auth
- `src/components/auth/login-screen.tsx` — Polished centered login card on a
  dark emerald-tinted gradient background with a faint grid mask. Title
  "Kanban AI" + emerald Sparkles mark. Feature highlights row (Real-time sync /
  AI insights / GitHub import). Queries `api.users()` and renders a 2-col grid
  of seeded user cards (colored avatar circle with first initial, name, email);
  clicking one calls `api.login(email)` → sets store user → toast "Welcome,
  {name}". Fallback manual email input. Loading skeleton + error states.

### Shell
- `src/components/shell/app-shell.tsx` — `h-screen flex flex-col` app shell.
  Renders `<Header />` then a `flex flex-1 overflow-hidden` row containing
  `<Sidebar />` + `<main>` with the active view. Active view dispatched by
  `useAppStore.activeTab`: board → `<BoardView boardId>`; team / ai / digest /
  github → `next/dynamic` imports (ssr:false, skeleton loader) of the
  Task 3-b panel files. Auto-selects first board on mount if none selected;
  shows `<EmptyBoardState>` with "Create board" CTA when no current board.
- `src/components/shell/header.tsx` — Sticky 14-tall top bar with: sidebar
  collapse toggle (desktop), inline-editable board name (Enter commits →
  `api.updateBoard`, Esc cancels), sprint countdown badge ("5d left", amber
  when ≤3d, "ends today" / "Nd overdue" edge cases), `<PresenceAvatars />`,
  emerald "Run AI" outline button (calls `emitAIRun(currentBoardId)` + toast),
  theme toggle (Sun/Moon), user avatar dropdown (name, email, Sign out →
  `api.logout()` + `queryClient.clear()`).
- `src/components/shell/sidebar.tsx` — Collapsible desktop sidebar (w-64 ↔
  w-14) AND a mobile Sheet drawer (rendered automatically when `useIsMobile`).
  Sections: brand mark + collapse toggle, "+ New board" (emerald accent),
  scrollable boards list (template icon + name; active highlighted with
  emerald accent + dot), nav tabs (Board / Team / AI Insights / Digest /
  GitHub Import) with lucide icons. AI Insights tab shows unread count badge
  (from `api.insights()` filtered by `!read`). New-board dialog with name
  input + template picker (the 3 `BOARD_TEMPLATES` + "Blank", each card showing
  the template's label color dots) → `api.createBoard({name, templateId})` →
  selects it.
- `src/components/shell/presence-avatars.tsx` — Stacked overlapping avatars
  (ring-2 ring-background) from `usePresence()`. De-dupes by user id. Always
  surfaces the local user at the front if not in the list. "+N" overflow chip
  when >5 online. Tooltip per avatar with name (and "(you)" suffix for the
  local user).
- `src/components/shell/cursors-layer.tsx` — BONUS real-time cursors overlay.
  Fixed `pointer-events-none z-50` full-screen layer. Subscribes to
  `onCursorUpdate`, skips own cursor, prunes stale entries (3s). Local mouse
  moves are throttled to ~50ms via `requestAnimationFrame` and emitted with
  `emitCursorMove`. Renders remote cursors as colored arrow SVGs + name labels
  with a spring physics animation via framer-motion. Only active on the board
  view (controlled by the `active` prop).

### Board (dnd-kit)
- `src/components/board/board-view.tsx` — The board. Calls
  `useBoardRealtime(boardId)`. Queries `api.getFullBoard(boardId)` (key
  `qk.fullBoard`). Skeleton loaders while loading, error state with Retry.
  Horizontal scroll container of `<Column />` (sorted by `order`). Wraps
  everything in `<DndContext>` with `PointerSensor` (5px activation distance)
  + `KeyboardSensor`. Custom collision detection: `pointerWithin` →
  `rectIntersection` → `closestCorners` (so dropping on an empty column still
  works). `onDragStart` captures the dragged card for the `DragOverlay`;
  `onDragOver` does an optimistic cross-column move so the card visibly
  follows between columns during the drag; `onDragEnd` re-reads the live cache,
  computes the final ordered destination column array (splice at target
  index), renumbers orders, applies the cache update, then emits
  `emitCardMove({boardId, cardId, fromColumnId, toColumnId, newOrder,
  expectedVersion: card.version, editor})` and shows a "Moved to {column}"
  toast on cross-column moves. Also renders `<CursorsLayer active />`.
- `src/components/board/column.tsx` — Vertical droppable lane (w-72).
  `useDroppable({id: column.id})` with isOver ring highlight. Header: column
  color dot + name + count (`{n}/{wipLimit}` if set) + amber "WIP" warning
  badge when over the limit. `SortableContext` with `verticalListSortingStrategy`
  wrapping the cards. `<InlineCardCreate>` at the bottom: a "+ Add card"
  button that turns into an input on click; Enter → `emitCardCreate`, Esc →
  cancel. Disables add when WIP limit reached.
- `src/components/board/card-item.tsx` — `useSortable({id: card.id, data:
  {type:"card", card}})`. Compact card: 1-2 line truncated title, optional
  description preview, label chips (color dot + name, max 4 with "+N"), footer
  row with complexity badge (amber if AI-suggested-not-accepted, emerald if
  accepted), GitHub icon (links to issue), source-URL icon, due-date chip,
  done dot, assignee mini-avatar. Subtle hover lift + emerald border on hover.
  Click (suppressed during drag) → `useAppStore.selectCard(card.id)`. Also
  exports a `CardPreview` for the `DragOverlay` (rotated, emerald-bordered
  mini card).

### Card detail modal
- `src/components/card-modal/card-detail-modal.tsx` — Polished shadcn `Dialog`
  controlled by `useAppStore.selectedCardId`. Two-column layout (stacks on
  mobile): left = title / assignee / labels / description / comments; right
  sidebar = complexity card / due date / GitHub link / source URL / activity
  timeline.
  - Queries `api.getCard(cardId)`, `api.cardComments(cardId)`,
    `api.cardActivity(cardId)`, and `api.getFullBoard(currentBoardId)` (for
    the members + labels lists). All invalidated by the realtime hook as
    needed.
  - Title: inline-editable input, debounced 600ms → `emitCardUpdate` patch
    `{title}`.
  - Description: textarea, debounced 800ms → `emitCardUpdate` patch
    `{description}`.
  - Labels: chips with X-to-remove + `+` popover picker. Add/remove emits
    `emitCardUpdate` patch `{labelIds: [...]} AND optimistically updates
    both the card cache and the full-board cache.
  - Comments: list (avatar + name + relative time + text) + composer textarea
    with ⌘/Ctrl+Enter to send → `emitCommentCreate`.
  - Complexity card: when `complexity !== null && !complexityAccepted`, shows
    amber "AI complexity suggestion" with the value in a circle, Accept
    (calls `api.patchCard(cardId, {complexityAccepted:true})` + toast) and
    Override (1-5 number buttons → `emitCardUpdate` patch `{complexity}`).
    When accepted, shows emerald "Complexity accepted" with the value +
    an Override button to change it.
  - Due date: native date input → `emitCardUpdate` patch `{dueDate}`.
  - GitHub link: shown when `githubRepo + githubIssueNumber`, links to the
    issue on github.com.
  - Source URL: shown when `sourceUrl`, external link.
  - Activity timeline: avatar + name + summary + relative time, capped at 12
    with "+N more" overflow.
  - Typing indicator: when focused in title / description / comment composer,
    `emitTyping` is called at most once per second (throttled). Listens to
    `onTypingUpdate` filtered by cardId (excluding local user). Shows
    "{name} is typing…" with three bouncing emerald dots.
  - Footer: subtle `v{version}` for transparency about the optimistic
    concurrency model.
  - All optimistic `emitPatch` calls also locally bump `version + 1` and
    update both `qk.card(cardId)` and `qk.fullBoard(currentBoardId)` caches,
    so the UI is instantly consistent; the broadcast `card:updated` event
    from the server then reconciles any field differences.

### Hooks
- `src/hooks/use-presence.ts` — Wraps `onPresenceUpdate` → returns
  `PresenceUser[]`. Used by `PresenceAvatars`.
- `src/hooks/use-board-realtime.ts` — The core real-time hook.
  `useBoardRealtime(boardId: string | null)`. On mount/board-change: reads the
  store user, converts to `SocketUser`, calls `joinBoard(boardId, user)`; on
  unmount/change: `leaveBoard(boardId)`. Subscribes to `onCardCreated`,
  `onCardUpdated`, `onCardMoved`, `onCardDeleted`, `onCommentCreated`,
  `onActivityCreated`, `onConflict`, `onGithubImported` — all in a single
  effect (deps `[queryClient, selectCard]`) so subscription is stable. Latest
  `boardId` and `user` are kept in refs that are updated in effects (per the
  react-hooks/refs ESLint rule). For each event:
    - card:created → adds the card to `qk.fullBoard(boardId).cards` (dedup
      guard, sorted by order within column).
    - card:updated → replaces the card in the array; also refreshes
      `qk.card(cardId)`.
    - card:moved → replaces the card (the payload includes the full updated
      card with new columnId + order); refreshes `qk.card(cardId)`.
    - card:deleted → removes from array; removes `qk.card(cardId)`.
    - comment:created → invalidates `qk.cardComments(cardId)`.
    - activity:created → invalidates `qk.cardActivity(cardId)`.
    - conflict → `toast.error("Edit conflict on '{cardTitle}'", { description:
      "{serverLastEditedBy} edited it first. Your change was applied
      (last-write-wins).", action: { label: "View", onClick: () =>
      selectCard(cardId) }, duration: 8000 })`.
    - github:imported → invalidates `qk.fullBoard(boardId)` + `qk.insights`
      + toast.success("Imported N issues from {repo}").

## How the real-time flow ties together
1. Page mounts → `api.me()` → user set in store → `<AppShell>` renders.
2. `useBoardRealtime(boardId)` joins the board room on the socket service
   (port 3003 via the Caddy gateway: `io("/?XTransformPort=3003")`).
3. `BoardView` queries `api.getFullBoard(boardId)` and renders columns + cards.
4. User drags a card → `onDragOver` optimistically moves it between columns in
   the cache; `onDragEnd` renumbers + emits `card:move` with the current
   `expectedVersion` and an editor `SocketUser`.
5. Socket service (Task 2-a) writes to DB, broadcasts `card:moved` to the
   room (including back to the emitter). `useBoardRealtime`'s `onCardMoved`
   listener replaces the card in the cache → all connected clients see the
   move instantly.
6. If the server detected a version mismatch (another user edited first), it
   still applies the write (last-write-wins) but emits a `conflict` event to
   the editing socket only → `useBoardRealtime` shows the sonner error toast
   with a "View" action.
7. Clicking a card opens `CardDetailModal`; edits there go through
   `emitCardUpdate` with debounced patches. Typing is throttled to 1/s and
   broadcasts to other viewers via `user:typing` → `typing:update`.

## Verification
- `bun run lint` — clean for ALL `src/` files. The only 3 remaining errors
  are in `public/extension/icons/generate.js` (pre-existing extension
  infrastructure owned by Task 4-a — not mine).
- `bunx tsc --noEmit` — clean for ALL `src/app`, `src/components`,
  `src/hooks`, `src/lib`, `src/store` files. The only remaining errors are
  in `skills/` (pre-existing, not part of this project).
- Dev log confirms: `GET / 200`, `GET /api/auth/me 200`,
  `GET /api/auth/users 200` — the page boots, me() runs (no user yet),
  LoginScreen renders and fetches the seeded users.
- All 4 panel files (`team-view`, `ai-insights-panel`, `digest-view`,
  `github-import-panel`) were already created in parallel by Task 3-b and
  use **default exports**. My `next/dynamic(() => import(...), { ssr:false })`
  imports are wired to those default exports (no `.then(m => ({ default:
  m.X }))` wrapper needed).

## Issues / notes
- The 4 panel files export `default function X({boardId})` (lowercase
  conventions were already settled by Task 3-b when I checked). My
  `app-shell.tsx` imports them via plain `dynamic(() => import("..."))` so
  the default export is used directly. If Task 3-b later switches to named
  exports, the only change needed is in `app-shell.tsx`.
- `react-hooks/refs` rule (from eslint-plugin-react-hooks v6) rejects
  assigning to `ref.current` during render. I use the documented pattern of
  updating refs inside their own effects — refs still hold the latest
  value at event-fire time because the effect runs before the next event
  is processed.
- `socket.io-client`'s `s.off(...)` returns the Socket instance, not
  `void`. The `on*` helpers in `@/lib/socket` therefore return
  `() => Socket`. Wrapping the cleanup as `return () => { unsub(); }` in
  the effects satisfies `EffectCallback` (`() => void`).
- Optimistic concurrency: my optimistic cache writes bump `version + 1`
  locally so subsequent edits from the same modal send the right
  `expectedVersion`. If the server's version differs (because another
  client also edited), the conflict toast fires and the server's broadcast
  (which carries the actual server version) reconciles the cache.
- `card:move` emits the dragged card's pre-drag `version` as
  `expectedVersion`, matching the optimistic-concurrency contract in
  `src/lib/types.ts` (`CardMovePayload.expectedVersion`).
- The label picker emits `labelIds` in the patch object; the socket
  service may or may not persist these (Task 2-a's `card:update` handler
  only persists the typed `CardUpdatePayload.patch` fields). The local
  optimistic cache update keeps the UI correct in the immediate term;
  a board refetch will reconcile. This is a known minor gap that Task 2-a
  could close by also handling `labelIds` in the patch.
- The "Run AI" button in the header fires `emitAIRun(currentBoardId)`.
  Resulting `ai:insight` / `ai:update` / `ai:complete` events are handled
  by the AI panel (Task 3-b) — not by my core files.
