"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Loader2, PencilLine, Plus, RotateCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DataTable } from "@/shared/components/DataTable";
import {
  DASHBOARD_COMPACT_CARD,
  DASHBOARD_MARKETPLACE_LOGO_FRAME,
  DASHBOARD_MARKETPLACE_LOGO_IMG_IN_FRAME,
  DASHBOARD_PAGE_SHELL,
  DASHBOARD_PAGE_TITLE,
  MARKETPLACE_PRODUCTS_COL_SECONDARY_ID,
  MARKETPLACE_PRODUCTS_COL_SKU,
  MARKETPLACE_PRODUCTS_COL_STATUS,
  MARKETPLACE_PRODUCTS_COL_TITLE,
  MARKETPLACE_PRODUCTS_TABLE_CLASS,
} from "@/shared/lib/dashboardUi";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  readLocalJsonCache,
  shouldRunBackgroundSync,
  writeLocalJsonCache,
} from "@/shared/lib/dashboardClientCache";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";
import { useUser } from "@/shared/hooks/useUser";
import {
  type AmazonProductDraftMode,
  type AmazonProductDraftRecord,
  type AmazonProductDraftValues,
  deriveDraftStatus,
  draftValuesFromSource,
  emptyDraftValues,
  sourceSnapshotFromRow,
} from "@/shared/lib/amazonProductDraft";
import {
  getAmazonProductTypeOptions,
  getAmazonProductTypeSchema,
  getMissingAmazonRequiredFields,
} from "@/shared/lib/amazonProductTypeSchema";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";

type ProductStatus = "active" | "inactive" | "all";

type ProductsApiPayload = {
  items?: MarketplaceProductListRow[];
  totalCount?: number;
  error?: string;
  missingKeys?: string[];
  hint?: string;
  pending?: boolean;
};

type CachedProductsPayload = {
  savedAt: number;
  items: MarketplaceProductListRow[];
  totalCount?: number;
};

type DraftApiPayload = {
  item?: AmazonProductDraftRecord | null;
  items?: AmazonProductDraftRecord[];
  tableMissing?: boolean;
  error?: string;
};

type AmazonProductDetailPayload = {
  sourceSnapshot?: ReturnType<typeof sourceSnapshotFromRow>;
  draftValues?: AmazonProductDraftValues;
  draft?: AmazonProductDraftRecord | null;
  error?: string;
};

export type MarketplaceProductsViewProps = {
  /** Feste URL oder Builder bei Amazon-Statusfilter */
  apiUrl: string | ((status: ProductStatus) => string);
  cacheKey: string | ((status: ProductStatus, pageIndex?: number) => string);
  logoSrc: string;
  brandAlt: string;
  /** Zusatz zu `DASHBOARD_MARKETPLACE_LOGO_FRAME` (z. B. `DASHBOARD_MARKETPLACE_LOGO_FRAME_EXT_LG`). */
  logoFrameClassName?: string;
  /** Abstand Logo ↔ „Produkte“-Titel (z. B. `gap-1` bei breitem Logo). */
  titleRowGapClassName?: string;
  /** i18n-Key für Untertitel (optional, z. B. eBay ohne Hinweistext) */
  subtitleKey?: string;
  /** Wenn gesetzt: Status-Dropdown wie bei Amazon */
  amazonStatusFilter?: boolean;
  /**
   * Serverseitige Seiten (`limit`/`offset` an der API). Pro Seite eigener Cache + Hintergrund-Abgleich nur für die aktuelle Seite.
   * Ohne: eine Antwort, Tabellen-Pagination nur im Browser (Standard, z. B. Amazon).
   */
  serverPagination?: boolean;
  /** Zeilen pro Seite (serverseitig oder im DataTable). */
  pageSize?: number;
  /**
   * Hintergrund-Abgleich (Standard 5 Min). Für schwere Listen (z. B. Amazon SP-API) ggf. höher setzen.
   */
  backgroundSyncIntervalMs?: number;
  /** Vorbereitung Produkteditor (Owner) – aktuell nur für Amazon vorgesehen. */
  enableAmazonEditor?: boolean;
};

const REPORT_PENDING_MAX_ATTEMPTS = 36;
const REPORT_PENDING_DELAY_CAP_MS = 45_000;
const AMAZON_DRAFT_IMAGE_MAX_FILES_PER_DROP = 8;
const AMAZON_DRAFT_IMAGE_MAX_MB = 8;

function isLikelyImageUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^data:image\//i.test(v)) return true;
  try {
    const url = new URL(v);
    if (!/^https?:$/i.test(url.protocol)) return false;
    return /\.(png|jpe?g|webp|gif|avif|bmp|svg)(\?|#|$)/i.test(url.pathname) || url.searchParams.has("image");
  } catch {
    return false;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

export function MarketplaceProductsView({
  apiUrl,
  cacheKey,
  logoSrc,
  brandAlt,
  logoFrameClassName,
  titleRowGapClassName,
  subtitleKey,
  amazonStatusFilter = false,
  serverPagination = false,
  pageSize: pageSizeProp = 50,
  backgroundSyncIntervalMs = DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  enableAmazonEditor = false,
}: MarketplaceProductsViewProps) {
  const { t, locale } = useTranslation();
  const user = useUser();
  const isOwner = !user.isLoading && user.roleKey?.toLowerCase() === "owner";
  const canEditProducts = enableAmazonEditor && isOwner;
  const [status, setStatus] = useState<ProductStatus>("active");
  const [pageIndex, setPageIndex] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [rows, setRows] = useState<MarketplaceProductListRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [error, setError] = useState<{ message: string; missingKeys?: string[]; hint?: string } | null>(
    null
  );
  const [pendingInfo, setPendingInfo] = useState<string | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<AmazonProductDraftMode>("edit_existing");
  const [editorSource, setEditorSource] = useState<MarketplaceProductListRow | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftValues, setDraftValues] = useState<AmazonProductDraftValues>(() => emptyDraftValues());
  const [draftStatus, setDraftStatus] = useState<"draft" | "ready">("draft");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftTableMissing, setDraftTableMissing] = useState(false);
  const [imageDropActive, setImageDropActive] = useState(false);
  const statusRef = useRef(status);
  const selectedProductTypeSchema = useMemo(
    () => getAmazonProductTypeSchema(draftValues.productType),
    [draftValues.productType]
  );
  const missingRequiredFields = useMemo(
    () => (editorMode === "create_new" ? getMissingAmazonRequiredFields(draftValues) : []),
    [editorMode, draftValues]
  );
  const productTypeOptions = useMemo(() => getAmazonProductTypeOptions(), []);

  const pageIndexRef = useRef(pageIndex);
  const rowsRef = useRef(rows);
  /** Nur für nicht-stille Loads — stille Polls erhöhen das nicht, damit Hintergrund-Sync keinen Nutzer-Fetch abbricht. */
  const foregroundLoadGenRef = useRef(0);
  const silentLoadGenRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const silentFetchAbortRef = useRef<AbortController | null>(null);
  const reportPendingAttemptRef = useRef(0);
  const reportPendingTimeoutRef = useRef<number | null>(null);
  const lastLoadParamsRef = useRef<{ status: ProductStatus; pageIndex: number } | null>(null);
  const pendingForcedRefreshRef = useRef(false);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    reportPendingAttemptRef.current = 0;
    if (reportPendingTimeoutRef.current != null) {
      window.clearTimeout(reportPendingTimeoutRef.current);
      reportPendingTimeoutRef.current = null;
    }
  }, [status, pageIndex]);

  const resolveCacheKey = useCallback(
    (st: ProductStatus, pi: number) => {
      if (typeof cacheKey === "function") return cacheKey(st, serverPagination ? pi : 0);
      if (serverPagination) return `${cacheKey}_p${pi}`;
      return cacheKey;
    },
    [cacheKey, serverPagination]
  );

  const buildRequestUrl = useCallback(
    (st: ProductStatus, forceRefresh = false) => {
      const base = typeof apiUrl === "function" ? apiUrl(st) : apiUrl;
      const u = new URL(base, typeof window !== "undefined" ? window.location.origin : "http://localhost");
      if (serverPagination) {
        u.searchParams.set("limit", String(pageSizeProp));
        u.searchParams.set("offset", String(pageIndexRef.current * pageSizeProp));
      }
      if (forceRefresh) {
        u.searchParams.set("refresh", "1");
      }
      return `${u.pathname}${u.search}`;
    },
    [apiUrl, serverPagination, pageSizeProp]
  );

  const totalArticlesLabel = useMemo(() => {
    const n = serverPagination && totalCount != null ? totalCount : rows.length;
    return new Intl.NumberFormat(intlLocaleTag(locale)).format(n);
  }, [serverPagination, totalCount, rows.length, locale]);

  const saveDraft = useCallback(async () => {
    const mode = editorMode;
    const values = {
      ...draftValues,
      bulletPoints: draftValues.bulletPoints.map((x) => x.trim()).filter(Boolean),
      images: draftValues.images.map((x) => x.trim()).filter(Boolean),
    };
    const sourceBase = editorSource
      ? sourceSnapshotFromRow(editorSource)
      : sourceSnapshotFromRow({
          sku: values.sku,
          secondaryId: values.asin,
          title: values.title,
          statusLabel: "",
          isActive: true,
        });
    const source = {
      ...sourceBase,
      sku: values.sku || sourceBase.sku,
      asin: values.asin || sourceBase.asin,
      title: values.title || sourceBase.title,
      description: values.description,
      bulletPoints: values.bulletPoints,
      images: values.images,
      productType: values.productType,
      brand: values.brand,
      conditionType: values.conditionType,
      externalProductId: values.externalProductId,
      externalProductIdType: values.externalProductIdType,
      listPriceEur: values.listPriceEur ? Number(values.listPriceEur) : null,
      quantity: values.quantity ? Number(values.quantity) : null,
      attributes: values.attributes,
    };
    const statusOut = deriveDraftStatus(values, mode);
    setDraftSaving(true);
    setDraftError(null);
    try {
      const method = mode === "create_new" && !draftId ? "POST" : "PUT";
      const res = await fetch("/api/amazon/products/drafts", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: draftId ?? undefined,
          mode,
          sku: values.sku || editorSource?.sku || undefined,
          sourceSnapshot: source,
          draftValues: values,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as DraftApiPayload;
      if (!res.ok) throw new Error(payload.error ?? "Entwurf konnte nicht gespeichert werden.");
      const item = payload.item ?? null;
      if (item?.id) setDraftId(item.id);
      setDraftStatus(statusOut);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : t("commonUi.unknownError"));
    } finally {
      setDraftSaving(false);
    }
  }, [draftId, draftValues, editorMode, editorSource, t]);

  const loadDraft = useCallback(
    async (sku: string, mode: AmazonProductDraftMode) => {
      setDraftLoading(true);
      setDraftError(null);
      setDraftTableMissing(false);
      try {
        if (mode === "edit_existing" && sku) {
          const detailRes = await fetch(`/api/amazon/products/${encodeURIComponent(sku)}`, {
            cache: "no-store",
          });
          const detailPayload = (await detailRes.json().catch(() => ({}))) as AmazonProductDetailPayload;
          if (!detailRes.ok) {
            throw new Error(detailPayload.error ?? "Produktdetails konnten nicht geladen werden.");
          }
          const nextValues = detailPayload.draftValues ?? draftValuesFromSource(detailPayload.sourceSnapshot ?? sourceSnapshotFromRow({
            sku,
            secondaryId: "",
            title: "",
            statusLabel: "",
            isActive: true,
          }));
          setDraftValues(nextValues);
          if (detailPayload.draft?.id) {
            setDraftId(detailPayload.draft.id);
            setDraftStatus(
              detailPayload.draft.status ??
                deriveDraftStatus(detailPayload.draft.draft_values ?? nextValues, mode)
            );
          } else {
            setDraftId(null);
            setDraftStatus(deriveDraftStatus(nextValues, mode));
          }
          return;
        }

        const q = new URLSearchParams();
        if (sku) q.set("sku", sku);
        q.set("mode", mode);
        const res = await fetch(`/api/amazon/products/drafts?${q.toString()}`, { cache: "no-store" });
        const payload = (await res.json().catch(() => ({}))) as DraftApiPayload;
        if (payload.tableMissing) {
          setDraftTableMissing(true);
          return;
        }
        if (!res.ok) throw new Error(payload.error ?? "Entwurf konnte nicht geladen werden.");
        const item = payload.item ?? null;
        if (!item) {
          setDraftId(null);
          return;
        }
        setDraftId(item.id);
        setDraftValues(item.draft_values ?? emptyDraftValues());
        setDraftStatus(item.status ?? deriveDraftStatus(item.draft_values ?? emptyDraftValues(), mode));
      } catch (e) {
        setDraftError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      } finally {
        setDraftLoading(false);
      }
    },
    [t]
  );

  const openEditorForRow = useCallback(
    (row: MarketplaceProductListRow) => {
      const source = sourceSnapshotFromRow(row);
      setEditorMode("edit_existing");
      setEditorSource(row);
      setDraftId(null);
      const initial = draftValuesFromSource(source);
      setDraftValues(initial);
      setDraftStatus(deriveDraftStatus(initial, "edit_existing"));
      setEditorOpen(true);
      void loadDraft(row.sku, "edit_existing");
    },
    [loadDraft]
  );

  const openCreateEditor = useCallback(() => {
    setEditorMode("create_new");
    setEditorSource(null);
    setDraftId(null);
    const initial = emptyDraftValues();
    setDraftValues(initial);
    setDraftStatus("draft");
    setDraftError(null);
    setDraftTableMissing(false);
    setEditorOpen(true);
  }, []);

  const handleImageDrop = useCallback(
    async (dataTransfer: DataTransfer) => {
      const droppedUrls = [
        dataTransfer.getData("text/uri-list"),
        dataTransfer.getData("text/plain"),
      ]
        .join("\n")
        .split("\n")
        .map((x) => x.trim())
        .filter(isLikelyImageUrl);
      const files = Array.from(dataTransfer.files ?? [])
        .filter((file) => file.type.startsWith("image/"))
        .slice(0, AMAZON_DRAFT_IMAGE_MAX_FILES_PER_DROP);
      const tooLarge = files.find((file) => file.size > AMAZON_DRAFT_IMAGE_MAX_MB * 1024 * 1024);
      if (tooLarge) {
        setDraftError(`Bild zu groß: ${tooLarge.name}. Maximal ${AMAZON_DRAFT_IMAGE_MAX_MB} MB pro Datei.`);
        return;
      }
      let fileDataUrls: string[] = [];
      if (files.length > 0) {
        try {
          fileDataUrls = (await Promise.all(files.map((file) => readFileAsDataUrl(file)))).filter(Boolean);
        } catch (e) {
          setDraftError(e instanceof Error ? e.message : "Bilder konnten nicht verarbeitet werden.");
          return;
        }
      }
      if (droppedUrls.length === 0 && fileDataUrls.length === 0) return;
      setDraftValues((prev) => ({
        ...prev,
        images: [...prev.images, ...droppedUrls, ...fileDataUrls].slice(0, 20),
      }));
      setDraftError(null);
    },
    []
  );

  const columns = useMemo<Array<ColumnDef<MarketplaceProductListRow>>>(
    () => [
      {
        accessorKey: "sku",
        header: t("marketplaceProducts.sku"),
        meta: {
          thClassName: MARKETPLACE_PRODUCTS_COL_SKU,
          tdClassName: MARKETPLACE_PRODUCTS_COL_SKU,
          headerLabelClassName: "truncate",
          headerButtonClassName: "min-w-0 max-w-full",
        },
        cell: ({ row }) => (
          <span className="block truncate font-medium" title={row.original.sku || undefined}>
            {row.original.sku || "—"}
          </span>
        ),
      },
      {
        accessorKey: "secondaryId",
        header: t("marketplaceProducts.secondaryId"),
        meta: {
          thClassName: MARKETPLACE_PRODUCTS_COL_SECONDARY_ID,
          tdClassName: MARKETPLACE_PRODUCTS_COL_SECONDARY_ID,
          headerLabelClassName: "truncate",
          headerButtonClassName: "min-w-0 max-w-full",
        },
        cell: ({ row }) => (
          <span className="block truncate" title={row.original.secondaryId || undefined}>
            {row.original.secondaryId || "—"}
          </span>
        ),
      },
      {
        accessorKey: "title",
        header: t("marketplaceProducts.articleName"),
        meta: {
          thClassName: canEditProducts ? "w-[46%] min-w-0" : MARKETPLACE_PRODUCTS_COL_TITLE,
          tdClassName: canEditProducts ? "w-[46%] min-w-0" : MARKETPLACE_PRODUCTS_COL_TITLE,
          headerLabelClassName: "truncate",
          headerButtonClassName: "min-w-0 max-w-full",
        },
        cell: ({ row }) => {
          const raw = row.original.title || "";
          return (
            <span className="block min-w-0 truncate text-muted-foreground" title={raw || undefined}>
              {raw || "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "statusLabel",
        header: t("marketplaceProducts.status"),
        meta: {
          thClassName: `${MARKETPLACE_PRODUCTS_COL_STATUS} whitespace-nowrap`,
          tdClassName: `${MARKETPLACE_PRODUCTS_COL_STATUS} whitespace-nowrap`,
          headerLabelClassName: "truncate",
          headerButtonClassName: "min-w-0 max-w-full",
        },
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? "default" : "secondary"}>
            {row.original.isActive ? t("marketplaceProducts.active") : t("marketplaceProducts.inactive")}
          </Badge>
        ),
      },
      ...(canEditProducts
        ? ([
            {
              id: "editorAction",
              enableSorting: false,
              header: "",
              meta: {
                thClassName: "w-[12%] min-w-0 text-right",
                tdClassName: "w-[12%] min-w-0 text-right",
              },
              cell: ({ row }: { row: { original: MarketplaceProductListRow } }) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() => openEditorForRow(row.original)}
                >
                  <PencilLine className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Bearbeiten
                </Button>
              ),
            },
          ] satisfies Array<ColumnDef<MarketplaceProductListRow>>)
        : []),
    ],
    [t, canEditProducts, openEditorForRow]
  );

  const load = useCallback(
    async (forceRefresh = false, silent = false) => {
      const st = statusRef.current;
      const pi = serverPagination ? pageIndexRef.current : 0;
      const key = resolveCacheKey(st, pi);
      let hadCache = false;

      let myForegroundGen = 0;
      let mySilentGen = 0;
      let ac: AbortController;
      if (!silent) {
        foregroundLoadGenRef.current += 1;
        myForegroundGen = foregroundLoadGenRef.current;
        silentFetchAbortRef.current?.abort();
        fetchAbortRef.current?.abort();
        ac = new AbortController();
        fetchAbortRef.current = ac;
      } else {
        silentLoadGenRef.current += 1;
        mySilentGen = silentLoadGenRef.current;
        silentFetchAbortRef.current?.abort();
        ac = new AbortController();
        silentFetchAbortRef.current = ac;
      }

      const isStale = () =>
        silent ? mySilentGen !== silentLoadGenRef.current : myForegroundGen !== foregroundLoadGenRef.current;

      if (!forceRefresh && !silent) {
        const parsed = readLocalJsonCache<CachedProductsPayload>(key);
        if (parsed && Array.isArray(parsed.items)) {
          setRows(parsed.items);
          setPendingInfo(null);
          hadCache = true;
          setIsLoading(false);
          if (serverPagination && typeof parsed.totalCount === "number") {
            setTotalCount(parsed.totalCount);
          } else if (!serverPagination) {
            setTotalCount(parsed.items.length);
          }
        }
      }

      if (forceRefresh && !silent) {
        setIsLoading(true);
      } else if (!hadCache && !silent) {
        setIsLoading(true);
      }

      const showBackgroundIndicator = silent || (!forceRefresh && hadCache);
      if (showBackgroundIndicator) {
        setIsBackgroundSyncing(true);
      }

      if (!silent) {
        setError(null);
      }

      try {
        const url = buildRequestUrl(st, forceRefresh);
        const res = await fetch(url, { cache: "no-store", signal: ac.signal });
        const payload = (await res.json()) as ProductsApiPayload;

        if (isStale()) return;

        if (res.status === 202 && payload.pending) {
          reportPendingAttemptRef.current += 1;
          const attempt = reportPendingAttemptRef.current;
          setPendingInfo(payload.error ?? t("marketplaceProducts.reportPending"));
          if (!hadCache && rowsRef.current.length === 0) {
            setRows([]);
          }
          if (attempt > REPORT_PENDING_MAX_ATTEMPTS) {
            setError({
              message: t("marketplaceProducts.reportPendingGiveUp"),
            });
            setPendingInfo(null);
            reportPendingAttemptRef.current = 0;
            return;
          }
          const delayMs = Math.min(
            REPORT_PENDING_DELAY_CAP_MS,
            Math.round(3500 * Math.pow(1.38, attempt - 1))
          );
          if (reportPendingTimeoutRef.current != null) {
            window.clearTimeout(reportPendingTimeoutRef.current);
          }
          reportPendingTimeoutRef.current = window.setTimeout(() => {
            reportPendingTimeoutRef.current = null;
            void load(forceRefresh, silent);
          }, delayMs);
          return;
        }

        reportPendingAttemptRef.current = 0;
        if (reportPendingTimeoutRef.current != null) {
          window.clearTimeout(reportPendingTimeoutRef.current);
          reportPendingTimeoutRef.current = null;
        }

        if (!res.ok) {
          setError({
            message: payload.error ?? t("marketplaceProducts.loadFailed"),
            missingKeys: payload.missingKeys,
            hint: payload.hint,
          });
          setRows([]);
          if (serverPagination) setTotalCount(null);
          return;
        }
        setPendingInfo(null);
        const nextItems = payload.items ?? [];
        setRows(nextItems);
        if (serverPagination && typeof payload.totalCount === "number") {
          setTotalCount(payload.totalCount);
        } else if (!serverPagination) {
          setTotalCount(nextItems.length);
        }
        writeLocalJsonCache(key, {
          savedAt: Date.now(),
          items: nextItems,
          totalCount: serverPagination ? payload.totalCount : undefined,
        } satisfies CachedProductsPayload);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        if (silent) {
          console.warn("[Marketplace Produkte] Hintergrund-Abgleich fehlgeschlagen:", e);
        } else {
          setRows([]);
          setError({
            message: e instanceof Error ? e.message : t("commonUi.unknownError"),
          });
        }
      } finally {
        if (isStale()) return;
        if (!silent) {
          setIsLoading(false);
        }
        if (showBackgroundIndicator) {
          setIsBackgroundSyncing(false);
        }
      }
    },
    [buildRequestUrl, resolveCacheKey, serverPagination, t]
  );

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    statusRef.current = status;
    pageIndexRef.current = pageIndex;
  }, [status, pageIndex]);

  useEffect(() => {
    if (amazonStatusFilter && pageIndex !== 0) {
      // Statuswechsel soll nach Page-Reset weiterhin mit forceRefresh laden.
      pendingForcedRefreshRef.current = true;
      setPageIndex(0);
    }
  }, [status, amazonStatusFilter, pageIndex]);

  useEffect(() => {
    const prev = lastLoadParamsRef.current;
    let forceRefresh = prev == null ? false : prev.status !== status;
    if (pendingForcedRefreshRef.current) {
      forceRefresh = true;
      pendingForcedRefreshRef.current = false;
    }
    lastLoadParamsRef.current = { status, pageIndex };
    void load(forceRefresh, false);
  }, [status, pageIndex, load]);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      void load(false, true);
    }, backgroundSyncIntervalMs);
    return () => window.clearInterval(id);
  }, [hasMounted, load, backgroundSyncIntervalMs]);

  useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort();
      silentFetchAbortRef.current?.abort();
      if (reportPendingTimeoutRef.current != null) {
        window.clearTimeout(reportPendingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={DASHBOARD_PAGE_SHELL}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className={cn("flex items-center gap-2", titleRowGapClassName)}>
            <span className={cn(DASHBOARD_MARKETPLACE_LOGO_FRAME, logoFrameClassName)}>
              <img
                src={logoSrc}
                alt={brandAlt}
                className={DASHBOARD_MARKETPLACE_LOGO_IMG_IN_FRAME}
                loading="eager"
              />
            </span>
            <span className={cn(DASHBOARD_PAGE_TITLE, "text-muted-foreground")}>
              {t("marketplaceProducts.productsWord")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {canEditProducts ? (
              <Button type="button" variant="outline" size="sm" onClick={openCreateEditor} className="h-8 gap-1.5">
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Artikel anlegen
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isLoading}
              onClick={() => void load(true, false)}
              className="h-8 gap-1.5"
            >
              <RotateCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} aria-hidden />
              {t("priceParity.refresh")}
            </Button>
            {!isLoading ? (
              <p className="text-sm text-muted-foreground">
                {t("marketplaceProducts.totalCount", { count: totalArticlesLabel })}
              </p>
            ) : null}
            {isBackgroundSyncing ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t("marketplaceProducts.syncing")}
              </span>
            ) : null}
          </div>
        </div>
        {subtitleKey ? (
          <p className="text-sm text-muted-foreground">{t(subtitleKey)}</p>
        ) : null}
      </div>

      {amazonStatusFilter ? (
        <div className={cn(DASHBOARD_COMPACT_CARD, "flex flex-row flex-wrap items-end gap-3")}>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t("marketplaceProducts.filterStatus")}</p>
            <Select value={status} onValueChange={(value) => setStatus(value as ProductStatus)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t("marketplaceProducts.active")}</SelectItem>
                <SelectItem value="inactive">{t("marketplaceProducts.inactive")}</SelectItem>
                <SelectItem value="all">{t("marketplaceProducts.all")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          <p className="font-medium">{error.message}</p>
          {error.missingKeys && error.missingKeys.length > 0 ? (
            <p className="font-mono text-xs text-red-800/90">
              {t("marketplaceProducts.missingEnvVars", { keys: error.missingKeys.join(", ") })}
            </p>
          ) : null}
          {error.hint ? <p className="text-xs leading-relaxed text-red-900/80">{error.hint}</p> : null}
        </div>
      ) : null}

      {pendingInfo ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700">
          {pendingInfo}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground">
          {t("marketplaceProducts.loading")}
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={rows}
            filterColumn={t("filters.skuAsinOrTitle")}
            paginate={!serverPagination}
            defaultPageSize={pageSizeProp}
            getRowId={(row) => `${row.sku}\u0000${row.secondaryId}`}
            compact
            className="flex-1 min-h-0"
            tableWrapClassName="min-h-0 [&_[data-slot=table-head]]:!h-5 [&_[data-slot=table-head]]:!px-0.5 [&_[data-slot=table-head]]:!py-0 [&_[data-slot=table-head]]:!text-[9px] [&_[data-slot=table-cell]]:!px-0.5 [&_[data-slot=table-cell]]:!py-0 [&_[data-slot=table-cell]]:!text-[10px]"
            tableClassName={MARKETPLACE_PRODUCTS_TABLE_CLASS}
          />
          {serverPagination && totalCount != null && totalCount > pageSizeProp ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {t("dataTable.pageOf", {
                  current: String(pageIndex + 1),
                  total: String(Math.max(1, Math.ceil(totalCount / pageSizeProp))),
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pageIndex <= 0}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                >
                  {t("dataTable.prev")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={(pageIndex + 1) * pageSizeProp >= totalCount}
                  onClick={() => setPageIndex((p) => p + 1)}
                >
                  {t("dataTable.next")}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[96vh] w-[min(96rem,calc(100vw-1.25rem))] max-w-[calc(100%-1rem)] overflow-y-auto sm:max-w-none">
          <DialogHeader>
            <DialogTitle>
              {editorMode === "create_new" ? "Neuen Amazon-Artikel vorbereiten" : "Amazon-Artikel bearbeiten"}
            </DialogTitle>
            <DialogDescription>
              Entwurf im Dashboard. Es wird noch nichts an Amazon übertragen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
              Pflichtfelder bei Amazon sind je Kategorie/Produkttyp unterschiedlich. Diese Maske deckt die
              allgemeinen Kernfelder ab; kategoriespezifische Attribute folgen im nächsten Schritt.
            </div>
            {draftTableMissing ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                Tabelle für Produkt-Entwürfe fehlt. Bitte Supabase-Migration ausführen.
              </div>
            ) : null}
            {draftError ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
                {draftError}
              </div>
            ) : null}
            {editorMode === "create_new" && missingRequiredFields.length > 0 ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800">
                <p className="font-medium">Für Amazon fehlen noch Pflichtfelder:</p>
                <p className="mt-1 text-xs">{missingRequiredFields.map((x) => x.label).join(" • ")}</p>
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">SKU</span>
                <Input
                  value={draftValues.sku}
                  onChange={(e) => setDraftValues((prev) => ({ ...prev, sku: e.target.value }))}
                  placeholder="z. B. ASTRO-123"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">ASIN</span>
                <Input
                  value={draftValues.asin}
                  onChange={(e) => setDraftValues((prev) => ({ ...prev, asin: e.target.value }))}
                  placeholder="z. B. B0..."
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Produkttyp (Amazon)</span>
                <Select
                  value={draftValues.productType || "__none__"}
                  onValueChange={(value) =>
                    setDraftValues((prev) => ({
                      ...prev,
                      productType: !value || value === "__none__" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Produkttyp wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nicht gewählt</SelectItem>
                    {productTypeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.value} - {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Marke</span>
                <Input
                  value={draftValues.brand}
                  onChange={(e) => setDraftValues((prev) => ({ ...prev, brand: e.target.value }))}
                  placeholder="Brand"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Zustand</span>
                <Select
                  value={draftValues.conditionType || "new_new"}
                  onValueChange={(value) =>
                    setDraftValues((prev) => ({ ...prev, conditionType: value ?? "new_new" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new_new">Neu</SelectItem>
                    <SelectItem value="used_like_new">Gebraucht – Wie neu</SelectItem>
                    <SelectItem value="used_very_good">Gebraucht – Sehr gut</SelectItem>
                    <SelectItem value="used_good">Gebraucht – Gut</SelectItem>
                    <SelectItem value="used_acceptable">Gebraucht – Akzeptabel</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Externe Produkt-ID</span>
                <Input
                  value={draftValues.externalProductId}
                  onChange={(e) => setDraftValues((prev) => ({ ...prev, externalProductId: e.target.value }))}
                  placeholder="EAN/UPC/GTIN/ISBN"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">ID-Typ</span>
                <Select
                  value={draftValues.externalProductIdType}
                  onValueChange={(value) =>
                    setDraftValues((prev) => ({
                      ...prev,
                      externalProductIdType: value as "ean" | "upc" | "gtin" | "isbn" | "none",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ean">EAN</SelectItem>
                    <SelectItem value="upc">UPC</SelectItem>
                    <SelectItem value="gtin">GTIN</SelectItem>
                    <SelectItem value="isbn">ISBN</SelectItem>
                    <SelectItem value="none">Keine (GTIN exemption)</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Preis (EUR)</span>
                <Input
                  value={draftValues.listPriceEur}
                  onChange={(e) => setDraftValues((prev) => ({ ...prev, listPriceEur: e.target.value }))}
                  placeholder="z. B. 29.99"
                  inputMode="decimal"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Bestand</span>
                <Input
                  value={draftValues.quantity}
                  onChange={(e) => setDraftValues((prev) => ({ ...prev, quantity: e.target.value }))}
                  placeholder="z. B. 120"
                  inputMode="numeric"
                />
              </label>
            </div>
            {selectedProductTypeSchema ? (
              <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="text-sm font-medium">
                  Kategorieattribute ({selectedProductTypeSchema.label})
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {selectedProductTypeSchema.attributes.map((field) => (
                    <label key={field.key} className="space-y-1 text-sm">
                      <span className="text-muted-foreground">
                        {field.label}
                        {field.required ? " *" : ""}
                      </span>
                      <Input
                        value={draftValues.attributes[field.key] ?? ""}
                        onChange={(e) =>
                          setDraftValues((prev) => ({
                            ...prev,
                            attributes: {
                              ...prev.attributes,
                              [field.key]: e.target.value,
                            },
                          }))
                        }
                        placeholder={field.placeholder}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Titel</span>
              <Input
                value={draftValues.title}
                onChange={(e) => setDraftValues((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Produkttitel"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Beschreibung</span>
              <Textarea
                value={draftValues.description}
                onChange={(e) => setDraftValues((prev) => ({ ...prev, description: e.target.value }))}
                className="min-h-[120px]"
                placeholder="Lange Beschreibung"
              />
            </label>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Bulletpoints</p>
              {[0, 1, 2, 3, 4].map((idx) => (
                <Input
                  key={`bp-${idx}`}
                  value={draftValues.bulletPoints[idx] ?? ""}
                  onChange={(e) =>
                    setDraftValues((prev) => {
                      const next = [...prev.bulletPoints];
                      next[idx] = e.target.value;
                      return { ...prev, bulletPoints: next };
                    })
                  }
                  placeholder={`Bulletpoint ${idx + 1}`}
                />
              ))}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Bilder (URLs)</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraftValues((prev) => ({ ...prev, images: [...prev.images, ""] }))
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Bild hinzufügen
                </Button>
              </div>
              <div
                className={cn(
                  "rounded-md border border-dashed p-4 text-center text-sm transition-colors",
                  imageDropActive
                    ? "border-primary/70 bg-primary/5 text-foreground"
                    : "border-border/70 bg-muted/20 text-muted-foreground"
                )}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setImageDropActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!imageDropActive) setImageDropActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setImageDropActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setImageDropActive(false);
                  void handleImageDrop(e.dataTransfer);
                }}
              >
                <Upload className="mx-auto mb-2 h-5 w-5" aria-hidden />
                Bilder hier hineinziehen (Dateien oder Bild-URLs). Max. {AMAZON_DRAFT_IMAGE_MAX_MB} MB pro Datei.
              </div>
              {(draftValues.images.length ? draftValues.images : [""]).map((url, idx) => (
                <div key={`img-${idx}`} className="flex items-center gap-2">
                  <Input
                    value={url}
                    onChange={(e) =>
                      setDraftValues((prev) => {
                        const next = [...prev.images];
                        next[idx] = e.target.value;
                        return { ...prev, images: next };
                      })
                    }
                    placeholder="https://..."
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      setDraftValues((prev) => ({
                        ...prev,
                        images: prev.images.filter((_, imageIdx) => imageIdx !== idx),
                      }))
                    }
                    aria-label="Bild entfernen"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
              {draftValues.images.filter(Boolean).length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {draftValues.images
                    .filter(Boolean)
                    .slice(0, 8)
                    .map((img) => (
                      <a
                        key={img}
                        href={img}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block overflow-hidden rounded-md border border-border/60"
                      >
                        <img src={img} alt="Produktbild" className="h-24 w-full object-cover" loading="lazy" />
                      </a>
                    ))}
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Status: {draftLoading ? "lädt..." : draftStatus === "ready" ? "bereit" : "Entwurf"}
              {editorMode === "create_new" && missingRequiredFields.length > 0
                ? ` • ${missingRequiredFields.length} Pflichtfeld(er) fehlen`
                : ""}
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
                Schließen
              </Button>
              <Button type="button" onClick={() => void saveDraft()} disabled={draftSaving || draftLoading}>
                {draftSaving ? "Speichert..." : "Entwurf speichern"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
