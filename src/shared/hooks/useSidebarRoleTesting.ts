"use client";

import { useMemo } from "react";
import { ROLE_OPTIONS, type SidebarItemKey } from "@/shared/lib/access-control";
import { useAppStore } from "@/shared/stores/useAppStore";
import { useUser } from "@/shared/hooks/useUser";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { resolveRoleLabel } from "@/i18n/resolve-role-label";
import type { Locale } from "@/i18n/config";
import type { NavAccessEditConfig } from "@/shared/lib/nav-access-edit";

export default function useSidebarRoleTesting(locale: Locale) {
  const user = useUser();
  const { activeRole: effectiveRole } = usePermissions();
  const activeRole = useAppStore((s) => s.activeRole);
  const roleTestingEnabled = useAppStore((s) => s.roleTestingEnabled);
  const roleTestAccessEditMode = useAppStore((s) => s.roleTestAccessEditMode);
  const roleSidebarItems = useAppStore((s) => s.roleSidebarItems);
  const toggleRoleSidebarItem = useAppStore((s) => s.toggleRoleSidebarItem);
  const setRoleTestingEnabled = useAppStore((s) => s.setRoleTestingEnabled);
  const customRoleKeys = useAppStore((s) => s.customRoleKeys);
  const roleLabels = useAppStore((s) => s.roleLabels);
  const setActiveRole = useAppStore((s) => s.setActiveRole);
  const wipPageLocks = useAppStore((s) => s.wipPageLocks);

  const roleLabel = resolveRoleLabel(effectiveRole, roleLabels[effectiveRole], locale);
  const roleOptions = useMemo(
    () => [
      ...ROLE_OPTIONS.map((item) => ({
        value: item.value,
        label: resolveRoleLabel(item.value, roleLabels[item.value], locale),
      })),
      ...customRoleKeys.map((key) => ({
        value: key,
        label: resolveRoleLabel(key, roleLabels[key], locale),
      })),
    ],
    [customRoleKeys, roleLabels, locale]
  );

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

  return {
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
  };
}
