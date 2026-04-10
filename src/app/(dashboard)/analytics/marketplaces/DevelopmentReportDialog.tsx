"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Presentation, Printer } from "lucide-react";
import type { Locale as DateFnsLocale } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MarketplaceBrandImg } from "@/shared/components/MarketplaceBrandImg";
import type { MarketplaceArticleSalesRow } from "@/shared/lib/marketplaceArticleLines";
import { readLocalJsonCache, writeLocalJsonCache } from "@/shared/lib/dashboardClientCache";
import { cn } from "@/lib/utils";
import {
  aggregateMarketplaceReportRows,
  buildMarketplaceReportRowFromCompare,
  type SalesCompareResponseLike,
} from "./buildMarketplaceReportRowFromCompare";
import { AnalyticsMarketplacePeriodRangePicker } from "./AnalyticsMarketplacePeriodRangePicker";
import { DevelopmentReportVisualKpi } from "./DevelopmentReportVisualKpi";
import { buildDevelopmentReportHtml } from "./DevelopmentReportPrintView";
import { devReportChannelBrand } from "./devReportChannelBrand";
import { computeDisplayedPreviousPeriod } from "./developmentReportPeriod";
import {
  DEV_REPORT_ARTICLE_FETCH_TIMEOUT_MS,
  DEV_REPORT_ARTICLE_MARKETPLACES,
  DEV_REPORT_SALES_FETCH_TIMEOUT_MS_PREVIOUS,
  DEV_REPORT_SALES_FETCH_TIMEOUT_MS_YOY,
  DEV_REPORT_SALES_CHANNELS,
  devReportSalesLocalStorageKey,
  fetchDevReportSalesCompareWithTimeout,
  fetchMarketplaceArticleSalesWithTimeout,
  parseCachedAnalyticsSalesCompare,
  runWithConcurrency,
  salesCompareCacheKey,
  type CompareModeParam,
  type DevReportChannelId,
} from "./developmentReportSalesApi";
import type { DevelopmentReportArticleScopeNotice } from "./DevelopmentReportArticleSummary";

const DEFAULT_SELECTED_IDS: DevReportChannelId[] = DEV_REPORT_SALES_CHANNELS.map((c) => c.id);
const DEV_REPORT_ARTICLES_MAX_BLOCKING_MS = 12_000;

function channelLabel(id: DevReportChannelId): string {
  return id === "mediamarkt-saturn" ? "MediaMarkt Saturn" : id === "tiktok" ? "TikTok Shop" : id[0].toUpperCase() + id.slice(1);
}

export function DevelopmentReportDialog({
  open,
  onOpenChange,
  initialFrom,
  initialTo,
  intlTag,
  dfLocale,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFrom: string;
  initialTo: string;
  intlTag: string;
  dfLocale: DateFnsLocale;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [rFrom, setRFrom] = useState(initialFrom);
  const [rTo, setRTo] = useState(initialTo);
  const [compareMode, setCompareMode] = useState<CompareModeParam>("yoy");
  const [scopeMode, setScopeMode] = useState<"all" | "single" | "selected">("all");
  const [singleId, setSingleId] = useState<DevReportChannelId>("amazon");
  const [selectedIds, setSelectedIds] = useState<DevReportChannelId[]>([...DEFAULT_SELECTED_IDS]);
  const [salesByChannel, setSalesByChannel] = useState<Partial<Record<DevReportChannelId, SalesCompareResponseLike>>>({});
  const [salesErrByChannel, setSalesErrByChannel] = useState<Partial<Record<DevReportChannelId, string>>>({});
  const [salesLoading, setSalesLoading] = useState(false);
  const [articlesByChannel, setArticlesByChannel] = useState<
    Partial<Record<DevReportChannelId, { items: MarketplaceArticleSalesRow[]; unsupported: boolean; error: string | null; loading: boolean }>>
  >({});
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [reportGeneratedAt, setReportGeneratedAt] = useState(new Date());
  const [moverMetric, setMoverMetric] = useState<"units" | "revenue">("revenue");
  const [presentationMode, setPresentationMode] = useState(false);
  const loadRunIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setRFrom(initialFrom);
    setRTo(initialTo);
  }, [open, initialFrom, initialTo]);

  useEffect(() => {
    if (!open) setPresentationMode(false);
  }, [open]);

  const { previousFrom, previousTo } = useMemo(
    () => computeDisplayedPreviousPeriod(rFrom, rTo, compareMode),
    [rFrom, rTo, compareMode]
  );

  const baseRows = useMemo(
    () =>
      DEV_REPORT_SALES_CHANNELS.map((ch) =>
        buildMarketplaceReportRowFromCompare({
          id: ch.id,
          label: channelLabel(ch.id),
          data: salesByChannel[ch.id] ?? null,
        })
      ),
    [salesByChannel]
  );

  const activeRows = useMemo(() => {
    if (scopeMode === "single") return baseRows.filter((r) => r.id === singleId);
    if (scopeMode === "selected") {
      const f = baseRows.filter((r) => selectedIds.includes(r.id as DevReportChannelId));
      return f.length > 0 ? f : baseRows;
    }
    return baseRows;
  }, [baseRows, scopeMode, singleId, selectedIds]);

  const totalRow = useMemo(() => aggregateMarketplaceReportRows(activeRows), [activeRows]);
  const kpiRowsForDisplay = useMemo(() => {
    if (!hasLoaded) return activeRows;
    if (totalRow && activeRows.length > 1) return [...activeRows, { ...totalRow, label: "Gesamt" }];
    return activeRows;
  }, [hasLoaded, activeRows, totalRow]);

  const articleScopeIds = useMemo(
    () => new Set(activeRows.map((r) => r.id).filter((id): id is DevReportChannelId => id !== "total")),
    [activeRows]
  );

  const articleSummaryChannels = useMemo(() => {
    if (!hasLoaded) return [] as Array<{ id: DevReportChannelId; label: string; items: MarketplaceArticleSalesRow[] }>;
    const out: Array<{ id: DevReportChannelId; label: string; items: MarketplaceArticleSalesRow[] }> = [];
    for (const id of DEV_REPORT_SALES_CHANNELS.map((c) => c.id)) {
      if (!articleScopeIds.has(id)) continue;
      if (id === "amazon") continue;
      const art = articlesByChannel[id];
      if (!art || art.loading || art.unsupported || art.error || art.items.length === 0) continue;
      out.push({ id, label: channelLabel(id), items: art.items });
    }
    return out;
  }, [hasLoaded, articleScopeIds, articlesByChannel]);

  const articleScopeNotices = useMemo((): DevelopmentReportArticleScopeNotice[] => {
    if (!hasLoaded) return [];
    const out: DevelopmentReportArticleScopeNotice[] = [];
    for (const id of articleScopeIds) {
      if (id === "amazon") continue;
      const art = articlesByChannel[id];
      if (!art || art.loading) continue;
      if (art.unsupported) out.push({ channelId: id, kind: "unsupported" });
      else if (art.error) out.push({ channelId: id, kind: "error", detail: art.error });
      else if (art.items.length === 0) out.push({ channelId: id, kind: "empty" });
    }
    return out;
  }, [hasLoaded, articleScopeIds, articlesByChannel]);

  const salesChannelsToLoad = useMemo(() => {
    if (scopeMode === "single") return DEV_REPORT_SALES_CHANNELS.filter((c) => c.id === singleId);
    if (scopeMode === "selected") return DEV_REPORT_SALES_CHANNELS.filter((c) => selectedIds.includes(c.id));
    return DEV_REPORT_SALES_CHANNELS;
  }, [scopeMode, singleId, selectedIds]);

  const articleMarketplaceIdsToLoad = useMemo(() => {
    if (scopeMode === "single") return singleId === "amazon" ? [] : [singleId];
    if (scopeMode === "selected") return selectedIds.filter((id) => id !== "amazon");
    return [...DEV_REPORT_ARTICLE_MARKETPLACES];
  }, [scopeMode, singleId, selectedIds]);

  const loadReport = useCallback(async () => {
    const runId = ++loadRunIdRef.current;
    const isCurrentRun = () => loadRunIdRef.current === runId;

    setSalesLoading(true);
    setArticlesLoading(false);
    setSalesErrByChannel({});
    setHasLoaded(false);
    setReportGeneratedAt(new Date());

    const timeoutMsg = "Zeitüberschreitung beim Laden";
    const salesTimeoutMs =
      compareMode === "previous"
        ? DEV_REPORT_SALES_FETCH_TIMEOUT_MS_PREVIOUS
        : DEV_REPORT_SALES_FETCH_TIMEOUT_MS_YOY;
    const nextSales: Partial<Record<DevReportChannelId, SalesCompareResponseLike>> = {};
    const nextErr: Partial<Record<DevReportChannelId, string>> = {};

    if (compareMode === "previous") {
      const warm: Partial<Record<DevReportChannelId, SalesCompareResponseLike>> = {};
      for (const ch of salesChannelsToLoad) {
        const raw = readLocalJsonCache<unknown>(devReportSalesLocalStorageKey(ch.id, rFrom, rTo, "previous"));
        const hit = parseCachedAnalyticsSalesCompare(raw);
        if (hit) warm[ch.id] = hit;
      }
      if (Object.keys(warm).length > 0 && isCurrentRun()) {
        setSalesByChannel(warm);
        setHasLoaded(true);
      }
    }

    await runWithConcurrency(salesChannelsToLoad, 3, async (ch) => {
      const hit =
        parseCachedAnalyticsSalesCompare(readLocalJsonCache<unknown>(salesCompareCacheKey(ch.id, rFrom, rTo))) ?? null;
      if (hit && compareMode === "yoy") nextSales[ch.id] = hit;

      // Amazon kann je nach Zeitraum deutlich länger brauchen.
      const timeoutForChannel = ch.id === "amazon" ? Math.round(salesTimeoutMs * 1.5) : salesTimeoutMs;
      const payload = await fetchDevReportSalesCompareWithTimeout({
        apiPath: ch.apiPath,
        from: rFrom,
        to: rTo,
        compareMode,
        timeoutMs: timeoutForChannel,
      });
      if (payload.error) {
        nextErr[ch.id] = payload.error === "__FETCH_TIMEOUT__" ? timeoutMsg : payload.error;
        if (isCurrentRun()) {
          setSalesErrByChannel((prev) => ({ ...prev, [ch.id]: nextErr[ch.id]! }));
          // Bereits Teilergebnisse/Fehler anzeigen statt auf alle Kanäle zu warten.
          setHasLoaded(true);
        }
        return;
      }
      nextSales[ch.id] = payload;
      writeLocalJsonCache(
        devReportSalesLocalStorageKey(ch.id, rFrom, rTo, compareMode),
        { savedAt: Date.now(), ...payload }
      );
      if (isCurrentRun()) {
        setSalesByChannel((prev) => ({ ...prev, [ch.id]: payload }));
        // Erste verfügbare Kanaldaten sofort rendern.
        setHasLoaded(true);
      }
    });

    if (!isCurrentRun()) return;

    // Fallback: falls alles fehlschlug und noch nichts dargestellt wurde.
    setSalesByChannel((prev) => (Object.keys(prev).length > 0 ? prev : nextSales));
    setSalesErrByChannel((prev) => ({ ...nextErr, ...prev }));
    setSalesLoading(false);
    setHasLoaded(true);

    const nextArt: Partial<
      Record<DevReportChannelId, { items: MarketplaceArticleSalesRow[]; unsupported: boolean; error: string | null; loading: boolean }>
    > = {};
    setArticlesLoading(true);
    for (const id of DEV_REPORT_ARTICLE_MARKETPLACES) {
      const loadThis = articleMarketplaceIdsToLoad.includes(id);
      nextArt[id] = { items: [], unsupported: false, error: null, loading: loadThis };
    }
    nextArt.amazon = { items: [], unsupported: true, error: null, loading: false };
    if (!isCurrentRun()) return;
    setArticlesByChannel(nextArt);

    if (articleMarketplaceIdsToLoad.length === 0) {
      setArticlesLoading(false);
      return;
    }

    const unblockTimer = window.setTimeout(() => {
      if (isCurrentRun()) {
        setArticlesLoading(false);
      }
    }, DEV_REPORT_ARTICLES_MAX_BLOCKING_MS);
    try {
      await Promise.all(
        articleMarketplaceIdsToLoad.map(async (id) => {
          const { ok, data } = await fetchMarketplaceArticleSalesWithTimeout({
            marketplace: id,
            from: rFrom,
            to: rTo,
            timeoutMs: DEV_REPORT_ARTICLE_FETCH_TIMEOUT_MS,
          });
          const row = data as { items?: MarketplaceArticleSalesRow[]; error?: string; unsupported?: boolean };
          if (!ok) {
            if (isCurrentRun()) {
              setArticlesByChannel((prev) => ({
                ...prev,
                [id]: {
                  items: [],
                  unsupported: false,
                  error: row?.error === "__FETCH_TIMEOUT__" ? timeoutMsg : row?.error ?? t("commonUi.unknownError"),
                  loading: false,
                },
              }));
            }
            return;
          }
          if (row.unsupported) {
            if (isCurrentRun()) {
              setArticlesByChannel((prev) => ({
                ...prev,
                [id]: { items: [], unsupported: true, error: null, loading: false },
              }));
            }
            return;
          }
          if (isCurrentRun()) {
            setArticlesByChannel((prev) => ({
              ...prev,
              [id]: { items: Array.isArray(row.items) ? row.items : [], unsupported: false, error: null, loading: false },
            }));
          }
        })
      );
    } finally {
      window.clearTimeout(unblockTimer);
      if (isCurrentRun()) {
        setArticlesLoading(false);
      }
    }
  }, [articleMarketplaceIdsToLoad, compareMode, rFrom, rTo, salesChannelsToLoad, t]);

  const printReport = useCallback(() => {
    const html = buildDevelopmentReportHtml({
      rows: kpiRowsForDisplay,
      periodFrom: rFrom,
      periodTo: rTo,
      previousFrom,
      previousTo,
      generatedAt: reportGeneratedAt,
      intlTag,
    });
    const popup = window.open("", "_blank", "width=1200,height=900");
    if (popup) {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      const triggerPrint = () => {
        popup.focus();
        popup.print();
      };
      popup.addEventListener("load", triggerPrint, { once: true });
      window.setTimeout(triggerPrint, 350);
      return;
    }
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    iframe.onload = () => {
      iframe.contentWindow?.print();
      window.setTimeout(() => iframe.remove(), 700);
    };
  }, [kpiRowsForDisplay, rFrom, rTo, previousFrom, previousTo, reportGeneratedAt, intlTag]);

  const compareModeLabel = compareMode === "previous" ? t("devReport.comparePrevious") : t("devReport.compareYoy");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full max-w-[calc(100%-0.5rem)] overflow-y-auto p-0 sm:max-w-[min(120rem,calc(100vw-0.5rem))]">
        <div className={cn("space-y-3", presentationMode ? "p-6 md:p-8" : "p-4 md:p-6")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={cn("font-semibold", presentationMode ? "text-lg" : "text-base")}>{t("devReport.title")}</h2>
            <div className="flex flex-wrap gap-2">
              {!(presentationMode && hasLoaded) ? (
                <Button type="button" variant="outline" size="sm" onClick={loadReport} disabled={salesLoading || articlesLoading}>
                  {salesLoading || articlesLoading ? <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden /> : null}
                  {t("devReport.load")}
                </Button>
              ) : null}
              <Button type="button" size="sm" onClick={printReport} disabled={!hasLoaded} className="gap-1.5">
                <Printer className="size-3.5" aria-hidden />
                {t("devReport.print")}
              </Button>
              <Button
                type="button"
                variant={presentationMode ? "secondary" : "outline"}
                size="sm"
                className="gap-1.5"
                aria-pressed={presentationMode}
                onClick={() => setPresentationMode((v) => !v)}
              >
                <Presentation className="size-3.5" aria-hidden />
                {presentationMode ? t("devReport.exitPresentation") : t("devReport.presentationMode")}
              </Button>
            </div>
          </div>

          {!presentationMode ? (
            <div className="flex flex-wrap items-center gap-2">
              <AnalyticsMarketplacePeriodRangePicker
                periodFrom={rFrom}
                periodTo={rTo}
                onChange={(from, to) => {
                  setRFrom(from);
                  setRTo(to);
                }}
                dfLocale={dfLocale}
                t={t}
              />
              <label className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">{t("devReport.compareMode")}</span>
                <select
                  value={compareMode}
                  onChange={(e) => setCompareMode(e.target.value as CompareModeParam)}
                  className="rounded-md border border-border/50 bg-background px-2 py-1 text-sm"
                >
                  <option value="previous">{t("devReport.comparePrevious")}</option>
                  <option value="yoy">{t("devReport.compareYoy")}</option>
                </select>
              </label>
            </div>
          ) : null}

          {!presentationMode ? (
            <div className="grid gap-3 rounded-lg border border-border/50 bg-muted/10 p-3 md:grid-cols-[220px_minmax(0,1fr)]">
            <label className="space-y-1 text-xs">
              <span>{t("devReport.scopeLabel")}</span>
              <select
                value={scopeMode}
                onChange={(e) => setScopeMode(e.target.value as typeof scopeMode)}
                className="w-full rounded-md border border-border/50 bg-background px-2 py-1.5 text-sm"
              >
                <option value="all">{t("devReport.scopeAll")}</option>
                <option value="single">{t("devReport.scopeSingle")}</option>
                <option value="selected">{t("devReport.scopeSelected")}</option>
              </select>
            </label>
            {scopeMode === "single" ? (
              <label className="space-y-1 text-xs">
                <span>{t("devReport.marketplace")}</span>
                <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background px-2 py-1">
                  <span className="inline-flex h-6 w-20 items-center justify-start" aria-hidden>
                    <MarketplaceBrandImg src={devReportChannelBrand(singleId).logoSrc} alt="" className="max-h-6 max-w-full object-contain object-left" />
                  </span>
                  <select
                    value={singleId}
                    onChange={(e) => setSingleId(e.target.value as DevReportChannelId)}
                    className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm outline-none focus:ring-0"
                  >
                    {DEV_REPORT_SALES_CHANNELS.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {channelLabel(ch.id)}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            ) : scopeMode === "selected" ? (
              <div className="space-y-1 text-xs">
                <span>{t("devReport.pickMarketplaces")}</span>
                <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-border/50 bg-background p-2 text-sm sm:grid-cols-3">
                  {DEV_REPORT_SALES_CHANNELS.map((ch) => {
                    const checked = selectedIds.includes(ch.id);
                    return (
                      <label key={ch.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(ev) => {
                            setSelectedIds((prev) =>
                              ev.target.checked ? [...prev, ch.id] : prev.filter((x) => x !== ch.id)
                            );
                          }}
                        />
                        <span className="inline-flex h-5 w-12 items-center justify-start" aria-hidden>
                          <MarketplaceBrandImg src={devReportChannelBrand(ch.id).logoSrc} alt="" className="max-h-5 max-w-full object-contain object-left" />
                        </span>
                        <span className="truncate">{channelLabel(ch.id)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground md:self-end">{t("devReport.scopeAllHint")}</p>
            )}
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
              {t("devReport.metaReport")} {rFrom}–{rTo} · {t("devReport.metaCompare")} {compareModeLabel}
            </div>
          )}

          {Object.keys(salesErrByChannel).length > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-950">
              {Object.entries(salesErrByChannel).map(([id, msg]) => (
                <p key={id} className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-12 items-center justify-start" aria-hidden>
                    <MarketplaceBrandImg
                      src={devReportChannelBrand(id as DevReportChannelId).logoSrc}
                      alt=""
                      className="max-h-5 max-w-full object-contain object-left"
                    />
                  </span>
                  <span>
                    <span className="font-medium">{channelLabel(id as DevReportChannelId)}:</span> {msg}
                  </span>
                </p>
              ))}
            </div>
          ) : null}

          {hasLoaded ? (
            <DevelopmentReportVisualKpi
              rows={kpiRowsForDisplay}
              periodFrom={rFrom}
              periodTo={rTo}
              previousFrom={previousFrom}
              previousTo={previousTo}
              generatedAt={reportGeneratedAt}
              intlTag={intlTag}
              articleSummaryChannels={articleSummaryChannels}
              articleSummaryCurrency="EUR"
              moverMetric={moverMetric}
              articlesLoading={articlesLoading}
              articleScopeNotices={articleScopeNotices}
              presentationMode={presentationMode}
              t={t}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("devReport.promptLoad")}</p>
          )}

          {hasLoaded && !presentationMode ? (
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className={`rounded-md border px-2 py-1 ${moverMetric === "revenue" ? "border-primary bg-primary/10" : "border-border/50"}`}
                onClick={() => setMoverMetric("revenue")}
              >
                {t("devReport.moversByRevenue")}
              </button>
              <button
                type="button"
                className={`rounded-md border px-2 py-1 ${moverMetric === "units" ? "border-primary bg-primary/10" : "border-border/50"}`}
                onClick={() => setMoverMetric("units")}
              >
                {t("devReport.moversByUnits")}
              </button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
