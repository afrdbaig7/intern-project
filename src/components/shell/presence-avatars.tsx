"use client";

import * as React from "react";
import { usePresence } from "@/hooks/use-presence";
import { useAppStore } from "@/store/app-store";
import type { PresenceUser } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function AvatarDot({
  user,
  size = 28,
}: {
  user: Pick<PresenceUser, "name" | "avatarColor">;
  size?: number;
}) {
  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-background"
      style={{
        backgroundColor: user.avatarColor,
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.42),
      }}
      aria-hidden
    >
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

export function PresenceAvatars() {
  const users = usePresence();
  const me = useAppStore((s) => s.user);

  // De-dup by user id (a user may have multiple sockets/tabs).
  const seen = new Set<string>();
  const deduped: PresenceUser[] = [];
  for (const u of users) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    deduped.push(u);
  }
  // Always show the local user at the front if not already present.
  if (me && !seen.has(me.id)) {
    deduped.unshift({
      id: me.id,
      name: me.name,
      avatarColor: me.avatarColor,
      socketId: "local",
    });
  }

  const visible = deduped.slice(0, 5);
  const overflow = Math.max(0, deduped.length - visible.length);

  if (deduped.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center" aria-label={`${deduped.length} user${deduped.length === 1 ? "" : "s"} online`}>
        <div className="flex -space-x-2">
          {visible.map((u) => (
            <Tooltip key={u.id}>
              <TooltipTrigger asChild>
                <div className="cursor-default">
                  <AvatarDot user={u} />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {u.name}
                {u.id === me?.id ? " (you)" : ""}
              </TooltipContent>
            </Tooltip>
          ))}
          {overflow > 0 && (
            <div className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background">
              +{overflow}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
