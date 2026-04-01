"use client";

import { resolveSellerPortalOrderUrl, trimMarketplaceOrderId } from "@/shared/lib/marketplaceSellerOrderLink";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/I18nProvider";

type MarketplaceOrderIdLinkProps = {
  marketplace?: string;
  /** Marktplatz-Bestellnummer (Xentral: internetNumber; APIs: orderId). */
  internetNumber?: string;
  className?: string;
};

export function MarketplaceOrderIdLink({ marketplace, internetNumber, className }: MarketplaceOrderIdLinkProps) {
  const { t } = useTranslation();
  const raw = trimMarketplaceOrderId(internetNumber ?? "");
  const display = raw || "—";
  const url = resolveSellerPortalOrderUrl(marketplace ?? "", raw);

  if (!url || display === "—") {
    return (
      <span
        className={cn("tabular-nums text-muted-foreground", className)}
        title={display === "—" ? undefined : display}
      >
        {display}
      </span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "tabular-nums font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className
      )}
      title={t("common.openMarketplaceOrderTitle", { id: display })}
    >
      {display}
    </a>
  );
}
