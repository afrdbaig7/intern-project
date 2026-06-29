"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { getQueryClient } from "@/lib/query-client";

/**
 * Top-level client providers:
 *  - QueryClientProvider (TanStack Query)
 *  - ThemeProvider (next-themes, dark by default)
 *  - Toaster (sonner)
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <NextThemesProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast: "rounded-lg border border-border",
            },
          }}
        />
      </NextThemesProvider>
    </QueryClientProvider>
  );
}
