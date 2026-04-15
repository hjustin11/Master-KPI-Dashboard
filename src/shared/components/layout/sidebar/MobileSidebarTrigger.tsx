"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsUpDown, PanelLeft, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LogoutMenuItem } from "@/shared/components/auth/LogoutMenuItem";
import { useUser } from "@/shared/hooks/useUser";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { useTranslation } from "@/i18n/I18nProvider";
import { useTutorialNavGate } from "@/shared/components/tutorial/TutorialNavContext";
import useSidebarNav from "@/shared/hooks/useSidebarNav";
import useSidebarRoleTesting from "@/shared/hooks/useSidebarRoleTesting";
import useUpdatesPolling from "@/shared/hooks/useUpdatesPolling";
import { SidebarNavSections } from "./SidebarNavSections";

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
