"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const segmentLabels: Record<string, string> = {
  amazon: "Amazon",
  orders: "Bestellungen",
  products: "Produkte",
  returns: "Retouren",
  xentral: "Xentral",
  articles: "Artikel",
  advertising: "Werbung",
  campaigns: "Kampagnen",
  performance: "Performance",
  analytics: "Analytics",
  marketplaces: "Marktplätze",
  otto: "Otto",
  ebay: "eBay",
  kaufland: "Kaufland",
  fressnapf: "Fressnapf",
  "mediamarkt-saturn": "MediaMarkt & Saturn",
  zooplus: "ZooPlus",
  tiktok: "TikTok",
  "article-forecast": "Artikelprognose",
  settings: "Administration",
  profile: "Profil",
  users: "Benutzerverwaltung",
  updates: "Update & Feedback",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const cleanPath = pathname.split("/").filter(Boolean);

  if (pathname === "/" || cleanPath.length === 0) {
    return null;
  }

  const items = cleanPath.map((segment, index) => ({
    label: segmentLabels[segment] ?? segment,
    href: `/${cleanPath.slice(0, index + 1).join("/")}`,
  }));

  return (
    <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={item.href} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="h-3.5 w-3.5" /> : null}
            {isLast ? (
              <span className="font-medium text-foreground">{item.label}</span>
            ) : (
              <Link href={item.href} className="transition-colors duration-150 hover:text-foreground">
                {item.label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
