"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Zap, Sparkles, Github, Loader2, LogIn, Mail } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAppStore, qk } from "@/store/app-store";
import type { UserDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function UserAvatar({
  user,
  size = "md",
}: {
  user: Pick<UserDTO, "name" | "avatarColor">;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "lg" ? "size-12 text-base" : size === "sm" ? "size-6 text-xs" : "size-9 text-sm";
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-sm`}
      style={{ backgroundColor: user.avatarColor }}
      aria-hidden
    >
      {user.name.charAt(0).toUpperCase()}
    </div>
  );
}

export function LoginScreen() {
  const setUser = useAppStore((s) => s.setUser);
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [loggingInId, setLoggingInId] = React.useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: qk.users,
    queryFn: api.users,
  });

  const doLogin = React.useCallback(
    async (loginEmail: string, name?: string) => {
      if (!loginEmail.trim()) return;
      setSubmitting(true);
      try {
        const { user } = await api.login(loginEmail.trim());
        setUser(user);
        toast.success(`Welcome, ${name ?? user.name}`);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Login failed";
        toast.error(msg);
      } finally {
        setSubmitting(false);
        setLoggingInId(null);
      }
    },
    [setUser],
  );

  const onPickUser = (u: UserDTO) => {
    setLoggingInId(u.id);
    void doLogin(u.email, u.name);
  };

  const onSubmitManual = (e: React.FormEvent) => {
    e.preventDefault();
    void doLogin(email);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient gradient backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(900px 500px at 15% -10%, rgba(16,185,129,0.18), transparent 60%), radial-gradient(700px 500px at 110% 10%, rgba(16,185,129,0.10), transparent 55%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(800px_circle_at_center,black,transparent)] opacity-[0.04] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:48px_48px]" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-4 py-10"
      >
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
            <Sparkles className="size-7 text-emerald-500" />
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Kanban <span className="text-emerald-500">AI</span>
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Real-time boards with an autonomous AI project manager.
          </p>
        </div>

        {/* Feature highlights */}
        <div className="mb-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              icon: Zap,
              title: "Real-time sync",
              desc: "Live cursors, presence, drag-and-drop",
            },
            {
              icon: Sparkles,
              title: "AI insights",
              desc: "Bottlenecks, risk, complexity, digests",
            },
            {
              icon: Github,
              title: "GitHub import",
              desc: "Pull open issues into a board",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-3 backdrop-blur"
            >
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <f.icon className="size-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{f.title}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Login card */}
        <Card className="w-full max-w-2xl border-border/60 bg-card/70 backdrop-blur">
          <CardContent className="p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Choose an account</h2>
              <p className="text-sm text-muted-foreground">
                Pick a seeded user to sign in instantly. No password needed.
              </p>
            </div>

            {usersQuery.isLoading ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : usersQuery.isError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                Couldn’t load users. {String(usersQuery.error?.message ?? "")}
              </div>
            ) : (
              <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {(usersQuery.data ?? []).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    disabled={submitting}
                    onClick={() => onPickUser(u)}
                    className="group flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-left transition hover:border-emerald-500/40 hover:bg-emerald-500/5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <UserAvatar user={u} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{u.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {u.email}
                      </div>
                    </div>
                    {loggingInId === u.id ? (
                      <Loader2 className="size-4 animate-spin text-emerald-500" />
                    ) : (
                      <LogIn className="size-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              OR
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={onSubmitManual} className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  disabled={submitting}
                />
              </div>
              <Button
                type="submit"
                disabled={submitting || !email.trim()}
                className="bg-emerald-500 text-white hover:bg-emerald-600"
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LogIn className="size-4" />
                )}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Kanban AI · Built with Next.js, Socket.IO & an on-device AI engine
        </p>
      </motion.div>
    </div>
  );
}
