"use client";

import { useMemo } from "react";
import type { PermissionKey, SidebarItemKey } from "@/shared/lib/access-control";
import { navItems } from "@/shared/components/layout/sidebar/navItems";
import {
  navItemHasAnyAccessibleRoute,
  partitionNavItems,
  type NavItem,
} from "@/shared/components/layout/sidebar/nav-utils";

export default function useSidebarNav(params: {
  hasPermission: (permission: PermissionKey) => boolean;
  canAccessSidebarItem: (itemKey: SidebarItemKey) => boolean;
  canAccessPageByPath: (pathname: string) => boolean;
  visibleSidebarKeys: string[] | null;
  userIsLoading: boolean;
}): {
  filteredNavItems: NavItem[];
  tutorialGatedNavItems: NavItem[];
  start: NavItem[];
  marketplaces: NavItem[];
  rest: NavItem[];
  effectiveHasPermission: (permission: PermissionKey) => boolean;
  effectiveCanAccessSidebarItem: (itemKey: SidebarItemKey) => boolean;
} {
  const {
    hasPermission,
    canAccessSidebarItem,
    canAccessPageByPath,
    visibleSidebarKeys,
    userIsLoading,
  } = params;

  const effectiveHasPermission = useMemo<(permission: PermissionKey) => boolean>(
    () => (userIsLoading ? () => true : hasPermission),
    [userIsLoading, hasPermission]
  );
  const effectiveCanAccessSidebarItem = useMemo<(itemKey: SidebarItemKey) => boolean>(
    () => (userIsLoading ? () => true : canAccessSidebarItem),
    [userIsLoading, canAccessSidebarItem]
  );

  const filteredNavItems = useMemo(
    () =>
      navItems.filter(
        (item) =>
          effectiveCanAccessSidebarItem(item.key) &&
          navItemHasAnyAccessibleRoute(item, effectiveHasPermission, canAccessPageByPath) &&
          (item.requiredPermissions?.every((permission) => effectiveHasPermission(permission)) ?? true)
      ),
    [effectiveCanAccessSidebarItem, effectiveHasPermission, canAccessPageByPath]
  );

  const tutorialGatedNavItems = useMemo(() => {
    if (visibleSidebarKeys === null) return filteredNavItems;
    const allow = new Set(visibleSidebarKeys);
    return filteredNavItems.filter((item) => allow.has(item.key));
  }, [filteredNavItems, visibleSidebarKeys]);

  const { start, marketplaces, rest } = useMemo(
    () => partitionNavItems(tutorialGatedNavItems),
    [tutorialGatedNavItems]
  );

  return {
    filteredNavItems,
    tutorialGatedNavItems,
    start,
    marketplaces,
    rest,
    effectiveHasPermission,
    effectiveCanAccessSidebarItem,
  };
}
