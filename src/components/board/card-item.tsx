"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import {
  Github,
  Link as LinkIcon,
  CalendarClock,
  Clock,
  Timer,
} from "lucide-react";
import type { CardDTO, UserDTO } from "@/lib/types";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CardItemProps {
  card: CardDTO;
  /** Whether this card is currently being dragged (hides the placeholder). */
  isDragging?: boolean;
}

function MiniAvatar({ user }: { user: Pick<UserDTO, "name" | "avatarColor"> }) {
  return (
    <div
      className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-1 ring-background"
      style={{ backgroundColor: user.avatarColor }}
      title={user.name}
    >
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

export function CardItem({ card, isDragging }: CardItemProps) {
  const selectCard = useAppStore((s) => s.selectCard);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: card.id,
    data: {
      type: "card",
      card,
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dragging = isDragging || isSortableDragging;

  const onClick = React.useCallback(
    (e: React.MouseEvent) => {
      if (dragging) return;
      e.preventDefault();
      selectCard(card.id);
    },
    [dragging, selectCard, card.id],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <motion.div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={onClick}
        whileHover={{ y: -1 }}
        transition={{ duration: 0.12 }}
        className={cn(
          "group cursor-pointer rounded-lg border border-border/70 bg-card p-2.5 shadow-sm transition-colors",
          "hover:border-emerald-500/40 hover:shadow-md",
          dragging && "opacity-40",
        )}
        data-card-id={card.id}
      >
        {/* Title */}
        <p className="line-clamp-2 text-sm font-medium leading-snug">
          {card.title}
        </p>

        {/* Description preview */}
        {card.description && (
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {card.description}
          </p>
        )}

        {/* Labels */}
        {card.labels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {card.labels.slice(0, 4).map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
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
              </span>
            ))}
            {card.labels.length > 4 && (
              <span className="text-[10px] text-muted-foreground">
                +{card.labels.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Footer row */}
        <div className="mt-2 flex items-center gap-1.5">
          {card.complexity !== null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold",
                    card.complexityAccepted
                      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                  )}
                  title={
                    card.complexityAccepted
                      ? `Complexity ${card.complexity} (accepted)`
                      : `AI suggests ${card.complexity} points`
                  }
                >
                  {card.complexity}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {card.complexityAccepted
                  ? `Complexity ${card.complexity} (accepted)`
                  : `AI suggests ${card.complexity} points`}
              </TooltipContent>
            </Tooltip>
          )}

          {card.githubIssueNumber !== null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={
                    card.githubRepo
                      ? `https://github.com/${card.githubRepo}/issues/${card.githubIssueNumber}`
                      : "#"
                  }
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Github className="size-3.5" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                #{card.githubIssueNumber}
              </TooltipContent>
            </Tooltip>
          )}

          {card.sourceUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={card.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <LinkIcon className="size-3.5" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[200px] text-xs">
                {card.sourceUrl}
              </TooltipContent>
            </Tooltip>
          )}

          {card.dueDate && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <CalendarClock className="size-3" />
                  {new Date(card.dueDate).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Due {new Date(card.dueDate).toLocaleDateString()}
              </TooltipContent>
            </Tooltip>
          )}

          {card.timerStartedAt && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                  <Clock className="size-3 animate-pulse" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Timer running since{" "}
                {new Date(card.timerStartedAt).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </TooltipContent>
            </Tooltip>
          )}

          {card.timeLoggedSec > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <Timer className="size-3" />
                  {formatMinutes(card.timeLoggedSec)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {formatDurationFull(card.timeLoggedSec)} logged
              </TooltipContent>
            </Tooltip>
          )}

          <div className="ml-auto flex items-center gap-1">
            {card.completedAt && (
              <span className="size-2 rounded-full bg-emerald-500" title="Done" />
            )}
            {card.assignee && <MiniAvatar user={card.assignee} />}
          </div>
        </div>
      </motion.div>
    </TooltipProvider>
  );
}

/** Compact "Xm" / "Xh" badge label for the card-item time-logged chip. */
function formatMinutes(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

/** Full "Xh Ym" string for the tooltip. */
function formatDurationFull(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Read-only card preview rendered inside the DragOverlay. */
export function CardPreview({ card }: { card: CardDTO }) {
  return (
    <div className="w-64 rotate-2 cursor-grabbing rounded-lg border border-emerald-500/40 bg-card p-2.5 shadow-xl">
      <p className="line-clamp-2 text-sm font-medium leading-snug">{card.title}</p>
      {card.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.labels.slice(0, 4).map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${l.color}22`, color: l.color }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: l.color }}
              />
              {l.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
