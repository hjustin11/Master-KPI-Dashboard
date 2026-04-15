"use client";

import { useEffect, useState } from "react";

/**
 * Generischer Hook für localStorage-persistierte Column-Sichtbarkeit.
 * Reconciled mit der aktuellen Spaltenliste (neue Keys bekommen `defaultVisible`,
 * nicht mehr existierende Keys werden entfernt).
 */
export default function useColumnVisibility(params: {
  storageKey: string;
  columns: string[];
  defaultVisible: boolean;
  readStored: () => Record<string, boolean>;
}): {
  visibility: Record<string, boolean>;
  setVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
} {
  const { storageKey, columns, defaultVisible, readStored } = params;
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const stored = readStored();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibility((prev) => {
      const base = Object.keys(prev).length > 0 ? prev : stored;
      const next: Record<string, boolean> = { ...base };
      for (const c of columns) {
        if (next[c] === undefined) next[c] = defaultVisible;
      }
      if (columns.length > 0) {
        for (const k of Object.keys(next)) {
          if (!columns.includes(k)) delete next[k];
        }
      }
      return next;
    });

  }, [columns, defaultVisible, readStored]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (Object.keys(visibility).length === 0) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(visibility));
    } catch {
      /* ignore quota / private mode */
    }
  }, [visibility, storageKey]);

  return { visibility, setVisibility };
}
