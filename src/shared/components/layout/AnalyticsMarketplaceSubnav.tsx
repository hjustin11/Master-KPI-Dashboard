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
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex shrink-0 items-start gap-2">
        <div
          className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground"
          aria-hidden
        >
          <Store className="h-3.5 w-3.5" />
        </div>
        <nav
          aria-label={`Untermenü ${slug}`}
          className="min-w-0 space-y-0.5 border-l border-border pl-2.5"
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
                  "block rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-all duration-200 hover:bg-accent/60 hover:text-foreground",
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
