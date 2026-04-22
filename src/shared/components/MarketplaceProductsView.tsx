"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Loader2,
  PencilLine,
  Plus,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DataTable } from "@/shared/components/DataTable";
import {
  MarketplaceProductShellDialog,
  type MarketplaceProductShellMode,
} from "@/shared/components/MarketplaceProductShellDialog";
import CrossListingEditorDialog from "@/app/(dashboard)/analytics/marketplaces/components/CrossListingEditorDialog";
import type { CrossListingTargetSlug } from "@/shared/lib/crossListing/crossListingDraftTypes";
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
import { postMarketplaceIntegrationCacheRefresh } from "@/shared/lib/marketplaceIntegrationCacheRefreshClient";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";
import {
  marketplaceProductRowId,
  mergeMarketplaceProductClientLists,
} from "@/shared/lib/marketplaceProductClientMerge";
import { useStableTableRowsDuringFetch } from "@/shared/lib/useStableTableRowsDuringFetch";
import { useUser } from "@/shared/hooks/useUser";
import {
  AMAZON_DRAFT_IMAGE_SLOT_COUNT,
  padAmazonDraftImages,
} from "@/shared/lib/amazonProductDraft";
import { getAmazonProductTypeOptions } from "@/shared/lib/amazonProductTypeSchema";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";
import dynamic from "next/dynamic";
import { useAmazonContentAudit } from "@/shared/hooks/useAmazonContentAudit";
import { useAmazonDraftEditor } from "@/shared/hooks/useAmazonDraftEditor";
import { AmazonSubmitPreviewDialog } from "@/shared/components/AmazonSubmitPreviewDialog";

// Dynamic import: AmazonProductEditor ist ~1.100 Zeilen und nur bei aktivem Editor relevant.
// Reduziert Initial-Bundle der Produktseiten merklich.
const AmazonProductEditor = dynamic(
  () => import("@/shared/components/AmazonProductEditor").then((m) => m.AmazonProductEditor),
  { ssr: false }
);

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


export type MarketplaceProductsViewProps = {
  /** Feste URL oder Builder bei Amazon-Statusfilter */
  apiUrl: string | ((status: ProductStatus) => string);
  cacheKey: string | ((status: ProductStatus, pageIndex?: number) => string);
  logoSrc: string;
  brandAlt: string;
  /**
   * Marktplatz-Kennung für das Artikel-Shell-Layout (`shopify`, `ebay`, `mediamarkt-saturn`, …).
   */
  marketplaceSlug: string;
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
   * Ohne: eine API-Antwort; Tabellen-Pagination steuert `dataTablePaginate`.
   */
  serverPagination?: boolean;
  /** Zeilen pro Seite (nur bei `serverPagination` oder wenn `dataTablePaginate` true und DataTable paginiert). */
  pageSize?: number;
  /**
   * DataTable-interne Seiten (nur sichtbarer Ausschnitt). `false` = alle Zeilen, nur vertikal scrollen.
   * Standard: `true`, außer bei `serverPagination` (dann untere Seiten-Buttons).
   */
  dataTablePaginate?: boolean;
  /**
   * Hintergrund-Abgleich (Standard 5 Min). Für schwere Listen (z. B. Amazon SP-API) ggf. höher setzen.
   */
  backgroundSyncIntervalMs?: number;
  /** Vorbereitung Produkteditor (Owner) – aktuell nur für Amazon vorgesehen. */
  enableAmazonEditor?: boolean;
  /**
   * Amazon-Country-Slug (z. B. "amazon-fr"). Lädt länderspezifische Detail-Inhalte
   * im Editor. Default: "amazon" (DE).
   */
  amazonSlug?: string;
  /**
   * Zentrales Artikel-Popup (Stammdaten + Platzhalter für marktplatzspezifische Felder).
   * Standard: an, sobald kein `enableAmazonEditor` (Volleditor nur Amazon-Owner).
   */
  productShellEnabled?: boolean;
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
  marketplaceSlug,
  logoFrameClassName,
  titleRowGapClassName,
  subtitleKey,
  amazonStatusFilter = false,
  serverPagination = false,
  pageSize: pageSizeProp = 50,
  dataTablePaginate,
  backgroundSyncIntervalMs = DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  enableAmazonEditor = false,
  amazonSlug,
  productShellEnabled: productShellEnabledProp,
}: MarketplaceProductsViewProps) {
  const { t, locale } = useTranslation();
  const user = useUser();
  const isOwner = !user.isLoading && user.roleKey?.toLowerCase() === "owner";
  const canEditProducts = enableAmazonEditor && isOwner;
  const useProductShell = productShellEnabledProp ?? !enableAmazonEditor;
  const tablePaginate = dataTablePaginate ?? !serverPagination;
  const [status, setStatus] = useState<ProductStatus>("active");
  const [pageIndex, setPageIndex] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [rows, setRows] = useState<MarketplaceProductListRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [isIntegrationRefresh, setIsIntegrationRefresh] = useState(false);
  const [error, setError] = useState<{ message: string; missingKeys?: string[]; hint?: string } | null>(
    null
  );
  const [pendingInfo, setPendingInfo] = useState<string | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [imageDropActive, setImageDropActive] = useState(false);
  const [shellOpen, setShellOpen] = useState(false);
  const [submitPreviewOpen, setSubmitPreviewOpen] = useState(false);
  const [shellMode, setShellMode] = useState<MarketplaceProductShellMode>("edit");
  const [shellRow, setShellRow] = useState<MarketplaceProductListRow | null>(null);
  const [crossEditOpen, setCrossEditOpen] = useState(false);
  const [crossEditSku, setCrossEditSku] = useState<string | null>(null);

  const crossListingEditSlug: CrossListingTargetSlug | null = useMemo(() => {
    const supported: CrossListingTargetSlug[] = [
      "otto",
      "kaufland",
      "fressnapf",
      "zooplus",
      "mediamarkt-saturn",
    ];
    return (supported as string[]).includes(marketplaceSlug)
      ? (marketplaceSlug as CrossListingTargetSlug)
      : null;
  }, [marketplaceSlug]);

  // --- Draft-editor ↔ Content-audit hook wiring ---
  // The draft-editor hook needs audit callbacks from the content-audit hook,
  // while the content-audit hook needs draftValues from the draft-editor hook.
  // We break this circular dependency by:
  //  1. Calling the draft-editor hook first with no-op stubs for audit callbacks.
  //  2. Calling the content-audit hook second, feeding it the draft-editor's draftValues.
  //  3. Updating the audit callback ref so the draft-editor's internal refs
  //     pick up the real implementations on the next render.
  // All draft-editor callbacks that use audit functions are user-triggered,
  // so the one-render delay before the real callbacks are wired is harmless.
  const auditNoop = useCallback(async () => {}, []);
  const auditSetNoop = useCallback(() => {}, []);
  const auditCallbacksRef = useRef<{
    fetchContentAudit: (sku: string, opts?: { refresh?: boolean }) => Promise<void>;
    setAuditPayload: (v: null) => void;
    setAuditError: (v: null) => void;
    setAuditLoading: (v: false) => void;
  }>({
    fetchContentAudit: auditNoop,
    setAuditPayload: auditSetNoop,
    setAuditError: auditSetNoop,
    setAuditLoading: auditSetNoop,
  });

  const {
    editorOpen,
    setEditorOpen,
    editorMode,
    draftValues,
    setDraftValues,
    draftStatus,
    draftLoading,
    draftSaving,
    draftError,
    setDraftError,
    draftTableMissing,
    detailLoadHint,
    missingTranslations,
    targetLanguageTag,
    sourceSnapshotForTranslation,
    submitSending,
    submitResult,
    saveDraft,
    submitToAmazon,
    openEditorForRow,
    openCreateEditor,
  } = useAmazonDraftEditor({
    marketplaceSlug,
    amazonSlug,
    canEditProducts,
    locale,
    fetchContentAudit: auditCallbacksRef.current.fetchContentAudit,
    setAuditPayload: auditCallbacksRef.current.setAuditPayload,
    setAuditError: auditCallbacksRef.current.setAuditError,
    setAuditLoading: auditCallbacksRef.current.setAuditLoading,
    closeShellDialog: () => setShellOpen(false),
    t,
  });

  const {
    auditPayload,
    auditLoading,
    auditError,
    contentAuditSuggestions,
    displayedContentAuditFindings,
    fetchContentAudit,
    setAuditPayload,
    setAuditError,
    setAuditLoading,
  } = useAmazonContentAudit({
    marketplaceSlug,
    amazonSlug,
    canEditProducts,
    draftValues: {
      title: draftValues.title,
      brand: draftValues.brand,
      description: draftValues.description,
      bulletPoints: draftValues.bulletPoints,
      externalProductId: draftValues.externalProductId,
      productType: draftValues.productType,
      packageLength: draftValues.packageLength,
      packageWidth: draftValues.packageWidth,
      packageHeight: draftValues.packageHeight,
      packageWeight: draftValues.packageWeight,
    },
  });
  // Wire real audit callbacks so the draft-editor picks them up via refs.
  auditCallbacksRef.current.fetchContentAudit = fetchContentAudit;
  auditCallbacksRef.current.setAuditPayload = setAuditPayload;
  auditCallbacksRef.current.setAuditError = setAuditError;
  auditCallbacksRef.current.setAuditLoading = setAuditLoading;
  const statusRef = useRef(status);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);

  const amazonImageSlots = useMemo(() => padAmazonDraftImages(draftValues.images), [draftValues.images]);
  const filledAmazonImageIndices = useMemo(
    () =>
      amazonImageSlots
        .map((url, idx) => ({ url: url.trim(), idx }))
        .filter((entry) => Boolean(entry.url))
        .map((entry) => entry.idx),
    [amazonImageSlots]
  );
  const canAddMoreAmazonImages = filledAmazonImageIndices.length < AMAZON_DRAFT_IMAGE_SLOT_COUNT;
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
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const tableRows = useStableTableRowsDuringFetch({
    rows,
    isFetchActive: isLoading || isBackgroundSyncing,
  });

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
    (st: ProductStatus) => {
      const base = typeof apiUrl === "function" ? apiUrl(st) : apiUrl;
      const u = new URL(base, typeof window !== "undefined" ? window.location.origin : "http://localhost");
      if (serverPagination) {
        u.searchParams.set("limit", String(pageSizeProp));
        u.searchParams.set("offset", String(pageIndexRef.current * pageSizeProp));
      }
      return `${u.pathname}${u.search}`;
    },
    [apiUrl, serverPagination, pageSizeProp]
  );

  /** Ein Aufruf ohne Pagination (Amazon: `all=1`), damit „Artikel bearbeiten“ den API-Datensatz zur SKU findet. */
  const productsShellListUrl = useMemo(() => {
    const base = typeof apiUrl === "function" ? apiUrl(status) : apiUrl;
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    try {
      const u = new URL(base, origin);
      u.searchParams.delete("limit");
      u.searchParams.delete("offset");
      if (u.pathname === "/api/amazon/products" || /^\/api\/amazon\/[^/]+\/products$/.test(u.pathname)) {
        u.searchParams.set("all", "1");
      }
      return `${u.pathname}${u.search}`;
    } catch {
      return base;
    }
  }, [apiUrl, status]);

  const totalArticlesLabel = useMemo(() => {
    const n = serverPagination && totalCount != null ? totalCount : tableRows.length;
    return new Intl.NumberFormat(intlLocaleTag(locale)).format(n);
  }, [serverPagination, totalCount, tableRows.length, locale]);

  const openShellForRow = useCallback(
    (row: MarketplaceProductListRow) => {
      setEditorOpen(false);
      setShellMode("edit");
      setShellRow(row);
      setShellOpen(true);
    },
    [setEditorOpen, setShellMode, setShellRow, setShellOpen]
  );

  const openCrossListingEditorForRow = useCallback(
    (row: MarketplaceProductListRow) => {
      if (!row.sku) return;
      setEditorOpen(false);
      setShellOpen(false);
      setCrossEditSku(row.sku);
      setCrossEditOpen(true);
    },
    [setEditorOpen]
  );

  const openShellCreate = useCallback(
    () => {
      setEditorOpen(false);
      setShellMode("create");
      setShellRow(null);
      setShellOpen(true);
    },
    [setEditorOpen, setShellMode, setShellRow, setShellOpen]
  );

  const appendIncomingImages = useCallback(
    (incoming: string[]) => {
      if (incoming.length === 0) return;
      setDraftValues((prev) => {
        const slots = padAmazonDraftImages(prev.images);
        let i = 0;
        for (let s = 0; s < AMAZON_DRAFT_IMAGE_SLOT_COUNT && i < incoming.length; s += 1) {
          if (!slots[s].trim()) {
            slots[s] = incoming[i];
            i += 1;
          }
        }
        return { ...prev, images: slots };
      });
      setDraftError(null);
    },
    [setDraftValues, setDraftError]
  );

  const readImageFilesAsDataUrls = useCallback(async (fileList: File[]) => {
    const files = fileList
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, AMAZON_DRAFT_IMAGE_MAX_FILES_PER_DROP);
    const tooLarge = files.find((file) => file.size > AMAZON_DRAFT_IMAGE_MAX_MB * 1024 * 1024);
    if (tooLarge) {
      throw new Error(`Bild zu groß: ${tooLarge.name}. Maximal ${AMAZON_DRAFT_IMAGE_MAX_MB} MB pro Datei.`);
    }
    return (await Promise.all(files.map((file) => readFileAsDataUrl(file)))).filter(Boolean);
  }, []);

  const handleImageDrop = useCallback(
    async (dataTransfer: DataTransfer) => {
      const droppedUrls = [dataTransfer.getData("text/uri-list"), dataTransfer.getData("text/plain")]
        .join("\n")
        .split("\n")
        .map((x) => x.trim())
        .filter(isLikelyImageUrl);
      try {
        const fileDataUrls = await readImageFilesAsDataUrls(Array.from(dataTransfer.files ?? []));
        appendIncomingImages([...droppedUrls, ...fileDataUrls]);
      } catch (e) {
        setDraftError(e instanceof Error ? e.message : "Bilder konnten nicht verarbeitet werden.");
      }
    },
    [appendIncomingImages, readImageFilesAsDataUrls, setDraftError]
  );

  const handleImageFileInputChange = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      try {
        const fileDataUrls = await readImageFilesAsDataUrls(Array.from(files));
        appendIncomingImages(fileDataUrls);
      } catch (e) {
        setDraftError(e instanceof Error ? e.message : "Bilder konnten nicht verarbeitet werden.");
      }
    },
    [appendIncomingImages, readImageFilesAsDataUrls, setDraftError]
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
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditorForRow(row.original);
                  }}
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
    async (forceRefresh = false, silent = false, skipLocalHydration = false) => {
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

      if (!forceRefresh && !silent && !skipLocalHydration) {
        const parsed = readLocalJsonCache<CachedProductsPayload>(key);
        if (parsed && Array.isArray(parsed.items)) {
          const dedupedFromCache = mergeMarketplaceProductClientLists([], parsed.items);
          setRows(dedupedFromCache);
          setPendingInfo(null);
          hadCache = true;
          setIsLoading(false);
          if (serverPagination && typeof parsed.totalCount === "number") {
            setTotalCount(parsed.totalCount);
          } else if (!serverPagination) {
            setTotalCount(dedupedFromCache.length);
          }
        }
      }

      const hasAnyRows = hadCache || rowsRef.current.length > 0;
      if (forceRefresh && !silent && !hasAnyRows) {
        setIsLoading(true);
      } else if (!hasAnyRows && !silent) {
        setIsLoading(true);
      } else if (!silent) {
        setIsLoading(false);
      }

      const showBackgroundIndicator = silent || hasAnyRows;
      if (showBackgroundIndicator) {
        setIsBackgroundSyncing(true);
      }

      if (!silent) {
        setError(null);
      }

      try {
        const url = buildRequestUrl(st);
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
            void load(forceRefresh, silent, skipLocalHydration);
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
          if (rowsRef.current.length === 0) {
            setRows([]);
            if (serverPagination) setTotalCount(null);
          }
          return;
        }
        setPendingInfo(null);
        const nextItems = payload.items ?? [];
        let mergedForCache: MarketplaceProductListRow[] = [];
        setRows((prev) => {
          mergedForCache = serverPagination
            ? mergeMarketplaceProductClientLists([], nextItems)
            : mergeMarketplaceProductClientLists(prev, nextItems);
          return mergedForCache;
        });
        if (serverPagination && typeof payload.totalCount === "number") {
          setTotalCount(payload.totalCount);
        } else if (!serverPagination) {
          setTotalCount(mergedForCache.length);
        }
        writeLocalJsonCache(key, {
          savedAt: Date.now(),
          items: mergedForCache,
          totalCount: serverPagination ? payload.totalCount : undefined,
        } satisfies CachedProductsPayload);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        if (silent) {
          console.warn("[Marketplace Produkte] Hintergrund-Abgleich fehlgeschlagen:", e);
        } else {
          if (rowsRef.current.length === 0) {
            setRows([]);
          }
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

  const handleIntegrationCacheRefreshProducts = useCallback(async () => {
    setIsIntegrationRefresh(true);
    try {
      const json = await postMarketplaceIntegrationCacheRefresh({
        marketplace: amazonSlug && amazonSlug !== "amazon" ? amazonSlug : marketplaceSlug,
        resource: "products",
      });
      const pr = json.products as { ok?: boolean; skipped?: string; error?: string } | undefined;
      if (pr?.ok === false && pr.error) {
        throw new Error(pr.error);
      }
      if (pr?.ok === false && pr.skipped) {
        toast.info(pr.skipped);
      } else {
        toast.success(t("marketplaceCache.refreshOk"));
      }
      await load(false, false, true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("marketplaceCache.refreshFailed"));
    } finally {
      setIsIntegrationRefresh(false);
    }
  }, [load, marketplaceSlug, amazonSlug, t]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    statusRef.current = status;
    pageIndexRef.current = pageIndex;
  }, [status, pageIndex]);

  useEffect(() => {
    if (!amazonStatusFilter) return;
    setPageIndex(0);
  }, [status, amazonStatusFilter]);

  useEffect(() => {
    void load(false, false);
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
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
                {t("marketplaceProducts.createArticle")}
              </Button>
            ) : useProductShell ? (
              <Button type="button" variant="outline" size="sm" onClick={openShellCreate} className="h-8 gap-1.5">
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t("marketplaceProducts.createArticle")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isLoading || isIntegrationRefresh}
              onClick={() => void handleIntegrationCacheRefreshProducts()}
              className="h-8 gap-1.5"
            >
              <RotateCw
                className={cn("h-3.5 w-3.5", (isLoading || isIntegrationRefresh) && "animate-spin")}
                aria-hidden
              />
              {isIntegrationRefresh ? t("marketplaceCache.refreshing") : t("marketplaceCache.refresh")}
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

      {isLoading && tableRows.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground">
          {t("productListShared.loading", { marketplace: brandAlt })}
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={tableRows}
            filterColumn={t("filters.skuAsinOrTitle")}
            paginate={tablePaginate}
            defaultPageSize={pageSizeProp}
            getRowId={(row) => marketplaceProductRowId(row)}
            onRowClick={
              canEditProducts
                ? (row) => openEditorForRow(row)
                : crossListingEditSlug
                  ? (row) => openCrossListingEditorForRow(row)
                  : useProductShell
                    ? (row) => openShellForRow(row)
                    : undefined
            }
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
      {useProductShell && !crossListingEditSlug ? (
        <MarketplaceProductShellDialog
          open={shellOpen}
          onOpenChange={setShellOpen}
          mode={shellMode}
          row={shellRow}
          marketplaceLabel={brandAlt}
          marketplaceSlug={marketplaceSlug}
          logoSrc={logoSrc}
          productsListApiUrl={useProductShell ? productsShellListUrl : null}
        />
      ) : null}
      {crossListingEditSlug ? (
        <CrossListingEditorDialog
          open={crossEditOpen}
          sku={crossEditSku}
          targetSlug={crossListingEditSlug}
          existingDraft={null}
          onClose={() => setCrossEditOpen(false)}
          onSaved={() => setCrossEditOpen(false)}
        />
      ) : null}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <AmazonProductEditor
          draftValues={draftValues}
          draftLoading={draftLoading}
          draftSaving={draftSaving}
          draftError={draftError}
          draftTableMissing={draftTableMissing}
          draftStatus={draftStatus}
          detailLoadHint={detailLoadHint}
          editorMode={editorMode}
          auditPayload={auditPayload}
          auditLoading={auditLoading}
          auditError={auditError}
          contentAuditSuggestions={contentAuditSuggestions}
          displayedContentAuditFindings={displayedContentAuditFindings}
          onClose={() => setEditorOpen(false)}
          onSave={saveDraft}
          onSubmitToAmazon={
            canEditProducts
              ? async () => {
                  setSubmitPreviewOpen(true);
                }
              : undefined
          }
          submitSending={submitSending}
          submitResultSummary={
            submitResult
              ? submitResult.ok
                ? `Auf Amazon übertragen (${submitResult.status}${submitResult.sandbox ? ", Sandbox" : ""})`
                : `Fehler: ${submitResult.error ?? submitResult.issues[0]?.message ?? submitResult.status}`
              : null
          }
          onSetDraftValues={setDraftValues}
          onFetchContentAudit={fetchContentAudit}
          logoSrc={logoSrc}
          marketplaceSlug={marketplaceSlug}
          amazonSlug={amazonSlug}
          missingTranslations={missingTranslations}
          targetLanguageTag={targetLanguageTag}
          sourceSnapshotForTranslation={sourceSnapshotForTranslation}
          canEditProducts={canEditProducts}
          imageDropActive={imageDropActive}
          onSetImageDropActive={setImageDropActive}
          imageFileInputRef={imageFileInputRef}
          amazonImageSlots={amazonImageSlots}
          filledAmazonImageIndices={filledAmazonImageIndices}
          canAddMoreAmazonImages={canAddMoreAmazonImages}
          productTypeOptions={productTypeOptions}
          onImageDrop={handleImageDrop}
          onImageFileInputChange={handleImageFileInputChange}
        />
      </Dialog>
      <AmazonSubmitPreviewDialog
        open={submitPreviewOpen}
        onOpenChange={setSubmitPreviewOpen}
        draftValues={draftValues}
        originalSnapshot={sourceSnapshotForTranslation}
        amazonSlug={amazonSlug ?? "amazon-de"}
        submitting={submitSending}
        submitResult={submitResult}
        onConfirm={async () => {
          const result = await submitToAmazon();
          if (result?.ok) setSubmitPreviewOpen(false);
        }}
      />
    </div>
  );
}
