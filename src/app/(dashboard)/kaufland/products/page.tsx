"use client";

import { MarketplaceProductsView } from "@/shared/components/MarketplaceProductsView";

export default function KauflandProductsPage() {
  return (
    <MarketplaceProductsView
      apiUrl="/api/kaufland/products"
      cacheKey={(_s, page) => `kaufland_products_cache_v1_p${page ?? 0}`}
      serverPagination
      logoSrc="/brand/marketplaces/kaufland.svg"
      brandAlt="Kaufland"
      subtitleKey="marketplaceProducts.subtitleKaufland"
    />
  );
}
