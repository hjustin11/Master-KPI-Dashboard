"use client";

import { MarketplaceProductsView } from "@/shared/components/MarketplaceProductsView";

export default function MmsProductsPage() {
  return (
    <MarketplaceProductsView
      apiUrl="/api/mediamarkt-saturn/products"
      cacheKey="mms_products_cache_v1"
      logoSrc="/brand/marketplaces/mediamarkt-saturn.svg"
      brandAlt="MediaMarkt & Saturn"
      subtitleKey="marketplaceProducts.subtitleMms"
    />
  );
}
