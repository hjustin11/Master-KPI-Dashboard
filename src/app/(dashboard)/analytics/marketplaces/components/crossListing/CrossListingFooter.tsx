"use client";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { MARKETPLACE_PRODUCT_EDITOR_FOOTER_CLASS } from "@/shared/lib/marketplaceProductEditorTokens";
import { useTranslation } from "@/i18n/I18nProvider";

export function CrossListingFooter({
  missing,
  error,
  saving,
  canSave,
  uploadEnabled,
  uploading,
  persistedDraftId,
  onClose,
  onSave,
  onUpload,
}: {
  missing: string[];
  error: string | null;
  saving: boolean;
  canSave: boolean;
  uploadEnabled: boolean;
  uploading: boolean;
  persistedDraftId?: string | null;
  onClose: () => void;
  onSave: () => void;
  onUpload: () => void;
}) {
  const { t } = useTranslation();
  const uploadDisabled = !uploadEnabled || uploading || saving;

  let uploadDisabledReason: string | undefined;
  if (!uploadEnabled) {
    if (!persistedDraftId) uploadDisabledReason = t("crossListing.upload.saveFirst");
    else if (missing.length > 0)
      uploadDisabledReason = `${t("crossListing.missing")}: ${missing.join(", ")}`;
    else uploadDisabledReason = t("crossListing.upload.comingSoon");
  }

  return (
    <DialogFooter className={MARKETPLACE_PRODUCT_EDITOR_FOOTER_CLASS}>
      <div className="flex items-center gap-2">
        {missing.length > 0 && (
          <span className="text-[11px] font-medium text-amber-600">
            {t("crossListing.missing")}: {missing.join(", ")}
          </span>
        )}
        {error && <span className="text-[10px] text-rose-600">{error}</span>}
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={saving || uploading}>
          {t("crossListing.action.cancel")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onUpload}
          disabled={uploadDisabled}
          title={uploadDisabledReason}
        >
          {uploading ? t("crossListing.upload.loading") : t("crossListing.action.upload")}
        </Button>
        <Button size="sm" onClick={onSave} disabled={!canSave}>
          {t("crossListing.action.saveDraft")}
        </Button>
      </div>
    </DialogFooter>
  );
}
