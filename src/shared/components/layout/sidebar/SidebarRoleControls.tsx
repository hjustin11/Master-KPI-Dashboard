"use client";

import { ChevronLeft, ChevronRight, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { LogoutMenuItem } from "@/shared/components/auth/LogoutMenuItem";
import type { Translate } from "@/shared/components/layout/sidebarWipText";

type RoleOption = { value: string; label: string };

type UserInfo = {
  initials: string;
  fullName: string;
  isLoading: boolean;
  roleKey?: string;
};

export function SidebarRoleControls({
  collapsed,
  user,
  roleLabel,
  canRoleSwitch,
  cycleRole,
  onProfileClick,
  roleTestingEnabled,
  setRoleTestingEnabled,
  roleOptions,
  activeRole,
  setActiveRole,
  t,
}: {
  collapsed: boolean;
  user: UserInfo;
  roleLabel: string;
  canRoleSwitch: boolean;
  cycleRole: (direction: "prev" | "next") => void;
  onProfileClick: () => void;
  roleTestingEnabled: boolean;
  setRoleTestingEnabled: (enabled: boolean) => void;
  roleOptions: RoleOption[];
  activeRole: string;
  setActiveRole: (role: string) => void;
  t: Translate;
}) {
  return (
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
        <DropdownMenuItem onClick={onProfileClick}>
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
  );
}
