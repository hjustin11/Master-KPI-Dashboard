"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";
import { cn } from "@/lib/utils";
import { DASHBOARD_PAGE_SHELL, DASHBOARD_PAGE_TITLE } from "@/shared/lib/dashboardUi";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import type { ContainerComparisonDelta } from "@/shared/lib/procurement/compareProcurementImports";
import {
  containerArrivalIsUpcoming,
  containerArrivalUtc,
  containerKey,
  groupAllByContainer,
  groupProductTotalAmount,
  rowsWithCanonicalContainerArrival,
} from "@/shared/lib/procurement/procurementAggregation";

export type ProcurementTableRow = {
  id: string;
  sortIndex: number;
  containerNumber: string;
  manufacture: string;
  productName: string;
  sku: string;
  amount: number;
  arrivalAtPort: string;
  notes: string;
};

function rowMatchesQuery(line: ProcurementTableRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [
    line.containerNumber,
    line.manufacture,
    line.productName,
    line.sku,
    line.arrivalAtPort,
    line.notes,
    String(line.amount),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(s);
}

function formatArrivalDay(ts: number | null, appLocale: Locale): string {
  if (ts == null) return "—";
  return new Date(ts).toLocaleDateString(intlLocaleTag(appLocale), {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/** Längste Containernummer oder SKU in den Gruppen (Zeichen), für eine gemeinsame erste Spalte. */
function maxLeadingIdentifierLen(groups: ProcurementTableRow[][]): number {
  let n = 0;
  for (const g of groups) {
    n = Math.max(n, (g[0]?.containerNumber ?? "").trim().length);
    for (const row of g) {
      n = Math.max(n, (row.sku ?? "").trim().length);
    }
  }
  return n;
}

const PROCUREMENT_LINES_CLIENT_CACHE_KEY = "analytics_procurement_lines_v1";

type CachedProcurementPayload = {
  savedAt: number;
  lines: ProcurementTableRow[];
  comparison: Record<string, ContainerComparisonDelta>;
};

const TABLE_MIN_W = "min-w-[44rem]";

/** Genug Breite für „2.767 → 1.407“ in einer Zeile, konsistent mit Grid + colgroup. */
const AMOUNT_COL = "7rem";

export default function AnalyticsProcurementPage() {
  const { t, locale } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<ProcurementTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [containerComparison, setContainerComparison] = useState<
    Record<string, ContainerComparisonDelta>
  >({});

  const qtyFmt = useMemo(
    () =>
      new Intl.NumberFormat(intlLocaleTag(locale), {
        maximumFractionDigits: 0,
      }),
    [locale]
  );

  const loadLines = useCallback(async (forceRefresh = false, silent = false) => {
    let hadCache = false;

    if (!forceRefresh && !silent) {
      const parsed = readLocalJsonCache<CachedProcurementPayload>(PROCUREMENT_LINES_CLIENT_CACHE_KEY);
      if (parsed && Array.isArray(parsed.lines)) {
        setLines(parsed.lines);
        setContainerComparison(
          parsed.comparison && typeof parsed.comparison === "object" ? parsed.comparison : {}
        );
        hadCache = true;
        setLoading(false);
      }
    }

    if (forceRefresh && !silent) {
      setLoading(true);
    } else if (!hadCache && !silent) {
      setLoading(true);
    }

    const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
    if (showBackgroundIndicator) {
      setIsBackgroundSyncing(true);
    }

    if (!silent) {
      setLoadError(null);
    }

    try {
      const qs = forceRefresh ? "?refresh=1" : "";
      const res = await fetch(`/api/procurement/lines${qs}`, { cache: "no-store" });
      const payload = (await res.json()) as {
        error?: string;
        lines?: ProcurementTableRow[];
        comparison?: Record<string, ContainerComparisonDelta>;
      };
      if (!res.ok) {
        throw new Error(payload.error ?? t("analyticsProcurement.loadError"));
      }
      const nextLines = payload.lines ?? [];
      const nextComp =
        payload.comparison && typeof payload.comparison === "object" ? payload.comparison : {};
      setLines(nextLines);
      setContainerComparison(nextComp);
      writeLocalJsonCache(PROCUREMENT_LINES_CLIENT_CACHE_KEY, {
        savedAt: Date.now(),
        lines: nextLines,
        comparison: nextComp,
      } satisfies CachedProcurementPayload);
    } catch (e) {
      if (silent) {
        console.warn("[Beschaffung] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setLoadError(e instanceof Error ? e.message : t("analyticsProcurement.loadError"));
        if (!hadCache) {
          setLines([]);
          setContainerComparison({});
        }
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
      if (showBackgroundIndicator) {
        setIsBackgroundSyncing(false);
      }
    }
  }, [t]);

  const loadLinesRef = useRef(loadLines);
  loadLinesRef.current = loadLines;

  useEffect(() => {
    void loadLinesRef.current(false, false);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      void loadLinesRef.current(false, true);
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, []);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/procurement/import", { method: "POST", body: fd });
      const payload = (await res.json()) as { error?: string; rowCount?: number };
      if (!res.ok) {
        throw new Error(payload.error ?? t("analyticsProcurement.importError"));
      }
      toast.success(t("analyticsProcurement.importSuccess", { count: String(payload.rowCount ?? 0) }));
      await loadLinesRef.current(true, false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("analyticsProcurement.importError"));
    } finally {
      setUploading(false);
    }
  };

  const filteredLines = useMemo(
    () => lines.filter((line) => rowMatchesQuery(line, search)),
    [lines, search]
  );

  /** Ob überhaupt ein Container mit Ankunft ab heute in den Rohdaten existiert (für Leer-Hinweis). */
  const anyUpcomingContainerInDataset = useMemo(() => {
    const groups = groupAllByContainer(lines);
    return groups.some((rows) => containerArrivalIsUpcoming(rows));
  }, [lines]);

  const sortedContainerGroups = useMemo(() => {
    const groups = groupAllByContainer(filteredLines).filter((rows) =>
      containerArrivalIsUpcoming(rows)
    );
    const meta = groups.map((rows) => ({
      rows,
      fileOrder: Math.min(...rows.map((r) => r.sortIndex)),
      earliest: containerArrivalUtc(rows),
    }));

    meta.sort((a, b) => {
      const ae = a.earliest;
      const be = b.earliest;
      if (ae == null && be == null) return a.fileOrder - b.fileOrder;
      if (ae == null) return 1;
      if (be == null) return -1;
      if (ae !== be) return ae - be;
      return a.fileOrder - b.fileOrder;
    });

    return meta.map((m) => rowsWithCanonicalContainerArrival(m.rows));
  }, [filteredLines]);

  const leadingColCh = useMemo(() => {
    const m = maxLeadingIdentifierLen(sortedContainerGroups);
    return Math.min(80, Math.max(9, m + 2));
  }, [sortedContainerGroups]);

  const gridColsStyle = useMemo(
    (): React.CSSProperties => ({
      /** Muss mit <colgroup> (AMOUNT_COL) übereinstimmen, sonst Überlappung bei Alt→Neu. */
      gridTemplateColumns: `${leadingColCh}ch minmax(0, 1fr) ${AMOUNT_COL} minmax(7.5rem, 28%)`,
    }),
    [leadingColCh]
  );

  return (
    <div className={cn(DASHBOARD_PAGE_SHELL, "gap-3")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={DASHBOARD_PAGE_TITLE}>{t("analyticsProcurement.title")}</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="sr-only"
            onChange={(e) => void onFileChange(e)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="mr-2 h-4 w-4" aria-hidden />
            )}
            {uploading ? t("analyticsProcurement.uploading") : t("analyticsProcurement.upload")}
          </Button>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("commonUi.loading")}
        </div>
      ) : isBackgroundSyncing ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground/90">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {t("commonUi.syncing")}
        </div>
      ) : null}

      {!loading && lines.length === 0 ? (
        <div className="rounded-lg border border-border/50 bg-card/80 p-3 text-sm text-muted-foreground">
          {t("analyticsProcurement.noDataUploaded")}
        </div>
      ) : null}

      {!loading && lines.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-lg border border-border/50 bg-card/80 p-2">
          <div className="relative w-full min-w-0 max-w-[min(100%,40rem)] shrink-0">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full min-w-0 pl-7 text-xs"
              placeholder={t("dataTable.searchIn", { fields: t("filters.procurementTable") })}
            />
          </div>

          {!anyUpcomingContainerInDataset ? (
            <p className="text-xs text-muted-foreground">{t("analyticsProcurement.noUpcomingDeliveries")}</p>
          ) : sortedContainerGroups.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("dataTable.noRows")}</p>
          ) : (
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-auto rounded-md border border-border/50 bg-background/40"
              )}
            >
              <div className={cn("sticky top-0 z-[2] shrink-0 border-b border-border/60 bg-card/95 backdrop-blur-sm")}>
                <div className={cn("w-full", TABLE_MIN_W)}>
                  <div
                    className="grid w-full border-b border-border/50 bg-muted/40 text-[11px] font-medium text-muted-foreground"
                    role="row"
                    style={gridColsStyle}
                    aria-label={t("analyticsProcurement.columnHeaderRowAria")}
                  >
                    <div className="px-2 py-1.5 whitespace-nowrap">{t("analyticsProcurement.sku")}</div>
                    <div className="min-w-0 px-2 py-1.5">{t("analyticsProcurement.productName")}</div>
                    <div className="px-2 py-1.5 text-right whitespace-nowrap">
                      {t("analyticsProcurement.amount")}
                    </div>
                    <div className="min-w-0 px-2 py-1.5">{t("analyticsProcurement.notes")}</div>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-1.5 pt-1">
                {sortedContainerGroups.map((groupRows, gi) => {
                  const head = groupRows[0]!;
                  const cLabel = head.containerNumber.trim() || "—";
                  const ck = containerKey(head);
                  const delta = containerComparison[ck];
                  const mfg = head.manufacture?.trim() || "—";
                  /** Nur Produkte (ohne Packaging/Parts-Zeilen) – konsistent mit Import-Vergleich. */
                  const total = groupProductTotalAmount(groupRows);
                  const containerArrivalTs = containerArrivalUtc(groupRows);
                  const arrivalLabel = formatArrivalDay(containerArrivalTs, locale);
                  return (
                    <div
                      key={`${cLabel}-${head.sortIndex}-${gi}`}
                      className={cn(
                        "overflow-x-auto rounded-md border border-border/60",
                        gi % 2 === 0 ? "bg-background" : "bg-muted/15"
                      )}
                    >
                      <div
                        className="grid w-full min-w-0 items-start border-b border-border/50 bg-muted/45 text-xs leading-snug"
                        style={gridColsStyle}
                      >
                        <div className="px-2 py-1.5 font-mono text-xs font-bold tracking-tight whitespace-nowrap text-foreground">
                          {cLabel}
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1.5">
                          {delta?.arrivalDirection ? (
                            <span
                              className="inline-flex flex-wrap items-center gap-x-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-xs font-semibold tabular-nums"
                              title={t("analyticsProcurement.containerArrivalBadgeTitle")}
                            >
                              <span className="text-foreground">
                                {t("analyticsProcurement.earliestArrivalShort")}:{" "}
                                {formatArrivalDay(delta.previousArrivalUtc, locale)}
                              </span>
                              <ArrowRight
                                className="h-3 w-3 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                              <span
                                className={cn(
                                  delta.arrivalDirection === "later" &&
                                    "text-red-600 dark:text-red-400",
                                  delta.arrivalDirection === "earlier" &&
                                    "text-green-600 dark:text-green-400"
                                )}
                                title={
                                  delta.arrivalDirection === "later"
                                    ? t("analyticsProcurement.comparisonArrivalLater")
                                    : t("analyticsProcurement.comparisonArrivalEarlier")
                                }
                              >
                                {formatArrivalDay(delta.newArrivalUtc, locale)}
                              </span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex shrink-0 items-center rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground"
                              title={t("analyticsProcurement.containerArrivalBadgeTitle")}
                            >
                              {t("analyticsProcurement.earliestArrivalShort")}: {arrivalLabel}
                            </span>
                          )}
                        </div>
                        <div className="flex min-h-[1.75rem] min-w-0 flex-col justify-center px-2 py-1.5 text-right">
                          {delta?.qtyDirection ? (
                            <div className="inline-flex w-full min-w-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-xs tabular-nums">
                              <span className="shrink-0 font-medium whitespace-nowrap text-muted-foreground">
                                {qtyFmt.format(delta.previousTotalQty)}
                              </span>
                              <ArrowRight
                                className="h-3 w-3 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                              <span
                                className={cn(
                                  "shrink-0 font-bold whitespace-nowrap",
                                  delta.qtyDirection === "more" &&
                                    "text-green-600 dark:text-green-400",
                                  delta.qtyDirection === "less" &&
                                    "text-red-600 dark:text-red-400"
                                )}
                                title={
                                  delta.qtyDirection === "more"
                                    ? t("analyticsProcurement.comparisonQtyMore")
                                    : t("analyticsProcurement.comparisonQtyLess")
                                }
                              >
                                {qtyFmt.format(total)}
                              </span>
                            </div>
                          ) : (
                            <span className="block w-full text-xs font-bold tabular-nums whitespace-nowrap text-foreground">
                              {qtyFmt.format(total)}
                            </span>
                          )}
                        </div>
                        <div
                          className="min-w-0 truncate px-2 py-1.5 text-muted-foreground"
                          title={mfg !== "—" ? mfg : undefined}
                        >
                          {mfg}
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table
                          className={cn("w-full table-fixed border-collapse text-xs", TABLE_MIN_W)}
                          aria-label={cLabel}
                        >
                          <colgroup>
                            <col style={{ width: `${leadingColCh}ch` }} />
                            <col />
                            <col style={{ width: AMOUNT_COL }} />
                            <col style={{ width: "28%" }} />
                          </colgroup>
                          <tbody>
                            {groupRows.map((row) => (
                              <tr
                                key={row.id}
                                className="border-b border-border/25 last:border-b-0 hover:bg-muted/20"
                              >
                                <td className="px-2 py-1 align-top font-mono text-xs">
                                  <span className="inline-block max-w-none whitespace-nowrap font-medium tabular-nums">
                                    {row.sku || "—"}
                                  </span>
                                </td>
                                <td className="max-w-0 min-w-0 px-2 py-1 align-top text-muted-foreground">
                                  <span
                                    className="line-clamp-2 whitespace-normal break-words"
                                    title={row.productName || undefined}
                                  >
                                    {row.productName?.trim() || "—"}
                                  </span>
                                </td>
                                <td className="px-2 py-1 align-top text-right tabular-nums">
                                  {qtyFmt.format(row.amount)}
                                </td>
                                <td className="max-w-0 min-w-0 px-2 py-1 align-top text-muted-foreground">
                                  <span className="block whitespace-pre-wrap break-words">
                                    {row.notes?.trim() || "—"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
