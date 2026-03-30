"use client";

import { MarketplaceProductsView } from "@/shared/components/MarketplaceProductsView";

export default function ShopifyProductsPage() {
  return (
    <MarketplaceProductsView
      apiUrl="/api/shopify/products"
      cacheKey="shopify_products_cache_v1"
      logoSrc="/brand/marketplaces/shopify.svg"
      brandAlt="Shopify"
      subtitleKey="marketplaceProducts.subtitleShopify"
    />
  );
}
