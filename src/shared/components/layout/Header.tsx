"use client";

import { Bell, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumbs } from "@/shared/components/layout/Breadcrumbs";
import { MobileSidebarTrigger } from "@/shared/components/layout/AppSidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogoutMenuItem } from "@/shared/components/auth/LogoutMenuItem";
import { useUser } from "@/shared/hooks/useUser";
import { ROLE_OPTIONS } from "@/shared/lib/access-control";
import { useAppStore } from "@/shared/stores/useAppStore";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";
import { useTranslation } from "@/i18n/I18nProvider";
import { resolveRoleLabel } from "@/i18n/resolve-role-label";

export function Header() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const user = useUser();
  const activeRole = useAppStore((state) => state.activeRole);
  const roleTestingEnabled = useAppStore((state) => state.roleTestingEnabled);
  const setRoleTestingEnabled = useAppStore((state) => state.setRoleTestingEnabled);
  const customRoleKeys = useAppStore((state) => state.customRoleKeys);
  const roleLabels = useAppStore((state) => state.roleLabels);
  const setActiveRole = useAppStore((state) => state.setActiveRole);
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

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border/50 bg-sidebar">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <div className="hidden md:block">
          <SidebarTrigger />
        </div>

        <div className="md:hidden">
          <MobileSidebarTrigger />
        </div>

        <div className="min-w-0 flex-1">
          <Breadcrumbs />
        </div>

        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <Button variant="ghost" size="icon-sm">
            <Bell className="h-4 w-4" />
            <span className="sr-only">{t("header.notifications")}</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full">
              <Avatar size="sm">
                <AvatarFallback>{user.initials}</AvatarFallback>
              </Avatar>
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
      </div>
    </header>
  );
}
