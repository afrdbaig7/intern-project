"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAppStore, qk } from "@/store/app-store";
import { emitAIRun } from "@/lib/socket";
import {
  Sparkles,
  Sun,
  Moon,
  Clock,
  LogOut,
  Loader2,
  Pencil,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PresenceAvatars } from "./presence-avatars";

function daysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function Header() {
  const { theme, setTheme } = useTheme();
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const currentBoardId = useAppStore((s) => s.currentBoardId);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  const queryClient = useQueryClient();

  const boardQuery = useQuery({
    queryKey: currentBoardId ? qk.board(currentBoardId) : ["board", "noop"],
    queryFn: () => (currentBoardId ? api.getBoard(currentBoardId) : Promise.reject()),
    enabled: !!currentBoardId,
  });

  const [editingName, setEditingName] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState("");
  const [savingName, setSavingName] = React.useState(false);

  React.useEffect(() => {
    if (boardQuery.data) setNameDraft(boardQuery.data.name);
  }, [boardQuery.data?.name]);

  const onCommitName = async () => {
    if (!currentBoardId || !boardQuery.data) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === boardQuery.data.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const updated = await api.updateBoard(currentBoardId, { name: trimmed });
      queryClient.setQueryData(qk.board(currentBoardId), updated);
      queryClient.invalidateQueries({ queryKey: qk.boards });
      toast.success("Board renamed");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to rename board";
      toast.error(msg);
      setNameDraft(boardQuery.data.name);
    } finally {
      setSavingName(false);
      setEditingName(false);
    }
  };

  const onRunAI = () => {
    if (!currentBoardId) return;
    emitAIRun(currentBoardId);
    toast.success("AI analysis started", {
      description: "Insights will stream in as they’re produced.",
    });
  };

  const onLogout = async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    setUser(null);
    queryClient.clear();
    toast.success("Signed out");
  };

  const board = boardQuery.data;
  const sprintEnd = board?.sprintEnd ? new Date(board.sprintEnd) : null;
  const daysLeft = sprintEnd ? daysBetween(new Date(), sprintEnd) : null;
  const sprintUrgent = daysLeft !== null && daysLeft <= 3 && daysLeft >= 0;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-3 backdrop-blur sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="hidden sm:inline-flex"
      >
        {sidebarCollapsed ? (
          <PanelLeft className="size-4" />
        ) : (
          <PanelLeftClose className="size-4" />
        )}
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {editingName && currentBoardId ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onCommitName();
                if (e.key === "Escape") {
                  setNameDraft(board?.name ?? "");
                  setEditingName(false);
                }
              }}
              onBlur={() => void onCommitName()}
              disabled={savingName}
              className="h-8 w-48 sm:w-64"
            />
            {savingName && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => currentBoardId && setEditingName(true)}
            className="group flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-accent"
            title={currentBoardId ? "Click to rename" : undefined}
            disabled={!currentBoardId}
          >
            <span className="truncate text-sm font-semibold">
              {boardQuery.isLoading && currentBoardId
                ? "Loading…"
                : board?.name ?? "No board selected"}
            </span>
            {currentBoardId && (
              <Pencil className="size-3 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            )}
          </button>
        )}

        {daysLeft !== null && (
          <Badge
            variant="outline"
            className={
              sprintUrgent
                ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                : "border-border bg-secondary text-muted-foreground"
            }
            title={`Sprint ends ${sprintEnd?.toLocaleDateString()}`}
          >
            <Clock className="size-3" />
            {daysLeft < 0
              ? `${Math.abs(daysLeft)}d overdue`
              : daysLeft === 0
                ? "ends today"
                : `${daysLeft}d left`}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <PresenceAvatars />

        <Button
          variant="outline"
          size="sm"
          onClick={onRunAI}
          disabled={!currentBoardId}
          className="gap-1.5 border-emerald-500/30 bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-500"
        >
          <Sparkles className="size-4" />
          <span className="hidden sm:inline">Run AI</span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
        </Button>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-full font-semibold text-white shadow-sm ring-1 ring-border"
                style={{ backgroundColor: user.avatarColor }}
                aria-label="Account menu"
              >
                {user.name.charAt(0).toUpperCase()}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="truncate text-sm font-medium">{user.name}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void onLogout()}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
