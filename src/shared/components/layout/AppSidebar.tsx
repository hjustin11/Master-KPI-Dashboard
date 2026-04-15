"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  PanelLeft,
  User,
} from "lucide-react";
import { SidebarNavSections } from "./sidebar/SidebarNavSections";
import { SidebarRoleControls } from "./sidebar/SidebarRoleControls";
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
import { LogoutMenuItem } from "@/shared/components/auth/LogoutMenuItem";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useUser } from "@/shared/hooks/useUser";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { useTranslation } from "@/i18n/I18nProvider";
import { useTutorialNavGate } from "@/shared/components/tutorial/TutorialNavContext";
import useSidebarNav from "@/shared/hooks/useSidebarNav";
import useSidebarRoleTesting from "@/shared/hooks/useSidebarRoleTesting";
import useUpdatesPolling from "@/shared/hooks/useUpdatesPolling";

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
    isAdvertisingDeveloper,
  } = usePermissions();
  const {
    activeRole,
    setActiveRole,
    roleTestingEnabled,
    setRoleTestingEnabled,
    roleOptions,
    roleLabel,
    canRoleSwitch,
    cycleRole,
    navAccessEdit,
    wipPageLocks,
  } = useSidebarRoleTesting(locale);
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
  const {
    start,
    marketplaces,
    rest,
    effectiveHasPermission,
  } = useSidebarNav({
    hasPermission,
    canAccessSidebarItem,
    canAccessPageByPath,
    visibleSidebarKeys,
    userIsLoading: user.isLoading,
  });
  const { updatesBellState } = useUpdatesPolling();

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
        <SidebarNavSections
          start={start}
          marketplaces={marketplaces}
          rest={rest}
          collapsed={collapsed}
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
      </SidebarContent>

      <SidebarFooter className="border-t border-border/50 p-3">
        <SidebarRoleControls
          collapsed={collapsed}
          user={user}
          roleLabel={roleLabel}
          canRoleSwitch={canRoleSwitch}
          cycleRole={cycleRole}
          onProfileClick={() => router.push("/settings/profile")}
          roleTestingEnabled={roleTestingEnabled}
          setRoleTestingEnabled={setRoleTestingEnabled}
          roleOptions={roleOptions}
          activeRole={activeRole}
          setActiveRole={setActiveRole}
          t={t}
        />
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
    isAdvertisingDeveloper,
  } = usePermissions();
  const {
    activeRole,
    setActiveRole,
    roleTestingEnabled,
    setRoleTestingEnabled,
    roleOptions,
    roleLabel,
    canRoleSwitch,
    cycleRole,
    navAccessEdit,
    wipPageLocks,
  } = useSidebarRoleTesting(locale);
  const {
    start,
    marketplaces,
    rest,
    effectiveHasPermission,
  } = useSidebarNav({
    hasPermission,
    canAccessSidebarItem,
    canAccessPageByPath,
    visibleSidebarKeys,
    userIsLoading: user.isLoading,
  });
  const { updatesBellState } = useUpdatesPolling();

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
        <SidebarNavSections
          start={start}
          marketplaces={marketplaces}
          rest={rest}
          collapsed={false}
          pathname={pathname}
          hasPermission={effectiveHasPermission}
          canAccessPageByPath={canAccessPageByPath}
          userIsLoading={user.isLoading}
          isAdvertisingDeveloper={isAdvertisingDeveloper}
          wipPageLocks={wipPageLocks}
          accessEdit={navAccessEdit}
          updatesBellState={updatesBellState}
          t={t}
          className="space-y-1 px-4 pb-4"
        />
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
