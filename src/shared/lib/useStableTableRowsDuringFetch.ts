import { useEffect, useMemo, useRef } from "react";

type Options<T> = {
  rows: T[];
  /** z. B. isLoading || isBackgroundSyncing */
  isFetchActive: boolean;
};

/**
 * Hält die zuletzt nicht-leere Zeilenliste sichtbar, während noch geladen wird und
 * `rows` vorübergehend leer ist (z. B. neuer Filter/Datumsbereich vor der API-Antwort).
 */
export function useStableTableRowsDuringFetch<T>({ rows, isFetchActive }: Options<T>): T[] {
  const lastNonEmptyRef = useRef<T[]>([]);

  useEffect(() => {
    if (rows.length > 0) {
      lastNonEmptyRef.current = rows;
    }
  }, [rows]);

  return useMemo(() => {
    if (rows.length > 0) return rows;
    if (isFetchActive && lastNonEmptyRef.current.length > 0) return lastNonEmptyRef.current;
    return rows;
  }, [rows, isFetchActive]);
}
