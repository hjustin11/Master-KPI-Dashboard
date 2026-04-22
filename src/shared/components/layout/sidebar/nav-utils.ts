import type { ComponentType } from "react";
import type { PermissionKey, SidebarItemKey } from "@/shared/lib/access-control";

export type UpdatesBellState = "none" | "updates";

export type NavItem = {
  key: SidebarItemKey;
  labelKey: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  requiredPermissions?: PermissionKey[];
  children?: Array<{ labelKey: string; href: string; requiredPermissions?: PermissionKey[] }>;
};

export function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Hauptklick Ziel = erster Unterpunkt (ohne separate Übersichtsseite). */
export const NAV_PRIMARY_CHILD_KEYS = new Set<SidebarItemKey>([
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
  "settings",
]);

export function visibleNavChildren(
  item: NavItem,
  hasPermission: (permission: PermissionKey) => boolean,
  canAccessPageByPath: (pathname: string) => boolean
) {
  return (
    item.children?.filter(
      (child) =>
        (child.requiredPermissions?.every((permission) => hasPermission(permission)) ?? true) &&
        canAccessPageByPath(child.href)
    ) ?? []
  );
}

export function navItemHasAnyAccessibleRoute(
  item: NavItem,
  hasPermission: (permission: PermissionKey) => boolean,
  canAccessPageByPath: (pathname: string) => boolean
) {
  if (canAccessPageByPath(item.href)) return true;
  return visibleNavChildren(item, hasPermission, canAccessPageByPath).length > 0;
}

export function resolveNavLink(
  item: NavItem,
  hasPermission: (permission: PermissionKey) => boolean,
  canAccessPageByPath: (pathname: string) => boolean
): { primaryHref: string; activePrefix: string } {
  if (NAV_PRIMARY_CHILD_KEYS.has(item.key)) {
    const visible = visibleNavChildren(item, hasPermission, canAccessPageByPath);
    const primary = visible[0]?.href ?? item.href;
    const prefix = primary.replace(/\/[^/]+$/, "") || item.href;
    return { primaryHref: primary, activePrefix: prefix };
  }
  return { primaryHref: item.href, activePrefix: item.href };
}

export const MARKETPLACE_NAV_KEYS = new Set<SidebarItemKey>([
  "amazon",
  "amazon-fr",
  "ebay",
  "otto",
  "kaufland",
  "fressnapf",
  "mediamarktSaturn",
  "zooplus",
  "tiktok",
  "shopify",
]);

export const START_NAV_KEYS = new Set<SidebarItemKey>(["overview", "myArea"]);

export function partitionNavItems(items: NavItem[]): {
  start: NavItem[];
  marketplaces: NavItem[];
  rest: NavItem[];
} {
  const start: NavItem[] = [];
  const marketplaces: NavItem[] = [];
  const rest: NavItem[] = [];
  for (const item of items) {
    if (START_NAV_KEYS.has(item.key)) start.push(item);
    else if (MARKETPLACE_NAV_KEYS.has(item.key)) marketplaces.push(item);
    else rest.push(item);
  }
  return { start, marketplaces, rest };
}

export function isMarketplaceItemActive(
  pathname: string,
  item: NavItem,
  hasPermission: (permission: PermissionKey) => boolean,
  canAccessPageByPath: (pathname: string) => boolean
): boolean {
  const { activePrefix } = resolveNavLink(item, hasPermission, canAccessPageByPath);
  if (isActivePath(pathname, activePrefix)) return true;
  return visibleNavChildren(item, hasPermission, canAccessPageByPath).some((child) =>
    isActivePath(pathname, child.href)
  );
}
