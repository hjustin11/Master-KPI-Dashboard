"use client";

import { MarketplaceProductsView } from "@/shared/components/MarketplaceProductsView";
import {
  DASHBOARD_MARKETPLACE_LOGO_FRAME_EXT_MD,
  WIKIMEDIA_SHOPIFY_LOGO_2018_SVG,
} from "@/shared/lib/dashboardUi";

export default function ShopifyProductsPage() {
  return (
    <MarketplaceProductsView
      apiUrl="/api/shopify/products"
      cacheKey="shopify_products_cache_v1"
      logoSrc={WIKIMEDIA_SHOPIFY_LOGO_2018_SVG}
      brandAlt="Shopify"
      marketplaceSlug="shopify"
      logoFrameClassName={DASHBOARD_MARKETPLACE_LOGO_FRAME_EXT_MD}
    />
  );
}
