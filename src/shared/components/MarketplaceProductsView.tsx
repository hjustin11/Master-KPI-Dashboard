"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Maximize2,
  PencilLine,
  Plus,
  RotateCw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
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
import { MarketplaceProductEditorDialogContent } from "@/shared/components/MarketplaceProductEditorDialogContent";
import {
  MARKETPLACE_PRODUCT_EDITOR_BODY_PADDING_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_CONTROL as AMAZON_EDITOR_CONTROL,
  MARKETPLACE_PRODUCT_EDITOR_FIELD as AMAZON_EDITOR_FIELD,
  MARKETPLACE_PRODUCT_EDITOR_FOOTER_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_HEADER_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_HINT as AMAZON_EDITOR_HINT,
  MARKETPLACE_PRODUCT_EDITOR_H3 as AMAZON_EDITOR_H3,
  MARKETPLACE_PRODUCT_EDITOR_LABEL as AMAZON_EDITOR_LABEL,
  MARKETPLACE_PRODUCT_EDITOR_LOGO_IMG_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_LOGO_WRAP_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_SCROLL_OUTER_CLASS,
  MARKETPLACE_PRODUCT_EDITOR_SECTION as AMAZON_EDITOR_SECTION,
  MARKETPLACE_PRODUCT_EDITOR_TITLE_CLASS,
} from "@/shared/lib/marketplaceProductEditorTokens";
import { cn } from "@/lib/utils";
import { DataTable } from "@/shared/components/DataTable";
import {
  MarketplaceProductShellDialog,
  type MarketplaceProductShellMode,
} from "@/shared/components/MarketplaceProductShellDialog";
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
  type AmazonProductDraftMode,
  type AmazonProductDraftRecord,
  type AmazonProductDraftValues,
  deriveDraftStatus,
  draftValuesFromSource,
  emptyDraftValues,
  normalizeDraftValues,
  padAmazonDraftImages,
  sanitizeAmazonBulletPoints,
  sanitizeAmazonDescription,
  sourceSnapshotFromRow,
} from "@/shared/lib/amazonProductDraft";
import {
  getAmazonProductTypeOptions,
  getAmazonProductTypeSchema,
  getMissingAmazonRequiredFields,
} from "@/shared/lib/amazonProductTypeSchema";
import {
  AMAZON_EDITOR_CONDITION_VALUES,
  formatDraftValuesPhysicalFieldsForEditor,
  isLikelyAmazonShippingUuid,
  normalizeConditionTypeForDraft,
  serializeDraftPhysicalFieldsForSave,
} from "@/shared/lib/amazonMeasureDisplay";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";
import type { AmazonContentAuditPayload } from "@/shared/lib/amazonContentAuditPayload";
import type { AmazonAuditFinding } from "@/shared/lib/amazonContentAudit";
import { buildAmazonTitleRecommendation, getTitleAuditFindings } from "@/shared/lib/amazonContentAudit";
import { AmazonDraftSuggestionTrigger } from "@/shared/components/AmazonDraftSuggestionTrigger";

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
  /** Hinweis wenn SP-API-Listings-Details fehlen (nur Tabellenstammdaten). */
  detailLoadHint?: string;
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

async function downloadImageDirect(url: string, filename: string) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("download_failed");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}

function AmazonDraftImageSlot({
  index,
  url,
  onClear,
}: {
  index: number;
  url: string;
  onClear: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const trimmed = url.trim();
  const showImg = Boolean(trimmed && isLikelyImageUrl(trimmed) && !broken);
  useEffect(() => {
    setBroken(false);
  }, [trimmed]);

  return (
    <div className="h-fit w-full min-w-0 rounded border border-border/60 bg-card p-px shadow-sm">
      <div className="relative aspect-square w-full overflow-hidden rounded border border-border/45 bg-muted/30">
        <span className="pointer-events-none absolute top-0.5 left-0.5 z-[1] rounded bg-background/90 px-0.5 py-px text-[8px] font-semibold tabular-nums text-foreground shadow-sm ring-1 ring-border/60 backdrop-blur-sm">
          {index + 1}
        </span>
        {showImg ? (
          <img
            src={trimmed}
            alt=""
            className="h-full w-full object-contain"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-1">
            <span className="text-center text-[8px] leading-tight text-muted-foreground">
              {broken ? "Vorschau fehlerhaft" : "—"}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 z-[1] flex flex-row items-center justify-center gap-px border-t border-border/50 bg-background/90 px-0.5 py-px backdrop-blur-sm">
          {trimmed ? (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/40 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={`Bild ${index + 1} vergrößern`}
              title="Vergrößern"
            >
              <Maximize2 className="h-2.5 w-2.5" aria-hidden />
            </button>
          ) : null}
          {trimmed ? (
            <button
              type="button"
              onClick={() => void downloadImageDirect(trimmed, `produktbild-${index + 1}.jpg`)}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/40 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={`Bild ${index + 1} herunterladen`}
              title="Herunterladen"
            >
              <Download className="h-2.5 w-2.5" aria-hidden />
            </button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 border border-border/60 bg-muted/40 p-0 text-foreground hover:bg-destructive/15 hover:text-destructive"
            onClick={onClear}
            aria-label={`Bild ${index + 1} entfernen`}
            title="Entfernen"
          >
            <Trash2 className="h-2.5 w-2.5" aria-hidden />
          </Button>
        </div>
      </div>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[min(72rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] p-3 sm:max-w-[min(72rem,calc(100vw-1rem))] sm:p-4">
          <DialogHeader>
            <DialogTitle>Produktbild {index + 1}</DialogTitle>
            <DialogDescription>Vergrößerte Vorschau</DialogDescription>
          </DialogHeader>
          <div className="flex h-[70vh] w-full items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/20 p-2">
            {showImg ? (
              <img src={trimmed} alt="" className="max-h-full max-w-full object-contain" loading="eager" />
            ) : (
              <p className="text-sm text-muted-foreground">Keine Bildvorschau verfügbar.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AmazonDraftImageAddTile({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex aspect-square w-full min-h-0 flex-col items-center justify-center gap-px rounded border border-dashed border-border/70 bg-muted/20 p-px text-center text-[8px] text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 hover:text-foreground"
      aria-label="Weitere Bilder hinzufügen"
      title="Weitere Bilder hinzufügen"
    >
      <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="px-0.5 text-[8px] font-medium leading-tight">Hinzufügen</span>
    </button>
  );
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
  const [detailLoadHint, setDetailLoadHint] = useState<string | null>(null);
  const [imageDropActive, setImageDropActive] = useState(false);
  const [shellOpen, setShellOpen] = useState(false);
  const [shellMode, setShellMode] = useState<MarketplaceProductShellMode>("edit");
  const [shellRow, setShellRow] = useState<MarketplaceProductListRow | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditPayload, setAuditPayload] = useState<AmazonContentAuditPayload | null>(null);
  const statusRef = useRef(status);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedProductTypeSchema = useMemo(
    () => getAmazonProductTypeSchema(draftValues.productType),
    [draftValues.productType]
  );
  const missingRequiredFields = useMemo(
    () => (editorMode === "create_new" ? getMissingAmazonRequiredFields(draftValues) : []),
    [editorMode, draftValues]
  );

  type ContentAuditFieldChip = {
    show: boolean;
    proposedText: string;
    sourceLabel: string;
  };
  type ContentAuditTitleBadge = {
    kind: "ok" | "warnStructural" | "warnLlm" | "errorLlm" | "noLlm";
    label: string;
    titleAttr: string;
  };
  const emptyAuditChip = (): ContentAuditFieldChip => ({
    show: false,
    proposedText: "",
    sourceLabel: "",
  });

  const contentAuditSuggestions = useMemo(() => {
    const emptyFindings: AmazonAuditFinding[] = [];
    if (!auditPayload || marketplaceSlug !== "amazon" || !canEditProducts) {
      return {
        title: emptyAuditChip(),
        description: emptyAuditChip(),
        bullets: emptyAuditChip(),
        brand: emptyAuditChip(),
        ean: false,
        titleAuditFindings: emptyFindings,
        titleBadge: null as ContentAuditTitleBadge | null,
      };
    }
    const rec = auditPayload.recommendations;
    const titleNorm = (s: string) => s.replace(/\s+/g, " ").trim();
    const curTitle = titleNorm(draftValues.title);
    const titleAuditFindings = getTitleAuditFindings({
      title: draftValues.title,
      brand: draftValues.brand,
      rulebookMarkdown: auditPayload.rulebookMarkdown ?? "",
    });
    const recTitleEditor = buildAmazonTitleRecommendation(draftValues.title);
    const recTitleNorm = titleNorm(recTitleEditor);
    const titleDiff = auditPayload.diffs.find((d) => d.field === "title");
    const serverSnapTitle = titleNorm(auditPayload.amazon?.title ?? "");
    const draftMatchesAuditSnapshot = serverSnapTitle.length === 0 || curTitle === serverSnapTitle;
    const llmOpt = auditPayload.titleOptimization;

    let titleBadge: ContentAuditTitleBadge;
    if (titleAuditFindings.length > 0) {
      titleBadge = {
        kind: "warnStructural",
        label: `${titleAuditFindings.length} Struktur`,
        titleAttr: titleAuditFindings.map((x) => x.message).join(" · "),
      };
    } else if (llmOpt == null) {
      titleBadge = {
        kind: "noLlm",
        label: "LLM-Daten fehlen",
        titleAttr: "Content-Prüfung erneut ausführen.",
      };
    } else if (!llmOpt.usedLlm) {
      titleBadge = {
        kind: "noLlm",
        label: llmOpt.llmSkippedReason === "no_api_key" ? "LLM nicht konfiguriert" : "LLM inaktiv",
        titleAttr: [llmOpt.summary, llmOpt.llmSkippedReason].filter(Boolean).join(" · "),
      };
    } else if (llmOpt.llmError) {
      titleBadge = {
        kind: "errorLlm",
        label: "LLM-Fehler",
        titleAttr: llmOpt.llmError,
      };
    } else if (!llmOpt.noMaterialImprovement || llmOpt.issues.length > 0 || llmOpt.score < 76) {
      titleBadge = {
        kind: "warnLlm",
        label: `LLM ${llmOpt.score}${llmOpt.issues.length ? ` · ${llmOpt.issues.length}` : ""}`,
        titleAttr: [llmOpt.summary, ...llmOpt.issues].filter(Boolean).join(" · "),
      };
    } else {
      titleBadge = {
        kind: "ok",
        label: `OK · LLM ${llmOpt.score}`,
        titleAttr: llmOpt.summary || "Kein wesentlicher Verbesserungsbedarf laut LLM und Regelwerk-Kontext.",
      };
    }

    let title = emptyAuditChip();
    const llmTitleRaw = llmOpt?.improvedTitle?.trim() ?? "";
    if (llmTitleRaw && titleNorm(llmTitleRaw) !== curTitle) {
      title = {
        show: true,
        proposedText: llmTitleRaw,
        sourceLabel: `LLM${llmOpt?.model ? ` (${llmOpt.model})` : ""}: ${llmOpt?.summary ? `${llmOpt.summary.slice(0, 140)}${llmOpt.summary.length > 140 ? "…" : ""}` : "Alternativer Titelvorschlag"}`,
      };
    } else if (recTitleNorm && recTitleNorm !== curTitle) {
      title = {
        show: true,
        proposedText: recTitleEditor,
        sourceLabel: "Prüfung: optimierter Titel (Länge, unzulässige Begriffe)",
      };
    } else if (titleDiff && draftMatchesAuditSnapshot) {
      const refT = titleNorm(titleDiff.referenceValue);
      if (refT && refT !== curTitle) {
        title = {
          show: true,
          proposedText: titleDiff.referenceValue.trim(),
          sourceLabel: titleDiff.note,
        };
      }
    }

    const curDesc = sanitizeAmazonDescription(draftValues.description);
    const recDesc = sanitizeAmazonDescription(rec.description);
    const descDiff = auditPayload.diffs.find((d) => d.field === "description");

    let description = emptyAuditChip();
    if (recDesc && recDesc !== curDesc) {
      description = {
        show: true,
        proposedText: rec.description,
        sourceLabel: "Prüfung: bereinigte Beschreibung",
      };
    } else if (descDiff) {
      const refD = sanitizeAmazonDescription(descDiff.referenceValue);
      if (refD && refD !== curDesc) {
        description = {
          show: true,
          proposedText: descDiff.referenceValue,
          sourceLabel: descDiff.note,
        };
      }
    }

    const propB = sanitizeAmazonBulletPoints(rec.bulletPoints);
    const curB = sanitizeAmazonBulletPoints(draftValues.bulletPoints);
    const bulletsDiffer = propB.join("\u001e") !== curB.slice(0, 5).join("\u001e");
    const bulletsFew = auditPayload.findings.some((f) => f.id === "bullets-too-few");

    let bullets = emptyAuditChip();
    if (propB.length > 0 && bulletsDiffer && (bulletsFew || propB.length >= 3)) {
      bullets = {
        show: true,
        proposedText: propB.slice(0, 5).join("\n"),
        sourceLabel: bulletsFew
          ? "Prüfung: Bullet-Vorschlag aus Beschreibung / Listung"
          : "Prüfung: konsolidierte Bullet Points",
      };
    }

    const brandDiff = auditPayload.diffs.find((d) => d.field === "brand");
    const brandRef = brandDiff?.referenceValue?.trim() ?? "";
    let brand = emptyAuditChip();
    if (brandRef && brandRef !== draftValues.brand.trim()) {
      brand = {
        show: true,
        proposedText: brandRef,
        sourceLabel: brandDiff?.note ?? "Kanalabgleich",
      };
    }

    const xe = (auditPayload.xentralEan ?? "").replace(/\D/g, "");
    const ean = Boolean(xe.length >= 8 && !draftValues.externalProductId.trim());

    return { title, description, bullets, brand, ean, titleAuditFindings, titleBadge };
  }, [auditPayload, canEditProducts, draftValues, marketplaceSlug]);

  const displayedContentAuditFindings = useMemo(() => {
    if (!auditPayload) return [];
    const titleFx = getTitleAuditFindings({
      title: draftValues.title,
      brand: draftValues.brand,
      rulebookMarkdown: auditPayload.rulebookMarkdown ?? "",
    });
    const rest = auditPayload.findings.filter((f) => f.field !== "title");
    const llmOpt = auditPayload.titleOptimization;
    const llmRows: AmazonAuditFinding[] = [];
    if (llmOpt?.usedLlm) {
      if (llmOpt.summary?.trim()) {
        llmRows.push({
          id: "llm-title-summary",
          severity: "info",
          message: `LLM (${llmOpt.model ?? "Modell"}), Score ${llmOpt.score}: ${llmOpt.summary.trim()}`,
          field: "title",
        });
      }
      llmOpt.issues.forEach((msg: string, i: number) => {
        llmRows.push({
          id: `llm-title-issue-${i}`,
          severity: "medium",
          message: msg,
          recommendation: llmOpt.improvedTitle ? `Vorschlag: ${llmOpt.improvedTitle}` : undefined,
          field: "title",
        });
      });
    } else if (llmOpt && !llmOpt.usedLlm && llmOpt.summary?.trim()) {
      llmRows.push({
        id: "llm-title-skipped",
        severity: "info",
        message: llmOpt.summary.trim(),
        field: "title",
      });
    }
    return [...titleFx, ...llmRows, ...rest];
  }, [auditPayload, draftValues.title, draftValues.brand]);

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
      if (u.pathname === "/api/amazon/products") {
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

  const saveDraft = useCallback(async () => {
    const mode = editorMode;
    const physical = serializeDraftPhysicalFieldsForSave(draftValues);
    const values = {
      ...draftValues,
      ...physical,
      conditionType: normalizeConditionTypeForDraft(draftValues.conditionType),
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
      uvpEur: values.uvpEur ? Number(values.uvpEur) : null,
      listPriceEur: values.listPriceEur ? Number(values.listPriceEur) : null,
      handlingTime: values.handlingTime,
      shippingTemplate: values.shippingTemplate,
      quantity: values.quantity ? Number(values.quantity) : null,
      packageLength: values.packageLength,
      packageWidth: values.packageWidth,
      packageHeight: values.packageHeight,
      packageWeight: values.packageWeight,
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

  const fetchContentAudit = useCallback(
    async (sku: string, options?: { refresh?: boolean }) => {
      const s = sku.trim();
      if (!s || marketplaceSlug !== "amazon" || !canEditProducts) return;
      setAuditLoading(true);
      setAuditError(null);
      setAuditPayload(null);
      try {
        const qs = new URLSearchParams();
        qs.set("sku", s);
        if (options?.refresh) qs.set("refresh", "1");
        const res = await fetch(`/api/amazon/content-audit?${qs.toString()}`, { cache: "no-store" });
        const payload = (await res.json().catch(() => ({}))) as AmazonContentAuditPayload & { error?: string };
        if (!res.ok) throw new Error(payload.error ?? "Content-Prüfung konnte nicht geladen werden.");
        setAuditPayload(payload);
      } catch (e) {
        setAuditError(e instanceof Error ? e.message : "Content-Prüfung konnte nicht geladen werden.");
      } finally {
        setAuditLoading(false);
      }
    },
    [canEditProducts, marketplaceSlug]
  );

  const loadDraft = useCallback(
    async (sku: string, mode: AmazonProductDraftMode) => {
      setDraftLoading(true);
      setDraftError(null);
      setDraftTableMissing(false);
      setDetailLoadHint(null);
      try {
        if (mode === "edit_existing" && sku) {
          const detailRes = await fetch(`/api/amazon/products/${encodeURIComponent(sku)}`, {
            cache: "no-store",
          });
          const detailPayload = (await detailRes.json().catch(() => ({}))) as AmazonProductDetailPayload;
          if (!detailRes.ok) {
            throw new Error(detailPayload.error ?? "Produktdetails konnten nicht geladen werden.");
          }
          setDetailLoadHint(
            typeof detailPayload.detailLoadHint === "string" && detailPayload.detailLoadHint.trim()
              ? detailPayload.detailLoadHint.trim()
              : null
          );
          const localeTag = intlLocaleTag(locale);
          const nextValues = formatDraftValuesPhysicalFieldsForEditor(
            normalizeDraftValues(
              detailPayload.draftValues ??
                draftValuesFromSource(
                  detailPayload.sourceSnapshot ??
                    sourceSnapshotFromRow({
                      sku,
                      secondaryId: "",
                      title: "",
                      statusLabel: "",
                      isActive: true,
                    })
                )
            ),
            localeTag
          );
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
          if (marketplaceSlug === "amazon" && canEditProducts) {
            void fetchContentAudit(sku);
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
        const dv = formatDraftValuesPhysicalFieldsForEditor(
          normalizeDraftValues(item.draft_values ?? {}),
          intlLocaleTag(locale)
        );
        setDraftValues(dv);
        setDraftStatus(item.status ?? deriveDraftStatus(dv, mode));
        if (mode === "edit_existing" && sku && marketplaceSlug === "amazon" && canEditProducts) {
          void fetchContentAudit(sku);
        }
      } catch (e) {
        setDraftError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      } finally {
        setDraftLoading(false);
      }
    },
    [t, locale, fetchContentAudit, marketplaceSlug, canEditProducts]
  );

  const openShellForRow = useCallback((row: MarketplaceProductListRow) => {
    setEditorOpen(false);
    setShellMode("edit");
    setShellRow(row);
    setShellOpen(true);
  }, []);

  const openShellCreate = useCallback(() => {
    setEditorOpen(false);
    setShellMode("create");
    setShellRow(null);
    setShellOpen(true);
  }, []);

  const openEditorForRow = useCallback(
    (row: MarketplaceProductListRow) => {
      setShellOpen(false);
      setAuditPayload(null);
      setAuditError(null);
      setAuditLoading(false);
      const source = sourceSnapshotFromRow(row);
      setEditorMode("edit_existing");
      setEditorSource(row);
      setDraftId(null);
      const initial = formatDraftValuesPhysicalFieldsForEditor(
        draftValuesFromSource(source),
        intlLocaleTag(locale)
      );
      setDraftValues(initial);
      setDraftStatus(deriveDraftStatus(initial, "edit_existing"));
      setEditorOpen(true);
      void loadDraft(row.sku, "edit_existing");
    },
    [loadDraft, locale]
  );

  const openCreateEditor = useCallback(() => {
    setShellOpen(false);
    setAuditPayload(null);
    setAuditError(null);
    setAuditLoading(false);
    setEditorMode("create_new");
    setEditorSource(null);
    setDraftId(null);
    const initial = emptyDraftValues();
    setDraftValues(initial);
    setDraftStatus("draft");
    setDraftError(null);
    setDraftTableMissing(false);
    setDetailLoadHint(null);
    setEditorOpen(true);
  }, []);

  const appendIncomingImages = useCallback((incoming: string[]) => {
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
  }, []);

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
    [appendIncomingImages, readImageFilesAsDataUrls]
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
    [appendIncomingImages, readImageFilesAsDataUrls]
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
        marketplace: marketplaceSlug,
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
  }, [load, marketplaceSlug, t]);

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
      {useProductShell ? (
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
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <MarketplaceProductEditorDialogContent>
          <DialogHeader className={MARKETPLACE_PRODUCT_EDITOR_HEADER_CLASS}>
            <DialogTitle className={MARKETPLACE_PRODUCT_EDITOR_TITLE_CLASS}>
              <span className={MARKETPLACE_PRODUCT_EDITOR_LOGO_WRAP_CLASS} aria-hidden>
                <img src={logoSrc} alt="" className={MARKETPLACE_PRODUCT_EDITOR_LOGO_IMG_CLASS} loading="lazy" />
              </span>
              <span className="inline-flex items-center gap-2">
                {editorMode === "create_new" ? "Neuen Artikel vorbereiten" : "Artikel bearbeiten"}
                {marketplaceSlug === "amazon" && editorMode === "edit_existing" && auditLoading ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                ) : null}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className={MARKETPLACE_PRODUCT_EDITOR_SCROLL_OUTER_CLASS}>
            {draftLoading ? (
              <div
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card"
                aria-busy="true"
                aria-live="polite"
              >
                <Loader2 className="h-9 w-9 animate-spin text-muted-foreground" aria-hidden />
                <p className="text-[10px] text-muted-foreground">Produktdaten werden geladen…</p>
              </div>
            ) : null}
            <div
              className={cn(
                MARKETPLACE_PRODUCT_EDITOR_BODY_PADDING_CLASS,
                draftLoading && "pointer-events-none select-none opacity-[0.35]"
              )}
            >
            {detailLoadHint ? (
              <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-950 dark:text-amber-100">
                {detailLoadHint}
              </div>
            ) : null}
            {draftTableMissing ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-1.5 text-[10px] leading-snug text-amber-700">
                Tabelle für Produkt-Entwürfe fehlt. Bitte Supabase-Migration ausführen.
              </div>
            ) : null}
            {draftError ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-1.5 text-[10px] leading-snug text-red-700">
                {draftError}
              </div>
            ) : null}
            {marketplaceSlug === "amazon" && canEditProducts && editorMode === "edit_existing" ? (
              <div className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-[10px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">Content-Prüfung</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[10px]"
                    disabled={auditLoading || !draftValues.sku.trim()}
                    onClick={() => void fetchContentAudit(draftValues.sku)}
                  >
                    {auditLoading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden /> : null}
                    Erneut prüfen
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[10px]"
                    disabled={auditLoading || !draftValues.sku.trim()}
                    onClick={() => void fetchContentAudit(draftValues.sku, { refresh: true })}
                    title="Lädt u. a. Shopify/Marktplatz-Listen neu und prüft erneut"
                  >
                    <RotateCw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Mit Marktdaten-Refresh
                  </Button>
                </div>
                {auditPayload && !auditLoading && !auditError ? (
                  <p className="text-muted-foreground">
                    {displayedContentAuditFindings.length} Hinweis(e) · {auditPayload.diffs.length}{" "}
                    Kanal-Abweichung(en)
                    {displayedContentAuditFindings.length === 0
                      ? " — keine strukturellen Mängel erkannt."
                      : ""}
                  </p>
                ) : !auditLoading && !auditError && !auditPayload ? (
                  <p className="text-muted-foreground">
                    Nach dem Laden der Produktdaten startet die Prüfung automatisch; hier kannst du sie manuell
                    wiederholen.
                  </p>
                ) : null}
              </div>
            ) : null}
            {marketplaceSlug === "amazon" && canEditProducts && auditError ? (
              <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-950 dark:text-amber-100">
                Content-Prüfung: {auditError}
              </div>
            ) : null}
            {marketplaceSlug === "amazon" && canEditProducts && auditPayload && !auditLoading ? (
              <details className="rounded-md border border-border/60 bg-muted/25 px-2 py-1 text-[10px]">
                <summary className="cursor-pointer font-medium text-foreground">
                  Alle Prüfhinweise ({displayedContentAuditFindings.length}) — Titel bezogen auf aktuellen Editor-Text
                </summary>
                {displayedContentAuditFindings.length === 0 ? (
                  <p className="mt-1 text-muted-foreground">Keine strukturellen Hinweise.</p>
                ) : (
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                    {displayedContentAuditFindings.map((f) => (
                      <li key={f.id}>
                        <span className="font-medium uppercase text-foreground/80">{f.severity}</span>: {f.message}
                        {f.recommendation ? (
                          <span className="mt-0.5 block text-[9px]">{f.recommendation}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            ) : null}
            {editorMode === "create_new" && missingRequiredFields.length > 0 ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-1.5 text-[10px] leading-snug text-amber-800">
                <p className="font-medium">Pflichtfelder fehlen:</p>
                <p className="mt-0.5">{missingRequiredFields.map((x) => x.label).join(" • ")}</p>
              </div>
            ) : null}
            <div className="flex min-w-0 flex-col gap-1">
                {selectedProductTypeSchema ? (
                  <section className={AMAZON_EDITOR_SECTION}>
                    <h3 className={AMAZON_EDITOR_H3}>
                      Kategorieattribute ({selectedProductTypeSchema.label})
                    </h3>
                    <p className={AMAZON_EDITOR_HINT}>Zusätzliche Felder für den gewählten Produkttyp.</p>
                    <div className="mt-1 grid grid-cols-1 items-start gap-x-1 gap-y-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                      {selectedProductTypeSchema.attributes.map((field) => (
                        <label key={field.key} className={AMAZON_EDITOR_LABEL}>
                          <span className="text-muted-foreground">
                            {field.label}
                            {field.required ? " *" : ""}
                          </span>
                          <Input
                            className={AMAZON_EDITOR_CONTROL}
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
                  </section>
                ) : null}
              <div className="flex min-h-0 min-w-0 flex-col gap-1 lg:flex-row lg:items-stretch">
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 lg:min-w-0 lg:w-0">
                <section className={AMAZON_EDITOR_SECTION}>
                  <h3 className={AMAZON_EDITOR_H3}>Stammdaten</h3>
                  <p className={AMAZON_EDITOR_HINT}>SKU, ASIN und vollständiger Produkttitel.</p>
                  <div className="mt-1 flex flex-col gap-1">
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      <label className={AMAZON_EDITOR_LABEL}>
                        <span className="text-muted-foreground">SKU</span>
                        <Input
                          className={AMAZON_EDITOR_CONTROL}
                          value={draftValues.sku}
                          onChange={(e) => setDraftValues((prev) => ({ ...prev, sku: e.target.value }))}
                          placeholder="z. B. ASTRO-123"
                        />
                      </label>
                      <label className={AMAZON_EDITOR_LABEL}>
                        <span className="text-muted-foreground">ASIN</span>
                        <Input
                          className={AMAZON_EDITOR_CONTROL}
                          value={draftValues.asin}
                          onChange={(e) => setDraftValues((prev) => ({ ...prev, asin: e.target.value }))}
                          placeholder="z. B. B0..."
                        />
                      </label>
                    </div>
                    <label className={AMAZON_EDITOR_LABEL}>
                      <span className="flex flex-wrap items-center gap-1">
                        <span className="text-muted-foreground">Produkttitel</span>
                        {auditPayload &&
                        marketplaceSlug === "amazon" &&
                        canEditProducts &&
                        editorMode === "edit_existing" &&
                        contentAuditSuggestions.titleBadge ? (
                          <span
                            className={cn(
                              "inline-flex max-w-full items-center gap-0.5 rounded border px-1 py-px text-[9px] leading-tight",
                              contentAuditSuggestions.titleBadge.kind === "ok"
                                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                                : contentAuditSuggestions.titleBadge.kind === "errorLlm"
                                  ? "border-red-500/40 bg-red-500/10 text-red-950 dark:text-red-100"
                                  : "border-amber-500/45 bg-amber-500/10 text-amber-950 dark:text-amber-100"
                            )}
                            title={contentAuditSuggestions.titleBadge.titleAttr}
                          >
                            {contentAuditSuggestions.titleBadge.kind === "ok" ? (
                              <>
                                <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />
                                <span>{contentAuditSuggestions.titleBadge.label}</span>
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                                <span>{contentAuditSuggestions.titleBadge.label}</span>
                              </>
                            )}
                          </span>
                        ) : null}
                        {contentAuditSuggestions.title.show && auditPayload ? (
                          <AmazonDraftSuggestionTrigger
                            sourceLabel={contentAuditSuggestions.title.sourceLabel}
                            currentText={draftValues.title}
                            proposedText={contentAuditSuggestions.title.proposedText}
                            onApply={() =>
                              setDraftValues((prev) => ({
                                ...prev,
                                title: contentAuditSuggestions.title.proposedText,
                              }))
                            }
                          />
                        ) : null}
                      </span>
                      <Textarea
                        value={draftValues.title}
                        onChange={(e) => setDraftValues((prev) => ({ ...prev, title: e.target.value }))}
                        placeholder="Vollständiger Listungstitel"
                        rows={2}
                        className={cn("min-h-[2.5rem] resize-y py-0.5", AMAZON_EDITOR_FIELD)}
                      />
                    </label>
                  </div>
                </section>
                    <div className="flex min-w-0 flex-col gap-1 lg:flex-row lg:items-stretch">
                      <div className="min-w-0 w-full shrink-0 lg:w-0 lg:flex-[1.45] lg:self-start">
                <section className={cn(AMAZON_EDITOR_SECTION, "flex min-h-0 min-w-0 flex-col")}>
                  <h3 className={cn(AMAZON_EDITOR_H3, "shrink-0")}>Katalog &amp; Angebot</h3>
                  <p className={cn(AMAZON_EDITOR_HINT, "shrink-0")}>Typ, Marke, Preise, Bestand, Versand.</p>
                  <div className="mt-1 min-h-0 grid grid-cols-1 items-start gap-x-1 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                    <label className={cn(AMAZON_EDITOR_LABEL, "xl:col-span-2")}>
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
                        <SelectTrigger className={cn("w-full", AMAZON_EDITOR_CONTROL)}>
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
                    <label className={AMAZON_EDITOR_LABEL}>
                      <span className="flex items-center gap-1">
                        <span className="text-muted-foreground">Marke / Hersteller</span>
                        {contentAuditSuggestions.brand.show && auditPayload ? (
                          <AmazonDraftSuggestionTrigger
                            sourceLabel={contentAuditSuggestions.brand.sourceLabel}
                            currentText={draftValues.brand}
                            proposedText={contentAuditSuggestions.brand.proposedText}
                            onApply={() =>
                              setDraftValues((prev) => ({
                                ...prev,
                                brand: contentAuditSuggestions.brand.proposedText.trim(),
                              }))
                            }
                          />
                        ) : null}
                      </span>
                      <Input
                        className={AMAZON_EDITOR_CONTROL}
                        value={draftValues.brand}
                        onChange={(e) => setDraftValues((prev) => ({ ...prev, brand: e.target.value }))}
                        placeholder="z. B. AstroPet"
                      />
                    </label>
                    <label className={AMAZON_EDITOR_LABEL}>
                      <span className="text-muted-foreground">UVP (EUR)</span>
                      <Input
                        className={AMAZON_EDITOR_CONTROL}
                        value={draftValues.uvpEur}
                        onChange={(e) => setDraftValues((prev) => ({ ...prev, uvpEur: e.target.value }))}
                        placeholder="z. B. 39.99"
                        inputMode="decimal"
                      />
                    </label>
                    <label className={AMAZON_EDITOR_LABEL}>
                      <span className="text-muted-foreground">Preis (EUR)</span>
                      <Input
                        className={AMAZON_EDITOR_CONTROL}
                        value={draftValues.listPriceEur}
                        onChange={(e) => setDraftValues((prev) => ({ ...prev, listPriceEur: e.target.value }))}
                        placeholder="z. B. 29.99"
                        inputMode="decimal"
                      />
                    </label>
                    <label className={AMAZON_EDITOR_LABEL}>
                      <span className="text-muted-foreground">Bestand</span>
                      <Input
                        className={AMAZON_EDITOR_CONTROL}
                        value={draftValues.quantity}
                        onChange={(e) => setDraftValues((prev) => ({ ...prev, quantity: e.target.value }))}
                        placeholder="z. B. 120"
                        inputMode="numeric"
                      />
                    </label>
                    <label className={AMAZON_EDITOR_LABEL}>
                      <span className="text-muted-foreground">Bearbeitungszeit</span>
                      <Input
                        className={AMAZON_EDITOR_CONTROL}
                        value={draftValues.handlingTime}
                        onChange={(e) => setDraftValues((prev) => ({ ...prev, handlingTime: e.target.value }))}
                        placeholder="z. B. 1-2 Werktage"
                      />
                    </label>
                    <label className={cn(AMAZON_EDITOR_LABEL, "xl:col-span-2")}>
                      <span className="text-muted-foreground">Versandvorlage</span>
                      <Input
                        className={AMAZON_EDITOR_CONTROL}
                        value={draftValues.shippingTemplate}
                        onChange={(e) => setDraftValues((prev) => ({ ...prev, shippingTemplate: e.target.value }))}
                        placeholder="z. B. Standard DE"
                      />
                      {isLikelyAmazonShippingUuid(draftValues.shippingTemplate) ? (
                        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                          {t("amazonDraft.shippingUuidHint")}
                        </p>
                      ) : null}
                    </label>
                    <label className={AMAZON_EDITOR_LABEL}>
                      <span className="text-muted-foreground">Zustand</span>
                      <Select
                        value={normalizeConditionTypeForDraft(draftValues.conditionType)}
                        onValueChange={(value) =>
                          setDraftValues((prev) => ({ ...prev, conditionType: value ?? "new_new" }))
                        }
                      >
                        <SelectTrigger className={cn("w-full", AMAZON_EDITOR_CONTROL)}>
                          <SelectValue>
                            {t(
                              `amazonDraft.condition.${normalizeConditionTypeForDraft(draftValues.conditionType)}`
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {AMAZON_EDITOR_CONDITION_VALUES.map((condKey) => (
                            <SelectItem key={condKey} value={condKey}>
                              {t(`amazonDraft.condition.${condKey}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className={AMAZON_EDITOR_LABEL}>
                      <span className="flex items-center gap-1">
                        <span className="text-muted-foreground">Externe Produkt-ID</span>
                        {contentAuditSuggestions.ean && auditPayload?.xentralEan ? (
                          <AmazonDraftSuggestionTrigger
                            sourceLabel="Xentral (EAN)"
                            currentText={draftValues.externalProductId.trim() ? draftValues.externalProductId : "—"}
                            proposedText={auditPayload.xentralEan}
                            onApply={() =>
                              setDraftValues((prev) => ({
                                ...prev,
                                externalProductId: auditPayload.xentralEan ?? "",
                                externalProductIdType: "ean",
                              }))
                            }
                          />
                        ) : null}
                      </span>
                      <Input
                        className={AMAZON_EDITOR_CONTROL}
                        value={draftValues.externalProductId}
                        onChange={(e) => setDraftValues((prev) => ({ ...prev, externalProductId: e.target.value }))}
                        placeholder="EAN/UPC/GTIN/ISBN"
                      />
                    </label>
                    <label className={AMAZON_EDITOR_LABEL}>
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
                        <SelectTrigger className={cn("w-full", AMAZON_EDITOR_CONTROL)}>
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
                  <label className={AMAZON_EDITOR_LABEL}>
                    <span className="text-muted-foreground">{t("amazonDraft.dimensionLength")}</span>
                    <Input
                      className={AMAZON_EDITOR_CONTROL}
                      value={draftValues.packageLength}
                      onChange={(e) => setDraftValues((prev) => ({ ...prev, packageLength: e.target.value }))}
                      placeholder="0"
                      inputMode="decimal"
                    />
                  </label>
                  <label className={AMAZON_EDITOR_LABEL}>
                    <span className="text-muted-foreground">{t("amazonDraft.dimensionWidth")}</span>
                    <Input
                      className={AMAZON_EDITOR_CONTROL}
                      value={draftValues.packageWidth}
                      onChange={(e) => setDraftValues((prev) => ({ ...prev, packageWidth: e.target.value }))}
                      placeholder="0"
                      inputMode="decimal"
                    />
                  </label>
                  <label className={AMAZON_EDITOR_LABEL}>
                    <span className="text-muted-foreground">{t("amazonDraft.dimensionHeight")}</span>
                    <Input
                      className={AMAZON_EDITOR_CONTROL}
                      value={draftValues.packageHeight}
                      onChange={(e) => setDraftValues((prev) => ({ ...prev, packageHeight: e.target.value }))}
                      placeholder="0"
                      inputMode="decimal"
                    />
                  </label>
                  <label className={AMAZON_EDITOR_LABEL}>
                    <span className="text-muted-foreground">{t("amazonDraft.weightKg")}</span>
                    <Input
                      className={AMAZON_EDITOR_CONTROL}
                      value={draftValues.packageWeight}
                      onChange={(e) => setDraftValues((prev) => ({ ...prev, packageWeight: e.target.value }))}
                      placeholder="0"
                      inputMode="decimal"
                    />
                  </label>
                  </div>
                </section>
                      </div>
                      <div className="flex min-h-0 min-w-0 w-full flex-col lg:w-0 lg:flex-[1.2] lg:self-stretch">
                <section
                  className={cn(
                    AMAZON_EDITOR_SECTION,
                    "flex min-h-0 min-w-0 flex-col lg:min-h-0 lg:flex-1"
                  )}
                >
                  <h3 className={cn(AMAZON_EDITOR_H3, "shrink-0")}>
                    {t("amazonDraft.contentSectionTitle")}
                  </h3>
                  <p className={cn(AMAZON_EDITOR_HINT, "shrink-0")}>
                    {t("amazonDraft.contentSectionHint")}
                  </p>
                  <div className="mt-1 flex min-h-0 flex-col gap-1 lg:min-h-0 lg:flex-1">
                    <label
                      className={cn(
                        AMAZON_EDITOR_LABEL,
                        "flex min-h-0 min-w-0 flex-col lg:min-h-0 lg:flex-1"
                      )}
                    >
                      <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                        Beschreibung
                        {contentAuditSuggestions.description.show && auditPayload ? (
                          <AmazonDraftSuggestionTrigger
                            sourceLabel={contentAuditSuggestions.description.sourceLabel}
                            currentText={draftValues.description}
                            proposedText={contentAuditSuggestions.description.proposedText}
                            onApply={() =>
                              setDraftValues((prev) => ({
                                ...prev,
                                description: contentAuditSuggestions.description.proposedText,
                              }))
                            }
                          />
                        ) : null}
                      </span>
                      <Textarea
                        value={draftValues.description}
                        onChange={(e) => setDraftValues((prev) => ({ ...prev, description: e.target.value }))}
                        className={cn(
                          "field-sizing-fixed min-h-[2.75rem] resize-y py-0.5 lg:min-h-0 lg:flex-1",
                          AMAZON_EDITOR_FIELD
                        )}
                        rows={2}
                        placeholder="Beschreibung"
                      />
                    </label>
                  </div>
                </section>
                      </div>
                    </div>
                <section className={AMAZON_EDITOR_SECTION}>
                  <div className="flex flex-wrap items-center gap-1">
                    <h3 className={AMAZON_EDITOR_H3}>{t("amazonDraft.bulletsSectionTitle")}</h3>
                    {contentAuditSuggestions.bullets.show && auditPayload ? (
                      <AmazonDraftSuggestionTrigger
                        className="translate-y-px"
                        sourceLabel={contentAuditSuggestions.bullets.sourceLabel}
                        currentText={draftValues.bulletPoints.map((b) => b.trim()).join("\n")}
                        proposedText={contentAuditSuggestions.bullets.proposedText}
                        onApply={() => {
                          const next = contentAuditSuggestions.bullets.proposedText
                            .split("\n")
                            .map((x) => x.trim())
                            .filter(Boolean);
                          const padded = sanitizeAmazonBulletPoints(next).slice(0, 5);
                          while (padded.length < 5) padded.push("");
                          setDraftValues((prev) => ({ ...prev, bulletPoints: padded }));
                        }}
                      />
                    ) : null}
                  </div>
                  <p className={AMAZON_EDITOR_HINT}>{t("amazonDraft.bulletsSectionHint")}</p>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {[0, 1, 2, 3, 4].map((idx) => (
                      <label key={`bp-${idx}`} className={AMAZON_EDITOR_LABEL}>
                        <span className="text-muted-foreground">
                          {t("amazonDraft.bulletPlaceholder", { n: idx + 1 })}
                        </span>
                        <Textarea
                          className={cn(
                            "field-sizing-content max-h-[min(22vh,7rem)] min-h-[1.75rem] resize-y overflow-y-auto py-0.5",
                            AMAZON_EDITOR_FIELD
                          )}
                          rows={1}
                          value={draftValues.bulletPoints[idx] ?? ""}
                          onChange={(e) =>
                            setDraftValues((prev) => {
                              const next = [...prev.bulletPoints];
                              next[idx] = e.target.value;
                              return { ...prev, bulletPoints: next };
                            })
                          }
                          placeholder={t("amazonDraft.bulletPlaceholder", { n: idx + 1 })}
                        />
                      </label>
                    ))}
                  </div>
                </section>
                  </div>
              <div className="flex min-h-0 w-full shrink-0 flex-col self-stretch lg:w-[min(15rem,100%)] lg:max-w-[15rem]">
                <section className={cn(AMAZON_EDITOR_SECTION, "flex min-h-0 min-w-0 flex-1 flex-col")}>
                  <div className="mb-1 flex shrink-0 flex-wrap items-baseline justify-between gap-1">
                    <h3 className={AMAZON_EDITOR_H3}>Bilder</h3>
                    <span className="text-[9px] tabular-nums leading-none text-muted-foreground">
                      {filledAmazonImageIndices.length}/{AMAZON_DRAFT_IMAGE_SLOT_COUNT}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "mb-1 w-full shrink-0 rounded border border-dashed px-1 py-0.5 text-center text-[9px] leading-tight transition-colors",
                      imageDropActive
                        ? "border-primary/70 bg-primary/5 text-foreground"
                        : "border-border/70 bg-muted/25 text-muted-foreground"
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
                    <Upload className="mx-auto mb-px h-2.5 w-2.5 opacity-70" aria-hidden />
                    Ablage · max.&nbsp;{AMAZON_DRAFT_IMAGE_MAX_MB}&nbsp;MB
                  </div>
                  <input
                    ref={imageFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void handleImageFileInputChange(e.target.files);
                      e.currentTarget.value = "";
                    }}
                  />
                  <div className="mt-1 grid w-full grid-cols-2 items-start gap-1">
                    {filledAmazonImageIndices.map((idx) => (
                      <AmazonDraftImageSlot
                        key={idx}
                        index={idx}
                        url={amazonImageSlots[idx] ?? ""}
                        onClear={() =>
                          setDraftValues((prev) => {
                            const next = padAmazonDraftImages(prev.images);
                            next[idx] = "";
                            return { ...prev, images: next };
                          })
                        }
                      />
                    ))}
                    {canAddMoreAmazonImages ? (
                      <AmazonDraftImageAddTile onAdd={() => imageFileInputRef.current?.click()} />
                    ) : null}
                  </div>
                </section>
              </div>
              </div>
            </div>
            </div>
          </div>
          <DialogFooter className={MARKETPLACE_PRODUCT_EDITOR_FOOTER_CLASS}>
            <span className="text-[9px] leading-snug text-muted-foreground">
              Status: {draftLoading ? "lädt..." : draftStatus === "ready" ? "bereit" : "Entwurf"}
              {editorMode === "create_new" && missingRequiredFields.length > 0
                ? ` • ${missingRequiredFields.length} Pflichtfeld(er) fehlen`
                : ""}
            </span>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setEditorOpen(false)}>
                Schließen
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => void saveDraft()}
                disabled={draftSaving || draftLoading}
              >
                {draftSaving ? "Speichert..." : "Entwurf speichern"}
              </Button>
            </div>
          </DialogFooter>
        </MarketplaceProductEditorDialogContent>
      </Dialog>
    </div>
  );
}
