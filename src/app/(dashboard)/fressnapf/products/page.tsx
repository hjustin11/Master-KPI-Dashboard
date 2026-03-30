"use client";

import { MarketplaceProductsView } from "@/shared/components/MarketplaceProductsView";

export default function FressnapfProductsPage() {
  return (
    <MarketplaceProductsView
      apiUrl="/api/fressnapf/products"
      cacheKey="fressnapf_products_cache_v1"
      logoSrc="/brand/marketplaces/fressnapf.svg"
      brandAlt="Fressnapf"
      subtitleKey="marketplaceProducts.subtitleFressnapf"
    />
  );
}
