"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  PanelLeft,
  User,
} from "lucide-react";
import { CollapsedMarketplacePopover } from "./sidebar/CollapsedMarketplacePopover";
import { MarketplaceExpandedGroup } from "./sidebar/MarketplaceExpandedGroup";
import { SingleNavItem } from "./sidebar/SingleNavItem";
import { navItems } from "./sidebar/navItems";
import {
  navItemHasAnyAccessibleRoute,
  partitionNavItems,
  type UpdatesBellState,
} from "./sidebar/nav-utils";
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
import type { NavAccessEditConfig } from "@/shared/lib/nav-access-edit";
import {
  getUpdatesSignature,
  readSeenUpdatesSignature,
  UPDATES_SEEN_EVENT,
} from "@/shared/lib/updatesFeed";
import { DASHBOARD_CLIENT_BACKGROUND_SYNC_MS } from "@/shared/lib/dashboardClientCache";

type ManagedUpdatePayloadItem = {
  date?: string;
  title?: string;
  text?: string;
  release_key?: string | null;
};

async function fetchCurrentUpdatesSignature(): Promise<string | null> {
  try {
    const res = await fetch("/api/updates", { cache: "no-store" });
    if (!res.ok) return null;
    const payload = (await res.json()) as { items?: ManagedUpdatePayloadItem[] };
    if (!Array.isArray(payload.items)) return null;
    const entries = payload.items
      .map((item) => ({
        date: typeof item.date === "string" ? item.date : "",
        title: typeof item.title === "string" ? item.title : "",
        text: typeof item.text === "string" ? item.text : "",
        releaseKey: typeof item.release_key === "string" ? item.release_key : undefined,
      }))
      .filter((item) => item.date && item.title && item.text);
    if (entries.length === 0) return null;
    return getUpdatesSignature(entries);
  } catch {
    return null;
  }
}



export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale } = useTranslation();
  const { state, toggleSidebar } = useSidebar();
  const { visibleSidebarKeys } = useTutorialNavGate();
  const user = useUser();
  const {
    hasPermission,
    canAccessSidebarItem,
    canAccessPageByPath,
    activeRole: effectiveRole,
    isAdvertisingDeveloper,
  } = usePermissions();
  const activeRole = useAppStore((stateFromStore) => stateFromStore.activeRole);
  const roleTestingEnabled = useAppStore((stateFromStore) => stateFromStore.roleTestingEnabled);
  const roleTestAccessEditMode = useAppStore((stateFromStore) => stateFromStore.roleTestAccessEditMode);
  const roleSidebarItems = useAppStore((stateFromStore) => stateFromStore.roleSidebarItems);
  const toggleRoleSidebarItem = useAppStore((stateFromStore) => stateFromStore.toggleRoleSidebarItem);
  const setRoleTestingEnabled = useAppStore(
    (stateFromStore) => stateFromStore.setRoleTestingEnabled
  );
  const customRoleKeys = useAppStore((stateFromStore) => stateFromStore.customRoleKeys);
  const roleLabels = useAppStore((stateFromStore) => stateFromStore.roleLabels);
  const setActiveRole = useAppStore((stateFromStore) => stateFromStore.setActiveRole);
  const wipPageLocks = useAppStore((stateFromStore) => stateFromStore.wipPageLocks);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const effectiveHasPermission: (permission: PermissionKey) => boolean = user.isLoading
    ? () => true
    : hasPermission;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const effectiveCanAccessSidebarItem: (itemKey: SidebarItemKey) => boolean = user.isLoading
    ? () => true
    : canAccessSidebarItem;

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
  const [hasUnseenUpdates, setHasUnseenUpdates] = useState(false);
  const [currentUpdatesSignature, setCurrentUpdatesSignature] = useState(() => readSeenUpdatesSignature());
  const updatesBellState: UpdatesBellState = hasUnseenUpdates ? "updates" : "none";

  useEffect(() => {
    let cancelled = false;
    const refreshSignature = async () => {
      const signature = await fetchCurrentUpdatesSignature();
      if (!cancelled && signature) setCurrentUpdatesSignature(signature);
    };
    void refreshSignature();
    const id = window.setInterval(() => {
      void refreshSignature();
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const syncSeenState = () => {
      const seen = readSeenUpdatesSignature();
      setHasUnseenUpdates(currentUpdatesSignature !== seen);
    };
    syncSeenState();
    window.addEventListener("storage", syncSeenState);
    window.addEventListener(UPDATES_SEEN_EVENT, syncSeenState);
    return () => {
      window.removeEventListener("storage", syncSeenState);
      window.removeEventListener(UPDATES_SEEN_EVENT, syncSeenState);
    };
  }, [currentUpdatesSignature]);
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
          {start.map((item) => (
            <SingleNavItem
              key={item.key}
              item={item}
              pathname={pathname}
              hasPermission={effectiveHasPermission}
              canAccessPageByPath={canAccessPageByPath}
              collapsed={collapsed}
              userIsLoading={user.isLoading}
              isAdvertisingDeveloper={isAdvertisingDeveloper}
              wipPageLocks={wipPageLocks}
              accessEdit={navAccessEdit}
              updatesBellState={updatesBellState}
              t={t}
            />
          ))}
          {marketplaces.length > 0 ? (
            collapsed ? (
              <CollapsedMarketplacePopover
                items={marketplaces}
                pathname={pathname}
                hasPermission={effectiveHasPermission}
                canAccessPageByPath={canAccessPageByPath}
                userIsLoading={user.isLoading}
                isAdvertisingDeveloper={isAdvertisingDeveloper}
                wipPageLocks={wipPageLocks}
                accessEdit={navAccessEdit}
                t={t}
              />
            ) : (
              <MarketplaceExpandedGroup
                items={marketplaces}
                pathname={pathname}
                hasPermission={effectiveHasPermission}
                canAccessPageByPath={canAccessPageByPath}
                userIsLoading={user.isLoading}
                isAdvertisingDeveloper={isAdvertisingDeveloper}
                wipPageLocks={wipPageLocks}
                accessEdit={navAccessEdit}
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
              hasPermission={effectiveHasPermission}
              canAccessPageByPath={canAccessPageByPath}
              collapsed={collapsed}
              userIsLoading={user.isLoading}
              isAdvertisingDeveloper={isAdvertisingDeveloper}
              wipPageLocks={wipPageLocks}
              accessEdit={navAccessEdit}
              updatesBellState={updatesBellState}
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
  const {
    hasPermission,
    canAccessSidebarItem,
    canAccessPageByPath,
    activeRole: effectiveRole,
    isAdvertisingDeveloper,
  } = usePermissions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const effectiveHasPermission: (permission: PermissionKey) => boolean = user.isLoading
    ? () => true
    : hasPermission;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const effectiveCanAccessSidebarItem: (itemKey: SidebarItemKey) => boolean = user.isLoading
    ? () => true
    : canAccessSidebarItem;

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
  const [hasUnseenUpdates, setHasUnseenUpdates] = useState(false);
  const [currentUpdatesSignature, setCurrentUpdatesSignature] = useState(() => readSeenUpdatesSignature());
  const updatesBellState: UpdatesBellState = hasUnseenUpdates ? "updates" : "none";

  useEffect(() => {
    let cancelled = false;
    const refreshSignature = async () => {
      const signature = await fetchCurrentUpdatesSignature();
      if (!cancelled && signature) setCurrentUpdatesSignature(signature);
    };
    void refreshSignature();
    const id = window.setInterval(() => {
      void refreshSignature();
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const syncSeenState = () => {
      const seen = readSeenUpdatesSignature();
      setHasUnseenUpdates(currentUpdatesSignature !== seen);
    };
    syncSeenState();
    window.addEventListener("storage", syncSeenState);
    window.addEventListener(UPDATES_SEEN_EVENT, syncSeenState);
    return () => {
      window.removeEventListener("storage", syncSeenState);
      window.removeEventListener(UPDATES_SEEN_EVENT, syncSeenState);
    };
  }, [currentUpdatesSignature]);
  const activeRole = useAppStore((stateFromStore) => stateFromStore.activeRole);
  const roleTestingEnabled = useAppStore((stateFromStore) => stateFromStore.roleTestingEnabled);
  const roleTestAccessEditMode = useAppStore((stateFromStore) => stateFromStore.roleTestAccessEditMode);
  const roleSidebarItems = useAppStore((stateFromStore) => stateFromStore.roleSidebarItems);
  const toggleRoleSidebarItem = useAppStore((stateFromStore) => stateFromStore.toggleRoleSidebarItem);
  const setRoleTestingEnabled = useAppStore(
    (stateFromStore) => stateFromStore.setRoleTestingEnabled
  );
  const customRoleKeys = useAppStore((stateFromStore) => stateFromStore.customRoleKeys);
  const roleLabels = useAppStore((stateFromStore) => stateFromStore.roleLabels);
  const setActiveRole = useAppStore((stateFromStore) => stateFromStore.setActiveRole);
  const wipPageLocks = useAppStore((stateFromStore) => stateFromStore.wipPageLocks);
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
          {start.map((item) => (
            <SingleNavItem
              key={item.key}
              item={item}
              pathname={pathname}
              hasPermission={effectiveHasPermission}
              canAccessPageByPath={canAccessPageByPath}
              collapsed={false}
              userIsLoading={user.isLoading}
              isAdvertisingDeveloper={isAdvertisingDeveloper}
              wipPageLocks={wipPageLocks}
              accessEdit={navAccessEdit}
              updatesBellState={updatesBellState}
              t={t}
            />
          ))}
          {marketplaces.length > 0 ? (
            <MarketplaceExpandedGroup
              items={marketplaces}
              pathname={pathname}
              hasPermission={effectiveHasPermission}
              canAccessPageByPath={canAccessPageByPath}
              userIsLoading={user.isLoading}
              isAdvertisingDeveloper={isAdvertisingDeveloper}
              wipPageLocks={wipPageLocks}
              accessEdit={navAccessEdit}
              updatesBellState={updatesBellState}
              t={t}
            />
          ) : null}
          {rest.map((item) => (
            <SingleNavItem
              key={item.key}
              item={item}
              pathname={pathname}
              hasPermission={effectiveHasPermission}
              canAccessPageByPath={canAccessPageByPath}
              collapsed={false}
              userIsLoading={user.isLoading}
              isAdvertisingDeveloper={isAdvertisingDeveloper}
              wipPageLocks={wipPageLocks}
              accessEdit={navAccessEdit}
              updatesBellState={updatesBellState}
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
