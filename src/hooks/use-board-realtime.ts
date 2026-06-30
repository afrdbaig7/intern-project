"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  joinBoard,
  leaveBoard,
  onCardCreated,
  onCardUpdated,
  onCardMoved,
  onCardDeleted,
  onCommentCreated,
  onActivityCreated,
  onConflict,
  onGithubImported,
} from "@/lib/socket";
import { useAppStore, qk } from "@/store/app-store";
import type {
  CardDTO,
  ActivityDTO,
  CommentDTO,
  ConflictNotification,
} from "@/lib/types";

/**
 * The core real-time hook. Joins the board room on mount/board-change,
 * leaves on unmount, and subscribes to every socket broadcast that should
 * mutate the TanStack Query cache for this board.
 *
 * Mutations themselves are emitted from the components (CardItem, Column,
 * CardDetailModal) — this hook only handles the inbound side.
 *
 * Stale-closure safe: the latest boardId + user are read from refs.
 */
export function useBoardRealtime(boardId: string | null) {
  const queryClient = useQueryClient();
  const user = useAppStore((s) => s.user);
  const selectCard = useAppStore((s) => s.selectCard);

  const boardIdRef = React.useRef(boardId);
  React.useEffect(() => {
    boardIdRef.current = boardId;
  }, [boardId]);
  const userRef = React.useRef(user);
  React.useEffect(() => {
    userRef.current = user;
  }, [user]);

  React.useEffect(() => {
    if (!boardId) return;
    const u = userRef.current;
    if (u) {
      joinBoard(boardId, { id: u.id, name: u.name, avatarColor: u.avatarColor });
    }
    return () => {
      leaveBoard(boardId);
    };
  }, [boardId]);

  React.useEffect(() => {
    const keyFor = (id: string | null) => (id ? qk.fullBoard(id) : null);

    const updateBoardCards = (
      id: string,
      updater: (cards: CardDTO[]) => CardDTO[],
    ) => {
      const key = keyFor(id);
      if (!key) return;
      queryClient.setQueryData<{ cards: CardDTO[] } | undefined>(key, (old) => {
        if (!old) return old;
        return { ...old, cards: updater(old.cards ?? []) };
      });
    };

    const offCreated = onCardCreated((payload) => {
      const card = payload as CardDTO & { boardId?: string };
      const bid = card?.boardId ?? boardIdRef.current;
      if (!bid || !card?.id) return;
      updateBoardCards(bid, (cards) => {
        if (cards.some((c) => c.id === card.id)) return cards;
        const next = [...cards, card];
        next.sort((a, b) => {
          if (a.columnId === b.columnId) return a.order - b.order;
          return 0;
        });
        return next;
      });
    });

    const offUpdated = onCardUpdated((payload) => {
      const card = payload as CardDTO & { boardId?: string };
      const bid = card?.boardId ?? boardIdRef.current;
      if (!bid || !card?.id) return;
      updateBoardCards(bid, (cards) =>
        cards.map((c) => (c.id === card.id ? { ...c, ...card } : c)),
      );
      queryClient.setQueryData<CardDTO | undefined>(qk.card(card.id), (old) =>
        old ? { ...old, ...card } : old,
      );
    });

    const offMoved = onCardMoved((payload) => {
      const p = payload as {
        card?: CardDTO;
        cardId?: string;
        boardId?: string;
      };
      const card = p?.card;
      const bid = p?.boardId ?? card?.boardId ?? boardIdRef.current;
      if (!bid) return;
      if (card?.id) {
        updateBoardCards(bid, (cards) =>
          cards.map((c) => (c.id === card.id ? { ...c, ...card } : c)),
        );
        queryClient.setQueryData<CardDTO | undefined>(qk.card(card.id), (old) =>
          old ? { ...old, ...card } : old,
        );
      }
    });

    const offDeleted = onCardDeleted((payload) => {
      const p = payload as { cardId?: string; boardId?: string };
      const bid = p?.boardId ?? boardIdRef.current;
      if (!bid || !p?.cardId) return;
      updateBoardCards(bid, (cards) => cards.filter((c) => c.id !== p.cardId));
      queryClient.removeQueries({ queryKey: qk.card(p.cardId) });
    });

    const offComment = onCommentCreated((payload) => {
      const c = payload as CommentDTO & { cardId?: string };
      if (!c?.cardId) return;
      queryClient.invalidateQueries({ queryKey: qk.cardComments(c.cardId) });
    });

    const offActivity = onActivityCreated((payload) => {
      const a = payload as ActivityDTO & { cardId?: string };
      if (!a?.cardId) return;
      queryClient.invalidateQueries({ queryKey: qk.cardActivity(a.cardId) });
    });

    const offConflict = onConflict((payload) => {
      const c = payload as ConflictNotification;
      if (!c?.cardId) return;
      toast.error(`Edit conflict on "${c.cardTitle ?? "card"}"`, {
        description:
          c.serverLastEditedBy
            ? `${c.serverLastEditedBy} edited it first. Your change was applied (last-write-wins).`
            : "Another user edited it first. Your change was applied (last-write-wins).",
        action: {
          label: "View",
          onClick: () => selectCard(c.cardId),
        },
        duration: 8000,
      });
    });

    const offGithub = onGithubImported((payload) => {
      const p = payload as {
        boardId?: string;
        repo?: string;
        count?: number;
      };
      const bid = p?.boardId ?? boardIdRef.current;
      if (bid) {
        queryClient.invalidateQueries({ queryKey: qk.fullBoard(bid) });
        queryClient.invalidateQueries({ queryKey: qk.insights(bid) });
      }
      const count = p?.count ?? 0;
      const repo = p?.repo ?? "repo";
      toast.success(`Imported ${count} issue${count === 1 ? "" : "s"} from ${repo}`);
    });

    return () => {
      offCreated();
      offUpdated();
      offMoved();
      offDeleted();
      offComment();
      offActivity();
      offConflict();
      offGithub();
    };
  }, [queryClient, selectCard]);
}
