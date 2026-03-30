"use client";

import { MarketplaceProductsView } from "@/shared/components/MarketplaceProductsView";

export default function ZooplusProductsPage() {
  return (
    <MarketplaceProductsView
      apiUrl="/api/zooplus/products"
      cacheKey="zooplus_products_cache_v1"
      logoSrc="/brand/marketplaces/zooplus.svg"
      brandAlt="ZooPlus"
      subtitleKey="marketplaceProducts.subtitleZooplus"
    />
  );
}
