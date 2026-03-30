"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, type ComponentType } from "react";
import {
  BarChart3,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Cat,
  Megaphone,
  Monitor,
  Package,
  PanelLeft,
  Settings,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  PawPrint,
  Store,
  User,
  Video,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { LogoutMenuItem } from "@/shared/components/auth/LogoutMenuItem";
import { useUser } from "@/shared/hooks/useUser";
import { usePermissions } from "@/shared/hooks/usePermissions";
import {
  ROLE_OPTIONS,
  type PermissionKey,
  type SidebarItemKey,
} from "@/shared/lib/access-control";
import { useAppStore } from "@/shared/stores/useAppStore";
import { useTranslation } from "@/i18n/I18nProvider";
import { resolveRoleLabel } from "@/i18n/resolve-role-label";
import { useTutorialNavGate } from "@/shared/components/tutorial/TutorialNavContext";

type NavItem = {
  key: SidebarItemKey;
  labelKey: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  requiredPermissions?: PermissionKey[];
  children?: Array<{ labelKey: string; href: string; requiredPermissions?: PermissionKey[] }>;
};

const navItems: NavItem[] = [
  {
    key: "amazon",
    labelKey: "nav.amazon",
    href: "/amazon",
    icon: ShoppingCart,
    requiredPermissions: ["manage_integrations"],
    children: [
      { labelKey: "nav.amazonOrders", href: "/amazon/orders" },
      { labelKey: "nav.amazonProducts", href: "/amazon/products" },
    ],
  },
  {
    key: "ebay",
    labelKey: "nav.ebay",
    href: "/ebay",
    icon: ShoppingBag,
    requiredPermissions: ["manage_integrations"],
    children: [
      { labelKey: "nav.ebayOrders", href: "/ebay/orders" },
      { labelKey: "nav.ebayProducts", href: "/ebay/products" },
    ],
  },
  {
    key: "otto",
    labelKey: "nav.otto",
    href: "/otto",
    icon: ShoppingBag,
    requiredPermissions: ["manage_integrations"],
    children: [
      { labelKey: "nav.ottoOrders", href: "/otto/orders" },
      { labelKey: "nav.ottoProducts", href: "/otto/products" },
    ],
  },
  {
    key: "kaufland",
    labelKey: "nav.kaufland",
    href: "/kaufland",
    icon: Store,
    requiredPermissions: ["manage_integrations"],
    children: [
      { labelKey: "nav.kauflandOrders", href: "/kaufland/orders" },
      { labelKey: "nav.kauflandProducts", href: "/kaufland/products" },
    ],
  },
  {
    key: "fressnapf",
    labelKey: "nav.fressnapf",
    href: "/fressnapf",
    icon: PawPrint,
    requiredPermissions: ["manage_integrations"],
    children: [
      { labelKey: "nav.fressnapfOrders", href: "/fressnapf/orders" },
      { labelKey: "nav.fressnapfProducts", href: "/fressnapf/products" },
    ],
  },
  {
    key: "mediamarktSaturn",
    labelKey: "nav.mediamarktSaturn",
    href: "/mediamarkt-saturn",
    icon: Monitor,
    requiredPermissions: ["manage_integrations"],
    children: [
      { labelKey: "nav.mediamarktSaturnOrders", href: "/mediamarkt-saturn/orders" },
      { labelKey: "nav.mediamarktSaturnProducts", href: "/mediamarkt-saturn/products" },
    ],
  },
  {
    key: "zooplus",
    labelKey: "nav.zooplus",
    href: "/zooplus",
    icon: Cat,
    requiredPermissions: ["manage_integrations"],
    children: [
      { labelKey: "nav.zooplusOrders", href: "/zooplus/orders" },
      { labelKey: "nav.zooplusProducts", href: "/zooplus/products" },
    ],
  },
  {
    key: "tiktok",
    labelKey: "nav.tiktok",
    href: "/tiktok",
    icon: Video,
    requiredPermissions: ["manage_integrations"],
    children: [
      { labelKey: "nav.tiktokOrders", href: "/tiktok/orders" },
      { labelKey: "nav.tiktokProducts", href: "/tiktok/products" },
    ],
  },
  {
    key: "shopify",
    labelKey: "nav.shopify",
    href: "/shopify",
    icon: ShoppingBasket,
    requiredPermissions: ["manage_integrations"],
    children: [
      { labelKey: "nav.shopifyOrders", href: "/shopify/orders" },
      { labelKey: "nav.shopifyProducts", href: "/shopify/products" },
    ],
  },
  {
    key: "xentral",
    labelKey: "nav.xentral",
    href: "/xentral",
    icon: Package,
    requiredPermissions: ["manage_integrations"],
    children: [
      { labelKey: "nav.xentralProducts", href: "/xentral/products" },
      { labelKey: "nav.xentralOrders", href: "/xentral/orders" },
    ],
  },
  {
    key: "advertising",
    labelKey: "nav.advertising",
    href: "/advertising",
    icon: Megaphone,
    requiredPermissions: ["manage_integrations"],
    children: [
      { labelKey: "nav.adCampaigns", href: "/advertising/campaigns" },
      { labelKey: "nav.adPerformance", href: "/advertising/performance" },
    ],
  },
  {
    key: "analytics",
    labelKey: "nav.analytics",
    href: "/analytics",
    icon: BarChart3,
    requiredPermissions: ["export_data"],
    children: [
      { labelKey: "nav.analyticsMarketplaces", href: "/analytics/marketplaces" },
      { labelKey: "nav.analyticsArticleForecast", href: "/analytics/article-forecast" },
      { labelKey: "nav.analyticsProcurement", href: "/analytics/procurement" },
      { labelKey: "nav.analyticsPerformance", href: "/analytics/performance" },
    ],
  },
  {
    key: "settings",
    labelKey: "nav.settings",
    href: "/settings/users",
    icon: Settings,
    children: [
      { labelKey: "nav.settingsUsers", href: "/settings/users" },
      { labelKey: "nav.settingsProfile", href: "/settings/profile" },
      { labelKey: "nav.settingsTutorials", href: "/settings/tutorials" },
    ],
  },
  {
    key: "updates",
    labelKey: "nav.updates",
    href: "/updates",
    icon: Bell,
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Hauptklick Ziel = erster Unterpunkt (ohne separate Übersichtsseite). */
const NAV_PRIMARY_CHILD_KEYS = new Set<SidebarItemKey>([
  "amazon",
  "ebay",
  "otto",
  "kaufland",
  "fressnapf",
  "mediamarktSaturn",
  "zooplus",
  "tiktok",
  "shopify",
  "xentral",
  "advertising",
  "analytics",
]);

function visibleNavChildren(
  item: NavItem,
  hasPermission: (permission: PermissionKey) => boolean
) {
  return (
    item.children?.filter(
      (child) => child.requiredPermissions?.every((permission) => hasPermission(permission)) ?? true
    ) ?? []
  );
}

function resolveNavLink(
  item: NavItem,
  hasPermission: (permission: PermissionKey) => boolean
): { primaryHref: string; activePrefix: string } {
  if (NAV_PRIMARY_CHILD_KEYS.has(item.key)) {
    const visible = visibleNavChildren(item, hasPermission);
    const primary = visible[0]?.href ?? item.href;
    const prefix = primary.replace(/\/[^/]+$/, "") || item.href;
    return { primaryHref: primary, activePrefix: prefix };
  }
  return { primaryHref: item.href, activePrefix: item.href };
}

const MARKETPLACE_NAV_KEYS = new Set<SidebarItemKey>([
  "amazon",
  "ebay",
  "otto",
  "kaufland",
  "fressnapf",
  "mediamarktSaturn",
  "zooplus",
  "tiktok",
  "shopify",
]);

function partitionNavItems(items: NavItem[]): { marketplaces: NavItem[]; rest: NavItem[] } {
  const marketplaces: NavItem[] = [];
  const rest: NavItem[] = [];
  for (const item of items) {
    if (MARKETPLACE_NAV_KEYS.has(item.key)) marketplaces.push(item);
    else rest.push(item);
  }
  return { marketplaces, rest };
}

function isMarketplaceItemActive(
  pathname: string,
  item: NavItem,
  hasPermission: (permission: PermissionKey) => boolean
): boolean {
  const { activePrefix } = resolveNavLink(item, hasPermission);
  if (isActivePath(pathname, activePrefix)) return true;
  return visibleNavChildren(item, hasPermission).some((child) => isActivePath(pathname, child.href));
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

function SingleNavItem({
  item,
  pathname,
  hasPermission,
  collapsed,
  compact,
  t,
}: {
  item: NavItem;
  pathname: string;
  hasPermission: (permission: PermissionKey) => boolean;
  collapsed: boolean;
  compact?: boolean;
  t: Translate;
}) {
  const { primaryHref, activePrefix } = resolveNavLink(item, hasPermission);
  const active = isActivePath(pathname, activePrefix);
  const Icon = item.icon;
  const visibleChildren = visibleNavChildren(item, hasPermission);
  const hasSubnav = visibleChildren.length > 0;
  /** Eingeklappte Sidebar (Icons): nur Hauptlink. Sonst: Unterpunkte per Zeile ein-/ausklappbar. */
  const subnavCollapsible = !collapsed && hasSubnav;

  const childOrSelfActive = useMemo(
    () =>
      active ||
      visibleChildren.some((c) => isActivePath(pathname, c.href)),
    [active, pathname, visibleChildren]
  );

  const [subOpen, setSubOpen] = useState(false);
  useEffect(() => {
    if (!childOrSelfActive) return;
    const id = window.setTimeout(() => setSubOpen(true), 0);
    return () => window.clearTimeout(id);
  }, [childOrSelfActive]);

  const linkClass = cn(
    "group flex w-full min-w-0 items-center gap-3 rounded-md px-3 text-sm font-medium transition-all duration-200 hover:bg-accent/60",
    !collapsed && "border-l-2 border-transparent",
    compact ? "py-1.5" : "py-2",
    active && "bg-primary/10 text-primary",
    active && !collapsed && "border-primary",
    collapsed && "justify-center border-l-0 px-2"
  );

  const baseLink = (
    <Link href={primaryHref} className={linkClass}>
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
        <Icon aria-hidden />
      </span>
      {!collapsed ? (
        <span className="min-w-0 flex-1 truncate text-left">{t(item.labelKey)}</span>
      ) : null}
    </Link>
  );

  const collapsibleRow = (
    <button
      type="button"
      className={cn(
        "flex w-full min-w-0 items-center gap-3 rounded-md border-l-2 border-transparent px-3 text-left text-sm font-medium transition-all duration-200 hover:bg-accent/60",
        compact ? "py-1.5" : "py-2",
        active && "border-primary bg-primary/10 text-primary"
      )}
      aria-expanded={subOpen}
      aria-label={`${t(item.labelKey)} — ${t("sidebar.toggleSubnav")}`}
      onClick={() => setSubOpen((o) => !o)}
    >
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
        <Icon aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{t(item.labelKey)}</span>
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
          subOpen && "rotate-180"
        )}
        aria-hidden
      />
    </button>
  );

  const childClass = cn(
    "block rounded-md px-2 text-muted-foreground transition-all duration-200 hover:bg-accent/60 hover:text-foreground",
    compact ? "py-1 text-[11px] leading-snug" : "py-1.5 text-xs"
  );

  const showSubnav = !collapsed && hasSubnav && subOpen;

  return (
    <div data-tutorial-nav={item.key} className={cn("space-y-1", compact && "space-y-0.5")}>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger render={<div />}>{baseLink}</TooltipTrigger>
          <TooltipContent side="right">{t(item.labelKey)}</TooltipContent>
        </Tooltip>
      ) : subnavCollapsible ? (
        collapsibleRow
      ) : (
        baseLink
      )}

      {showSubnav ? (
        <div
          className={cn(
            "space-y-0.5 border-l border-border pl-3",
            compact ? "ml-6" : "ml-7"
          )}
        >
          {visibleChildren.map((child) => {
            const childActive = isActivePath(pathname, child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                data-tutorial-subnav={child.href}
                className={cn(childClass, childActive && "text-primary")}
              >
                {t(child.labelKey)}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MarketplaceExpandedGroup({
  items,
  pathname,
  hasPermission,
  t,
}: {
  items: NavItem[];
  pathname: string;
  hasPermission: (permission: PermissionKey) => boolean;
  t: Translate;
}) {
  const anyActive = useMemo(
    () => items.some((item) => isMarketplaceItemActive(pathname, item, hasPermission)),
    [items, pathname, hasPermission]
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!anyActive) return;
    const id = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(id);
  }, [anyActive]);

  if (items.length === 0) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full min-w-0 items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-accent/60",
          anyActive && "border-primary bg-primary/10 text-primary"
        )}
      >
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
          <Store aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{t("sidebar.marketplacesGroup")}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="ml-1 space-y-0.5 border-l border-dashed border-border/70 pl-2.5">
          {items.map((item) => (
            <SingleNavItem
              key={item.key}
              item={item}
              pathname={pathname}
              hasPermission={hasPermission}
              collapsed={false}
              compact
              t={t}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CollapsedMarketplacePopover({
  items,
  pathname,
  hasPermission,
  t,
}: {
  items: NavItem[];
  pathname: string;
  hasPermission: (permission: PermissionKey) => boolean;
  t: Translate;
}) {
  const anyActive = useMemo(
    () => items.some((item) => isMarketplaceItemActive(pathname, item, hasPermission)),
    [items, pathname, hasPermission]
  );

  if (items.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "group flex w-full items-center justify-center rounded-md border-l-0 px-2 py-2 text-sm font-medium transition-all duration-200 hover:bg-accent/60",
              anyActive && "bg-primary/10 text-primary"
            )}
            aria-label={t("sidebar.marketplacesGroup")}
            title={t("sidebar.marketplacesGroup")}
          />
        }
      >
        <Store className="h-4 w-4 shrink-0" />
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={8} className="w-[min(100vw-2rem,18rem)] p-0">
        <div className="max-h-[min(70vh,520px)] overflow-y-auto p-2">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("sidebar.marketplacesGroup")}
          </p>
          <div className="space-y-2">
            {items.map((item) => {
              const Icon = item.icon;
              const visibleChildren = visibleNavChildren(item, hasPermission);
              return (
                <div
                  key={item.key}
                  className="rounded-md border border-border/50 bg-muted/15 p-1.5 dark:bg-muted/25"
                >
                  <div className="flex items-center gap-2 px-1.5 py-1 text-xs font-medium">
                    <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" />
                    <span className="truncate">{t(item.labelKey)}</span>
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {visibleChildren.map((child) => {
                      const childActive = isActivePath(pathname, child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "block rounded-md px-2 py-1 text-[11px] leading-snug text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
                            childActive && "font-medium text-primary"
                          )}
                        >
                          {t(child.labelKey)}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale } = useTranslation();
  const { state, toggleSidebar } = useSidebar();
  const { visibleSidebarKeys } = useTutorialNavGate();
  const user = useUser();
  const { hasPermission, canAccessSidebarItem, activeRole: effectiveRole } = usePermissions();
  const activeRole = useAppStore((stateFromStore) => stateFromStore.activeRole);
  const roleTestingEnabled = useAppStore((stateFromStore) => stateFromStore.roleTestingEnabled);
  const setRoleTestingEnabled = useAppStore(
    (stateFromStore) => stateFromStore.setRoleTestingEnabled
  );
  const customRoleKeys = useAppStore((stateFromStore) => stateFromStore.customRoleKeys);
  const roleLabels = useAppStore((stateFromStore) => stateFromStore.roleLabels);
  const setActiveRole = useAppStore((stateFromStore) => stateFromStore.setActiveRole);
  const roleLabel = resolveRoleLabel(effectiveRole, roleLabels[effectiveRole], locale);
  const roleOptions = [
    ...ROLE_OPTIONS.map((item) => ({
      value: item.value,
      label: resolveRoleLabel(item.value, roleLabels[item.value], locale),
    })),
    ...customRoleKeys.map((key) => ({
      value: key,
      label: resolveRoleLabel(key, roleLabels[key], locale),
    })),
  ];
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  /** Sidebar-Klapp-Button nur nach Mount: identisches SSR- und erstes Client-HTML (vermeidet Hydration-Fehler). */
  const sidebarToggleMounted = isHydrated;

  // Verhindert Hydration-Mismatch: initial immer expanded rendern,
  // erst nach dem Client-Mount den echten Sidebar-State verwenden.
  const collapsed = isHydrated ? state === "collapsed" : false;
  const canRoleSwitch = !user.isLoading && user.roleKey === "owner" && roleTestingEnabled;

  const filteredNavItems = useMemo(
    () =>
      navItems.filter(
        (item) =>
          canAccessSidebarItem(item.key) &&
          (item.requiredPermissions?.every((permission) => hasPermission(permission)) ?? true)
      ),
    [canAccessSidebarItem, hasPermission]
  );
  const tutorialGatedNavItems = useMemo(() => {
    if (visibleSidebarKeys === null) return filteredNavItems;
    const allow = new Set(visibleSidebarKeys);
    return filteredNavItems.filter((item) => allow.has(item.key));
  }, [filteredNavItems, visibleSidebarKeys]);
  const { marketplaces, rest } = useMemo(
    () => partitionNavItems(tutorialGatedNavItems),
    [tutorialGatedNavItems]
  );

  const cycleRole = (direction: "prev" | "next") => {
    if (!canRoleSwitch) return;
    const values = roleOptions.map((r) => r.value);
    const currentIndex = values.indexOf(activeRole);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      direction === "prev"
        ? (safeIndex - 1 + values.length) % values.length
        : (safeIndex + 1) % values.length;
    setActiveRole(values[nextIndex] ?? "owner");
  };

  return (
    <Sidebar
      data-tutorial-target="sidebar"
      collapsible="icon"
      className="hidden border-r border-border/50 bg-sidebar md:flex"
    >
      <SidebarHeader className="h-14 border-b border-border/50 px-3">
        <div
          className={cn(
            "flex h-full items-center",
            collapsed ? "justify-center" : "justify-between"
          )}
        >
          {collapsed ? (
            <Image
              src="/brand/petrhein-icon-current.png"
              alt="PetRhein Icon"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
          ) : (
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-center">
                <div className="relative h-10 w-full max-w-[min(100%,14rem)] shrink-0">
                  <Image
                    src="/brand/petrhein-logo-attached.png"
                    alt="PetRhein"
                    fill
                    priority
                    className="object-contain"
                    sizes="(max-width: 768px) 224px, 224px"
                  />
                </div>
              </div>
            </div>
          )}
          {sidebarToggleMounted ? (
            <button
              type="button"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "transition-all duration-200",
                collapsed ? "absolute top-3 -right-1 z-20" : "ml-3"
              )}
              onClick={() => toggleSidebar()}
              aria-label={t("sidebar.toggleSidebar")}
            >
              <PanelLeft className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "pointer-events-none shrink-0 transition-all duration-200",
                collapsed ? "absolute top-3 -right-1 z-20" : "ml-3"
              )}
              aria-hidden
              tabIndex={-1}
            />
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="p-2">
        <nav className="space-y-1">
          {marketplaces.length > 0 ? (
            collapsed ? (
              <CollapsedMarketplacePopover
                items={marketplaces}
                pathname={pathname}
                hasPermission={hasPermission}
                t={t}
              />
            ) : (
              <MarketplaceExpandedGroup
                items={marketplaces}
                pathname={pathname}
                hasPermission={hasPermission}
                t={t}
              />
            )
          ) : null}
          {rest.map((item) => (
            <SingleNavItem
              key={item.key}
              item={item}
              pathname={pathname}
              hasPermission={hasPermission}
              collapsed={collapsed}
              t={t}
            />
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/50 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-all duration-200 hover:bg-accent/60",
                  collapsed && "justify-center"
                )}
              />
            }
          >
              <Avatar size="sm">
                <AvatarFallback>{user.initials}</AvatarFallback>
              </Avatar>
              {!collapsed ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.fullName}</p>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {user.isLoading ? t("common.loading") : roleLabel}
                    </p>
                    {canRoleSwitch ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            cycleRole("prev");
                          }}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                          aria-label={t("sidebar.prevRole")}
                          title={t("sidebar.prevRole")}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            cycleRole("next");
                          }}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                          aria-label={t("sidebar.nextRole")}
                          title={t("sidebar.nextRole")}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-56">
            <DropdownMenuItem onClick={() => router.push("/settings/profile")}>
              <User className="h-4 w-4" />
              {t("header.profile")}
            </DropdownMenuItem>
            {!user.isLoading && user.roleKey === "owner" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setRoleTestingEnabled(!roleTestingEnabled)}
                  className={roleTestingEnabled ? "bg-primary/10 text-primary" : ""}
                >
                  {t("header.roleTestMode")}: {roleTestingEnabled ? t("common.on") : t("common.off")}
                </DropdownMenuItem>

                {roleTestingEnabled ? (
                  <>
                    {activeRole !== "owner" ? (
                      <DropdownMenuItem onClick={() => setActiveRole("owner")}>
                        {t("header.restoreDeveloperView")}
                      </DropdownMenuItem>
                    ) : null}
                    {roleOptions.map((role) => (
                      <DropdownMenuItem
                        key={role.value}
                        onClick={() => setActiveRole(role.value)}
                        className={
                          role.value === activeRole ? "bg-primary/10 text-primary" : ""
                        }
                      >
                        {t("header.testAs", { role: role.label })}
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : null}
              </>
            ) : null}
            <DropdownMenuSeparator />
            <LogoutMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export function MobileSidebarTrigger() {
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale } = useTranslation();
  const { visibleSidebarKeys } = useTutorialNavGate();
  const user = useUser();
  const { hasPermission, canAccessSidebarItem, activeRole: effectiveRole } = usePermissions();

  const filteredNavItems = useMemo(
    () =>
      navItems.filter(
        (item) =>
          canAccessSidebarItem(item.key) &&
          (item.requiredPermissions?.every((permission) => hasPermission(permission)) ?? true)
      ),
    [canAccessSidebarItem, hasPermission]
  );
  const tutorialGatedNavItems = useMemo(() => {
    if (visibleSidebarKeys === null) return filteredNavItems;
    const allow = new Set(visibleSidebarKeys);
    return filteredNavItems.filter((item) => allow.has(item.key));
  }, [filteredNavItems, visibleSidebarKeys]);
  const { marketplaces, rest } = useMemo(
    () => partitionNavItems(tutorialGatedNavItems),
    [tutorialGatedNavItems]
  );
  const activeRole = useAppStore((stateFromStore) => stateFromStore.activeRole);
  const roleTestingEnabled = useAppStore((stateFromStore) => stateFromStore.roleTestingEnabled);
  const setRoleTestingEnabled = useAppStore(
    (stateFromStore) => stateFromStore.setRoleTestingEnabled
  );
  const customRoleKeys = useAppStore((stateFromStore) => stateFromStore.customRoleKeys);
  const roleLabels = useAppStore((stateFromStore) => stateFromStore.roleLabels);
  const setActiveRole = useAppStore((stateFromStore) => stateFromStore.setActiveRole);
  const roleLabel = resolveRoleLabel(effectiveRole, roleLabels[effectiveRole], locale);
  const roleOptions = [
    ...ROLE_OPTIONS.map((item) => ({
      value: item.value,
      label: resolveRoleLabel(item.value, roleLabels[item.value], locale),
    })),
    ...customRoleKeys.map((key) => ({
      value: key,
      label: resolveRoleLabel(key, roleLabels[key], locale),
    })),
  ];

  const canRoleSwitch = !user.isLoading && user.roleKey === "owner" && roleTestingEnabled;

  const cycleRole = (direction: "prev" | "next") => {
    if (!canRoleSwitch) return;
    const values = roleOptions.map((r) => r.value);
    const currentIndex = values.indexOf(activeRole);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      direction === "prev"
        ? (safeIndex - 1 + values.length) % values.length
        : (safeIndex + 1) % values.length;
    setActiveRole(values[nextIndex] ?? "owner");
  };

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="icon-sm" className="md:hidden" />}>
        <PanelLeft className="h-4 w-4" />
        <span className="sr-only">{t("sidebar.openMenu")}</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] border-r border-border/50 bg-card/80 backdrop-blur-sm">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2">
            <span className="relative block h-8 w-40 max-w-full shrink-0">
              <Image
                src="/brand/petrhein-logo-attached.png"
                alt="PetRhein"
                fill
                className="object-contain object-left"
                sizes="160px"
              />
            </span>
          </SheetTitle>
          <SheetDescription className="text-xs">{t("sidebar.navigation")}</SheetDescription>
        </SheetHeader>
        <nav className="space-y-1 px-4 pb-4">
          {marketplaces.length > 0 ? (
            <MarketplaceExpandedGroup
              items={marketplaces}
              pathname={pathname}
              hasPermission={hasPermission}
              t={t}
            />
          ) : null}
          {rest.map((item) => (
            <SingleNavItem
              key={item.key}
              item={item}
              pathname={pathname}
              hasPermission={hasPermission}
              collapsed={false}
              t={t}
            />
          ))}
        </nav>
        <div className="mt-auto border-t border-border/50 p-4">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <div
                  role="button"
                  tabIndex={0}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-all duration-200 hover:bg-accent/60"
                />
              }
            >
                <span className="flex items-center gap-2">
                  <Avatar size="sm">
                    <AvatarFallback>{user.initials}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{user.fullName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {user.isLoading ? t("common.loading") : roleLabel}
                    </span>
                    {canRoleSwitch ? (
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            cycleRole("prev");
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                          aria-label={t("sidebar.prevRole")}
                          title={t("sidebar.prevRole")}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            cycleRole("next");
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                          aria-label={t("sidebar.nextRole")}
                          title={t("sidebar.nextRole")}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                  </span>
                </span>
                <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => router.push("/settings/profile")}>
                <User className="h-4 w-4" />
                {t("header.profile")}
              </DropdownMenuItem>
              {!user.isLoading && user.roleKey === "owner" ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setRoleTestingEnabled(!roleTestingEnabled)}
                    className={roleTestingEnabled ? "bg-primary/10 text-primary" : ""}
                  >
                    {t("header.roleTestMode")}: {roleTestingEnabled ? t("common.on") : t("common.off")}
                  </DropdownMenuItem>

                  {roleTestingEnabled ? (
                    <>
                      {activeRole !== "owner" ? (
                        <DropdownMenuItem onClick={() => setActiveRole("owner")}>
                          {t("header.restoreDeveloperView")}
                        </DropdownMenuItem>
                      ) : null}
                      {roleOptions.map((role) => (
                        <DropdownMenuItem
                          key={role.value}
                          onClick={() => setActiveRole(role.value)}
                          className={role.value === activeRole ? "bg-primary/10 text-primary" : ""}
                        >
                          {t("header.testAs", { role: role.label })}
                        </DropdownMenuItem>
                      ))}
                    </>
                  ) : null}
                </>
              ) : null}
              <DropdownMenuSeparator />
              <LogoutMenuItem />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SheetContent>
    </Sheet>
  );
}
