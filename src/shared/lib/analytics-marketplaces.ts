import {
  WIKIMEDIA_FRESSNAPF_LOGO_2023_SVG,
  WIKIMEDIA_MEDIAMARKT_SATURN_LOGO_SVG,
  WIKIMEDIA_SHOPIFY_LOGO_2018_SVG,
  WIKIMEDIA_ZOOPLUS_LOGO_PNG,
} from "@/shared/lib/dashboardUi";

export const ANALYTICS_MARKETPLACES = [
  { slug: "otto", label: "Otto", logo: "/brand/marketplaces/otto.svg" },
  { slug: "ebay", label: "eBay", logo: "/brand/marketplaces/ebay.svg" },
  { slug: "kaufland", label: "Kaufland", logo: "/brand/marketplaces/kaufland.svg" },
  { slug: "fressnapf", label: "Fressnapf", logo: WIKIMEDIA_FRESSNAPF_LOGO_2023_SVG },
  {
    slug: "mediamarkt-saturn",
    label: "MediaMarkt & Saturn",
    logo: WIKIMEDIA_MEDIAMARKT_SATURN_LOGO_SVG,
  },
  { slug: "zooplus", label: "ZooPlus", logo: WIKIMEDIA_ZOOPLUS_LOGO_PNG },
  { slug: "tiktok", label: "TikTok", logo: "/brand/marketplaces/tiktok.svg" },
  { slug: "shopify", label: "Shopify", logo: WIKIMEDIA_SHOPIFY_LOGO_2018_SVG },
] as const;

export type AnalyticsMarketplaceSlug = (typeof ANALYTICS_MARKETPLACES)[number]["slug"];

export type AnalyticsMarketplace = (typeof ANALYTICS_MARKETPLACES)[number];

export function getMarketplaceBySlug(slug: string): AnalyticsMarketplace | undefined {
  return ANALYTICS_MARKETPLACES.find((m) => m.slug === slug);
}
