"use client";

import { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/I18nProvider";
import {
  postMarketplaceIntegrationCacheRefresh,
  type MarketplaceIntegrationRefreshResource,
} from "@/shared/lib/marketplaceIntegrationCacheRefreshClient";
import { cn } from "@/lib/utils";

type Props = {
  marketplace: string;
  resource: MarketplaceIntegrationRefreshResource;
  /** Nur für `orders` / `both` — gleicher Zeitraum wie die Seite. */
  fromYmd?: string;
  toYmd?: string;
  disabled?: boolean;
  className?: string;
  onAfterSuccess?: () => void | Promise<void>;
};

export function MarketplaceCacheRefreshButton({
  marketplace,
  resource,
  fromYmd,
  toYmd,
  disabled,
  className,
  onAfterSuccess,
}: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    setBusy(true);
    try {
      await postMarketplaceIntegrationCacheRefresh({
        marketplace,
        resource,
        ...(fromYmd && toYmd ? { fromYmd, toYmd } : {}),
      });
      toast.success(t("marketplaceCache.refreshOk"));
      await onAfterSuccess?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("marketplaceCache.refreshFailed"));
    } finally {
      setBusy(false);
    }
  }, [fromYmd, marketplace, onAfterSuccess, resource, t, toYmd]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("gap-1.5", className)}
      disabled={disabled || busy}
      onClick={() => void onClick()}
    >
      <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} aria-hidden />
      {busy ? t("marketplaceCache.refreshing") : t("marketplaceCache.refresh")}
    </Button>
  );
}
