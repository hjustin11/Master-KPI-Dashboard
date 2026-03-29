"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Cat,
  Megaphone,
  Menu,
  Monitor,
  Package,
  PawPrint,
  ShoppingBag,
  ShoppingCart,
  Store,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { type PermissionKey, type SidebarItemKey } from "@/shared/lib/access-control";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const mainItems: Array<{
  key: SidebarItemKey;
  label: string;
  href: string;
  /** Pfadpräfix für aktiven Zustand (z. B. /amazon für alle /amazon/*). */
  activeGroup?: string;
  icon: typeof BarChart3;
  requiredPermissions?: PermissionKey[];
}> = [
  {
    key: "amazon",
    label: "Amazon",
    href: "/amazon/orders",
    activeGroup: "/amazon",
    icon: ShoppingCart,
    requiredPermissions: ["manage_integrations"],
  },
  {
    key: "otto",
    label: "Otto",
    href: "/otto/orders",
    activeGroup: "/otto",
    icon: ShoppingBag,
    requiredPermissions: ["manage_integrations"],
  },
  {
    key: "kaufland",
    label: "Kaufland",
    href: "/kaufland/orders",
    activeGroup: "/kaufland",
    icon: Store,
    requiredPermissions: ["manage_integrations"],
  },
  {
    key: "fressnapf",
    label: "Fressnapf",
    href: "/fressnapf/orders",
    activeGroup: "/fressnapf",
    icon: PawPrint,
    requiredPermissions: ["manage_integrations"],
  },
  {
    key: "xentral",
    label: "Xentral",
    href: "/xentral/products",
    activeGroup: "/xentral",
    icon: Package,
    requiredPermissions: ["manage_integrations"],
  },
  {
    key: "advertising",
    label: "Werbung",
    href: "/advertising/campaigns",
    activeGroup: "/advertising",
    icon: Megaphone,
    requiredPermissions: ["manage_integrations"],
  },
  {
    key: "analytics",
    label: "Analytics",
    href: "/analytics/marketplaces",
    activeGroup: "/analytics",
    icon: BarChart3,
    requiredPermissions: ["export_data"],
  },
];

const moreItems: Array<{
  key: SidebarItemKey;
  label: string;
  href: string;
  /** z. B. /settings für Hervorhebung aller Unterseiten */
  activePrefix?: string;
  requiredPermissions?: PermissionKey[];
}> = [
  { key: "analytics", label: "Marktplätze", href: "/analytics/marketplaces", requiredPermissions: ["export_data"] },
  { key: "analytics", label: "Artikelprognose", href: "/analytics/article-forecast", requiredPermissions: ["export_data"] },
  { key: "analytics", label: "Beschaffung", href: "/analytics/procurement", requiredPermissions: ["export_data"] },
  { key: "analytics", label: "Performance", href: "/analytics/performance", requiredPermissions: ["export_data"] },
  {
    key: "settings",
    label: "Administration",
    href: "/settings/users",
    activePrefix: "/settings/users",
  },
  {
    key: "updates",
    label: "Update & Feedback",
    href: "/updates",
    requiredPermissions: ["manage_users"],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav() {
  const pathname = usePathname();
  const { canAccessSidebarItem, hasPermission } = usePermissions();
  const visibleMainItems = mainItems.filter(
    (item) =>
      canAccessSidebarItem(item.key) &&
      (item.requiredPermissions?.every((permission) => hasPermission(permission)) ?? true)
  );
  const visibleMoreItems = moreItems.filter(
    (item) =>
      canAccessSidebarItem(item.key) &&
      (item.requiredPermissions?.every((permission) => hasPermission(permission)) ?? true)
  );
  const moreActive = visibleMoreItems.some((item) =>
    isActive(pathname, item.activePrefix ?? item.href)
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/80 backdrop-blur-lg md:hidden">
      <div className="flex h-16 items-stretch">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {visibleMainItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.activeGroup ?? item.href);

            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  "flex min-w-[68px] shrink-0 flex-col items-center justify-center gap-1 px-0.5 text-[10px] transition-colors duration-150 sm:text-[11px]",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="max-w-[72px] truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <Sheet>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                className={cn(
                  "h-full w-14 shrink-0 rounded-none flex-col gap-1 text-[11px] transition-colors duration-150",
                  moreActive ? "text-primary" : "text-muted-foreground"
                )}
              />
            }
          >
            <Menu className="h-4 w-4" />
            <span>Mehr</span>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl border-t bg-background/95">
            <SheetHeader>
              <SheetTitle>Weitere Bereiche</SheetTitle>
              <SheetDescription>Schnellzugriff auf alle Menuepunkte</SheetDescription>
            </SheetHeader>
            <div className="space-y-2 p-4 pt-0">
              {visibleMoreItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm transition-colors duration-150 hover:bg-accent/60",
                    isActive(pathname, item.activePrefix ?? item.href) ? "bg-primary/10 text-primary" : ""
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
