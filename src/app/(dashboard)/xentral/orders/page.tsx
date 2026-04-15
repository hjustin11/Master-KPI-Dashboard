"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ADDRESS_ERROR_DEMO_ID_PREFIX } from "./addressErrorDemoOrders";
import { XentralAddressErrorDialogRow } from "./components/XentralAddressErrorDialogRow";
import { useXentralOrdersColumns } from "./components/XentralOrdersColumns";
import { DataTable } from "@/shared/components/DataTable";
import { DASHBOARD_PAGE_SHELL, DASHBOARD_PAGE_TITLE } from "@/shared/lib/dashboardUi";
import {
  computeAddressValidation,
  shippingFlatNeedsNameOrHnSaveConfirm,
} from "@/shared/lib/shippingAddressValidation";
import type { XentralPrimaryAddressFieldKey } from "@/shared/lib/xentralPrimaryAddressFields";
import {
  XENTRAL_ORDERS_CACHE_KEY,
  applyAddressDemoMerge,
  defaultBerlinLastTwoDays,
  formatXentralAddressSubmitError,
  mergePrimaryFields,
  resolveAddressDisplay,
  sortAddressDialogOrders,
  withNormalizedPrimaryFields,
  type AddressDialogPhase,
  type CachedPayload,
  type ImportMode,
  type XentralOrderRow,
  type XentralOrdersLoadOptions,
} from "@/shared/lib/xentral-orders-utils";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  shouldRunBackgroundSync,
} from "@/shared/lib/dashboardClientCache";
import { mergeXentralOrderLists } from "@/shared/lib/xentralOrderMerge";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";
import { usePermissions } from "@/shared/hooks/usePermissions";


export default function XentralOrdersPage() {
  const { t, locale } = useTranslation();
  const { canUseAction } = usePermissions();
  const intlTag = intlLocaleTag(locale);
  const formatMoney = useCallback(
    (amount: number | null, currency: string | null) => {
  if (amount == null || !Number.isFinite(amount)) return "—";
      return new Intl.NumberFormat(intlTag, {
    style: "currency",
    currency: (currency || "EUR").trim() || "EUR",
  }).format(amount);
    },
    [intlTag]
  );

  const [data, setData] = useState<XentralOrderRow[]>([]);
  const [displayedRows, setDisplayedRows] = useState<XentralOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("recent");
  /** Nach Mount setzen — verhindert Hydration-Mismatch (Datum/Intl zwischen Server und Browser). */
  const [hasMounted, setHasMounted] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const berlinRangeRef = useRef({ from: "", to: "" });
  /** Aktuelle Filterdaten für fetch — vermeidet veraltete Closures in `load`. */
  const dateFromRef = useRef("");
  const dateToRef = useRef("");
  const prevDateFilterRef = useRef<{ from: string; to: string } | null>(null);
  const [addressErrorsOpen, setAddressErrorsOpen] = useState(false);
  /** Nur Dialog: bis „Speichern“ keine Änderung an Haupttabelle / localStorage. */
  const [addressDialogDraft, setAddressDialogDraft] = useState<Record<string, XentralOrderRow>>({});
  const [addressDialogBaseline, setAddressDialogBaseline] = useState<Record<string, XentralOrderRow>>({});
  const [addressSaveConfirmOpen, setAddressSaveConfirmOpen] = useState(false);
  const [addressDialogPhase, setAddressDialogPhase] = useState<AddressDialogPhase>("edit");
  const [addressXentralSubmitting, setAddressXentralSubmitting] = useState(false);
  const [addressXentralError, setAddressXentralError] = useState<string | null>(null);
  const [xentralOrderWebBase, setXentralOrderWebBase] = useState<string | null>(null);
  const [xentralSalesOrderWebPath, setXentralSalesOrderWebPath] = useState("/sales-orders");
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);

  const dataRef = useRef<XentralOrderRow[]>([]);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  /** Sichtbare Tabellenzeilen (DataTable inkl. Suche) — Snapshot beim Öffnen des Dialogs. */
  const displayedRowsRef = useRef<XentralOrderRow[]>([]);
  useEffect(() => {
    displayedRowsRef.current = displayedRows;
  }, [displayedRows]);

  /** Aktueller Adress-Entwurf — synchroner Lesevorgang beim Senden (nur Keys in diesem Objekt). */
  const addressDialogDraftRef = useRef<Record<string, XentralOrderRow>>({});
  useEffect(() => {
    addressDialogDraftRef.current = addressDialogDraft;
  }, [addressDialogDraft]);

  const importModeRef = useRef<ImportMode>("recent");
  useEffect(() => {
    importModeRef.current = importMode;
  }, [importMode]);

  const dateFilteredData = useMemo(() => {
    if (!hasMounted || (!dateFrom && !dateTo)) return data;
    return data.filter((row) => {
      const ymd = row.orderDate?.slice(0, 10) ?? "";
      if (!ymd) return false;
      if (dateFrom && ymd < dateFrom) return false;
      if (dateTo && ymd > dateTo) return false;
      return true;
    });
  }, [data, dateFrom, dateTo, hasMounted]);

  const sumDisplayed = useMemo(
    () => displayedRows.reduce((sum, row) => sum + (row.total ?? 0), 0),
    [displayedRows]
  );

  const sumLabel = useMemo(
    () =>
      new Intl.NumberFormat(intlTag, { style: "currency", currency: "EUR" }).format(sumDisplayed),
    [sumDisplayed, intlTag]
  );

  const addressErrorRows = useMemo(
    () => displayedRows.filter((row) => resolveAddressDisplay(row) === "invalid"),
    [displayedRows]
  );

  const addressDraftRowsSorted = useMemo(
    () => sortAddressDialogOrders(Object.values(addressDialogDraft)),
    [addressDialogDraft]
  );

  const isAddressDraftDirty = useMemo(() => {
    const draftIds = Object.keys(addressDialogDraft);
    const baseIds = Object.keys(addressDialogBaseline);
    if (draftIds.length !== baseIds.length) return true;
    const baseSet = new Set(baseIds);
    for (const id of draftIds) {
      if (!baseSet.has(id)) return true;
    }
    const draftSet = new Set(draftIds);
    for (const id of baseIds) {
      if (!draftSet.has(id)) return true;
    }
    for (const id of draftIds) {
      const cur = addressDialogDraft[id];
      const base = addressDialogBaseline[id];
      if (!cur || !base) return true;
      if (JSON.stringify(cur.addressPrimaryFields) !== JSON.stringify(base.addressPrimaryFields)) {
        return true;
      }
    }
    return false;
  }, [addressDialogDraft, addressDialogBaseline]);

  const addressDraftNeedsUncertainSaveConfirm = useMemo(() => {
    return Object.values(addressDialogDraft).some((r) =>
      shippingFlatNeedsNameOrHnSaveConfirm(
        mergePrimaryFields(r) as unknown as Record<string, unknown>,
        r.customer
      )
    );
  }, [addressDialogDraft]);

  const removeAddressDraftRow = useCallback((orderId: string) => {
    setAddressDialogDraft((prev) => {
      if (!prev[orderId]) return prev;
      const next = { ...prev };
      delete next[orderId];
      addressDialogDraftRef.current = next;
      return next;
    });
    setAddressDialogBaseline((prev) => {
      if (!prev[orderId]) return prev;
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  }, []);

  /**
   * Nur Aufträge, die in der **aktuell sichtbaren** Tabelle stehen (Zeitraum + Suchfilter),
   * und nur mit ungültiger Adresse. Mit „X“ entfernte Zeilen liegen nicht mehr im Draft und
   * werden weder an Xentral gesendet noch lokal aus dem Entwurf übernommen.
   */
  const openAddressCorrectionDialog = useCallback(() => {
    if (!canUseAction("xentral.orders.correctAddress")) {
      toast.error(t("xentralOrders.noPermissionAddressCorrection"));
      return;
    }
    const visible = displayedRowsRef.current;
    const invalid = visible.filter((row) => resolveAddressDisplay(row) === "invalid");
    if (invalid.length === 0) {
      setAddressDialogDraft({});
      setAddressDialogBaseline({});
      addressDialogDraftRef.current = {};
    } else {
      const draft: Record<string, XentralOrderRow> = {};
      for (const r of invalid) {
        draft[r.id] = JSON.parse(JSON.stringify(r)) as XentralOrderRow;
      }
      const snapshot = JSON.parse(JSON.stringify(draft)) as Record<string, XentralOrderRow>;
      setAddressDialogDraft(draft);
      setAddressDialogBaseline(snapshot);
      addressDialogDraftRef.current = draft;
    }
    setAddressDialogPhase("edit");
    setAddressXentralError(null);
    setAddressXentralSubmitting(false);
    setAddressErrorsOpen(true);
  }, [canUseAction, t]);

  const handleAddressDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setAddressDialogDraft({});
      setAddressDialogBaseline({});
      setAddressSaveConfirmOpen(false);
      setAddressDialogPhase("edit");
      setAddressXentralError(null);
      setAddressXentralSubmitting(false);
    }
    setAddressErrorsOpen(open);
  }, []);

  const patchAddressDraftField = useCallback(
    (orderId: string, key: XentralPrimaryAddressFieldKey, value: string) => {
      setAddressDialogDraft((prev) => {
        const r = prev[orderId];
        if (!r) return prev;
        const nextFields = { ...mergePrimaryFields(r), [key]: value };
        const { status, issues } = computeAddressValidation({
          shipping: nextFields as unknown as Record<string, unknown>,
          billing: undefined,
          customerDisplay: r.customer,
        });
        return {
          ...prev,
          [orderId]: {
            ...r,
            addressPrimaryFields: nextFields,
            addressValidation: status,
            addressValidationIssues: issues,
          },
        };
      });
    },
    []
  );

  const patchAddressDraftGeocode = useCallback(
    (
      orderId: string,
      args: {
        street?: string;
        zipKey?: XentralPrimaryAddressFieldKey;
        zip?: string;
        cityKey?: XentralPrimaryAddressFieldKey;
        city?: string;
      }
    ) => {
      setAddressDialogDraft((prev) => {
        const r = prev[orderId];
        if (!r) return prev;
        let nextFields = { ...mergePrimaryFields(r) };
        if (args.street !== undefined) nextFields = { ...nextFields, street: args.street };
        if (args.zipKey !== undefined && args.zip !== undefined) {
          nextFields = { ...nextFields, [args.zipKey]: args.zip };
        }
        if (args.cityKey !== undefined && args.city !== undefined) {
          nextFields = { ...nextFields, [args.cityKey]: args.city };
        }
        const { status, issues } = computeAddressValidation({
          shipping: nextFields as unknown as Record<string, unknown>,
          billing: undefined,
          customerDisplay: r.customer,
        });
        return {
          ...prev,
          [orderId]: {
            ...r,
            addressPrimaryFields: nextFields,
            addressValidation: status,
            addressValidationIssues: issues,
          },
        };
      });
    },
    []
  );

  const flushAddressDraftToApp = useCallback((draft: Record<string, XentralOrderRow>) => {
    const ids = Object.keys(draft);
    if (ids.length === 0) return;

    const applyRowPatch = (r: XentralOrderRow): XentralOrderRow => {
      const d = draft[r.id];
      if (!d) return r;
      return {
        ...r,
        addressPrimaryFields: d.addressPrimaryFields,
        addressValidation: d.addressValidation,
        addressValidationIssues: d.addressValidationIssues ?? [],
        addressEdited: true,
      };
    };

    setData((prev) => prev.map(applyRowPatch));
    setDisplayedRows((prev) => prev.map(applyRowPatch));

    try {
      const raw = localStorage.getItem(XENTRAL_ORDERS_CACHE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as CachedPayload;
        if (Array.isArray(p.items)) {
          const mergedItems = p.items.map((item) => {
            const d = draft[item.id];
            if (!d) return item;
            return {
              ...item,
              addressPrimaryFields: d.addressPrimaryFields,
              addressValidation: d.addressValidation,
              addressValidationIssues: d.addressValidationIssues ?? [],
              addressEdited: true,
            };
          });
          localStorage.setItem(
            XENTRAL_ORDERS_CACHE_KEY,
            JSON.stringify({
              ...p,
              savedAt: Date.now(),
              items: mergedItems,
              xentralOrderWebBase: p.xentralOrderWebBase ?? null,
              xentralSalesOrderWebPath: p.xentralSalesOrderWebPath ?? "/sales-orders",
            } satisfies CachedPayload)
          );
        }
      }
    } catch {
      /* Cache optional */
    }

    setAddressSaveConfirmOpen(false);
    setAddressDialogPhase("edit");
    setAddressDialogDraft({});
    setAddressDialogBaseline({});
    setAddressXentralError(null);
    setAddressErrorsOpen(false);
  }, []);

  const requestProceedToReview = useCallback(() => {
    if (addressDraftNeedsUncertainSaveConfirm) {
      setAddressSaveConfirmOpen(true);
    } else {
      setAddressDialogPhase("review");
    }
  }, [addressDraftNeedsUncertainSaveConfirm]);

  const submitAddressDraftToXentral = useCallback(async () => {
    const draft = addressDialogDraftRef.current;
    const rows = sortAddressDialogOrders(Object.values(draft));
    if (rows.length === 0) return;

    const draftMap = Object.fromEntries(rows.map((r) => [r.id, r])) as Record<string, XentralOrderRow>;
    const realUpdates = rows
      .filter((r) => !r.id.startsWith(ADDRESS_ERROR_DEMO_ID_PREFIX))
      .map((r) => ({
        salesOrderId: r.id,
        addressPrimaryFields: mergePrimaryFields(r),
      }));

    setAddressXentralSubmitting(true);
    setAddressXentralError(null);
    try {
      if (realUpdates.length > 0) {
        const res = await fetch("/api/xentral/sales-order-shipping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates: realUpdates }),
        });
        const json = (await res.json()) as {
          error?: string;
          partialFailures?: Array<{ salesOrderId: string; error?: string }>;
          results?: Array<{ ok: boolean; salesOrderId: string; error?: string }>;
        };
        if (!res.ok) {
          const fromResults = Array.isArray(json.results)
            ? json.results.find((x) => x && !x.ok)?.error
            : undefined;
          const base = json.error?.trim() || `Xentral (${res.status})`;
          throw new Error(
            fromResults && !base.includes(fromResults.slice(0, 60))
              ? `${base}\n${fromResults}`
              : base
          );
        }
        const fails =
          json.partialFailures ??
          (Array.isArray(json.results) ? json.results.filter((x) => !x.ok) : []);
        if (fails.length > 0) {
          throw new Error(
            fails
              .map(
                (f) =>
                  `${f.salesOrderId}: ${f.error?.slice(0, 120) ?? t("xentralOrders.errorShort")}`
              )
              .join(" · ")
          );
        }
      }
      flushAddressDraftToApp(draftMap);
      toast.success(
        realUpdates.length > 0 ? t("xentralOrders.toastAddressesSaved") : t("xentralOrders.toastDemoSaved")
      );
    } catch (e) {
      const msg = formatXentralAddressSubmitError(
        e instanceof Error ? e.message : t("commonUi.unknownError"),
        t
      );
      setAddressXentralError(msg);
      toast.error(msg.length > 280 ? `${msg.slice(0, 277)}…` : msg);
    } finally {
      setAddressXentralSubmitting(false);
    }
  }, [flushAddressDraftToApp, t]);

  const load = useCallback(async (options?: XentralOrdersLoadOptions) => {
    const bustServerCache = options?.bustServerCache ?? false;
    const silent = options?.silent ?? false;
    const mode = options?.mode;
    let fetchMode: ImportMode = mode ?? importModeRef.current;
    let hadCache = false;

    if (!bustServerCache && !silent) {
      const raw = localStorage.getItem(XENTRAL_ORDERS_CACHE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as CachedPayload;
          if (
            Array.isArray(parsed.items) &&
            (parsed.importMode === "recent" || parsed.importMode === "all")
          ) {
            const normalized = withNormalizedPrimaryFields(parsed.items);
            const forUi = applyAddressDemoMerge(normalized);
            dataRef.current = forUi;
            setData(forUi);
            setDisplayedRows(forUi);
            setTotalCount(
              typeof parsed.xentralTotalCount === "number"
                ? parsed.xentralTotalCount
                : parsed.items.length
            );
            setImportMode(parsed.importMode);
            importModeRef.current = parsed.importMode;
            fetchMode = parsed.importMode;
            setXentralOrderWebBase(parsed.xentralOrderWebBase ?? null);
            setXentralSalesOrderWebPath(parsed.xentralSalesOrderWebPath ?? "/sales-orders");
            hadCache = true;
            setIsLoading(false);
          }
        } catch {
          /* Cache ungültig */
        }
      }
    }

    const retainVisual = hadCache || dataRef.current.length > 0;
    if (!silent && !retainVisual && !hadCache) {
      setIsLoading(true);
    }
    if (silent || retainVisual) {
      setIsBackgroundSyncing(true);
    }

    if (!silent) {
      setError(null);
    }

    try {
      let qs: URLSearchParams;
      if (fetchMode === "all") {
        qs = new URLSearchParams({ all: "1", limit: "50" });
      } else {
        qs = new URLSearchParams({ recentDays: "2", limit: "50" });
        const f = dateFromRef.current.trim();
        const t = dateToRef.current.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(f) && /^\d{4}-\d{2}-\d{2}$/.test(t)) {
          qs.set("fromYmd", f);
          qs.set("toYmd", t);
        }
      }
      if (bustServerCache) {
        qs.set("refresh", "1");
      }
      const res = await fetch(`/api/xentral/orders?${qs.toString()}`, {
        cache: "no-store",
      });

      const payload = (await res.json()) as {
        items?: XentralOrderRow[];
        totalCount?: number;
        error?: string;
        meta?: {
          mode?: string;
          stoppedEarly?: boolean;
          fromYmd?: string;
          toYmd?: string;
          xentralOrderWebBase?: string | null;
          xentralSalesOrderWebPath?: string;
        };
      };

      if (!res.ok) {
        throw new Error(payload.error ?? t("xentralOrders.loadFailed"));
      }

      const normalized = withNormalizedPrimaryFields(payload.items ?? []);
      const nextItems = applyAddressDemoMerge(normalized);
      const apiTotal =
        typeof payload.totalCount === "number" ? payload.totalCount : normalized.length;

      const linkBase = payload.meta?.xentralOrderWebBase ?? null;
      const linkPath = payload.meta?.xentralSalesOrderWebPath ?? "/sales-orders";
      setXentralOrderWebBase(linkBase);
      setXentralSalesOrderWebPath(linkPath);

      const merged = mergeXentralOrderLists(dataRef.current, nextItems, {
        dropMissingFromPrevious: false,
      });
      const stored = merged;
      dataRef.current = merged;
      setData(merged);

      setTotalCount(apiTotal);
      setImportMode(fetchMode);
      importModeRef.current = fetchMode;

      if (
        fetchMode === "recent" &&
        (payload.meta?.mode === "recentDays" || payload.meta?.mode === "dateRange") &&
        typeof payload.meta.fromYmd === "string" &&
        typeof payload.meta.toYmd === "string"
      ) {
        berlinRangeRef.current = {
          from: payload.meta.fromYmd,
          to: payload.meta.toYmd,
        };
        setDateFrom(payload.meta.fromYmd);
        setDateTo(payload.meta.toYmd);
        dateFromRef.current = payload.meta.fromYmd;
        dateToRef.current = payload.meta.toYmd;
      }

      if (
        fetchMode === "recent" &&
        (payload.meta?.mode === "recentDays" || payload.meta?.mode === "dateRange") &&
        payload.meta?.stoppedEarly
      ) {
        console.warn(
          "[Xentral] Datumsimport vorzeitig beendet (leere Seiten). Bei fehlenden Aufträgen: „Alle laden“."
        );
      }

      const savedAt = Date.now();
      localStorage.setItem(
        XENTRAL_ORDERS_CACHE_KEY,
        JSON.stringify({
          savedAt,
          items: stored,
          importMode: fetchMode,
          xentralTotalCount: apiTotal,
          xentralOrderWebBase: linkBase,
          xentralSalesOrderWebPath: linkPath,
        } satisfies CachedPayload)
      );
    } catch (e) {
      if (silent) {
        console.warn("[Xentral] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
      if (silent || retainVisual) {
        setIsBackgroundSyncing(false);
      }
    }
  }, [t]);

  /** Stabile Ref — verhindert Endlos-Reload bei HMR/Locale-Wechsel (`useEffect` mit `[load]`). */
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    setHasMounted(true);
    const d = defaultBerlinLastTwoDays();
    berlinRangeRef.current = { from: d.from, to: d.to };
    dateFromRef.current = d.from;
    dateToRef.current = d.to;
    setDateFrom(d.from);
    setDateTo(d.to);
    void loadRef.current();
  }, []);

  useEffect(() => {
    dateFromRef.current = dateFrom;
    dateToRef.current = dateTo;
  }, [dateFrom, dateTo]);

  /**
   * Nach Änderung von „Von/Bis“: Xentral für den gewählten Zeitraum nachladen (Modus „Nur 2 Tage“ / recent).
   * Erster Stand nach Mount zählt nicht als Änderung (kein zweiter Request neben dem Initial-Load).
   */
  useEffect(() => {
    if (!hasMounted || importMode !== "recent") return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) return;
    const prev = prevDateFilterRef.current;
    prevDateFilterRef.current = { from: dateFrom, to: dateTo };
    if (!prev || (prev.from === dateFrom && prev.to === dateTo)) return;
    const id = window.setTimeout(() => {
      void loadRef.current({ mode: "recent" });
    }, 450);
    return () => window.clearTimeout(id);
  }, [dateFrom, dateTo, hasMounted, importMode]);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      void loadRef.current({ silent: true });
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [hasMounted]);

  const columns = useXentralOrdersColumns({
    xentralOrderWebBase,
    xentralSalesOrderWebPath,
    formatMoney,
    t,
  });

  const dateFilterIsDefault =
    hasMounted &&
    dateFrom === berlinRangeRef.current.from &&
    dateTo === berlinRangeRef.current.to;

  return (
    <div className={DASHBOARD_PAGE_SHELL}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className={DASHBOARD_PAGE_TITLE}>{t("xentralOrders.title")}</h1>
          <div className="flex flex-wrap items-center gap-3">
            {!isLoading && displayedRows.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("xentralOrders.shown")}{" "}
                <span className="font-medium text-foreground">{displayedRows.length}</span>
                {totalCount != null && totalCount > displayedRows.length ? (
                  <span>
                    {" "}
                    / {totalCount} {t("xentralOrders.inXentral")}
                  </span>
                ) : null}
                <span>
                  {" "}
                  · {dateFilteredData.length} {t("xentralOrders.inPeriod")}
                </span>
                {" · "}
                {t("xentralOrders.sumView")}{" "}
                <span className="font-medium text-foreground">{sumLabel}</span>
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load({ bustServerCache: true, mode: importMode })}
              disabled={isLoading || !hasMounted}
            >
              {t("xentralOrders.refresh")}
            </Button>
            <Button
              type="button"
              variant={importMode === "all" ? "secondary" : "outline"}
              size="sm"
              onClick={() => void load({ bustServerCache: true, mode: "all" })}
              disabled={isLoading || !hasMounted}
              title={t("xentralOrders.loadAllTitle")}
            >
              {t("xentralOrders.loadAll")}
            </Button>
            {importMode === "all" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void load({ bustServerCache: true, mode: "recent" })}
                disabled={isLoading || !hasMounted}
                title={t("xentralOrders.loadRecentTitle")}
              >
                {t("xentralOrders.loadRecent")}
              </Button>
            ) : null}
            {isBackgroundSyncing ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t("xentralOrders.syncing")}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground backdrop-blur-sm">
          {t("xentralOrders.loading")}
        </div>
      ) : (
        <>
          <Dialog open={addressErrorsOpen} onOpenChange={handleAddressDialogOpenChange}>
            <DialogContent
              className="flex max-h-[96vh] w-[min(96rem,calc(100vw-1.25rem))] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden border-border/50 bg-card p-0 shadow-xl sm:max-w-none"
              showCloseButton
            >
              <DialogHeader className="shrink-0 space-y-1 border-b border-border/40 bg-gradient-to-b from-muted/45 to-muted/10 px-4 py-4 text-left sm:px-6">
                <DialogTitle className="text-lg font-semibold tracking-tight">
                  {addressDialogPhase === "edit"
                    ? t("xentralOrders.dialogEditTitle")
                    : t("xentralOrders.dialogReviewTitle")}
                </DialogTitle>
                <DialogDescription className="text-pretty text-sm text-muted-foreground">
                  {addressDialogPhase === "edit"
                    ? t("xentralOrders.dialogEditDesc")
                    : t("xentralOrders.dialogReviewDesc")}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto px-4 py-4 sm:px-6">
                {addressDraftRowsSorted.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 py-12 text-center text-sm text-muted-foreground">
                    {t("xentralOrders.dialogEmpty")}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {addressDialogPhase === "review" && addressXentralError ? (
                      <div
                        className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm break-words text-destructive whitespace-pre-wrap"
                        role="alert"
                      >
                        {addressXentralError}
                      </div>
                    ) : null}
                    <div className="overflow-hidden rounded-xl border border-border/40 bg-background/80 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
                    <Table className="w-full min-w-[min(100%,68rem)] max-w-full border-separate border-spacing-0 text-xs">
                      <TableHeader>
                        <TableRow className="border-0 hover:bg-transparent">
                          <TableHead className="sticky left-0 z-20 w-12 min-w-12 max-w-12 border-b border-border/50 bg-muted/40 px-1 py-3 text-center shadow-[3px_0_14px_-4px_rgba(0,0,0,0.06)]">
                            <span className="sr-only">{t("xentralOrders.srRemoveFromList")}</span>
                            <X
                              className="mx-auto size-3.5 text-muted-foreground opacity-60"
                              strokeWidth={2.25}
                              aria-hidden
                            />
                          </TableHead>
                          <TableHead className="sticky left-12 z-20 w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] border-b border-border/50 bg-muted/40 px-3 py-3 text-center align-middle shadow-[3px_0_14px_-4px_rgba(0,0,0,0.06)]">
                            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("xentralOrders.documentNr")}
                            </span>
                          </TableHead>
                          <TableHead className="sticky left-[12.5rem] z-20 w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] border-b border-border/50 bg-muted/40 px-3 py-3 text-center align-middle shadow-[3px_0_14px_-4px_rgba(0,0,0,0.06)]">
                            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("xentralOrders.orderNrShort")}
                            </span>
                          </TableHead>
                          <TableHead className="sticky left-[22rem] z-20 w-[9rem] min-w-[9rem] max-w-[9rem] border-b border-border/50 bg-muted/40 px-3 py-3 text-center align-middle shadow-[3px_0_14px_-4px_rgba(0,0,0,0.06)]">
                            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("xentralOrders.marketplace")}
                            </span>
                          </TableHead>
                          <TableHead className="min-w-[8rem] max-w-[11rem] border-b border-border/50 bg-muted/40 px-2 py-3 text-left">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("xentralOrders.fieldName")}
                            </span>
                          </TableHead>
                          <TableHead className="min-w-[13rem] border-b border-border/50 bg-muted/40 px-3 py-3 text-left">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("xentralOrders.fieldStreet")}
                            </span>
                          </TableHead>
                          <TableHead className="w-[6.75rem] min-w-[6.75rem] border-b border-border/50 bg-muted/40 px-2 py-3 text-center">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("xentralOrders.fieldZip")}
                            </span>
                          </TableHead>
                          <TableHead className="min-w-[10rem] border-b border-border/50 bg-muted/40 px-3 py-3 text-left">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("xentralOrders.fieldCity")}
                            </span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {addressDraftRowsSorted.map((row, rowIndex) => (
                          <XentralAddressErrorDialogRow
                            key={row.id}
                            row={row}
                            rowIndex={rowIndex}
                            dialogOpen={addressErrorsOpen}
                            mode={addressDialogPhase}
                            patchDraftField={patchAddressDraftField}
                            patchDraftGeocode={patchAddressDraftGeocode}
                            onRemoveFromDraft={removeAddressDraftRow}
                            xentralOrderWebBase={xentralOrderWebBase}
                            xentralSalesOrderWebPath={xentralSalesOrderWebPath}
                          />
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  </div>
                )}
              </div>
              <div className="shrink-0 border-t border-border/40 bg-muted/25 px-4 py-3 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    {addressDialogPhase === "edit" ? (
                      addressDraftRowsSorted.length === 0 ? (
                        <span>{t("xentralOrders.footerEmptyList")}</span>
                      ) : isAddressDraftDirty ? (
                        t("xentralOrders.footerDirty")
                      ) : (
                        t("xentralOrders.footerCleanEdit")
                      )
                    ) : (
                      <span className="font-medium text-foreground">
                        {addressDraftRowsSorted.length === 1
                          ? t("xentralOrders.footerReadyOne", {
                              count: addressDraftRowsSorted.length,
                            })
                          : t("xentralOrders.footerReadyMany", {
                              count: addressDraftRowsSorted.length,
                            })}
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    {addressDialogPhase === "edit" ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddressDialogOpenChange(false)}
                        >
                          {t("xentralOrders.cancel")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={addressDraftRowsSorted.length === 0}
                          onClick={() => requestProceedToReview()}
                          title={t("xentralOrders.saveAndReviewTitle")}
                        >
                          {t("xentralOrders.saveAndReview")}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddressDialogOpenChange(false)}
                          disabled={addressXentralSubmitting}
                        >
                          {t("xentralOrders.cancel")}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setAddressDialogPhase("edit")}
                          disabled={addressXentralSubmitting}
                        >
                          {t("xentralOrders.edit")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={addressDraftRowsSorted.length === 0 || addressXentralSubmitting}
                          onClick={() => void submitAddressDraftToXentral()}
                        >
                          {addressXentralSubmitting ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                              {t("xentralOrders.sending")}
                            </span>
                          ) : (
                            t("xentralOrders.submitToXentral")
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={addressSaveConfirmOpen} onOpenChange={setAddressSaveConfirmOpen}>
            <DialogContent
              showCloseButton
              className="z-[100] max-w-md shadow-lg"
            >
              <DialogHeader>
                <DialogTitle>{t("xentralOrders.confirmOverviewTitle")}</DialogTitle>
                <DialogDescription className="text-pretty">
                  {t("xentralOrders.confirmOverviewDesc")}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setAddressSaveConfirmOpen(false)}>
                  {t("xentralOrders.back")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setAddressSaveConfirmOpen(false);
                    setAddressDialogPhase("review");
                  }}
                >
                  {t("xentralOrders.toOverview")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

        <DataTable
          columns={columns}
          data={dateFilteredData}
            filterColumn={t("filters.xentralOrders")}
            toolbarBetween={
              canUseAction("xentral.orders.correctAddress") ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => openAddressCorrectionDialog()}
                  disabled={!hasMounted}
                >
                  {t("xentralOrders.correctAddresses")}
                  {addressErrorRows.length > 0 ? (
                    <span className="rounded-full bg-destructive/15 px-1.5 py-px text-xs font-medium tabular-nums text-destructive">
                      {addressErrorRows.length}
                    </span>
                  ) : null}
                </Button>
              ) : null
            }
          toolbarEnd={
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="xentral-orders-date-from" className="shrink-0 text-muted-foreground">
                    {t("dates.from")}
                </Label>
                <Input
                  id="xentral-orders-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[min(100%,11rem)] tabular-nums"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="xentral-orders-date-to" className="shrink-0 text-muted-foreground">
                    {t("dates.to")}
                </Label>
                <Input
                  id="xentral-orders-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[min(100%,11rem)] tabular-nums"
                />
              </div>
              {!dateFilterIsDefault ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground"
                  disabled={!hasMounted}
                  onClick={() => {
                    const d = defaultBerlinLastTwoDays();
                    berlinRangeRef.current = { from: d.from, to: d.to };
                    setDateFrom(d.from);
                    setDateTo(d.to);
                  }}
                >
                    {t("xentralOrders.lastTwoDays")}
                </Button>
              ) : null}
            </div>
          }
          paginate={false}
          compact
          className="flex-1 min-h-0"
          tableWrapClassName="min-h-0"
          onDisplayedRowsChange={setDisplayedRows}
        />
        </>
      )}
    </div>
  );
}

