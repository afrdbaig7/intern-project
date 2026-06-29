"use client";

import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS, type SocketUser, type PresenceUser } from "./types";

// Singleton socket.io client. Connects to the Caddy gateway with
// XTransformPort=3003 so the request is forwarded to the socket mini-service.
// Path MUST be "/" (matches the server config).
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io("/?XTransformPort=3003", {
    path: "/",
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
  });

  socket.on("connect", () => {
    // console.debug("[socket] connected", socket?.id);
  });
  socket.on("disconnect", (reason) => {
    // console.debug("[socket] disconnected", reason);
  });
  socket.on("connect_error", (err) => {
    console.warn("[socket] connect error", err.message);
  });

  return socket;
}

// Typed emit/on helpers -----------------------------------------------

export function joinBoard(boardId: string, user: SocketUser) {
  getSocket().emit(SOCKET_EVENTS.BOARD_JOIN, { boardId, user });
}

export function leaveBoard(boardId: string) {
  getSocket().emit(SOCKET_EVENTS.BOARD_LEAVE, { boardId });
}

export function emitCardCreate(payload: {
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  creatorId: string;
  sourceUrl?: string;
  labelIds?: string[];
  assigneeId?: string;
}) {
  getSocket().emit(SOCKET_EVENTS.CARD_CREATE, payload);
}

export function emitCardUpdate(payload: {
  boardId: string;
  cardId: string;
  expectedVersion: number;
  patch: Record<string, unknown>;
  editor: SocketUser;
}) {
  getSocket().emit(SOCKET_EVENTS.CARD_UPDATE, payload);
}

export function emitCardMove(payload: {
  boardId: string;
  cardId: string;
  fromColumnId: string;
  toColumnId: string;
  newOrder: number;
  expectedVersion: number;
  editor: SocketUser;
}) {
  getSocket().emit(SOCKET_EVENTS.CARD_MOVE, payload);
}

export function emitCardDelete(payload: {
  boardId: string;
  cardId: string;
  editor: SocketUser;
}) {
  getSocket().emit(SOCKET_EVENTS.CARD_DELETE, payload);
}

export function emitCommentCreate(payload: {
  boardId: string;
  cardId: string;
  text: string;
  user: SocketUser;
}) {
  getSocket().emit(SOCKET_EVENTS.COMMENT_CREATE, payload);
}

export function emitTyping(payload: {
  boardId: string;
  cardId: string;
  user: SocketUser;
}) {
  getSocket().emit(SOCKET_EVENTS.USER_TYPING, payload);
}

export function emitCursorMove(payload: {
  boardId: string;
  x: number;
  y: number;
  user: SocketUser;
}) {
  getSocket().emit(SOCKET_EVENTS.CURSOR_MOVE, payload);
}

export function emitAIRun(boardId: string) {
  getSocket().emit(SOCKET_EVENTS.AI_RUN, { boardId });
}

// Listener helpers ----------------------------------------------------

export type SocketListener = (payload: unknown) => void;

export function onPresenceUpdate(cb: (users: PresenceUser[]) => void) {
  const s = getSocket();
  const handler = (payload: unknown) => cb((payload as { users?: PresenceUser[] })?.users ?? []);
  s.on(SOCKET_EVENTS.PRESENCE_UPDATE, handler);
  return () => s.off(SOCKET_EVENTS.PRESENCE_UPDATE, handler);
}

export function onCardCreated(cb: (card: unknown) => void) {
  const s = getSocket();
  s.on(SOCKET_EVENTS.CARD_CREATED, cb);
  return () => s.off(SOCKET_EVENTS.CARD_CREATED, cb);
}

export function onCardUpdated(cb: (card: unknown) => void) {
  const s = getSocket();
  s.on(SOCKET_EVENTS.CARD_UPDATED, cb);
  return () => s.off(SOCKET_EVENTS.CARD_UPDATED, cb);
}

export function onCardMoved(cb: (payload: unknown) => void) {
  const s = getSocket();
  s.on(SOCKET_EVENTS.CARD_MOVED, cb);
  return () => s.off(SOCKET_EVENTS.CARD_MOVED, cb);
}

export function onCardDeleted(cb: (payload: unknown) => void) {
  const s = getSocket();
  s.on(SOCKET_EVENTS.CARD_DELETED, cb);
  return () => s.off(SOCKET_EVENTS.CARD_DELETED, cb);
}

export function onCommentCreated(cb: (comment: unknown) => void) {
  const s = getSocket();
  s.on(SOCKET_EVENTS.COMMENT_CREATED, cb);
  return () => s.off(SOCKET_EVENTS.COMMENT_CREATED, cb);
}

export function onActivityCreated(cb: (activity: unknown) => void) {
  const s = getSocket();
  s.on(SOCKET_EVENTS.ACTIVITY_CREATED, cb);
  return () => s.off(SOCKET_EVENTS.ACTIVITY_CREATED, cb);
}

export function onTypingUpdate(cb: (payload: unknown) => void) {
  const s = getSocket();
  s.on(SOCKET_EVENTS.TYPING_UPDATE, cb);
  return () => s.off(SOCKET_EVENTS.TYPING_UPDATE, cb);
}

export function onCursorUpdate(cb: (payload: unknown) => void) {
  const s = getSocket();
  s.on(SOCKET_EVENTS.CURSOR_UPDATE, cb);
  return () => s.off(SOCKET_EVENTS.CURSOR_UPDATE, cb);
}

export function onAiInsight(cb: (insight: unknown) => void) {
  const s = getSocket();
  s.on(SOCKET_EVENTS.AI_INSIGHT, cb);
  return () => s.off(SOCKET_EVENTS.AI_INSIGHT, cb);
}

export function onAiUpdate(cb: (payload: unknown) => void) {
  const s = getSocket();
  s.on(SOCKET_EVENTS.AI_UPDATE, cb);
  return () => s.off(SOCKET_EVENTS.AI_UPDATE, cb);
}

export function onAiComplete(cb: (payload: unknown) => void) {
  const s = getSocket();
  s.on(SOCKET_EVENTS.AI_COMPLETE, cb);
  return () => s.off(SOCKET_EVENTS.AI_COMPLETE, cb);
}

export function onConflict(cb: (payload: unknown) => void) {
  const s = getSocket();
  s.on(SOCKET_EVENTS.CONFLICT, cb);
  return () => s.off(SOCKET_EVENTS.CONFLICT, cb);
}

export function onGithubImported(cb: (payload: unknown) => void) {
  const s = getSocket();
  const handler = (p: unknown) => cb(p);
  s.on("github:imported", handler);
  return () => s.off("github:imported", handler);
}
