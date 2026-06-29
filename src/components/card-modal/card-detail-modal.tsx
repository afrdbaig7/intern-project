"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  X,
  Send,
  Sparkles,
  Check,
  Pencil,
  Plus,
  Github,
  Link as LinkIcon,
  CalendarClock,
  User as UserIcon,
  Tag,
  History,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  api,
  ApiError,
} from "@/lib/api";
import {
  emitCardUpdate,
  emitCommentCreate,
  emitTyping,
  onTypingUpdate,
} from "@/lib/socket";
import { useAppStore, qk } from "@/store/app-store";
import type {
  ActivityDTO,
  CardDTO,
  CommentDTO,
  SocketUser,
  UserDTO,
} from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface CardDetailModalProps {
  cardId: string | null;
}

export function CardDetailModal({ cardId }: CardDetailModalProps) {
  const open = !!cardId;
  const selectCard = useAppStore((s) => s.selectCard);

  const onOpenChange = (v: boolean) => {
    if (!v) selectCard(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton
      >
        {cardId ? <CardDetailBody cardId={cardId} /> : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── Body ───────────────────────────────────────────────────────────
function CardDetailBody({ cardId }: { cardId: string }) {
  const user = useAppStore((s) => s.user);
  const currentBoardId = useAppStore((s) => s.currentBoardId);
  const queryClient = useQueryClient();

  const cardQuery = useQuery({
    queryKey: qk.card(cardId),
    queryFn: () => api.getCard(cardId),
    staleTime: 5_000,
  });
  const commentsQuery = useQuery({
    queryKey: qk.cardComments(cardId),
    queryFn: () => api.cardComments(cardId),
  });
  const activityQuery = useQuery({
    queryKey: qk.cardActivity(cardId),
    queryFn: () => api.cardActivity(cardId),
  });
  const boardQuery = useQuery({
    queryKey: currentBoardId ? qk.fullBoard(currentBoardId) : ["board", "noop"],
    queryFn: () =>
      currentBoardId ? api.getFullBoard(currentBoardId) : Promise.reject(),
    enabled: !!currentBoardId,
  });

  // ── Typing indicator ────────────────────────────────────────────
  const [typingUsers, setTypingUsers] = React.useState<Map<string, { name: string; at: number }>>(
    new Map(),
  );
  React.useEffect(() => {
    const unsub = onTypingUpdate((payload) => {
      const p = payload as {
        cardId?: string;
        userId?: string;
        user?: SocketUser;
        typing?: boolean;
      };
      if (!p || p.cardId !== cardId) return;
      const u = p.user ?? { id: p.userId ?? "", name: "Someone", avatarColor: "#10b981" };
      if (user && u.id === user.id) return;
      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (p.typing === false) {
          next.delete(u.id);
        } else {
          next.set(u.id, { name: u.name, at: Date.now() });
        }
        return next;
      });
    });
    return () => {
      unsub();
    };
  }, [cardId, user]);

  // Auto-clear typing entries older than 3s.
  React.useEffect(() => {
    const i = setInterval(() => {
      const cutoff = Date.now() - 3000;
      setTypingUsers((prev) => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        let changed = false;
        for (const [k, v] of next) {
          if (v.at < cutoff) {
            next.delete(k);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 800);
    return () => clearInterval(i);
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────
  const toSocketUser = React.useCallback(
    (): SocketUser | null =>
      user ? { id: user.id, name: user.name, avatarColor: user.avatarColor } : null,
    [user],
  );

  const emitPatch = React.useCallback(
    (patch: Record<string, unknown>) => {
      if (!user || !currentBoardId || !cardQuery.data) return;
      const editor = { id: user.id, name: user.name, avatarColor: user.avatarColor };
      emitCardUpdate({
        boardId: currentBoardId,
        cardId,
        expectedVersion: cardQuery.data.version,
        patch,
        editor,
      });
      // Optimistic local card update; server will broadcast back.
      queryClient.setQueryData<CardDTO | undefined>(qk.card(cardId), (old) =>
        old ? { ...old, ...patch, version: old.version + 1 } : old,
      );
      queryClient.setQueryData<{ cards: CardDTO[] } | undefined>(
        qk.fullBoard(currentBoardId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            cards: old.cards.map((c) =>
              c.id === cardId ? { ...c, ...patch, version: c.version + 1 } : c,
            ),
          };
        },
      );
    },
    [user, currentBoardId, cardQuery.data, cardId, queryClient],
  );

  const emitTypingThrottled = useThrottledTyping(currentBoardId ?? null, cardId, toSocketUser());

  if (cardQuery.isLoading) {
    return <ModalSkeleton />;
  }
  if (cardQuery.isError || !cardQuery.data) {
    return (
      <div className="p-6">
        <DialogTitle className="sr-only">Card</DialogTitle>
        <div className="text-sm text-destructive">
          Failed to load card. {String(cardQuery.error?.message ?? "")}
        </div>
      </div>
    );
  }

  const card = cardQuery.data;
  const board = boardQuery.data;
  const members: UserDTO[] = board?.members ?? [];
  const labels = board?.labels ?? [];

  return (
    <>
      <DialogTitle className="sr-only">{card.title}</DialogTitle>
      <DialogDescription className="sr-only">
        Edit card details, leave comments, and view activity.
      </DialogDescription>

      <div className="flex max-h-[90vh] min-h-0 flex-col sm:flex-row">
        {/* Left column: title / desc / labels / comments */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="space-y-5 p-6">
              <TitleEditor
                title={card.title}
                onCommit={(t) => emitPatch({ title: t })}
                onTyping={() => emitTypingThrottled()}
              />

              <div>
                <SectionLabel icon={UserIcon}>Assignee</SectionLabel>
                <div className="mt-2 flex items-center gap-2">
                  {card.assignee ? (
                    <div className="flex items-center gap-2">
                      <AvatarCircle user={card.assignee} size={24} />
                      <span className="text-sm">{card.assignee.name}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Unassigned</span>
                  )}
                  <Select
                    value={card.assigneeId ?? "__none__"}
                    onValueChange={(v) =>
                      emitPatch({ assigneeId: v === "__none__" ? null : v })
                    }
                  >
                    <SelectTrigger size="sm" className="ml-auto w-40">
                      <SelectValue placeholder="Assign…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <span className="text-muted-foreground">Unassigned</span>
                      </SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <SectionLabel icon={Tag}>Labels</SectionLabel>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {card.labels.length === 0 && (
                    <span className="text-xs text-muted-foreground">No labels</span>
                  )}
                  {card.labels.map((l) => (
                    <Badge
                      key={l.id}
                      variant="secondary"
                      className="gap-1"
                      style={{
                        backgroundColor: `${l.color}22`,
                        color: l.color,
                      }}
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: l.color }}
                      />
                      {l.name}
                      <button
                        type="button"
                        aria-label={`Remove ${l.name}`}
                        onClick={() => {
                          const next = card.labels
                            .filter((x) => x.id !== l.id)
                            .map((x) => x.id);
                          emitPatch({ labelIds: next });
                          // Optimistic label removal on the cache
                          queryClient.setQueryData<CardDTO | undefined>(
                            qk.card(cardId),
                            (old) =>
                              old
                                ? { ...old, labels: old.labels.filter((x) => x.id !== l.id) }
                                : old,
                          );
                          queryClient.setQueryData<{ cards: CardDTO[] } | undefined>(
                            qk.fullBoard(currentBoardId!),
                            (old) =>
                              old
                                ? {
                                    ...old,
                                    cards: old.cards.map((c) =>
                                      c.id === cardId
                                        ? {
                                            ...c,
                                            labels: c.labels.filter((x) => x.id !== l.id),
                                          }
                                        : c,
                                    ),
                                  }
                                : old,
                          );
                        }}
                        className="ml-0.5 opacity-60 hover:opacity-100"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                  <LabelPicker
                    allLabels={labels}
                    selectedIds={card.labels.map((l) => l.id)}
                    onToggle={(id) => {
                      const current = card.labels.map((l) => l.id);
                      const next = current.includes(id)
                        ? current.filter((x) => x !== id)
                        : [...current, id];
                      emitPatch({ labelIds: next });
                      const labelObj = labels.find((l) => l.id === id);
                      if (!labelObj) return;
                      queryClient.setQueryData<CardDTO | undefined>(
                        qk.card(cardId),
                        (old) => {
                          if (!old) return old;
                          const has = old.labels.some((x) => x.id === id);
                          return {
                            ...old,
                            labels: has
                              ? old.labels.filter((x) => x.id !== id)
                              : [...old.labels, labelObj],
                          };
                        },
                      );
                      queryClient.setQueryData<{ cards: CardDTO[] } | undefined>(
                        qk.fullBoard(currentBoardId!),
                        (old) => {
                          if (!old) return old;
                          return {
                            ...old,
                            cards: old.cards.map((c) => {
                              if (c.id !== cardId) return c;
                              const has = c.labels.some((x) => x.id === id);
                              return {
                                ...c,
                                labels: has
                                  ? c.labels.filter((x) => x.id !== id)
                                  : [...c.labels, labelObj],
                              };
                            }),
                          };
                        },
                      );
                    }}
                  />
                </div>
              </div>

              <Separator />

              <div>
                <SectionLabel icon={Pencil}>Description</SectionLabel>
                <DescriptionEditor
                  value={card.description ?? ""}
                  onCommit={(d) => emitPatch({ description: d })}
                  onTyping={() => emitTypingThrottled()}
                />
              </div>

              <Separator />

              <div>
                <SectionLabel icon={History}>
                  Comments
                  {commentsQuery.data && commentsQuery.data.length > 0 && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({commentsQuery.data.length})
                    </span>
                  )}
                </SectionLabel>
                <CommentsThread
                  comments={commentsQuery.data ?? []}
                  loading={commentsQuery.isLoading}
                />
                <CommentComposer
                  cardId={cardId}
                  boardId={currentBoardId}
                  user={user}
                  onTyping={() => emitTypingThrottled()}
                />
              </div>
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-6 py-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <AnimatePresence>
                {typingUsers.size > 0 && (
                  <motion.span
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="flex items-center gap-1"
                  >
                    <span className="flex gap-0.5">
                      <span className="size-1 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.3s]" />
                      <span className="size-1 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.15s]" />
                      <span className="size-1 animate-bounce rounded-full bg-emerald-500" />
                    </span>
                    {Array.from(typingUsers.values()).map((t, i) => (
                      <span key={i}>
                        {t.name}
                        {i < typingUsers.size - 1 ? ", " : ""}
                      </span>
                    ))}
                    {typingUsers.size === 1 ? " is typing…" : " are typing…"}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <div>v{card.version}</div>
          </div>
        </div>

        {/* Right sidebar */}
        <aside className="w-full shrink-0 border-t border-border bg-card/30 sm:w-72 sm:border-l sm:border-t-0">
          <ScrollArea className="h-full max-h-[60vh] sm:max-h-[90vh]">
            <div className="space-y-5 p-5">
              <ComplexityCard
                card={card}
                onAccept={async () => {
                  try {
                    await api.patchCard(cardId, { complexityAccepted: true });
                    queryClient.invalidateQueries({ queryKey: qk.card(cardId) });
                    if (currentBoardId)
                      queryClient.invalidateQueries({
                        queryKey: qk.fullBoard(currentBoardId),
                      });
                    toast.success("Complexity accepted");
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError ? err.message : "Failed to accept",
                    );
                  }
                }}
                onOverride={(val) => emitPatch({ complexity: val })}
              />

              <div>
                <SectionLabel icon={CalendarClock}>Due date</SectionLabel>
                <Input
                  type="date"
                  value={card.dueDate ? card.dueDate.slice(0, 10) : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    emitPatch({ dueDate: v ? new Date(v).toISOString() : null });
                  }}
                  className="mt-2 h-8 text-xs"
                />
              </div>

              {card.githubRepo && card.githubIssueNumber !== null && (
                <div>
                  <SectionLabel icon={Github}>GitHub</SectionLabel>
                  <a
                    href={`https://github.com/${card.githubRepo}/issues/${card.githubIssueNumber}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex items-center gap-2 text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    <Github className="size-3.5" />
                    {card.githubRepo}#{card.githubIssueNumber}
                  </a>
                </div>
              )}

              {card.sourceUrl && (
                <div>
                  <SectionLabel icon={LinkIcon}>Source</SectionLabel>
                  <a
                    href={card.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block truncate text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                    title={card.sourceUrl}
                  >
                    {card.sourceUrl}
                  </a>
                </div>
              )}

              <Separator />

              <div>
                <SectionLabel icon={History}>Activity</SectionLabel>
                <ActivityTimeline
                  activities={activityQuery.data ?? []}
                  loading={activityQuery.isLoading}
                />
              </div>
            </div>
          </ScrollArea>
        </aside>
      </div>
    </>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="size-3.5" />
      {children}
    </div>
  );
}

function AvatarCircle({
  user,
  size = 28,
}: {
  user: Pick<UserDTO, "name" | "avatarColor">;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        backgroundColor: user.avatarColor,
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.4),
      }}
      aria-hidden
    >
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

function TitleEditor({
  title,
  onCommit,
  onTyping,
}: {
  title: string;
  onCommit: (t: string) => void;
  onTyping: () => void;
}) {
  const [draft, setDraft] = React.useState(title);
  React.useEffect(() => setDraft(title), [title]);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleCommit = (val: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (val.trim() && val !== title) onCommit(val.trim());
    }, 600);
  };

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onTyping();
        scheduleCommit(e.target.value);
      }}
      onBlur={() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (draft.trim() && draft !== title) onCommit(draft.trim());
      }}
      placeholder="Untitled card"
      className="w-full bg-transparent text-lg font-semibold leading-tight outline-none focus:outline-none"
    />
  );
}

function DescriptionEditor({
  value,
  onCommit,
  onTyping,
}: {
  value: string;
  onCommit: (d: string) => void;
  onTyping: () => void;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleCommit = (val: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (val !== value) onCommit(val);
    }, 800);
  };

  return (
    <Textarea
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onTyping();
        scheduleCommit(e.target.value);
      }}
      placeholder="Add a description…"
      className="mt-2 min-h-[100px] resize-y text-sm leading-relaxed"
    />
  );
}

function LabelPicker({
  allLabels,
  selectedIds,
  onToggle,
}: {
  allLabels: { id: string; name: string; color: string }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex size-6 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
          aria-label="Add label"
        >
          <Plus className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1">
        {allLabels.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">
            No labels on this board.
          </div>
        ) : (
          <div className="max-h-56 overflow-y-auto">
            {allLabels.map((l) => {
              const sel = selectedIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onToggle(l.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-accent"
                >
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: l.color }}
                  />
                  <span className="flex-1 text-left">{l.name}</span>
                  {sel && <Check className="size-3.5 text-emerald-500" />}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function CommentsThread({
  comments,
  loading,
}: {
  comments: CommentDTO[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-2 space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (comments.length === 0) {
    return (
      <div className="mt-2 rounded-md border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
        No comments yet. Start the conversation below.
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-3">
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2.5">
          <AvatarCircle user={c.user} size={28} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{c.user.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
              </span>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">
              {c.text}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CommentComposer({
  cardId,
  boardId,
  user,
  onTyping,
}: {
  cardId: string;
  boardId: string | null;
  user: UserDTO | null;
  onTyping: () => void;
}) {
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || !user || !boardId) return;
    setSending(true);
    try {
      emitCommentCreate({
        boardId,
        cardId,
        text: trimmed,
        user: { id: user.id, name: user.name, avatarColor: user.avatarColor },
      });
      setText("");
      toast.success("Comment sent");
    } finally {
      setSending(false);
    }
  };

  if (!user || !boardId) return null;

  return (
    <div className="mt-3 flex items-end gap-2">
      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onTyping();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Write a comment… (⌘/Ctrl + Enter to send)"
        className="min-h-[40px] resize-none text-sm"
        rows={2}
        disabled={sending}
      />
      <Button
        size="icon"
        onClick={submit}
        disabled={sending || !text.trim()}
        className="bg-emerald-500 text-white hover:bg-emerald-600"
      >
        {sending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
      </Button>
    </div>
  );
}

function ComplexityCard({
  card,
  onAccept,
  onOverride,
}: {
  card: CardDTO;
  onAccept: () => void;
  onOverride: (v: number) => void;
}) {
  const [overriding, setOverriding] = React.useState(false);
  const [draftValue, setDraftValue] = React.useState<number>(
    card.complexity ?? 3,
  );

  if (card.complexity === null) {
    return null;
  }

  const isAccepted = card.complexityAccepted;

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        isAccepted
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5",
      )}
    >
      <div className="flex items-center gap-2">
        <Sparkles
          className={cn(
            "size-4",
            isAccepted ? "text-emerald-500" : "text-amber-500",
          )}
        />
        <div className="text-xs font-semibold">
          {isAccepted ? "Complexity accepted" : "AI complexity suggestion"}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full text-sm font-bold",
            isAccepted
              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
          )}
        >
          {card.complexity}
        </span>
        <span className="text-xs text-muted-foreground">points (1–5)</span>
      </div>

      {!isAccepted && !overriding && (
        <div className="mt-3 flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={onAccept}
            className="h-7 gap-1 bg-emerald-500 text-xs text-white hover:bg-emerald-600"
          >
            <Check className="size-3.5" /> Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDraftValue(card.complexity ?? 3);
              setOverriding(true);
            }}
            className="h-7 text-xs"
          >
            Override
          </Button>
        </div>
      )}

      {!isAccepted && overriding && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDraftValue(n)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-semibold transition",
                  draftValue === n
                    ? "bg-emerald-500 text-white"
                    : "bg-secondary text-muted-foreground hover:bg-accent",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              onClick={() => {
                onOverride(draftValue);
                setOverriding(false);
              }}
              className="h-7 bg-emerald-500 text-xs text-white hover:bg-emerald-600"
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOverriding(false)}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isAccepted && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <AlertTriangle className="size-3" />
          Override below if the AI got it wrong.
        </div>
      )}
      {isAccepted && (
        <div className="mt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDraftValue(card.complexity ?? 3);
              setOverriding(true);
            }}
            className="h-7 text-xs"
          >
            Override
          </Button>
        </div>
      )}
      {isAccepted && overriding && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDraftValue(n)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-semibold transition",
                  draftValue === n
                    ? "bg-emerald-500 text-white"
                    : "bg-secondary text-muted-foreground hover:bg-accent",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              onClick={() => {
                onOverride(draftValue);
                setOverriding(false);
              }}
              className="h-7 bg-emerald-500 text-xs text-white hover:bg-emerald-600"
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOverriding(false)}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityTimeline({
  activities,
  loading,
}: {
  activities: ActivityDTO[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-2 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }
  if (activities.length === 0) {
    return (
      <div className="mt-2 text-xs text-muted-foreground">No activity yet.</div>
    );
  }
  return (
    <ol className="mt-2 space-y-2.5">
      {activities.slice(0, 12).map((a) => (
        <li key={a.id} className="flex items-start gap-2.5">
          <AvatarCircle user={a.user} size={20} />
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-snug">
              <span className="font-medium">{a.user.name}</span>{" "}
              <span className="text-muted-foreground">{a.summary}</span>
            </p>
            <p className="text-[10px] text-muted-foreground">
              {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
            </p>
          </div>
        </li>
      ))}
      {activities.length > 12 && (
        <li className="pl-7 text-[11px] text-muted-foreground">
          +{activities.length - 12} more
        </li>
      )}
    </ol>
  );
}

function ModalSkeleton() {
  return (
    <div className="p-6">
      <DialogTitle className="sr-only">Loading…</DialogTitle>
      <Skeleton className="h-7 w-3/4" />
      <div className="mt-4 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}

// ─── Hooks ──────────────────────────────────────────────────────────
function useThrottledTyping(
  boardId: string | null,
  cardId: string,
  user: SocketUser | null,
) {
  const lastRef = React.useRef(0);
  return React.useCallback(() => {
    if (!boardId || !user) return;
    const now = Date.now();
    if (now - lastRef.current < 1000) return;
    lastRef.current = now;
    emitTyping({ boardId, cardId, user });
  }, [boardId, cardId, user]);
}
