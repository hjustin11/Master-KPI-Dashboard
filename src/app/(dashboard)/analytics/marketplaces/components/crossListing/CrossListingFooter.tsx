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
  onClose: () => void;
  onSave: () => void;
  onUpload: () => void;
}) {
  const { t } = useTranslation();
  const uploadDisabled = !uploadEnabled || uploading || saving;
  return (
    <DialogFooter className={MARKETPLACE_PRODUCT_EDITOR_FOOTER_CLASS}>
      <div className="flex items-center gap-2">
        {missing.length > 0 && (
          <span className="text-[10px] text-amber-600">
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
          title={uploadEnabled ? undefined : t("crossListing.upload.comingSoon")}
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
