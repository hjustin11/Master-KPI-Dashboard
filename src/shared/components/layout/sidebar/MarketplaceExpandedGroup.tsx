"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PermissionKey, SidebarItemKey } from "@/shared/lib/access-control";
import type { NavAccessEditConfig } from "@/shared/lib/nav-access-edit";
import type { Translate } from "@/shared/components/layout/sidebarWipText";
import { isMarketplaceItemActive, type NavItem, type UpdatesBellState } from "./nav-utils";
import { SingleNavItem } from "./SingleNavItem";

export function MarketplaceExpandedGroup({
  items,
  pathname,
  hasPermission,
  canAccessPageByPath,
  userIsLoading,
  isAdvertisingDeveloper,
  wipPageLocks,
  accessEdit,
  updatesBellState,
  t,
}: {
  items: NavItem[];
  pathname: string;
  hasPermission: (permission: PermissionKey) => boolean;
  canAccessPageByPath: (pathname: string) => boolean;
  userIsLoading: boolean;
  isAdvertisingDeveloper: boolean;
  wipPageLocks: Record<SidebarItemKey, boolean>;
  accessEdit?: NavAccessEditConfig;
  updatesBellState?: UpdatesBellState;
  t: Translate;
}) {
  const anyActive = useMemo(
    () =>
      items.some((item) => isMarketplaceItemActive(pathname, item, hasPermission, canAccessPageByPath)),
    [items, pathname, hasPermission, canAccessPageByPath]
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
              canAccessPageByPath={canAccessPageByPath}
              collapsed={false}
              compact
              userIsLoading={userIsLoading}
              isAdvertisingDeveloper={isAdvertisingDeveloper}
              wipPageLocks={wipPageLocks}
              accessEdit={accessEdit}
              updatesBellState={updatesBellState}
              t={t}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
