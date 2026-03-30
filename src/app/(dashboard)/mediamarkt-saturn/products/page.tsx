"use client";

import { MarketplaceProductsView } from "@/shared/components/MarketplaceProductsView";
import {
  DASHBOARD_MARKETPLACE_LOGO_FRAME_EXT_MD,
  WIKIMEDIA_MEDIAMARKT_SATURN_LOGO_SVG,
} from "@/shared/lib/dashboardUi";

export default function MmsProductsPage() {
  return (
    <MarketplaceProductsView
      apiUrl="/api/mediamarkt-saturn/products"
      cacheKey="mms_products_cache_v1"
      logoSrc={WIKIMEDIA_MEDIAMARKT_SATURN_LOGO_SVG}
      brandAlt="MediaMarkt & Saturn"
      logoFrameClassName={DASHBOARD_MARKETPLACE_LOGO_FRAME_EXT_MD}
    />
  );
}
