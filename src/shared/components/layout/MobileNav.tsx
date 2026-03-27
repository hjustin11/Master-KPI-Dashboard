"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Megaphone, Menu, Package, ShoppingCart } from "lucide-react";
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
  icon: typeof Home;
  requiredPermissions?: PermissionKey[];
}> = [
  { key: "overview", label: "Home", href: "/", icon: Home },
  { key: "amazon", label: "Amazon", href: "/amazon", icon: ShoppingCart, requiredPermissions: ["manage_integrations"] },
  { key: "xentral", label: "Xentral", href: "/xentral", icon: Package, requiredPermissions: ["manage_integrations"] },
  { key: "advertising", label: "Werbung", href: "/advertising", icon: Megaphone, requiredPermissions: ["manage_integrations"] },
];

const moreItems: Array<{
  key: SidebarItemKey;
  label: string;
  href: string;
  requiredPermissions?: PermissionKey[];
}> = [
  { key: "analytics", label: "Analytics", href: "/analytics", requiredPermissions: ["export_data"] },
  { key: "settings", label: "Einstellungen", href: "/settings" },
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
  const moreActive = visibleMoreItems.some((item) => isActive(pathname, item.href));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/80 backdrop-blur-lg md:hidden">
      <div className="grid h-16 grid-cols-5">
        {visibleMainItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[11px] transition-colors duration-150",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <Sheet>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                className={cn(
                  "h-full w-full rounded-none flex-col gap-1 text-[11px] transition-colors duration-150",
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
                    isActive(pathname, item.href) ? "bg-primary/10 text-primary" : ""
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
