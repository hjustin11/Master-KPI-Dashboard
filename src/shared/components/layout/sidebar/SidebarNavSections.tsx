"use client";

import type { PermissionKey, SidebarItemKey } from "@/shared/lib/access-control";
import type { NavAccessEditConfig } from "@/shared/lib/nav-access-edit";
import type { Translate } from "@/shared/components/layout/sidebarWipText";
import { CollapsedMarketplacePopover } from "./CollapsedMarketplacePopover";
import { MarketplaceExpandedGroup } from "./MarketplaceExpandedGroup";
import { SingleNavItem } from "./SingleNavItem";
import type { NavItem, UpdatesBellState } from "./nav-utils";

export function SidebarNavSections({
  start,
  marketplaces,
  rest,
  collapsed,
  pathname,
  hasPermission,
  canAccessPageByPath,
  userIsLoading,
  isAdvertisingDeveloper,
  wipPageLocks,
  accessEdit,
  updatesBellState,
  t,
  className = "space-y-1",
}: {
  start: NavItem[];
  marketplaces: NavItem[];
  rest: NavItem[];
  collapsed: boolean;
  pathname: string;
  hasPermission: (permission: PermissionKey) => boolean;
  canAccessPageByPath: (pathname: string) => boolean;
  userIsLoading: boolean;
  isAdvertisingDeveloper: boolean;
  wipPageLocks: Record<SidebarItemKey, boolean>;
  accessEdit?: NavAccessEditConfig;
  updatesBellState?: UpdatesBellState;
  t: Translate;
  className?: string;
}) {
  return (
    <nav className={className}>
      {start.map((item) => (
        <SingleNavItem
          key={item.key}
          item={item}
          pathname={pathname}
          hasPermission={hasPermission}
          canAccessPageByPath={canAccessPageByPath}
          collapsed={collapsed}
          userIsLoading={userIsLoading}
          isAdvertisingDeveloper={isAdvertisingDeveloper}
          wipPageLocks={wipPageLocks}
          accessEdit={accessEdit}
          updatesBellState={updatesBellState}
          t={t}
        />
      ))}
      {marketplaces.length > 0 ? (
        collapsed ? (
          <CollapsedMarketplacePopover
            items={marketplaces}
            pathname={pathname}
            hasPermission={hasPermission}
            canAccessPageByPath={canAccessPageByPath}
            userIsLoading={userIsLoading}
            isAdvertisingDeveloper={isAdvertisingDeveloper}
            wipPageLocks={wipPageLocks}
            accessEdit={accessEdit}
            t={t}
          />
        ) : (
          <MarketplaceExpandedGroup
            items={marketplaces}
            pathname={pathname}
            hasPermission={hasPermission}
            canAccessPageByPath={canAccessPageByPath}
            userIsLoading={userIsLoading}
            isAdvertisingDeveloper={isAdvertisingDeveloper}
            wipPageLocks={wipPageLocks}
            accessEdit={accessEdit}
            updatesBellState={updatesBellState}
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
          canAccessPageByPath={canAccessPageByPath}
          collapsed={collapsed}
          userIsLoading={userIsLoading}
          isAdvertisingDeveloper={isAdvertisingDeveloper}
          wipPageLocks={wipPageLocks}
          accessEdit={accessEdit}
          updatesBellState={updatesBellState}
          t={t}
        />
      ))}
    </nav>
  );
}
