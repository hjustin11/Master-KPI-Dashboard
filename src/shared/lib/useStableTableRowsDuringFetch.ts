import { useMemo, useState } from "react";

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
  const [lastNonEmpty, setLastNonEmpty] = useState<T[]>([]);

  // Update-during-render Muster (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  if (rows.length > 0 && rows !== lastNonEmpty) {
    setLastNonEmpty(rows);
  }

  return useMemo(() => {
    if (rows.length > 0) return rows;
    if (isFetchActive && lastNonEmpty.length > 0) return lastNonEmpty;
    return rows;
  }, [rows, isFetchActive, lastNonEmpty]);
}
