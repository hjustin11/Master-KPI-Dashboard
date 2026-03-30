"use client";

import { resolveSellerPortalOrderUrl, trimMarketplaceOrderId } from "@/shared/lib/marketplaceSellerOrderLink";
import { cn } from "@/lib/utils";

type MarketplaceOrderIdLinkProps = {
  marketplace?: string;
  internetNumber?: string;
  className?: string;
};

export function MarketplaceOrderIdLink({ marketplace, internetNumber, className }: MarketplaceOrderIdLinkProps) {
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
      title={`Auftrag im Seller-Portal öffnen (${display})`}
    >
      {display}
    </a>
  );
}
