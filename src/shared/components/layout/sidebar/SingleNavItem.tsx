"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Construction } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PermissionKey, SidebarItemKey } from "@/shared/lib/access-control";
import type { NavAccessEditConfig } from "@/shared/lib/nav-access-edit";
import {
  type Translate,
  wipDevTooltipForItem,
  wipLockedHintForItem,
} from "@/shared/components/layout/sidebarWipText";
import {
  isActivePath,
  resolveNavLink,
  visibleNavChildren,
  type NavItem,
  type UpdatesBellState,
} from "./nav-utils";
import { NavAccessCheckbox } from "./NavAccessCheckbox";

export function SingleNavItem({
  item,
  pathname,
  hasPermission,
  canAccessPageByPath,
  collapsed,
  compact,
  t,
  userIsLoading,
  isAdvertisingDeveloper,
  wipPageLocks,
  accessEdit,
  updatesBellState,
}: {
  item: NavItem;
  pathname: string;
  hasPermission: (permission: PermissionKey) => boolean;
  canAccessPageByPath: (pathname: string) => boolean;
  collapsed: boolean;
  compact?: boolean;
  t: Translate;
  userIsLoading: boolean;
  isAdvertisingDeveloper: boolean;
  wipPageLocks: Record<SidebarItemKey, boolean>;
  accessEdit?: NavAccessEditConfig;
  updatesBellState?: UpdatesBellState;
}) {
  const { primaryHref, activePrefix } = resolveNavLink(item, hasPermission, canAccessPageByPath);
  const active = isActivePath(pathname, activePrefix);
  const Icon = item.icon;
  const visibleChildren = visibleNavChildren(item, hasPermission, canAccessPageByPath);
  const hasSubnav = visibleChildren.length > 0;
  const wipLocked = Boolean(wipPageLocks[item.key]) && !userIsLoading && !isAdvertisingDeveloper;
  const wipOwner = Boolean(wipPageLocks[item.key]) && !userIsLoading && isAdvertisingDeveloper;
  const wipLockedHint = wipLockedHintForItem(item.key, t);
  const wipTooltip = wipDevTooltipForItem(item.key, t);
  /** Eingeklappte Sidebar (Icons): nur Hauptlink. Sonst: Unterpunkte per Zeile ein-/ausklappbar. */
  const subnavCollapsible = !collapsed && hasSubnav;
  const bellState: UpdatesBellState = item.key === "updates" ? (updatesBellState ?? "none") : "none";
  const hasBellHighlight = bellState !== "none";
  const bellActiveClass = "text-amber-700 dark:text-amber-300";
  /** Immer dunkle Schrift auf der hellen Akzentfläche — `dark:text-*` würde bei OS-Dark-Mode hellgrau erzwingen und „verschwindet" auf Gelb. */
  const bellAccentRowClass = "border-amber-400/70 bg-amber-400/10 !text-black";

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
    collapsed && "justify-center border-l-0 px-2",
    item.key === "updates" && hasBellHighlight && !active && !collapsed && bellAccentRowClass
  );

  const mainLabel =
    wipOwner && !collapsed ? (
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left">
        <span className="truncate">{t(item.labelKey)}</span>
        <span title={t("nav.advertisingWipBadge")} className="inline-flex shrink-0">
          <Construction className="h-3.5 w-3.5 text-amber-600" aria-hidden />
        </span>
      </span>
    ) : !collapsed ? (
      <span className="min-w-0 flex-1 truncate text-left">{t(item.labelKey)}</span>
    ) : null;

  const baseLink = (
    <Link href={primaryHref} className={cn(linkClass, accessEdit && "min-w-0 flex-1")}>
      <span
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4",
          wipOwner && "relative",
          item.key === "updates" && hasBellHighlight && !active && bellActiveClass,
          item.key === "updates" &&
            hasBellHighlight &&
            "motion-safe:animate-[sidebar-bell-wiggle_1.8s_ease-in-out_infinite]"
        )}
      >
        <Icon aria-hidden />
        {wipOwner && collapsed ? (
          <Construction
            className="pointer-events-none absolute -right-1 -top-0.5 h-3 w-3 text-amber-600"
            aria-hidden
          />
        ) : null}
      </span>
      {mainLabel}
    </Link>
  );

  const collapsibleRowInner = (
    <button
      type="button"
      className={cn(
        "flex w-full min-w-0 flex-1 items-center gap-3 rounded-md border-l-2 border-transparent px-3 text-left text-sm font-medium transition-all duration-200 hover:bg-accent/60",
        compact ? "py-1.5" : "py-2",
        active && "border-primary bg-primary/10 text-primary",
        item.key === "updates" && hasBellHighlight && !active && bellAccentRowClass
      )}
      aria-expanded={subOpen}
      aria-label={`${t(item.labelKey)} — ${t("sidebar.toggleSubnav")}`}
      onClick={() => setSubOpen((o) => !o)}
    >
      <span
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4",
          item.key === "updates" && hasBellHighlight && !active && bellActiveClass,
          item.key === "updates" &&
            hasBellHighlight &&
            "motion-safe:animate-[sidebar-bell-wiggle_1.8s_ease-in-out_infinite]"
        )}
      >
        <Icon aria-hidden />
      </span>
      {wipOwner ? (
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left">
          <span className="truncate">{t(item.labelKey)}</span>
          <Construction className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-left">{t(item.labelKey)}</span>
      )}
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
          subOpen && "rotate-180"
        )}
        aria-hidden
      />
    </button>
  );

  const collapsibleRow = accessEdit ? (
    <div className="flex w-full min-w-0 items-center gap-1 pr-1">
      {collapsibleRowInner}
      <NavAccessCheckbox itemKey={item.key} accessEdit={accessEdit} compact={compact} />
    </div>
  ) : (
    collapsibleRowInner
  );

  const childClass = cn(
    "block rounded-md px-2 text-muted-foreground transition-all duration-200 hover:bg-accent/60 hover:text-foreground",
    compact ? "py-1 text-[11px] leading-snug" : "py-1.5 text-xs"
  );

  const showSubnav = !collapsed && hasSubnav && subOpen && !wipLocked;

  if (wipLocked) {
    const lockedRow = (
      <div
        className={cn(linkClass, "cursor-not-allowed opacity-[0.65]")}
        aria-disabled
        title={wipLockedHint}
      >
        <span
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/[0.12] px-1.5 py-1 dark:border-amber-500/30 dark:bg-amber-500/10"
          aria-hidden
        >
          <Construction className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </span>
        {!collapsed ? (
          <span className="min-w-0 flex-1 truncate text-left">{t(item.labelKey)}</span>
        ) : null}
      </div>
    );
    return (
      <div data-tutorial-nav={item.key} className={cn("space-y-1", compact && "space-y-0.5")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger render={<div />}>{lockedRow}</TooltipTrigger>
            <TooltipContent side="right">{wipLockedHint}</TooltipContent>
          </Tooltip>
        ) : (
          lockedRow
        )}
      </div>
    );
  }

  const baseLinkWrapped = accessEdit ? (
    collapsed ? (
      <div className="flex w-full flex-col items-center gap-1">
        {baseLink}
        <NavAccessCheckbox itemKey={item.key} accessEdit={accessEdit} compact={compact} />
      </div>
    ) : (
      <div className="flex w-full min-w-0 items-center gap-1 pr-1">
        {baseLink}
        <NavAccessCheckbox itemKey={item.key} accessEdit={accessEdit} compact={compact} />
      </div>
    )
  ) : (
    baseLink
  );

  return (
    <div data-tutorial-nav={item.key} className={cn("space-y-1", compact && "space-y-0.5")}>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger render={<div />}>{baseLinkWrapped}</TooltipTrigger>
          <TooltipContent side="right">
            {wipOwner ? wipTooltip : t(item.labelKey)}
          </TooltipContent>
        </Tooltip>
      ) : subnavCollapsible ? (
        collapsibleRow
      ) : (
        baseLinkWrapped
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
