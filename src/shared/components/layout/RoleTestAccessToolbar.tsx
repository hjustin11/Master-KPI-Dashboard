"use client";

import { useMemo } from "react";
import { useUser } from "@/shared/hooks/useUser";
import { useAppStore } from "@/shared/stores/useAppStore";
import { useTranslation } from "@/i18n/I18nProvider";
import { resolveRoleLabel } from "@/i18n/resolve-role-label";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DASHBOARD_ACTION_CONFIG,
  DASHBOARD_WIDGET_CONFIG,
} from "@/shared/lib/role-surface-access";
import { DASHBOARD_PAGE_ACCESS_CONFIG } from "@/shared/lib/role-page-access";
import {
  DASHBOARD_SECTION_CONFIG,
  PERMISSION_CONFIG,
  ROLE_OPTIONS,
  SIDEBAR_ITEM_CONFIG,
  SIDEBAR_REQUIRED_PERMISSIONS,
} from "@/shared/lib/access-control";
import { cn } from "@/lib/utils";

export function RoleTestAccessToolbar() {
  const user = useUser();
  const { t, locale } = useTranslation();
  const roleTestingEnabled = useAppStore((s) => s.roleTestingEnabled);
  const roleTestAccessEditMode = useAppStore((s) => s.roleTestAccessEditMode);
  const setRoleTestAccessEditMode = useAppStore((s) => s.setRoleTestAccessEditMode);
  const activeRole = useAppStore((s) => s.activeRole);
  const roleLabels = useAppStore((s) => s.roleLabels);
  const customRoleKeys = useAppStore((s) => s.customRoleKeys);
  const rolePermissions = useAppStore((s) => s.rolePermissions);
  const roleSectionVisibility = useAppStore((s) => s.roleSectionVisibility);
  const rolePageAccess = useAppStore((s) => s.rolePageAccess);
  const roleSidebarItems = useAppStore((s) => s.roleSidebarItems);
  const roleWidgetVisibility = useAppStore((s) => s.roleWidgetVisibility);
  const roleActionAccess = useAppStore((s) => s.roleActionAccess);
  const toggleRolePermission = useAppStore((s) => s.toggleRolePermission);
  const toggleRoleSectionVisibility = useAppStore((s) => s.toggleRoleSectionVisibility);
  const toggleRolePageAccess = useAppStore((s) => s.toggleRolePageAccess);
  const toggleRoleSidebarItem = useAppStore((s) => s.toggleRoleSidebarItem);
  const toggleRoleWidgetVisibility = useAppStore((s) => s.toggleRoleWidgetVisibility);
  const toggleRoleActionAccess = useAppStore((s) => s.toggleRoleActionAccess);

  const roleLabel = useMemo(() => {
    const keys = [...ROLE_OPTIONS.map((r) => r.value), ...customRoleKeys];
    if (!keys.includes(activeRole)) return activeRole;
    return resolveRoleLabel(activeRole, roleLabels[activeRole], locale);
  }, [activeRole, customRoleKeys, roleLabels, locale]);

  if (user.isLoading || user.roleKey !== "owner" || !roleTestingEnabled) {
    return null;
  }

  const ownerLocked = activeRole === "owner";

  return (
    <div
      className={cn(
        "border-b border-border/60 bg-muted/25 px-4 py-2 md:px-6",
        roleTestAccessEditMode && "bg-primary/5"
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-muted-foreground">
          {t("header.roleTestAccessTarget", { role: roleLabel })}
        </span>
        <label className="inline-flex cursor-pointer items-center gap-2 font-medium">
          <input
            type="checkbox"
            checked={roleTestAccessEditMode}
            onChange={(e) => setRoleTestAccessEditMode(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          {t("header.roleTestAccessEdit")}
        </label>
        {roleTestAccessEditMode ? (
          <p className="w-full text-xs text-muted-foreground md:w-auto md:max-w-xl">
            {t("header.roleTestAccessEditHint")}
          </p>
        ) : null}
        {roleTestAccessEditMode ? (
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="outline" size="sm" className="ml-auto shrink-0">
                  {t("header.roleTestAccessPanelOpen")}
                </Button>
              }
            />
            <SheetContent side="right" className="flex w-[min(100vw-1rem,26rem)] flex-col gap-0 overflow-hidden p-0">
              <SheetHeader className="border-b border-border/50 px-4 py-3 text-left">
                <SheetTitle className="text-base">{t("header.roleTestAccessPanelTitle")}</SheetTitle>
                <p className="text-xs font-normal text-muted-foreground">
                  {t("header.roleTestAccessPanelLead", { role: roleLabel })}
                </p>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">{t("settingsUsers.permissionsTitle")}</h3>
                  <p className="text-xs text-muted-foreground">{t("header.roleTestAccessPanelPermissionsHint")}</p>
                  <ul className="space-y-2">
                    {PERMISSION_CONFIG.map((p) => {
                      const checked = rolePermissions[activeRole]?.includes(p.key) ?? false;
                      return (
                        <li key={p.key}>
                          <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-3.5 w-3.5 accent-primary"
                              checked={checked}
                              disabled={ownerLocked}
                              onChange={() => toggleRolePermission(activeRole, p.key)}
                            />
                            <span>{t(`permissions.${p.key}`)}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
                <section className="mt-6 space-y-2 border-t border-border/40 pt-4">
                  <h3 className="text-sm font-semibold">{t("settingsUsers.sidebarVisibilityTitle")}</h3>
                  <p className="text-xs text-muted-foreground">
                    Sidebar-Punkte. Hinweis: Manche Bereiche brauchen zusaetzlich Berechtigungen.
                  </p>
                  <ul className="space-y-2">
                    {SIDEBAR_ITEM_CONFIG.map((item) => {
                      const checked = Boolean(roleSidebarItems[activeRole]?.[item.key]);
                      const needs = SIDEBAR_REQUIRED_PERMISSIONS[item.key] ?? [];
                      const missing = needs.filter(
                        (permissionKey) => !(rolePermissions[activeRole] ?? []).includes(permissionKey)
                      );
                      return (
                        <li key={item.key} className="rounded-md border border-border/40 px-2 py-2">
                          <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-3.5 w-3.5 accent-primary"
                              checked={checked}
                              disabled={ownerLocked}
                              onChange={() => toggleRoleSidebarItem(activeRole, item.key)}
                            />
                            <span className="font-medium">{t(`sidebarItems.${item.key}`)}</span>
                          </label>
                          {checked && missing.length > 0 ? (
                            <div className="mt-1 ml-6 flex items-center gap-2 text-[11px] text-amber-600">
                              <span>Braucht auch: {missing.map((p) => t(`permissions.${p}`)).join(", ")}</span>
                              <button
                                type="button"
                                disabled={ownerLocked}
                                onClick={() => {
                                  for (const permissionKey of missing) {
                                    toggleRolePermission(activeRole, permissionKey);
                                  }
                                }}
                                className="rounded border border-amber-500/50 px-1.5 py-0.5 text-[10px] text-amber-700 hover:bg-amber-500/10 disabled:opacity-50"
                              >
                                Aktivieren
                              </button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
                <section className="mt-6 space-y-2 border-t border-border/40 pt-4">
                  <h3 className="text-sm font-semibold">{t("settingsUsers.cardVisibilityTitle")}</h3>
                  <p className="text-xs text-muted-foreground">{t("header.roleTestAccessPanelSectionsHint")}</p>
                  <ul className="space-y-2">
                    {DASHBOARD_SECTION_CONFIG.map((s) => {
                      const checked = Boolean(roleSectionVisibility[activeRole]?.[s.key]);
                      return (
                        <li key={s.key}>
                          <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-3.5 w-3.5 accent-primary"
                              checked={checked}
                              disabled={ownerLocked}
                              onChange={() => toggleRoleSectionVisibility(activeRole, s.key)}
                            />
                            <span>{t(`dashboardSections.${s.key}`)}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
                <section className="mt-6 space-y-2 border-t border-border/40 pt-4">
                  <h3 className="text-sm font-semibold">Unterseiten (Routen)</h3>
                  <p className="text-xs text-muted-foreground">
                    Direkter Seitenzugriff pro Rolle (auch bei direktem Link).
                  </p>
                  <ul className="space-y-2">
                    {DASHBOARD_PAGE_ACCESS_CONFIG.map((p) => {
                      const checked = Boolean(rolePageAccess[activeRole]?.[p.key]);
                      return (
                        <li key={p.key}>
                          <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-3.5 w-3.5 accent-primary"
                              checked={checked}
                              disabled={ownerLocked}
                              onChange={() => toggleRolePageAccess(activeRole, p.key)}
                            />
                            <span>{p.label}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
                <section className="mt-6 space-y-2 border-t border-border/40 pt-4">
                  <h3 className="text-sm font-semibold">Seiten-Kacheln</h3>
                  <p className="text-xs text-muted-foreground">
                    Grundlage: Kachel-Sichtbarkeit pro Rolle auf einzelnen Seiten.
                  </p>
                  <ul className="space-y-2">
                    {DASHBOARD_WIDGET_CONFIG.map((w) => {
                      const checked = Boolean(roleWidgetVisibility[activeRole]?.[w.key]);
                      return (
                        <li key={w.key}>
                          <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-3.5 w-3.5 accent-primary"
                              checked={checked}
                              disabled={ownerLocked}
                              onChange={() => toggleRoleWidgetVisibility(activeRole, w.key)}
                            />
                            <span>{w.label}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
                <section className="mt-6 space-y-2 border-t border-border/40 pt-4">
                  <h3 className="text-sm font-semibold">Kachel-Aktionen</h3>
                  <p className="text-xs text-muted-foreground">
                    Grundlage: Aktionen pro Rolle freigeben/entziehen.
                  </p>
                  <ul className="space-y-2">
                    {DASHBOARD_ACTION_CONFIG.map((a) => {
                      const checked = Boolean(roleActionAccess[activeRole]?.[a.key]);
                      return (
                        <li key={a.key}>
                          <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug">
                            <input
                              type="checkbox"
                              className="mt-0.5 h-3.5 w-3.5 accent-primary"
                              checked={checked}
                              disabled={ownerLocked}
                              onChange={() => toggleRoleActionAccess(activeRole, a.key)}
                            />
                            <span>{a.label}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </div>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>
    </div>
  );
}
