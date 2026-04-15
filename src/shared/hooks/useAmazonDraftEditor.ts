import { useCallback, useRef, useState } from "react";
import type {
  AmazonProductDraftMode,
  AmazonProductDraftRecord,
  AmazonProductDraftValues,
} from "@/shared/lib/amazonProductDraft";
import {
  deriveDraftStatus,
  draftValuesFromSource,
  emptyDraftValues,
  normalizeDraftValues,
  sourceSnapshotFromRow,
} from "@/shared/lib/amazonProductDraft";
import {
  formatDraftValuesPhysicalFieldsForEditor,
  normalizeConditionTypeForDraft,
  serializeDraftPhysicalFieldsForSave,
} from "@/shared/lib/amazonMeasureDisplay";
import type { Locale } from "@/i18n/config";
import { intlLocaleTag } from "@/i18n/locale-formatting";
import type { MarketplaceProductListRow } from "@/shared/lib/marketplaceProductList";

// ---------------------------------------------------------------------------
// Local API payload types (mirrors the parent component's private types)
// ---------------------------------------------------------------------------

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
  detailLoadHint?: string;
};

// ---------------------------------------------------------------------------
// Hook arguments & return type
// ---------------------------------------------------------------------------

export type UseAmazonDraftEditorArgs = {
  marketplaceSlug: string;
  canEditProducts: boolean;
  locale: Locale;
  fetchContentAudit: (sku: string, opts?: { refresh?: boolean }) => Promise<void>;
  setAuditPayload: (v: null) => void;
  setAuditError: (v: null) => void;
  setAuditLoading: (v: false) => void;
  /** Called at the start of openEditorForRow / openCreateEditor to dismiss any open shell dialog. */
  closeShellDialog?: () => void;
  t: (key: string, params?: Record<string, string>) => string;
};

export type UseAmazonDraftEditorReturn = {
  editorOpen: boolean;
  setEditorOpen: (v: boolean) => void;
  editorMode: AmazonProductDraftMode;
  editorSource: MarketplaceProductListRow | null;
  draftId: string | null;
  draftValues: AmazonProductDraftValues;
  setDraftValues: React.Dispatch<React.SetStateAction<AmazonProductDraftValues>>;
  draftStatus: "draft" | "ready";
  draftLoading: boolean;
  draftSaving: boolean;
  draftError: string | null;
  setDraftError: (v: string | null) => void;
  draftTableMissing: boolean;
  detailLoadHint: string | null;
  loadDraft: (sku: string, mode: AmazonProductDraftMode) => Promise<void>;
  saveDraft: () => Promise<void>;
  openEditorForRow: (row: MarketplaceProductListRow) => void;
  openCreateEditor: () => void;
};

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useAmazonDraftEditor({
  marketplaceSlug,
  canEditProducts,
  locale,
  fetchContentAudit,
  setAuditPayload,
  setAuditError,
  setAuditLoading,
  closeShellDialog,
  t,
}: UseAmazonDraftEditorArgs): UseAmazonDraftEditorReturn {
  // ---- Refs for callbacks that may be provided after the initial render ----
  // (avoids stale closures when the parent wires audit hooks after this hook)
  const fetchContentAuditRef = useRef(fetchContentAudit);
  fetchContentAuditRef.current = fetchContentAudit;
  const setAuditPayloadRef = useRef(setAuditPayload);
  setAuditPayloadRef.current = setAuditPayload;
  const setAuditErrorRef = useRef(setAuditError);
  setAuditErrorRef.current = setAuditError;
  const setAuditLoadingRef = useRef(setAuditLoading);
  setAuditLoadingRef.current = setAuditLoading;
  const closeShellRef = useRef(closeShellDialog);
  closeShellRef.current = closeShellDialog;

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

  // ---------------------------------------------------------------------------
  // saveDraft
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // loadDraft
  // ---------------------------------------------------------------------------

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
            void fetchContentAuditRef.current(sku);
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
          void fetchContentAuditRef.current(sku);
        }
      } catch (e) {
        setDraftError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      } finally {
        setDraftLoading(false);
      }
    },
    [t, locale, marketplaceSlug, canEditProducts]
  );

  // ---------------------------------------------------------------------------
  // openEditorForRow
  // ---------------------------------------------------------------------------

  const openEditorForRow = useCallback(
    (row: MarketplaceProductListRow) => {
      closeShellRef.current?.();
      setAuditPayloadRef.current(null);
      setAuditErrorRef.current(null);
      setAuditLoadingRef.current(false);
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

  // ---------------------------------------------------------------------------
  // openCreateEditor
  // ---------------------------------------------------------------------------

  const openCreateEditor = useCallback(() => {
    closeShellRef.current?.();
    setAuditPayloadRef.current(null);
    setAuditErrorRef.current(null);
    setAuditLoadingRef.current(false);
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

  return {
    editorOpen,
    setEditorOpen,
    editorMode,
    editorSource,
    draftId,
    draftValues,
    setDraftValues,
    draftStatus,
    draftLoading,
    draftSaving,
    draftError,
    setDraftError,
    draftTableMissing,
    detailLoadHint,
    loadDraft,
    saveDraft,
    openEditorForRow,
    openCreateEditor,
  };
}
