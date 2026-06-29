"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useDroppable,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  rectIntersection,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, KanbanSquare } from "lucide-react";
import { api } from "@/lib/api";
import { useAppStore, qk } from "@/store/app-store";
import { useBoardRealtime } from "@/hooks/use-board-realtime";
import { emitCardMove } from "@/lib/socket";
import { toast } from "sonner";
import type { BoardDetailDTO, CardDTO, ColumnDTO } from "@/lib/types";
import { Column } from "./column";
import { CardItem, CardPreview } from "./card-item";
import { CursorsLayer } from "@/components/shell/cursors-layer";
import { Skeleton } from "@/components/ui/skeleton";

interface BoardViewProps {
  boardId: string;
}

export function BoardView({ boardId }: BoardViewProps) {
  // Real-time: join room + subscribe to all inbound card events.
  useBoardRealtime(boardId);

  const queryClient = useQueryClient();
  const user = useAppStore((s) => s.user);

  const boardQuery = useQuery({
    queryKey: qk.fullBoard(boardId),
    queryFn: () => api.getFullBoard(boardId),
    staleTime: 10_000,
  });

  const [activeCard, setActiveCard] = React.useState<CardDTO | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const columns = React.useMemo(
    () =>
      (boardQuery.data?.columns ?? [])
        .slice()
        .sort((a, b) => a.order - b.order),
    [boardQuery.data?.columns],
  );

  const cardsByColumn = React.useMemo(() => {
    const map = new Map<string, CardDTO[]>();
    for (const col of columns) map.set(col.id, []);
    for (const card of boardQuery.data?.cards ?? []) {
      const list = map.get(card.columnId);
      if (list) list.push(card);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order);
    return map;
  }, [boardQuery.data?.cards, columns]);

  // ── DnD handlers ────────────────────────────────────────────────
  const onDragStart = (e: DragStartEvent) => {
    const card = e.active.data.current?.card as CardDTO | undefined;
    if (card) setActiveCard(card);
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeCard = active.data.current?.card as CardDTO | undefined;
    if (!activeCard) return;

    const fromColumnId = activeCard.columnId;
    // Determine the target column id (over could be a card or the column itself).
    let toColumnId: string | null = null;
    if (over.data.current?.type === "column") {
      toColumnId = (over.data.current as { columnId: string }).columnId;
    } else if (over.data.current?.type === "card") {
      const overCard = over.data.current?.card as CardDTO | undefined;
      toColumnId = overCard?.columnId ?? null;
    }

    if (!toColumnId || toColumnId === fromColumnId) return;

    // Optimistic cross-column move so the drag feels live.
    queryClient.setQueryData<{ cards: CardDTO[] } | undefined>(
      qk.fullBoard(boardId),
      (old) => {
        if (!old) return old;
        const updated = old.cards.map((c) =>
          c.id === activeCard.id
            ? { ...c, columnId: toColumnId! }
            : c,
        );
        return { ...old, cards: updated };
      },
    );
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveCard(null);
    if (!over) return;

    const activeCard = active.data.current?.card as CardDTO | undefined;
    if (!activeCard || !user) return;

    // Re-read the live card from cache (we may have optimistically moved it).
    const live = queryClient.getQueryData<{ cards: CardDTO[] } | undefined>(
      qk.fullBoard(boardId),
    );
    const current = live?.cards.find((c) => c.id === activeCard.id) ?? activeCard;
    const fromColumnId = activeCard.columnId;

    // Resolve target column.
    let toColumnId: string = current.columnId;
    let targetIndex = 0;

    if (over.data.current?.type === "column") {
      toColumnId = (over.data.current as { columnId: string }).columnId;
      targetIndex = 0;
    } else if (over.data.current?.type === "card") {
      const overCard = over.data.current?.card as CardDTO | undefined;
      if (!overCard) return;
      toColumnId = overCard.columnId;
      const colCards = (live?.cards ?? [])
        .filter((c) => c.columnId === toColumnId)
        .sort((a, b) => a.order - b.order);
      const idx = colCards.findIndex((c) => c.id === overCard.id);
      targetIndex = idx === -1 ? 0 : idx;
    }

    // Compute new ordered list of the destination column.
    const destCards = (live?.cards ?? [])
      .filter((c) => c.columnId === toColumnId && c.id !== activeCard.id)
      .sort((a, b) => a.order - b.order);
    destCards.splice(targetIndex, 0, { ...current, columnId: toColumnId });

    // Optimistic reordering: assign new sequential orders within destination,
    // and renumber source column if it changed.
    queryClient.setQueryData<{ cards: CardDTO[] } | undefined>(
      qk.fullBoard(boardId),
      (old) => {
        if (!old) return old;
        const others = old.cards.filter((c) => c.columnId !== toColumnId);
        const renumbered = destCards.map((c, i) => ({ ...c, order: i }));
        return { ...old, cards: [...others, ...renumbered] };
      },
    );

    const newOrder = Math.max(0, targetIndex);
    const expectedVersion = activeCard.version;

    emitCardMove({
      boardId,
      cardId: activeCard.id,
      fromColumnId,
      toColumnId,
      newOrder,
      expectedVersion,
      editor: { id: user.id, name: user.name, avatarColor: user.avatarColor },
    });

    if (toColumnId !== fromColumnId) {
      const col = columns.find((c) => c.id === toColumnId);
      toast.success(`Moved to ${col?.name ?? "column"}`, { duration: 1800 });
    }
  };

  // ── Render ──────────────────────────────────────────────────────
  if (boardQuery.isLoading) {
    return <BoardSkeleton />;
  }
  if (boardQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm font-medium text-destructive">Failed to load board</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {String(boardQuery.error?.message ?? "Unknown error")}
          </p>
          <button
            type="button"
            onClick={() => boardQuery.refetch()}
            className="mt-3 inline-flex h-8 items-center rounded-md border border-border px-3 text-xs hover:bg-accent"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const board = boardQuery.data;
  if (!board) return null;

  return (
    <div className="flex h-full flex-col">
      {/* Board header strip */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
        <KanbanSquare className="size-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {board.cards.length} card{board.cards.length === 1 ? "" : "s"} ·{" "}
          {columns.length} column{columns.length === 1 ? "" : "s"}
          {board.description && ` · ${board.description}`}
        </span>
      </div>

      {/* Columns (horizontal scroll) */}
      <DndContext
        sensors={sensors}
        collisionDetection={customCollision}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full gap-4 p-4">
            <SortableContext
              items={columns.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {columns.map((col) => (
                <Column
                  key={col.id}
                  column={col}
                  cards={cardsByColumn.get(col.id) ?? []}
                  boardId={boardId}
                />
              ))}
            </SortableContext>
          </div>
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18,0.67,0.6,1.22)" }}>
          {activeCard ? <CardPreview card={activeCard} /> : null}
        </DragOverlay>
      </DndContext>

      <CursorsLayer active />
    </div>
  );
}

/**
 * Custom collision detection: prefer pointer-within (good for empty
 * columns), fall back to rect intersection, then closest corners.
 */
const customCollision: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  const rect = rectIntersection(args);
  if (rect.length > 0) return rect;
  return closestCorners(args);
};

function BoardSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-4">
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex h-full gap-4 overflow-x-auto p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex w-72 shrink-0 flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <Skeleton className="size-2.5 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="ml-auto h-4 w-8 rounded-md" />
            </div>
            <Skeleton className="h-full w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
