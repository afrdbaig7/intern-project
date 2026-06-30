"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { emitCursorMove } from "@/lib/socket";
import { useAppStore } from "@/store/app-store";
import { onCursorUpdate } from "@/lib/socket";
import type { SocketUser } from "@/lib/types";

interface RemoteCursor {
  socketId: string;
  userId: string;
  name: string;
  avatarColor: string;
  x: number;
  y: number;
  lastSeen: number;
}

/**
 * Fixed full-screen overlay rendering remote cursors with name labels.
 * Listens to `cursor:update` socket events and emits local cursor moves
 * (throttled to ~50ms) when active.
 *
 * `active` controls whether we both listen and emit — only the board view
 * uses this, so we don't spam cursors on AI/Digest/etc. panels.
 */
export function CursorsLayer({ active }: { active: boolean }) {
  const user = useAppStore((s) => s.user);
  const boardId = useAppStore((s) => s.currentBoardId);
  const [cursors, setCursors] = React.useState<Map<string, RemoteCursor>>(new Map());

  React.useEffect(() => {
    if (!active) {
      setCursors(new Map());
      return;
    }
    const unsub = onCursorUpdate((payload) => {
      const p = payload as {
        socketId?: string;
        userId?: string;
        user?: SocketUser;
        x?: number;
        y?: number;
      };
      if (!p?.socketId) return;
      const u = p.user ?? {
        id: p.userId ?? "",
        name: "User",
        avatarColor: "#10b981",
      };
      if (user && u.id === user.id) return;
      setCursors((prev) => {
        const next = new Map(prev);
        next.set(p.socketId!, {
          socketId: p.socketId!,
          userId: u.id,
          name: u.name,
          avatarColor: u.avatarColor,
          x: p.x ?? 0,
          y: p.y ?? 0,
          lastSeen: Date.now(),
        });
        return next;
      });
    });
    return () => {
      unsub();
    };
  }, [active, user]);

  React.useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      const cutoff = Date.now() - 3000;
      setCursors((prev) => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        let changed = false;
        for (const [k, v] of next) {
          if (v.lastSeen < cutoff) {
            next.delete(k);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 800);
    return () => clearInterval(interval);
  }, [active]);

  React.useEffect(() => {
    if (!active || !user || !boardId) return;
    let lastEmit = 0;
    let pending = false;
    let lastX = 0;
    let lastY = 0;
    const raf = () => {
      pending = false;
      const now = Date.now();
      if (now - lastEmit >= 50) {
        lastEmit = now;
        emitCursorMove({
          boardId,
          x: lastX,
          y: lastY,
          user: { id: user.id, name: user.name, avatarColor: user.avatarColor },
        });
      }
    };
    const onMove = (e: MouseEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (!pending) {
        pending = true;
        requestAnimationFrame(raf);
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [active, user, boardId]);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50"
      aria-hidden
    >
      <AnimatePresence>
        {Array.from(cursors.values()).map((c) => (
          <motion.div
            key={c.socketId}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1, x: c.x, y: c.y }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: "spring", stiffness: 600, damping: 40, mass: 0.3 }}
            className="absolute left-0 top-0 flex items-start gap-1"
            style={{ color: c.avatarColor }}
          >
            <svg
              width="18"
              height="20"
              viewBox="0 0 18 20"
              fill="none"
              className="drop-shadow"
            >
              <path
                d="M2 2L16 9L9 11.5L6.5 18L2 2Z"
                fill="currentColor"
                stroke="white"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </svg>
            <div
              className="mt-3 -ml-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
              style={{ backgroundColor: c.avatarColor }}
            >
              {c.name}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
