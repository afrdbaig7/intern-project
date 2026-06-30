"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Zap,
  Sparkles,
  Github,
  Loader2,
  LogIn,
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type Mode = "signin" | "signup";

export function LoginScreen() {
  const setUser = useAppStore((s) => s.setUser);
  const [mode, setMode] = React.useState<Mode>("signin");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [showDemo, setShowDemo] = React.useState(false);

  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (mode === "signup" && name.trim().length < 2) {
      e.name = "Please enter your name (at least 2 characters).";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      e.email = "Please enter a valid email address.";
    }
    if (password.length < 6) {
      e.password = "Password must be at least 6 characters.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const trimmedEmail = email.trim().toLowerCase();
      const { user } =
        mode === "signin"
          ? await api.login(trimmedEmail, password)
          : await api.signup(name.trim(), trimmedEmail, password);
      setUser(user);
      toast.success(
        mode === "signup"
          ? `Welcome to Kanban AI, ${user.name}!`
          : `Welcome back, ${user.name}`,
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (demoEmail: string) => {
    setMode("signin");
    setEmail(demoEmail);
    setPassword("demo123");
    setErrors({});
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
            { icon: Zap, title: "Real-time sync", desc: "Live cursors, presence, drag-and-drop" },
            { icon: Sparkles, title: "AI insights", desc: "Bottlenecks, risk, complexity, digests" },
            { icon: Github, title: "GitHub import", desc: "Pull open issues into a board" },
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

        {/* Auth card */}
        <Card className="w-full max-w-md border-border/60 bg-card/70 backdrop-blur">
          <CardContent className="p-6">
            <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setErrors({}); }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-5">
                <p className="mb-4 text-sm text-muted-foreground">
                  Welcome back. Enter your credentials to continue.
                </p>
              </TabsContent>
              <TabsContent value="signup" className="mt-5">
                <p className="mb-4 text-sm text-muted-foreground">
                  Create a free account. You&apos;ll get a board to start with right away.
                </p>
              </TabsContent>
            </Tabs>

            <form onSubmit={submit} className="space-y-3">
              <AnimatePresence mode="popLayout">
                {mode === "signup" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <FieldShell label="Name" error={errors.name}>
                      <div className="relative">
                        <UserIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="Jane Doe"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="pl-9"
                          disabled={submitting}
                          autoComplete="name"
                        />
                      </div>
                    </FieldShell>
                  </motion.div>
                )}
              </AnimatePresence>

              <FieldShell label="Email" error={errors.email}>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9"
                    disabled={submitting}
                    autoComplete="email"
                  />
                </div>
              </FieldShell>

              <FieldShell label="Password" error={errors.password}>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-9"
                    disabled={submitting}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </FieldShell>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-emerald-500 text-white hover:bg-emerald-600"
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : mode === "signup" ? (
                  <LogIn className="size-4" />
                ) : (
                  <LogIn className="size-4" />
                )}
                {mode === "signup" ? "Create account" : "Sign in"}
              </Button>
            </form>

            {/* Demo account quick-fill */}
            <div className="mt-5 border-t border-border/60 pt-4">
              <button
                type="button"
                onClick={() => setShowDemo((s) => !s)}
                className="text-xs text-muted-foreground transition hover:text-foreground"
              >
                {showDemo ? "− Hide" : "+ Show"} demo accounts
              </button>
              <AnimatePresence>
                {showDemo && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <p className="mt-2 text-xs text-muted-foreground">
                      Demo password for all accounts: <code className="rounded bg-muted px-1 py-0.5 font-mono">demo123</code>
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-1.5">
                      {DEMO_EMAILS.map((d) => (
                        <button
                          key={d.email}
                          type="button"
                          onClick={() => fillDemo(d.email)}
                          className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-3 py-1.5 text-left text-xs transition hover:border-emerald-500/40 hover:bg-emerald-500/5"
                        >
                          <span className="font-medium">{d.name}</span>
                          <span className="text-muted-foreground">{d.email}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Kanban AI · Built with Next.js, Socket.IO & an on-device AI engine
        </p>
      </motion.div>
    </div>
  );
}

function FieldShell({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

const DEMO_EMAILS = [
  { name: "Aarav Sharma", email: "aarav@kanban.ai" },
  { name: "Priya Nair", email: "priya@kanban.ai" },
  { name: "Rohan Mehta", email: "rohan@kanban.ai" },
  { name: "Ananya Iyer", email: "ananya@kanban.ai" },
  { name: "Vikram Reddy", email: "vikram@kanban.ai" },
];
