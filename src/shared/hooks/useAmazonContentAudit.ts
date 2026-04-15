import { useCallback, useMemo, useState } from "react";
import type { AmazonContentAuditPayload } from "@/shared/lib/amazonContentAuditPayload";
import type { AmazonAuditFinding } from "@/shared/lib/amazonContentAudit";
import {
  buildAmazonTitleRecommendation,
  getTitleAuditFindings,
} from "@/shared/lib/amazonContentAudit";
import {
  sanitizeAmazonBulletPoints,
  sanitizeAmazonDescription,
} from "@/shared/lib/amazonProductDraft";

// ---------------------------------------------------------------------------
// Types re-exported for the parent component
// ---------------------------------------------------------------------------

export type ContentAuditFieldChip = {
  show: boolean;
  proposedText: string;
  sourceLabel: string;
};

export type ContentAuditTitleBadge = {
  kind: "ok" | "warnStructural" | "warnLlm" | "errorLlm" | "noLlm";
  label: string;
  titleAttr: string;
};

export type ContentAuditSuggestions = {
  title: ContentAuditFieldChip;
  description: ContentAuditFieldChip;
  /** Alle Bullets als Block (für "Alle übernehmen"). */
  bullets: ContentAuditFieldChip;
  /** Per-Bullet Chips (Index 0–4) für individuelle Vergleichs-Icons. */
  bulletChips: ContentAuditFieldChip[];
  /** Reason-Text für Bullets (von LLM fields.bulletPoints.reason). */
  bulletsReason: string;
  brand: ContentAuditFieldChip;
  searchTerms: ContentAuditFieldChip;
  ean: boolean;
  productType: ContentAuditFieldChip;
  packageLength: ContentAuditFieldChip;
  packageWidth: ContentAuditFieldChip;
  packageHeight: ContentAuditFieldChip;
  packageWeight: ContentAuditFieldChip;
  titleAuditFindings: AmazonAuditFinding[];
  titleBadge: ContentAuditTitleBadge | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const emptyAuditChip = (): ContentAuditFieldChip => ({
  show: false,
  proposedText: "",
  sourceLabel: "",
});

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAmazonContentAudit(args: {
  marketplaceSlug: string;
  canEditProducts: boolean;
  draftValues: {
    title: string;
    brand: string;
    description: string;
    bulletPoints: string[];
    externalProductId: string;
    /** Optional — wird für LLM-Vorschlag des Amazon-Produkttyps verglichen. */
    productType?: string;
    packageLength?: string;
    packageWidth?: string;
    packageHeight?: string;
    packageWeight?: string;
  };
}): {
  auditPayload: AmazonContentAuditPayload | null;
  auditLoading: boolean;
  auditError: string | null;
  contentAuditSuggestions: ContentAuditSuggestions;
  displayedContentAuditFindings: AmazonAuditFinding[];
  fetchContentAudit: (sku: string, options?: { refresh?: boolean }) => Promise<void>;
  setAuditPayload: React.Dispatch<React.SetStateAction<AmazonContentAuditPayload | null>>;
  setAuditError: React.Dispatch<React.SetStateAction<string | null>>;
  setAuditLoading: React.Dispatch<React.SetStateAction<boolean>>;
} {
  const { marketplaceSlug, canEditProducts, draftValues } = args;

  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditPayload, setAuditPayload] = useState<AmazonContentAuditPayload | null>(null);

  // ---------------------------------------------------------------------------
  // contentAuditSuggestions
  // ---------------------------------------------------------------------------

  const contentAuditSuggestions = useMemo<ContentAuditSuggestions>(() => {
    const emptyFindings: AmazonAuditFinding[] = [];
    if (!auditPayload || marketplaceSlug !== "amazon" || !canEditProducts) {
      return {
        title: emptyAuditChip(),
        description: emptyAuditChip(),
        bullets: emptyAuditChip(),
        bulletChips: [emptyAuditChip(), emptyAuditChip(), emptyAuditChip(), emptyAuditChip(), emptyAuditChip()],
        bulletsReason: "",
        brand: emptyAuditChip(),
        searchTerms: emptyAuditChip(),
        ean: false,
        productType: emptyAuditChip(),
        packageLength: emptyAuditChip(),
        packageWidth: emptyAuditChip(),
        packageHeight: emptyAuditChip(),
        packageWeight: emptyAuditChip(),
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
        sourceLabel: `LLM${llmOpt?.model ? ` (${llmOpt.model})` : ""}: ${llmOpt?.summary ? `${llmOpt.summary.slice(0, 140)}${llmOpt.summary.length > 140 ? "..." : ""}` : "Alternativer Titelvorschlag"}`,
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
    const llmDescRaw = llmOpt?.improvedDescription?.trim() ?? "";

    let description = emptyAuditChip();
    if (llmDescRaw && sanitizeAmazonDescription(llmDescRaw) !== curDesc) {
      description = {
        show: true,
        proposedText: llmDescRaw,
        sourceLabel: `LLM${llmOpt?.model ? ` (${llmOpt.model})` : ""}: Optimierte Beschreibung`,
      };
    } else if (recDesc && recDesc !== curDesc) {
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

    const llmBullets = llmOpt?.improvedBulletPoints ?? null;
    const propB = llmBullets && llmBullets.length > 0
      ? sanitizeAmazonBulletPoints(llmBullets)
      : sanitizeAmazonBulletPoints(rec.bulletPoints);
    const curB = sanitizeAmazonBulletPoints(draftValues.bulletPoints);
    const bulletsDiffer = propB.join("\u001e") !== curB.slice(0, 5).join("\u001e");
    const bulletsFew = auditPayload.findings.some((f) => f.id === "bullets-too-few");
    const bulletsFromLlm = llmBullets && llmBullets.length > 0;

    let bullets = emptyAuditChip();
    const bulletsSourceLabel = bulletsFromLlm
      ? `LLM${llmOpt?.model ? ` (${llmOpt.model})` : ""}: Optimierte Bullet Points`
      : bulletsFew
        ? "Prüfung: Bullet-Vorschlag aus Beschreibung / Listung"
        : "Prüfung: konsolidierte Bullet Points";
    if (propB.length > 0 && bulletsDiffer && (bulletsFew || propB.length >= 3 || bulletsFromLlm)) {
      bullets = {
        show: true,
        proposedText: propB.slice(0, 5).join("\n"),
        sourceLabel: bulletsSourceLabel,
      };
    }

    // Per-Bullet Chips für individuelle Vergleichs-Icons
    const bulletsReason = llmOpt?.fields?.bulletPoints?.reason ?? "";
    const bulletChips: ContentAuditFieldChip[] = [0, 1, 2, 3, 4].map((idx) => {
      const proposed = propB[idx]?.trim() ?? "";
      const current = curB[idx]?.trim() ?? "";
      if (!proposed || proposed === current) return emptyAuditChip();
      return {
        show: true,
        proposedText: proposed,
        sourceLabel: `${bulletsSourceLabel} — Bullet ${idx + 1}`,
      };
    });

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

    const llmSearchTerms = llmOpt?.improvedSearchTerms?.trim() ?? "";
    const recSearchTerms = rec.searchTerms?.trim() ?? "";
    let searchTerms = emptyAuditChip();
    const proposedSt = llmSearchTerms || recSearchTerms;
    if (proposedSt) {
      searchTerms = {
        show: true,
        proposedText: proposedSt,
        sourceLabel: llmSearchTerms
          ? `LLM${llmOpt?.model ? ` (${llmOpt.model})` : ""}: Optimierte Suchbegriffe`
          : "Prüfung: empfohlene Suchbegriffe aus Kanalabgleich",
      };
    }

    const xe = (auditPayload.xentralEan ?? "").replace(/\D/g, "");
    const ean = Boolean(xe.length >= 8 && !draftValues.externalProductId.trim());

    // ---------------------------------------------------------------------
    // NEU (Claude-Provider): per-Feld Optimierungen aus llmOpt.fields
    // ---------------------------------------------------------------------
    const llmFields = llmOpt?.fields;
    const providerLabel = llmOpt?.provider === "claude" ? "Claude" : llmOpt?.provider === "openai" ? "LLM" : "LLM";
    const modelSuffix = llmOpt?.model ? ` (${llmOpt.model})` : "";

    const stringFieldChip = (
      key: keyof NonNullable<typeof llmFields>,
      currentValue: string,
      labelHint: string
    ): ContentAuditFieldChip => {
      const fieldOpt = llmFields?.[key];
      if (!fieldOpt) return emptyAuditChip();
      const improved = fieldOpt.improved;
      if (improved == null) return emptyAuditChip();
      const proposed = Array.isArray(improved) ? improved[0] ?? "" : improved;
      const proposedTrim = proposed.trim();
      if (!proposedTrim || proposedTrim === currentValue.trim()) return emptyAuditChip();
      const ruleSuffix = fieldOpt.ruleIds && fieldOpt.ruleIds.length > 0 ? ` · ${fieldOpt.ruleIds.join(", ")}` : "";
      return {
        show: true,
        proposedText: proposedTrim,
        sourceLabel: `${providerLabel}${modelSuffix}: ${labelHint}${ruleSuffix}`,
      };
    };

    const productType = stringFieldChip("productType", draftValues.productType ?? "", "Amazon-Produkttyp-Vorschlag");
    const packageLength = stringFieldChip("packageLength", draftValues.packageLength ?? "", "Paket-Länge (cm)");
    const packageWidth = stringFieldChip("packageWidth", draftValues.packageWidth ?? "", "Paket-Breite (cm)");
    const packageHeight = stringFieldChip("packageHeight", draftValues.packageHeight ?? "", "Paket-Höhe (cm)");
    const packageWeight = stringFieldChip("packageWeight", draftValues.packageWeight ?? "", "Paket-Gewicht (kg)");

    return {
      title,
      description,
      bullets,
      bulletChips,
      bulletsReason,
      brand,
      searchTerms,
      ean,
      productType,
      packageLength,
      packageWidth,
      packageHeight,
      packageWeight,
      titleAuditFindings,
      titleBadge,
    };
  }, [auditPayload, canEditProducts, draftValues, marketplaceSlug]);

  // ---------------------------------------------------------------------------
  // displayedContentAuditFindings
  // ---------------------------------------------------------------------------

  const displayedContentAuditFindings = useMemo<AmazonAuditFinding[]>(() => {
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
      llmOpt.issues.forEach((rawIssue, i: number) => {
        const msg = typeof rawIssue === "string" ? rawIssue : rawIssue.message;
        const ruleId = typeof rawIssue === "string" ? null : rawIssue.ruleId ?? null;
        const fieldFromIssue = typeof rawIssue === "string" ? "title" : rawIssue.field || "title";
        const severity: "high" | "medium" | "low" | "info" =
          typeof rawIssue === "string"
            ? "medium"
            : rawIssue.severity === "high"
              ? "high"
              : rawIssue.severity === "low"
                ? "low"
                : rawIssue.severity === "info"
                  ? "info"
                  : "medium";
        const prefix = ruleId ? `[${ruleId}] ` : "";
        llmRows.push({
          id: `llm-title-issue-${i}`,
          severity,
          message: `${prefix}${msg}`,
          recommendation: llmOpt.improvedTitle ? `Vorschlag: ${llmOpt.improvedTitle}` : undefined,
          field: fieldFromIssue as AmazonAuditFinding["field"],
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

  // ---------------------------------------------------------------------------
  // fetchContentAudit
  // ---------------------------------------------------------------------------

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

  return {
    auditPayload,
    auditLoading,
    auditError,
    contentAuditSuggestions,
    displayedContentAuditFindings,
    fetchContentAudit,
    setAuditPayload,
    setAuditError,
    setAuditLoading,
  };
}
