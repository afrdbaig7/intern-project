"use client";

import * as React from "react";
import { onPresenceUpdate } from "@/lib/socket";
import type { PresenceUser } from "@/lib/types";

/**
 * Subscribes to the presence stream for the currently-joined board.
 * Returns the list of online users (including the local user, if present).
 *
 * The socket connection itself is owned by `getSocket()` (singleton).
 * `useBoardRealtime` is responsible for actually joining the board room;
 * this hook just listens to the resulting `presence:update` events.
 */
export function usePresence(): PresenceUser[] {
  const [users, setUsers] = React.useState<PresenceUser[]>([]);

  React.useEffect(() => {
    const unsub = onPresenceUpdate((list) => {
      setUsers(list);
    });
    return () => {
      unsub();
    };
  }, []);

  return users;
}
