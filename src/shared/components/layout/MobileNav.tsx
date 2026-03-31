"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
  BarChart3,
  Construction,
  Megaphone,
  Menu,
  Package,
  PawPrint,
  ShoppingBag,
  ShoppingCart,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { useUser } from "@/shared/hooks/useUser";
import { useTranslation } from "@/i18n/I18nProvider";
import { useTutorialNavGate } from "@/shared/components/tutorial/TutorialNavContext";
import { type PermissionKey, type SidebarItemKey } from "@/shared/lib/access-control";
import { useAppStore } from "@/shared/stores/useAppStore";
import type { NavAccessEditConfig } from "@/shared/lib/nav-access-edit";
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
  { key: "analytics", label: "Bedarfsprognose", href: "/analytics/article-forecast", requiredPermissions: ["export_data"] },
  { key: "analytics", label: "Beschaffung", href: "/analytics/procurement", requiredPermissions: ["export_data"] },
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
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const user = useUser();
  const { visibleSidebarKeys } = useTutorialNavGate();
  const { canAccessSidebarItem, hasPermission, isAdvertisingDeveloper } = usePermissions();
  const activeRole = useAppStore((s) => s.activeRole);
  const roleTestingEnabled = useAppStore((s) => s.roleTestingEnabled);
  const roleTestAccessEditMode = useAppStore((s) => s.roleTestAccessEditMode);
  const roleSidebarItems = useAppStore((s) => s.roleSidebarItems);
  const toggleRoleSidebarItem = useAppStore((s) => s.toggleRoleSidebarItem);
  const advertisingLocked = !user.isLoading && !isAdvertisingDeveloper;

  const navAccessEdit = useMemo((): NavAccessEditConfig | undefined => {
    if (user.isLoading || user.roleKey !== "owner" || !roleTestingEnabled || !roleTestAccessEditMode) {
      return undefined;
    }
    return {
      targetRoleKey: activeRole,
      isChecked: (key: SidebarItemKey) => Boolean(roleSidebarItems[activeRole]?.[key]),
      toggle: (key: SidebarItemKey) => toggleRoleSidebarItem(activeRole, key),
    };
  }, [
    user.isLoading,
    user.roleKey,
    roleTestingEnabled,
    roleTestAccessEditMode,
    activeRole,
    roleSidebarItems,
    toggleRoleSidebarItem,
  ]);
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
  const gateAllow = visibleSidebarKeys === null ? null : new Set(visibleSidebarKeys);
  const visibleMainItemsGated =
    gateAllow === null
      ? visibleMainItems
      : visibleMainItems.filter((item) => gateAllow.has(item.key));
  const visibleMoreItemsGated =
    gateAllow === null
      ? visibleMoreItems
      : visibleMoreItems.filter((item) => gateAllow.has(item.key));
  const moreActive = visibleMoreItemsGated.some((item) =>
    isActive(pathname, item.activePrefix ?? item.href)
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/80 backdrop-blur-lg md:hidden">
      <div className="flex h-16 items-stretch">
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {visibleMainItemsGated.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.activeGroup ?? item.href);

            if (item.key === "advertising" && advertisingLocked) {
              return (
                <span
                  key={item.key}
                  data-tutorial-nav={item.key}
                  title={t("nav.advertisingLockedHint")}
                  className={cn(
                    "flex min-w-[72px] shrink-0 cursor-not-allowed flex-col items-center justify-center gap-1 px-0.5 text-[10px] opacity-60 transition-colors duration-150 sm:text-[11px]",
                    "text-muted-foreground"
                  )}
                >
                  {navAccessEdit ? (
                    <input
                      type="checkbox"
                      className="mb-0.5 h-3 w-3 accent-primary"
                      checked={navAccessEdit.isChecked(item.key)}
                      disabled={navAccessEdit.targetRoleKey === "owner"}
                      onChange={() => navAccessEdit.toggle(item.key)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Sidebar"
                    />
                  ) : null}
                  <span className="inline-flex items-center justify-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/[0.12] px-1 py-0.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                    <Construction
                      className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500"
                      aria-hidden
                    />
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </span>
                  <span className="max-w-[72px] truncate">{item.label}</span>
                </span>
              );
            }

            return (
              <div
                key={item.key}
                className="flex min-w-[68px] shrink-0 flex-col items-center justify-center px-0.5"
              >
                {navAccessEdit ? (
                  <input
                    type="checkbox"
                    className="mb-0.5 h-3 w-3 accent-primary"
                    checked={navAccessEdit.isChecked(item.key)}
                    disabled={navAccessEdit.targetRoleKey === "owner"}
                    onChange={() => navAccessEdit.toggle(item.key)}
                    aria-label="Sidebar"
                  />
                ) : null}
                <Link
                  href={item.href}
                  data-tutorial-nav={item.key}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 text-[10px] transition-colors duration-150 sm:text-[11px]",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {item.key === "advertising" && !user.isLoading && isAdvertisingDeveloper ? (
                    <span className="relative inline-flex">
                      <Icon className="h-4 w-4" />
                      <Construction
                        className="absolute -right-1 -top-1 h-3 w-3 text-amber-600"
                        aria-hidden
                      />
                    </span>
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                  <span className="max-w-[72px] truncate">{item.label}</span>
                </Link>
              </div>
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
              {visibleMoreItemsGated.map((item) => (
                <div key={item.href} className="flex items-center gap-2">
                  {navAccessEdit ? (
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 shrink-0 accent-primary"
                      checked={navAccessEdit.isChecked(item.key)}
                      disabled={navAccessEdit.targetRoleKey === "owner"}
                      onChange={() => navAccessEdit.toggle(item.key)}
                      aria-label="Sidebar"
                    />
                  ) : null}
                  <Link
                    href={item.href}
                    data-tutorial-subnav={item.href}
                    className={cn(
                      "block min-w-0 flex-1 rounded-md px-3 py-2 text-sm transition-colors duration-150 hover:bg-accent/60",
                      isActive(pathname, item.activePrefix ?? item.href) ? "bg-primary/10 text-primary" : ""
                    )}
                  >
                    {item.label}
                  </Link>
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
