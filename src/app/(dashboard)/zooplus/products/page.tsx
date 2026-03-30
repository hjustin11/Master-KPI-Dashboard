"use client";

import { MarketplaceProductsView } from "@/shared/components/MarketplaceProductsView";
import {
  DASHBOARD_MARKETPLACE_LOGO_FRAME_EXT_LG,
  WIKIMEDIA_ZOOPLUS_LOGO_PNG,
} from "@/shared/lib/dashboardUi";

export default function ZooplusProductsPage() {
  return (
    <MarketplaceProductsView
      apiUrl="/api/zooplus/products"
      cacheKey="zooplus_products_cache_v1"
      logoSrc={WIKIMEDIA_ZOOPLUS_LOGO_PNG}
      brandAlt="ZooPlus"
      logoFrameClassName={DASHBOARD_MARKETPLACE_LOGO_FRAME_EXT_LG}
      titleRowGapClassName="gap-1"
    />
  );
}
