"use client";

import { AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAmazonMarketplaceBySlug } from "@/shared/config/amazonMarketplaces";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/I18nProvider";
import { languageDisplayName } from "@/shared/components/MarketplaceLanguageBanner";
import type { AmazonProductDraftValues } from "@/shared/lib/amazonProductDraft";

export type AmazonSubmitResultHint = {
  ok: boolean;
  status: string;
  submissionId: string | null;
  issues: Array<{ severity?: string; message?: string; code?: string; attributeNames?: string[] }>;
  httpStatus?: number;
  error?: string;
};

type FieldDiff = {
  key: string;
  label: string;
  oldValue: string;
  newValue: string;
};

function stringify(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join("\n• ");
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return "";
}

/**
 * Wichtigste editierbare Felder im Amazon-Editor — wir zeigen nur Felder
 * deren Werte tatsächlich abweichen.
 */
const DIFF_FIELDS: Array<{ key: keyof AmazonProductDraftValues; label: string }> = [
  { key: "title", label: "Titel (item_name)" },
  { key: "description", label: "Beschreibung (product_description)" },
  { key: "bulletPoints", label: "Bullet Points (bullet_point)" },
  { key: "brand", label: "Marke (brand)" },
  { key: "listPriceEur", label: "Preis (purchasable_offer.our_price)" },
  { key: "uvpEur", label: "UVP (list_price)" },
  { key: "externalProductId", label: "EAN / GTIN" },
  { key: "conditionType", label: "Condition Type" },
  { key: "images", label: "Bilder" },
];

function computeDiffs(
  current: AmazonProductDraftValues,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  original: Record<string, any> | null
): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const { key, label } of DIFF_FIELDS) {
    const newRaw = current[key];
    const oldRaw = original ? original[key] : "";
    const newStr = stringify(newRaw);
    const oldStr = stringify(oldRaw);
    if (newStr === oldStr) continue;
    out.push({ key, label, oldValue: oldStr, newValue: newStr });
  }
  return out;
}

export type AmazonSubmitPreviewDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draftValues: AmazonProductDraftValues;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  originalSnapshot: Record<string, any> | null;
  amazonSlug: string;
  submitting: boolean;
  submitResult?: AmazonSubmitResultHint | null;
  onConfirm: () => void | Promise<void>;
};

export function AmazonSubmitPreviewDialog({
  open,
  onOpenChange,
  draftValues,
  originalSnapshot,
  amazonSlug,
  submitting,
  submitResult,
  onConfirm,
}: AmazonSubmitPreviewDialogProps) {
  const { t } = useTranslation();
  const config = getAmazonMarketplaceBySlug(amazonSlug);
  const diffs = computeDiffs(draftValues, originalSnapshot);
  const languageName = config ? languageDisplayName(config.languageTag, t) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("amazonSubmitPreview.title", { name: config?.shortName ?? "Amazon" })}
          </DialogTitle>
          <DialogDescription>
            {t("amazonSubmitPreview.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {config ? (
            <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base leading-none" aria-hidden>
                  {config.countryFlag}
                </span>
                <span className="font-semibold text-foreground">{config.name}</span>
                <span className="text-muted-foreground">
                  — {t("amazonSubmitPreview.language")}: {languageName} ({config.languageTag})
                </span>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {t("marketplaceLanguage.marketplaceId")}:{" "}
                <span className="font-mono">{config.marketplaceId}</span>
              </div>
            </div>
          ) : null}

          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("amazonSubmitPreview.changedFieldsLabel", { count: String(diffs.length) })}
            </h4>
            {diffs.length === 0 ? (
              <p className="rounded border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {t("amazonSubmitPreview.noChanges")}
              </p>
            ) : (
              <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {diffs.map((d) => (
                  <li
                    key={d.key}
                    className="rounded border border-border/60 bg-background px-3 py-2 text-xs"
                  >
                    <p className="mb-1 font-medium text-foreground">{d.label}</p>
                    {d.oldValue ? (
                      <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground/80">
                        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                          {t("amazonSubmitPreview.before")}:
                        </span>{" "}
                        {d.oldValue}
                      </p>
                    ) : (
                      <p className="text-muted-foreground/60 italic">
                        {t("amazonSubmitPreview.emptyBefore")}
                      </p>
                    )}
                    <p
                      className={cn(
                        "mt-1 line-clamp-4 whitespace-pre-wrap",
                        "text-foreground"
                      )}
                    >
                      <span className="text-[9px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        {t("amazonSubmitPreview.after")}:
                      </span>{" "}
                      {d.newValue || (
                        <span className="italic text-muted-foreground/60">
                          {t("amazonSubmitPreview.emptyAfter")}
                        </span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <p>{t("amazonSubmitPreview.isolationWarning", { name: config?.shortName ?? "Amazon" })}</p>
          </div>

          {submitResult && !submitResult.ok ? (
            <div className="rounded-md border border-red-500/50 bg-red-50 px-3 py-2 text-[11px] text-red-900 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-100">
              <div className="flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="font-semibold">
                  Upload fehlgeschlagen (Status: {submitResult.status}
                  {submitResult.httpStatus ? `, HTTP ${submitResult.httpStatus}` : ""})
                </span>
              </div>
              {submitResult.error ? (
                <p className="mt-1 whitespace-pre-wrap text-red-800 dark:text-red-200">
                  {submitResult.error}
                </p>
              ) : null}
              {submitResult.issues && submitResult.issues.length > 0 ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {submitResult.issues.slice(0, 8).map((iss, i) => (
                    <li key={i}>
                      {iss.severity ? <span className="font-semibold">[{iss.severity}] </span> : null}
                      {iss.message ?? iss.code ?? "Unknown"}
                      {iss.attributeNames && iss.attributeNames.length > 0
                        ? ` (${iss.attributeNames.join(", ")})`
                        : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("amazonSubmitPreview.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void onConfirm()}
            disabled={submitting || diffs.length === 0}
          >
            {submitting
              ? t("amazonSubmitPreview.submitting")
              : t("amazonSubmitPreview.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
