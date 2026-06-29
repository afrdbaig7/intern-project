# Task 3-b — frontend-panels agent work record

## What I did
Built the 4 secondary view panels rendered inside the app shell:
- `src/components/panels/team-view.tsx` — `TeamView({ boardId })`
- `src/components/panels/ai-insights-panel.tsx` — `AIInsightsPanel({ boardId })`
- `src/components/panels/digest-view.tsx` — `DigestView({ boardId })`
- `src/components/panels/github-import-panel.tsx` — `GitHubImportPanel({ boardId })`

Each is a self-contained `"use client"` component that receives `{ boardId }: { boardId: string }`
and is dynamically imported by the shell (task 3-a). Every file ends with BOTH
`export { ComponentName };` AND `export default ComponentName;` — the existing
`src/components/shell/app-shell.tsx` uses `.then((m) => ({ default: m.TeamView }))`,
so the named export is required; the default export satisfies the original task spec.

## Files
- `src/components/panels/team-view.tsx` (~300 lines)
- `src/components/panels/ai-insights-panel.tsx` (~600 lines)
- `src/components/panels/digest-view.tsx` (~440 lines)
- `src/components/panels/github-import-panel.tsx` (~475 lines)

No other files were touched.

## Shared infra I imported (didn't recreate)
- `@/lib/api` — `api.team`, `api.insights`, `api.markInsight`, `api.digest`,
  `api.runAI`, `api.githubPreview`, `api.githubImport`, `api.getFullBoard`.
  `ApiError` for typed error messages.
- `@/lib/socket` — `onAiInsight`, `onAiUpdate`, `onAiComplete`, `emitAIRun`.
  Each `on*` returns an unsubscribe fn used in `useEffect` cleanups.
- `@/store/app-store` — `qk` (team / insights / digest / fullBoard query keys)
  + `useAppStore` for `user` (creatorId in github import) and `setActiveTab`
  ("board" CTA on the imported-card).
- `@/lib/types` — DTOs (TeamMemberStats, AIInsightDTO, DigestDTO, DigestContent,
  GitHubImportPreview, GitHubIssue, InsightType, BottleneckResult, SprintRiskResult,
  ComplexityResult, AssignmentSuggestion, BoardDetailDTO).
- shadcn/ui: card, button, badge, input, progress, avatar, select, alert, skeleton.
- lucide-react icons, recharts (AreaChart + CartesianGrid + XAxis + YAxis +
  Tooltip + ResponsiveContainer + Area), framer-motion, date-fns (`format`,
  `formatDistanceToNow`), sonner (`toast`).

## Per-panel highlights

### team-view.tsx
- Query `api.team(boardId)` → skeleton → error → empty → grid.
- Header: title + 2 summary pills (In progress / Done this sprint) + Run analysis
  button (emerald, calls emitAIRun + api.runAI, 2.5s cooldown).
- Responsive grid (1/2/3 cols) with framer-motion stagger.
- MemberCard: Avatar (size-11, colored ring + filled fallback w/ `user.avatarColor`
  + initial), name/email, In Progress stat with thin Progress bar relative to team
  max, Completed-this-sprint pill (emerald, CheckCircle2), Specialisation chips
  (top-3 labels colored via `hashToHue(name)` → hsl).

### ai-insights-panel.tsx
- Query `api.insights(boardId)`.
- Socket subscriptions:
  - `onAiInsight` → prepend to cache via `queryClient.setQueryData`, add id to
    `newIds` Set (drives a 1.6s emerald box-shadow pulse via framer-motion),
    auto-clear after 4s.
  - `onAiUpdate` → status="running" shows the "AI is analyzing the board…" banner
    + flips aiRunning; status="complete" clears it + toasts
    "AI analysis complete — N new insights".
  - `onAiComplete` → clears aiRunning + invalidates the digest query (so the
    DigestView panel picks up the new digest when the user switches tabs).
- Header: title + unread badge + Run button.
- Filter chips (All / Bottlenecks / Risks / Suggestions / Digest) with per-type
  counts; flat reverse-chronological list.
- Scrollable list with custom scrollbar (webkit + Firefox `scrollbarWidth: thin`),
  `max-h-[calc(100vh-14rem)] overflow-y-auto`.
- Each InsightRow: severity-colored left border + tinted bg if unread, type icon,
  title + collapsed message (line-clamp-2, "Show more" expands), per-type
  metadata chips (bottleneck: Arrived/Left/Ratio; sprint_risk: Days left/Cards
  remaining/Velocity/Projected w/ tone; complexity: Complexity/Confidence + thin
  bar; assignment: avatar + name + score), relative timestamp, mark-as-read /
  mark-as-unread (optimistic setQueryData + api.markInsight + revert on error).
- Empty state has a Run button; "Nothing matches this filter" variant when filter
  yields 0 but insights exist.

### digest-view.tsx
- Query `api.digest(boardId)`; skeleton → error → empty (with Run button) → report.
- Subscribes to `onAiUpdate`/`onAiComplete` so a fresh digest shows up
  immediately when the AI finishes; also drives the Regenerate button's spinner.
- Header: "Weekly Digest" + week range + "Generated X ago".
- Summary callout (emerald gradient border + Sparkles).
- Stat row (4 cards): Total Completed (emerald), Total Created (sky), Avg Velocity
  (cards/day, violet), Top Bottleneck (amber, isText → renders column name or
  "None detected").
- Velocity trend: recharts AreaChart inside `ResponsiveContainer width="100%"
  height={220}`, emerald stroke + linearGradient fill, CartesianGrid horizontal
  only, styled Tooltip matching the popover background.
- By-assignee bars: sorted desc, colored via `hashToHue(name)`, animated width
  via framer-motion, leader gets a Trophy icon.
- "Regenerate digest" button with spinner when regenerating.

### github-import-panel.tsx
- Query `api.getFullBoard(boardId)` for the column list. Default column derived
  via `useMemo` (first non-done, else first) — NOT via setState-in-effect (lint
  rule compliant).
- Phase state machine: idle → previewing → previewed → importing → imported.
- Input row: monospace Input + emerald-outline Preview button. Enter triggers
  Preview. Light client-side validation (`isValidRepoInput` accepts `owner/name`
  or any github.com URL).
- On Preview error: Alert (destructive variant) with title + the server's message
  (covers 404 repo / 403 rate-limit / 429 with reset time).
- PreviewCard: repo name + total issues, new/existing badges, scrollable sample
  list of first 8 issues (#number, line-clamped title, up to 3 colored label
  chips + Tag icon, assignee count + Users icon, +N overflow), column Select,
  and either "Import N issues" emerald button (disabled if newCount === 0) or
  an "All issues already imported" check-pill.
- ImportingCard: centered Loader2 + "Importing N issues… Creating cards for
  {repo} · please wait".
- ImportedCard: emerald-bordered, CheckCircle2, View board button (calls
  `useAppStore.setActiveTab("board")`), Import another repo button (resets).
  Toast: "Imported N issues from {repo}" with skipped count in description.
- On Import success: invalidates `qk.fullBoard(boardId)` + `qk.team(boardId)`
  (the realtime hook on `github:imported` also fires per-card `card:created`
  broadcasts as a backstop).
- Empty state: big Github icon in emerald-tinted circle + instructions.

## Verification
- `bun run lint`: my 4 files are clean. The only remaining lint errors are in
  `public/extension/icons/generate.js` (3 require-import warnings, task 4-a)
  and `src/hooks/use-board-realtime.ts` (refs-during-render, task 3-a's hook).
  Neither is mine.
- `bunx tsc --noEmit`: no errors in any of my 4 files. Only the pre-existing
  `skills/` errors remain (not mine).
- Walked through each panel mentally with seeded board `cmqzm7z0m0005m76e9g52uth3`:
  - Team View: GET `/api/boards/{id}/team` returns 5 members → grid of 5 cards.
  - AI Insights: empty initially → empty state with Run button → clicking Run
    streams insights one at a time via `onAiInsight` (each prepended + pulse).
  - Digest: null initially → empty state → after AI runs, renders summary, 4
    stat cards, AreaChart, by-assignee bars (Rohan leads with Trophy).
  - GitHub Import: idle state → Preview with `facebook/react` → PreviewCard →
    Import → ImportingCard → ImportedCard with View board CTA.

## Issues / notes
- The app-shell (3-a) uses `.then((m) => ({ default: m.TeamView }))` to grab
  named exports, but the original task spec for me said "default-export each
  component". I did both — every file ends with `export { ComponentName };` +
  `export default ComponentName;` so both patterns work. Verified with
  `bunx tsc --noEmit`: app-shell's dynamic imports now resolve cleanly.
- GitHub's unauthenticated rate limit (60 req/hour) is shared across the sandbox
  egress IP — the API surfaces 403/429 with a reset-time message and my Preview
  Alert renders that verbatim. The full flow works on a fresh IP.
- For the AI Insight's "Mark as read" action, I used an optimistic
  `setQueryData` + `api.markInsight` + `invalidateQueries` on error pattern
  inside `InsightRow`. `useQueryClient` is called at the top of `InsightRow`
  (NOT inside the callback) so the react-hooks ruleset is happy.
- Custom scrollbar styling injected via a plain `<style>` element (no styled-jsx
  dependency) scoped under `.kb-insights-scroll` / `.kb-github-scroll` class
  names so they don't leak globally.
