"use client";

import type {
  UserDTO,
  BoardDTO,
  BoardDetailDTO,
  CardDTO,
  CommentDTO,
  ActivityDTO,
  TeamMemberStats,
  AIInsightDTO,
  DigestDTO,
  GitHubImportPreview,
  BOARD_TEMPLATES,
} from "./types";

// Thin fetch wrapper for the Next.js REST API. Throws on non-2xx with the
// server's `error` message. Cookie auth is sent automatically (same-origin).

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
  // auth
  login: (email: string) =>
    request<{ user: UserDTO }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: UserDTO | null }>("/api/auth/me"),
  users: () => request<UserDTO[]>("/api/auth/users"),

  // boards
  listBoards: () => request<BoardDTO[]>("/api/boards"),
  createBoard: (data: { name: string; description?: string; templateId?: string }) =>
    request<BoardDTO>("/api/boards", { method: "POST", body: JSON.stringify(data) }),
  getBoard: (id: string) => request<BoardDTO>(`/api/boards/${id}`),
  getFullBoard: (id: string) => request<BoardDetailDTO>(`/api/boards/${id}/full`),
  updateBoard: (id: string, data: Partial<{ name: string; description: string; sprintStart: string | null; sprintEnd: string | null }>) =>
    request<BoardDTO>(`/api/boards/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteBoard: (id: string) => request<{ ok: true }>(`/api/boards/${id}`, { method: "DELETE" }),

  // team / insights / digest
  team: (id: string) => request<TeamMemberStats[]>(`/api/boards/${id}/team`),
  insights: (id: string) => request<AIInsightDTO[]>(`/api/boards/${id}/insights`),
  markInsight: (boardId: string, insightId: string, read: boolean) =>
    request<AIInsightDTO>(`/api/boards/${boardId}/insights/${insightId}`, {
      method: "PATCH",
      body: JSON.stringify({ read }),
    }),
  digest: (id: string) => request<DigestDTO | null>(`/api/boards/${id}/digest`),
  runAI: (id: string) => request<{ ok: true; message: string }>(`/api/boards/${id}/ai/run`, { method: "POST" }),

  // cards (REST fallback for detail-modal operations)
  getCard: (id: string) => request<CardDTO>(`/api/cards/${id}`),
  patchCard: (id: string, data: Partial<{ complexity: number | null; complexityAccepted: boolean; assigneeId: string | null }>) =>
    request<CardDTO>(`/api/cards/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  cardComments: (id: string) => request<CommentDTO[]>(`/api/cards/${id}/comments`),
  cardActivity: (id: string) => request<ActivityDTO[]>(`/api/cards/${id}/activity`),

  // clip (chrome extension also uses this)
  clip: (data: { title: string; description?: string; sourceUrl?: string; boardId: string; columnId: string; creatorId?: string }) =>
    request<CardDTO>("/api/clip", { method: "POST", body: JSON.stringify(data) }),

  // github
  githubPreview: (data: { repo: string; boardId?: string }) =>
    request<GitHubImportPreview>("/api/github/preview", { method: "POST", body: JSON.stringify(data) }),
  githubImport: (data: { repo: string; boardId: string; columnId: string; creatorId?: string }) =>
    request<{ imported: number; skipped: number; total: number }>("/api/github/import", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
