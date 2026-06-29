"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AlertTriangle, Plus, X, Loader2 } from "lucide-react";
import type { CardDTO, ColumnDTO } from "@/lib/types";
import { useAppStore } from "@/store/app-store";
import { emitCardCreate } from "@/lib/socket";
import { toast } from "sonner";
import { CardItem } from "./card-item";
import { cn } from "@/lib/utils";

interface ColumnProps {
  column: ColumnDTO;
  cards: CardDTO[];
  boardId: string;
}

export function Column({ column, cards, boardId }: ColumnProps) {
  const user = useAppStore((s) => s.user);
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", columnId: column.id },
  });

  const sortedCards = React.useMemo(
    () => [...cards].sort((a, b) => a.order - b.order),
    [cards],
  );

  const overWip = column.wipLimit !== null && sortedCards.length > column.wipLimit;
  const atWip = column.wipLimit !== null && sortedCards.length >= column.wipLimit;

  return (
    <div className="flex h-full w-72 shrink-0 flex-col">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2 px-1">
        <span
          className="size-2.5 rounded-full"
          style={{ backgroundColor: column.color }}
          aria-hidden
        />
        <h3 className="flex-1 truncate text-sm font-semibold">{column.name}</h3>
        <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {sortedCards.length}
          {column.wipLimit !== null && `/${column.wipLimit}`}
        </span>
        {overWip && (
          <span
            className="flex items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
            title={`WIP limit of ${column.wipLimit} exceeded`}
          >
            <AlertTriangle className="size-3" />
            WIP
          </span>
        )}
      </div>

      {/* Drop zone + cards */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2 rounded-xl border bg-card/30 p-2 transition-colors",
          isOver ? "border-emerald-500/50 bg-emerald-500/5" : "border-border/60",
        )}
      >
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
          <SortableContext
            items={sortedCards.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {sortedCards.map((card) => (
              <CardItem key={card.id} card={card} />
            ))}
          </SortableContext>

          {sortedCards.length === 0 && (
            <div
              className={cn(
                "flex h-16 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground",
                isOver ? "border-emerald-500/40" : "border-border/50",
              )}
            >
              {isOver ? "Drop here" : "No cards"}
            </div>
          )}
        </div>

        <InlineCardCreate
          boardId={boardId}
          columnId={column.id}
          disabled={atWip && !overWip}
          wipHint={
            atWip && !overWip
              ? `WIP limit reached (${column.wipLimit})`
              : undefined
          }
          hasUser={!!user}
        />
      </div>
    </div>
  );
}

function InlineCardCreate({
  boardId,
  columnId,
  disabled,
  wipHint,
  hasUser,
}: {
  boardId: string;
  columnId: string;
  disabled?: boolean;
  wipHint?: string;
  hasUser: boolean;
}) {
  const user = useAppStore((s) => s.user);
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || !user) return;
    setSubmitting(true);
    try {
      emitCardCreate({
        boardId,
        columnId,
        title: trimmed,
        creatorId: user.id,
      });
      setTitle("");
      // Keep the input focused for rapid entry.
      requestAnimationFrame(() => inputRef.current?.focus());
      toast.success("Card created");
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = () => {
    setTitle("");
    setAdding(false);
  };

  if (!hasUser) return null;

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        disabled={disabled}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground",
          disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
        )}
        title={wipHint}
      >
        <Plus className="size-3.5" />
        {wipHint ?? "Add card"}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border bg-background p-2">
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        placeholder="Card title…"
        disabled={submitting}
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !title.trim()}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-500 px-2.5 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Plus className="size-3" />
          )}
          Add
        </button>
        <button
          type="button"
          onClick={cancel}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent"
          aria-label="Cancel"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
