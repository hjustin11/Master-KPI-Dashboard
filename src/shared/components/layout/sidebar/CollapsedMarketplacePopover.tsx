"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Construction, Store } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { PermissionKey, SidebarItemKey } from "@/shared/lib/access-control";
import type { NavAccessEditConfig } from "@/shared/lib/nav-access-edit";
import {
  type Translate,
  wipLockedHintForItem,
} from "@/shared/components/layout/sidebarWipText";
import {
  isActivePath,
  isMarketplaceItemActive,
  visibleNavChildren,
  type NavItem,
} from "./nav-utils";
import { NavAccessCheckbox } from "./NavAccessCheckbox";

export function CollapsedMarketplacePopover({
  items,
  pathname,
  hasPermission,
  canAccessPageByPath,
  userIsLoading,
  isAdvertisingDeveloper,
  wipPageLocks,
  accessEdit,
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
  t: Translate;
}) {
  const anyActive = useMemo(
    () =>
      items.some((item) => isMarketplaceItemActive(pathname, item, hasPermission, canAccessPageByPath)),
    [items, pathname, hasPermission, canAccessPageByPath]
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
              const visibleChildren = visibleNavChildren(item, hasPermission, canAccessPageByPath);
              const wipLocked =
                Boolean(wipPageLocks[item.key]) && !userIsLoading && !isAdvertisingDeveloper;
              if (wipLocked) {
                return (
                  <div
                    key={item.key}
                    className="rounded-md border border-border/50 bg-muted/15 p-1.5 opacity-[0.65] dark:bg-muted/25"
                  >
                    <div
                      className="flex cursor-not-allowed items-center gap-2 px-1.5 py-1 text-xs font-medium"
                      title={wipLockedHintForItem(item.key, t)}
                    >
                      <span className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-500/40 bg-amber-500/[0.12] px-1 py-0.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                        <Construction className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                        <Icon className="h-3 w-3 text-muted-foreground" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                      <NavAccessCheckbox itemKey={item.key} accessEdit={accessEdit} compact />
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={item.key}
                  className="rounded-md border border-border/50 bg-muted/15 p-1.5 dark:bg-muted/25"
                >
                  <div className="flex items-center gap-2 px-1.5 py-1 text-xs font-medium">
                    <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" />
                    <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
                    <NavAccessCheckbox itemKey={item.key} accessEdit={accessEdit} compact />
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
