"use client";

import { create } from "zustand";
import type { UserDTO } from "@/lib/types";

export type ViewTab = "board" | "team" | "ai" | "digest" | "github";

interface AppState {
  user: UserDTO | null;
  setUser: (u: UserDTO | null) => void;

  currentBoardId: string | null;
  setCurrentBoardId: (id: string | null) => void;

  activeTab: ViewTab;
  setActiveTab: (t: ViewTab) => void;

  selectedCardId: string | null;
  selectCard: (id: string | null) => void;

  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  setUser: (u) => set({ user: u }),

  currentBoardId: null,
  setCurrentBoardId: (id) => set({ currentBoardId: id }),

  activeTab: "board",
  setActiveTab: (t) => set({ activeTab: t }),

  selectedCardId: null,
  selectCard: (id) => set({ selectedCardId: id }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));

export const qk = {
  boards: ["boards"] as const,
  board: (id: string) => ["board", id] as const,
  fullBoard: (id: string) => ["board", id, "full"] as const,
  team: (id: string) => ["board", id, "team"] as const,
  insights: (id: string) => ["board", id, "insights"] as const,
  digest: (id: string) => ["board", id, "digest"] as const,
  card: (id: string) => ["card", id] as const,
  cardComments: (id: string) => ["card", id, "comments"] as const,
  cardActivity: (id: string) => ["card", id, "activity"] as const,
  cardDependencies: (id: string) => ["card", id, "deps"] as const,
  cardTime: (id: string) => ["card", id, "time"] as const,
  users: ["users"] as const,
};
