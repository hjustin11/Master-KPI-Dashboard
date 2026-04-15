"use client";

import { useEffect, useState } from "react";
import { DASHBOARD_CLIENT_BACKGROUND_SYNC_MS } from "@/shared/lib/dashboardClientCache";
import {
  getUpdatesSignature,
  readSeenUpdatesSignature,
  UPDATES_SEEN_EVENT,
} from "@/shared/lib/updatesFeed";
import type { UpdatesBellState } from "@/shared/components/layout/sidebar/nav-utils";

type ManagedUpdatePayloadItem = {
  date?: string;
  title?: string;
  text?: string;
  release_key?: string | null;
};

async function fetchCurrentUpdatesSignature(): Promise<string | null> {
  try {
    const res = await fetch("/api/updates", { cache: "no-store" });
    if (!res.ok) return null;
    const payload = (await res.json()) as { items?: ManagedUpdatePayloadItem[] };
    if (!Array.isArray(payload.items)) return null;
    const entries = payload.items
      .map((item) => ({
        date: typeof item.date === "string" ? item.date : "",
        title: typeof item.title === "string" ? item.title : "",
        text: typeof item.text === "string" ? item.text : "",
        releaseKey: typeof item.release_key === "string" ? item.release_key : undefined,
      }))
      .filter((item) => item.date && item.title && item.text);
    if (entries.length === 0) return null;
    return getUpdatesSignature(entries);
  } catch {
    return null;
  }
}

export default function useUpdatesPolling(): { updatesBellState: UpdatesBellState } {
  const [hasUnseenUpdates, setHasUnseenUpdates] = useState(false);
  const [currentUpdatesSignature, setCurrentUpdatesSignature] = useState(() => readSeenUpdatesSignature());

  useEffect(() => {
    let cancelled = false;
    const refreshSignature = async () => {
      const signature = await fetchCurrentUpdatesSignature();
      if (!cancelled && signature) setCurrentUpdatesSignature(signature);
    };
    void refreshSignature();
    const id = window.setInterval(() => {
      void refreshSignature();
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const syncSeenState = () => {
      const seen = readSeenUpdatesSignature();
      setHasUnseenUpdates(currentUpdatesSignature !== seen);
    };
    syncSeenState();
    window.addEventListener("storage", syncSeenState);
    window.addEventListener(UPDATES_SEEN_EVENT, syncSeenState);
    return () => {
      window.removeEventListener("storage", syncSeenState);
      window.removeEventListener(UPDATES_SEEN_EVENT, syncSeenState);
    };
  }, [currentUpdatesSignature]);

  const updatesBellState: UpdatesBellState = hasUnseenUpdates ? "updates" : "none";
  return { updatesBellState };
}
