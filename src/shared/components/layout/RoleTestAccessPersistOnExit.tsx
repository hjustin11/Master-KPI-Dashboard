"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useUser } from "@/shared/hooks/useUser";
import { useAppStore } from "@/shared/stores/useAppStore";
import { saveDashboardAccessConfigToServer } from "@/shared/lib/dashboard-access-config";
import { useTranslation } from "@/i18n/I18nProvider";

/**
 * Beim Verlassen von „Zugriffe bearbeiten“ (Rollen-Test): Konfiguration nach Supabase speichern.
 * Lokaler Zustand bleibt zusätzlich über zustand/persist erhalten.
 */
export function RoleTestAccessPersistOnExit() {
  const { t } = useTranslation();
  const user = useUser();
  const roleTestingEnabled = useAppStore((s) => s.roleTestingEnabled);
  const roleTestAccessEditMode = useAppStore((s) => s.roleTestAccessEditMode);
  const rolePermissions = useAppStore((s) => s.rolePermissions);
  const roleSidebarItems = useAppStore((s) => s.roleSidebarItems);
  const roleSectionVisibility = useAppStore((s) => s.roleSectionVisibility);
  const roleWidgetVisibility = useAppStore((s) => s.roleWidgetVisibility);
  const roleActionAccess = useAppStore((s) => s.roleActionAccess);
  const roleLabels = useAppStore((s) => s.roleLabels);
  const customRoleKeys = useAppStore((s) => s.customRoleKeys);
  const textOverrides = useAppStore((s) => s.textOverrides);
  const settingsUsersSectionOrder = useAppStore((s) => s.settingsUsersSectionOrder);
  const prevEdit = useRef(false);
  const prevRoleTest = useRef(false);
  const dirtyRef = useRef(false);
  const debounceRef = useRef<number | null>(null);

  const saveCurrentState = useCallback(async () => {
    const s = useAppStore.getState();
    const result = await saveDashboardAccessConfigToServer({
      rolePermissions: s.rolePermissions,
      roleSidebarItems: s.roleSidebarItems,
      roleSectionVisibility: s.roleSectionVisibility,
      roleWidgetVisibility: s.roleWidgetVisibility,
      roleActionAccess: s.roleActionAccess,
      roleLabels: s.roleLabels,
      customRoleKeys: s.customRoleKeys,
      textOverrides: s.textOverrides,
      settingsUsersSectionOrder: s.settingsUsersSectionOrder,
    });
    if (!result.ok) {
      toast.error(t("settingsUsers.dashboardConfigSaveFailed", { message: result.error }));
      return;
    }
    dirtyRef.current = false;
    toast.success(t("settingsUsers.dashboardConfigSaved"));
  }, [t]);

  useEffect(() => {
    if (user.isLoading || user.roleKey !== "owner") {
      prevEdit.current = roleTestAccessEditMode;
      prevRoleTest.current = roleTestingEnabled;
      return;
    }

    const wasOn = prevEdit.current;
    prevEdit.current = roleTestAccessEditMode;
    const wasRoleTestOn = prevRoleTest.current;
    prevRoleTest.current = roleTestingEnabled;
    const leavingEditMode = wasOn && !roleTestAccessEditMode;
    const leavingRoleTestMode = wasRoleTestOn && !roleTestingEnabled;

    if (!leavingEditMode && !leavingRoleTestMode) {
      return;
    }
    if (dirtyRef.current) void saveCurrentState();
  }, [roleTestAccessEditMode, roleTestingEnabled, user.isLoading, user.roleKey, t, saveCurrentState]);

  useEffect(() => {
    if (user.isLoading || user.roleKey !== "owner" || !roleTestingEnabled || !roleTestAccessEditMode) return;
    dirtyRef.current = true;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      if (!dirtyRef.current) return;
      void saveCurrentState();
    }, 900);
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [
    rolePermissions,
    roleSidebarItems,
    roleSectionVisibility,
    roleWidgetVisibility,
    roleActionAccess,
    roleLabels,
    customRoleKeys,
    textOverrides,
    settingsUsersSectionOrder,
    roleTestingEnabled,
    roleTestAccessEditMode,
    user.isLoading,
    user.roleKey,
    saveCurrentState,
  ]);

  return null;
}
