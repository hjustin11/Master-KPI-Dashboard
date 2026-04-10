export type MarketplaceIntegrationRefreshResource = "orders" | "products" | "both";

export type PostMarketplaceIntegrationCacheRefreshArgs = {
  marketplace: string;
  resource: MarketplaceIntegrationRefreshResource;
  fromYmd?: string;
  toYmd?: string;
};

export async function postMarketplaceIntegrationCacheRefresh(
  args: PostMarketplaceIntegrationCacheRefreshArgs
): Promise<Record<string, unknown>> {
  const res = await fetch("/api/marketplaces/integration-cache/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      marketplace: args.marketplace,
      resource: args.resource,
      ...(args.fromYmd ? { fromYmd: args.fromYmd } : {}),
      ...(args.toYmd ? { toYmd: args.toYmd } : {}),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof json.error === "string" ? json.error : "Refresh fehlgeschlagen.";
    throw new Error(err);
  }
  if (json.ok !== true) {
    throw new Error(typeof json.error === "string" ? json.error : "Refresh fehlgeschlagen.");
  }
  return json;
}
