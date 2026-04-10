"use client";

import { MarketplaceProductsView } from "@/shared/components/MarketplaceProductsView";

export default function OttoProductsPage() {
  return (
    <MarketplaceProductsView
      apiUrl="/api/otto/products"
      cacheKey="otto_products_cache_v1"
      logoSrc="/brand/marketplaces/otto.svg"
      brandAlt="Otto"
      marketplaceSlug="otto"
    />
  );
}
