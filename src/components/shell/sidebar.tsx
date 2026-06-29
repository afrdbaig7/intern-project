"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Plus,
  KanbanSquare,
  Users,
  FileBarChart,
  Newspaper,
  Github,
  ChevronsLeft,
  LayoutTemplate,
  Loader2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAppStore, qk, type ViewTab } from "@/store/app-store";
import { BOARD_TEMPLATES, type BoardTemplate } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface NavItem {
  tab: ViewTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { tab: "board", label: "Board", icon: KanbanSquare },
  { tab: "team", label: "Team", icon: Users },
  { tab: "ai", label: "AI Insights", icon: Sparkles },
  { tab: "digest", label: "Digest", icon: Newspaper },
  { tab: "github", label: "GitHub Import", icon: Github },
];

const TEMPLATE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  "software-sprint": KanbanSquare,
  "content-calendar": Newspaper,
  "product-roadmap": LayoutTemplate,
};

export function Sidebar() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileSidebar />;
  return <DesktopSidebar />;
}

// ─── Desktop ────────────────────────────────────────────────────────
function DesktopSidebar() {
  const currentBoardId = useAppStore((s) => s.currentBoardId);
  const setCurrentBoardId = useAppStore((s) => s.setCurrentBoardId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const activeTab = useAppStore((s) => s.activeTab);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const queryClient = useQueryClient();

  const boardsQuery = useQuery({
    queryKey: qk.boards,
    queryFn: api.listBoards,
  });

  const insightsQuery = useQuery({
    queryKey: currentBoardId ? qk.insights(currentBoardId) : ["insights", "noop"],
    queryFn: () =>
      currentBoardId ? api.insights(currentBoardId) : Promise.reject(),
    enabled: !!currentBoardId,
  });
  const unreadInsights = (insightsQuery.data ?? []).filter((i) => !i.read).length;

  const [newOpen, setNewOpen] = React.useState(false);

  const onPickBoard = (id: string) => {
    setCurrentBoardId(id);
    setActiveTab("board");
  };

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-border bg-card/30 transition-[width] duration-200",
          sidebarCollapsed ? "w-14" : "w-64",
        )}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
            <Sparkles className="size-4" />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">Kanban AI</div>
              <div className="truncate text-[10px] text-muted-foreground">
                Real-time boards
              </div>
            </div>
          )}
        </div>

        {/* New board */}
        <div className="p-2">
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setNewOpen(true)}
                  className="w-full border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-500"
                >
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">New board</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNewOpen(true)}
              className="w-full justify-start gap-2 border-emerald-500/30 bg-emerald-500/5 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-500"
            >
              <Plus className="size-4" />
              New board
            </Button>
          )}
        </div>

        {/* Boards list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {!sidebarCollapsed && (
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Boards
            </div>
          )}
          {boardsQuery.isLoading ? (
            <div className="space-y-1 px-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 animate-pulse rounded-md bg-muted/40"
                />
              ))}
            </div>
          ) : boardsQuery.data && boardsQuery.data.length > 0 ? (
            <div className="space-y-0.5">
              {boardsQuery.data.map((b) => {
                const Icon = (b.template && TEMPLATE_ICON[b.template]) || KanbanSquare;
                const active = b.id === currentBoardId;
                if (sidebarCollapsed) {
                  return (
                    <Tooltip key={b.id}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onPickBoard(b.id)}
                          className={cn(
                            "flex w-full items-center justify-center rounded-md p-2 transition",
                            active
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">{b.name}</TooltipContent>
                    </Tooltip>
                  );
                }
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onPickBoard(b.id)}
                    className={cn(
                      "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition",
                      active
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        active && "text-emerald-500",
                      )}
                    />
                    <span className="truncate">{b.name}</span>
                    {active && (
                      <span className="ml-auto size-1.5 shrink-0 rounded-full bg-emerald-500" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            !sidebarCollapsed && (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                No boards yet. Create one to get started.
              </div>
            )
          )}
        </div>

        {/* Nav tabs */}
        <div className="border-t border-border p-2">
          {!sidebarCollapsed && (
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Views
            </div>
          )}
          <nav className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.tab;
              if (sidebarCollapsed) {
                return (
                  <Tooltip key={item.tab}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setActiveTab(item.tab)}
                        className={cn(
                          "relative flex w-full items-center justify-center rounded-md p-2 transition",
                          active
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <item.icon className="size-4" />
                        {item.tab === "ai" && unreadInsights > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-semibold text-white">
                            {unreadInsights > 9 ? "9+" : unreadInsights}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }
              return (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => setActiveTab(item.tab)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition",
                    active
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon
                    className={cn("size-4 shrink-0", active && "text-emerald-500")}
                  />
                  <span className="truncate">{item.label}</span>
                  {item.tab === "ai" && unreadInsights > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-auto bg-emerald-500/20 px-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                    >
                      {unreadInsights > 9 ? "9+" : unreadInsights}
                    </Badge>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Collapse toggle */}
        <div className="hidden border-t border-border p-2 sm:block">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className="w-full justify-start gap-2 text-muted-foreground"
          >
            <ChevronsLeft
              className={cn("size-4 transition", sidebarCollapsed && "rotate-180")}
            />
            {!sidebarCollapsed && <span className="text-xs">Collapse</span>}
          </Button>
        </div>
      </aside>

      <NewBoardDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) => {
          void queryClient.invalidateQueries({ queryKey: qk.boards });
          onPickBoard(id);
        }}
      />
    </TooltipProvider>
  );
}

// ─── Mobile (Sheet drawer) ──────────────────────────────────────────
function MobileSidebar() {
  const currentBoardId = useAppStore((s) => s.currentBoardId);
  const setCurrentBoardId = useAppStore((s) => s.setCurrentBoardId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const activeTab = useAppStore((s) => s.activeTab);
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);

  const boardsQuery = useQuery({
    queryKey: qk.boards,
    queryFn: api.listBoards,
  });
  const insightsQuery = useQuery({
    queryKey: currentBoardId ? qk.insights(currentBoardId) : ["insights", "noop"],
    queryFn: () =>
      currentBoardId ? api.insights(currentBoardId) : Promise.reject(),
    enabled: !!currentBoardId,
  });
  const unreadInsights = (insightsQuery.data ?? []).filter((i) => !i.read).length;

  const pick = (id: string) => {
    setCurrentBoardId(id);
    setActiveTab("board");
    setOpen(false);
  };

  return (
    <>
      <div className="flex h-12 items-center gap-2 border-b border-border bg-card/30 px-3 sm:hidden">
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="gap-2">
          <KanbanSquare className="size-4" />
          Boards
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-emerald-500" />
              Kanban AI
            </SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
            <Button
              size="sm"
              onClick={() => {
                setOpen(false);
                setNewOpen(true);
              }}
              className="mb-3 justify-start gap-2 bg-emerald-500 text-white hover:bg-emerald-600"
            >
              <Plus className="size-4" /> New board
            </Button>
            <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Boards
            </div>
            <div className="space-y-0.5">
              {(boardsQuery.data ?? []).map((b) => {
                const Icon = (b.template && TEMPLATE_ICON[b.template]) || KanbanSquare;
                const active = b.id === currentBoardId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => pick(b.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition",
                      active
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "hover:bg-accent",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{b.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="mb-1 mt-4 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Views
            </div>
            <nav className="space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const active = activeTab === item.tab;
                return (
                  <button
                    key={item.tab}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.tab);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition",
                      active
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "hover:bg-accent",
                    )}
                  >
                    <item.icon className="size-4" />
                    <span className="truncate">{item.label}</span>
                    {item.tab === "ai" && unreadInsights > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-auto bg-emerald-500/20 px-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                      >
                        {unreadInsights > 9 ? "9+" : unreadInsights}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </SheetContent>
      </Sheet>

      <NewBoardDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) => {
          void queryClient.invalidateQueries({ queryKey: qk.boards });
          pick(id);
        }}
      />
    </>
  );
}

// ─── New board dialog ───────────────────────────────────────────────
function NewBoardDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [templateId, setTemplateId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const reset = () => {
    setName("");
    setTemplateId(null);
  };

  const onCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const board = await api.createBoard({
        name: name.trim(),
        templateId: templateId ?? undefined,
      });
      toast.success(`Board “${board.name}” created`);
      onCreated(board.id);
      onOpenChange(false);
      reset();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to create board";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const options: Array<{ id: string | null; name: string; description: string; template?: BoardTemplate }> = [
    { id: null, name: "Blank", description: "A simple 4-column board" },
    ...BOARD_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      template: t,
    })),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a board</DialogTitle>
          <DialogDescription>
            Pick a template to start with pre-built columns, labels and sample cards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Board name
            </label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q1 Platform Sprint"
              onKeyDown={(e) => {
                if (e.key === "Enter") void onCreate();
              }}
              disabled={creating}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Template
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {options.map((opt) => {
                const selected = templateId === opt.id;
                return (
                  <button
                    key={opt.id ?? "blank"}
                    type="button"
                    onClick={() => setTemplateId(opt.id)}
                    disabled={creating}
                    className={cn(
                      "rounded-lg border p-3 text-left transition",
                      selected
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-border hover:border-border/80 hover:bg-accent",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <LayoutTemplate
                        className={cn(
                          "size-4",
                          selected ? "text-emerald-500" : "text-muted-foreground",
                        )}
                      />
                      <span className="text-sm font-medium">{opt.name}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {opt.description}
                    </p>
                    {opt.template && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {opt.template.labels.slice(0, 4).map((l) => (
                          <span
                            key={l.name}
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: l.color }}
                            title={l.name}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void onCreate()}
            disabled={creating || !name.trim()}
            className="bg-emerald-500 text-white hover:bg-emerald-600"
          >
            {creating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Create board
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
