"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store } from "lucide-react";
import { cn } from "@/lib/utils";

type AnalyticsMarketplaceSubnavProps = {
  slug: string;
};

export function AnalyticsMarketplaceSubnav({ slug }: AnalyticsMarketplaceSubnavProps) {
  const pathname = usePathname();
  const base = `/analytics/marketplaces/${slug}`;
  const links = [
    { label: "Übersicht", href: base },
    { label: "Bestellungen", href: `${base}/orders` },
    { label: "Produkte", href: `${base}/products` },
    { label: "Retouren", href: `${base}/returns` },
  ] as const;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-6">
      <div className="flex shrink-0 items-start gap-3">
        <div
          className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground"
          aria-hidden
        >
          <Store className="h-4 w-4" />
        </div>
        <nav
          aria-label={`Untermenü ${slug}`}
          className="min-w-0 space-y-1 border-l border-border pl-3"
        >
          {links.map((link) => {
            const active =
              link.href === base
                ? pathname === base
                : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "block rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-all duration-200 hover:bg-accent/60 hover:text-foreground",
                  active && "font-medium text-primary"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
