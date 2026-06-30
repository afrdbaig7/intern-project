"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { LoginScreen } from "@/components/auth/login-screen";
import { AppShell } from "@/components/shell/app-shell";
import { CardDetailModal } from "@/components/card-modal/card-detail-modal";
import { Loader2 } from "lucide-react";

export default function Home() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const selectedCardId = useAppStore((s) => s.selectedCardId);
  const [bootstrapping, setBootstrapping] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { user: me } = await api.me();
        if (cancelled) return;
        if (me) setUser(me);
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 401) {
          console.warn("[page] me() failed", err);
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  if (bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      {user ? <AppShell /> : <LoginScreen />}
      {/* Card detail modal overlays everything, controlled by the store. */}
      <CardDetailModal cardId={selectedCardId} />
    </motion.div>
  );
}
