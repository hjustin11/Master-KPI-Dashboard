"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * TanStack-Query-Provider für den gesamten Client-Tree.
 *
 * **Default-Settings** sind konservativ gewählt:
 * - `staleTime: 60s` — keine aggressiven Refetches beim Remount
 * - `gcTime: 5min` — entlastet Memory
 * - `refetchOnWindowFocus: false` — verhindert Request-Stürme beim Tab-Wechsel
 * - `retry: 1` — einmalig retry'n, danach aufgeben (vermeidet Cascading-Failures bei Supabase-Down)
 *
 * Einzelne Queries können diese Defaults in ihrem `useQuery`-Call überschreiben.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
