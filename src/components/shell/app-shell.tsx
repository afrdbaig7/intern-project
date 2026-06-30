"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { Plus, LayoutGrid } from "lucide-react";
import { api } from "@/lib/api";
import { useAppStore, qk } from "@/store/app-store";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { BoardView } from "@/components/board/board-view";
import { Skeleton } from "@/components/ui/skeleton";

const TeamView = dynamic(() => import("@/components/panels/team-view"), {
  ssr: false,
  loading: () => <PanelSkeleton />,
});
const AIInsightsPanel = dynamic(
  () => import("@/components/panels/ai-insights-panel"),
  { ssr: false, loading: () => <PanelSkeleton /> },
);
const DigestView = dynamic(() => import("@/components/panels/digest-view"), {
  ssr: false,
  loading: () => <PanelSkeleton />,
});
const GitHubImportPanel = dynamic(
  () => import("@/components/panels/github-import-panel"),
  { ssr: false, loading: () => <PanelSkeleton /> },
);

function PanelSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </div>
  );
}

export function AppShell() {
  const activeTab = useAppStore((s) => s.activeTab);
  const currentBoardId = useAppStore((s) => s.currentBoardId);
  const setCurrentBoardId = useAppStore((s) => s.setCurrentBoardId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const boardsQuery = useQuery({
    queryKey: qk.boards,
    queryFn: api.listBoards,
  });

  React.useEffect(() => {
    if (currentBoardId) return;
    if (boardsQuery.data && boardsQuery.data.length > 0) {
      setCurrentBoardId(boardsQuery.data[0].id);
    }
  }, [currentBoardId, boardsQuery.data, setCurrentBoardId]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden">
          {!currentBoardId ? (
            <EmptyBoardState
              loading={boardsQuery.isLoading}
              onCreate={() => {
                setActiveTab("board");
              }}
            />
          ) : activeTab === "board" ? (
            <BoardView boardId={currentBoardId} />
          ) : activeTab === "team" ? (
            <TeamView boardId={currentBoardId} />
          ) : activeTab === "ai" ? (
            <AIInsightsPanel boardId={currentBoardId} />
          ) : activeTab === "digest" ? (
            <DigestView boardId={currentBoardId} />
          ) : activeTab === "github" ? (
            <GitHubImportPanel boardId={currentBoardId} />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function EmptyBoardState({
  loading,
  onCreate,
}: {
  loading: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/30">
          <LayoutGrid className="size-7" />
        </div>
        {loading ? (
          <>
            <div className="text-base font-semibold">Loading boards…</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Fetching your boards from the server.
            </p>
          </>
        ) : (
          <>
            <div className="text-base font-semibold">No board selected</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first board to start managing work in real time. Pick a
              template to get columns, labels and sample cards instantly.
            </p>
            <button
              type="button"
              onClick={onCreate}
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-emerald-500 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-600"
            >
              <Plus className="size-4" /> Create board
            </button>
            <p className="mt-3 text-xs text-muted-foreground">
              Tip: use the “+ New board” button in the sidebar.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
