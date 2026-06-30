"use client";

import type {
  UserDTO,
  BoardDTO,
  BoardDetailDTO,
  CardDTO,
  CardDependenciesDTO,
  CardTimeStateDTO,
  CommentDTO,
  ActivityDTO,
  TeamMemberStats,
  AIInsightDTO,
  DigestDTO,
  GitHubImportPreview,
  BOARD_TEMPLATES,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    credentials: "include",
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ user: UserDTO }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signup: (name: string, email: string, password: string) =>
    request<{ user: UserDTO }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: UserDTO | null }>("/api/auth/me"),
  users: () => request<UserDTO[]>("/api/auth/users"),

  listBoards: () => request<BoardDTO[]>("/api/boards"),
  createBoard: (data: { name: string; description?: string; templateId?: string }) =>
    request<BoardDTO>("/api/boards", { method: "POST", body: JSON.stringify(data) }),
  getBoard: (id: string) => request<BoardDTO>(`/api/boards/${id}`),
  getFullBoard: (id: string) => request<BoardDetailDTO>(`/api/boards/${id}/full`),
  updateBoard: (id: string, data: Partial<{ name: string; description: string; sprintStart: string | null; sprintEnd: string | null }>) =>
    request<BoardDTO>(`/api/boards/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteBoard: (id: string) => request<{ ok: true }>(`/api/boards/${id}`, { method: "DELETE" }),

  team: (id: string) => request<TeamMemberStats[]>(`/api/boards/${id}/team`),
  insights: (id: string) => request<AIInsightDTO[]>(`/api/boards/${id}/insights`),
  markInsight: (boardId: string, insightId: string, read: boolean) =>
    request<AIInsightDTO>(`/api/boards/${boardId}/insights/${insightId}`, {
      method: "PATCH",
      body: JSON.stringify({ read }),
    }),
  digest: (id: string) => request<DigestDTO | null>(`/api/boards/${id}/digest`),
  runAI: (id: string) => request<{ ok: true; message: string }>(`/api/boards/${id}/ai/run`, { method: "POST" }),

  getCard: (id: string) => request<CardDTO>(`/api/cards/${id}`),
  patchCard: (id: string, data: Partial<{ complexity: number | null; complexityAccepted: boolean; assigneeId: string | null }>) =>
    request<CardDTO>(`/api/cards/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  cardComments: (id: string) => request<CommentDTO[]>(`/api/cards/${id}/comments`),
  cardActivity: (id: string) => request<ActivityDTO[]>(`/api/cards/${id}/activity`),

  cardDependencies: (id: string) =>
    request<CardDependenciesDTO>(`/api/cards/${id}/dependencies`),
  addBlocker: (id: string, blockerId: string) =>
    request<CardDependenciesDTO>(`/api/cards/${id}/dependencies`, {
      method: "POST",
      body: JSON.stringify({ blockerId }),
    }),
  removeBlocker: (id: string, blockerId: string) =>
    request<CardDependenciesDTO>(`/api/cards/${id}/dependencies`, {
      method: "DELETE",
      body: JSON.stringify({ blockerId }),
    }),

  cardTime: (id: string) =>
    request<CardTimeStateDTO>(`/api/cards/${id}/time`),
  startTimer: (id: string, userId: string) =>
    request<CardTimeStateDTO>(`/api/cards/${id}/time`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  stopTimer: (id: string, userId: string) =>
    request<CardTimeStateDTO>(`/api/cards/${id}/time`, {
      method: "PATCH",
      body: JSON.stringify({ userId }),
    }),

  clip: (data: { title: string; description?: string; sourceUrl?: string; boardId: string; columnId: string; creatorId?: string }) =>
    request<CardDTO>("/api/clip", { method: "POST", body: JSON.stringify(data) }),

  githubPreview: (data: { repo: string; boardId?: string }) =>
    request<GitHubImportPreview>("/api/github/preview", { method: "POST", body: JSON.stringify(data) }),
  githubImport: (data: { repo: string; boardId: string; columnId: string; creatorId?: string }) =>
    request<{ imported: number; skipped: number; total: number }>("/api/github/import", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
