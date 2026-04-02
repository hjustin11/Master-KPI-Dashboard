"use client";

import { useDeveloperUiVisible } from "@/shared/hooks/useDeveloperUiVisible";

/** Spalten-Debug (Käfer) — gleiche Sichtbarkeit wie `useDeveloperUiVisible` (nur Entwickler-Rolle). */
export function useShowApiSourceDebug(): boolean {
  return useDeveloperUiVisible();
}
