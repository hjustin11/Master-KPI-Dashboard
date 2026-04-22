"use client";

import { useEffect } from "react";

/**
 * Registriert den Service Worker, sobald der Browser ihn unterstützt.
 * Voraussetzung für die PWA-Installierbarkeit (zusammen mit dem
 * Manifest-Link im RootLayout).
 *
 * Bewusst kein Lifecycle-Management hier — der SW bleibt minimal und macht
 * nur Pass-through-Fetches (siehe public/sw.js). Updates werden beim
 * nächsten Reload automatisch aktiv (skipWaiting + clients.claim).
 */
export function PwaServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[PWA] Service-Worker-Registrierung fehlgeschlagen:", err);
    });
  }, []);

  return null;
}
