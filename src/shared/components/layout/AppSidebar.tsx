"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { PanelLeft } from "lucide-react";
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
import { buttonVariants } from "@/components/ui/button";
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

export { MobileSidebarTrigger } from "./sidebar/MobileSidebarTrigger";
