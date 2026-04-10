import type { DevReportChannelId } from "./developmentReportSalesApi";

export function devReportChannelBrand(id: DevReportChannelId): { logoSrc: string } {
  const map: Record<DevReportChannelId, string> = {
    amazon: "/brand/amazon-logo-current.png",
    ebay: "/brand/marketplaces/ebay.svg",
    otto: "/brand/marketplaces/otto.svg",
    kaufland: "/brand/marketplaces/kaufland.svg",
    fressnapf: "/brand/marketplaces/fressnapf.svg",
    "mediamarkt-saturn": "/brand/marketplaces/mediamarkt-saturn.svg",
    zooplus: "/brand/marketplaces/zooplus.svg",
    tiktok: "/brand/marketplaces/tiktok.svg",
    shopify: "/brand/marketplaces/shopify.svg",
  };
  return { logoSrc: map[id] };
}
