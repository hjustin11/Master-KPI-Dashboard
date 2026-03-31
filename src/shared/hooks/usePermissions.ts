import { useMemo } from "react";
import { useAppStore } from "@/shared/stores/useAppStore";
import { useUser } from "@/shared/hooks/useUser";
import {
  INITIAL_ROLE_SIDEBAR_ITEMS,
  SIDEBAR_ITEM_CONFIG,
  type DashboardSectionKey,
  type PermissionKey,
  type SidebarItemKey,
} from "@/shared/lib/access-control";
import type { Role } from "@/shared/lib/invitations";
import type { DashboardActionKey, DashboardWidgetKey } from "@/shared/lib/role-surface-access";
import { actionAccessForRole, widgetVisibilityForRole } from "@/shared/lib/role-surface-access";

/**
 * Persistenz (localStorage) kann ältere Einträge ohne neuere Sidebar-Keys enthalten.
 * Fehlende Keys sollen die Standardwerte aus `INITIAL_ROLE_SIDEBAR_ITEMS` nutzen,
 * nicht „unsichtbar“ (undefined = false) werden.
 */
function mergeRoleSidebarItems(
  roleKey: string,
  stored: Record<SidebarItemKey, boolean> | undefined
): Record<SidebarItemKey, boolean> {
  const initial = INITIAL_ROLE_SIDEBAR_ITEMS[roleKey as Role];
  if (initial) {
    const merged = { ...initial };
    if (stored) {
      for (const k of Object.keys(stored) as SidebarItemKey[]) {
        if (stored[k] !== undefined) merged[k] = stored[k];
      }
    }
    return merged;
  }
  const fill = INITIAL_ROLE_SIDEBAR_ITEMS.manager;
  const merged = { ...(stored ?? {}) } as Partial<Record<SidebarItemKey, boolean>>;
  for (const { key } of SIDEBAR_ITEM_CONFIG) {
    if (merged[key] === undefined) merged[key] = fill[key];
  }
  return merged as Record<SidebarItemKey, boolean>;
}

export function usePermissions() {
  const user = useUser();
  const activeRole = useAppStore((state) => state.activeRole);
  const roleTestingEnabled = useAppStore((state) => state.roleTestingEnabled);
  const roleTestAccessEditMode = useAppStore((state) => state.roleTestAccessEditMode);
  const rolePermissions = useAppStore((state) => state.rolePermissions);
  const roleSidebarItems = useAppStore((state) => state.roleSidebarItems);
  const roleSectionVisibility = useAppStore((state) => state.roleSectionVisibility);
  const roleWidgetVisibility = useAppStore((state) => state.roleWidgetVisibility);
  const roleActionAccess = useAppStore((state) => state.roleActionAccess);

  return useMemo(() => {
    const userRoleKey = user.roleKey || "viewer";

    // Sicherheit: Non-Owner kann niemals eine Test-Rolle "effektiv" nutzen,
    // selbst wenn activeRole manipuliert wurde.
    const effectiveRoleKey =
      userRoleKey === "owner"
        ? roleTestingEnabled
          ? activeRole
          : "owner"
        : userRoleKey;
    const permissions = rolePermissions[effectiveRoleKey] ?? [];
    const sidebarItems = mergeRoleSidebarItems(
      effectiveRoleKey,
      roleSidebarItems[effectiveRoleKey]
    );
    const sectionVisibility = roleSectionVisibility[effectiveRoleKey];
    const widgetVisibility = {
      ...widgetVisibilityForRole(effectiveRoleKey),
      ...(roleWidgetVisibility[effectiveRoleKey] ?? {}),
    };
    const actionAccess = {
      ...actionAccessForRole(effectiveRoleKey),
      ...(roleActionAccess[effectiveRoleKey] ?? {}),
    };

    /** Entwickler im Rollen-Test mit „Zugriffe bearbeiten“: volle UI zum Setzen der Sichtbarkeiten. */
    const editingAccessInRoleTest =
      userRoleKey === "owner" && roleTestingEnabled && roleTestAccessEditMode;

    const hasPermission = (permission: PermissionKey) => {
      if (editingAccessInRoleTest) return true;
      return permissions.includes(permission);
    };
    const canAccessSidebarItem = (itemKey: SidebarItemKey) => {
      if (editingAccessInRoleTest) return true;
      return Boolean(sidebarItems[itemKey]);
    };
    const canViewSection = (sectionKey: DashboardSectionKey) => {
      if (editingAccessInRoleTest) return true;
      return Boolean(sectionVisibility?.[sectionKey]);
    };
    const canViewWidget = (widgetKey: DashboardWidgetKey) => {
      if (editingAccessInRoleTest) return true;
      return Boolean(widgetVisibility[widgetKey]);
    };
    const canUseAction = (actionKey: DashboardActionKey) => {
      if (editingAccessInRoleTest) return true;
      return Boolean(actionAccess[actionKey]);
    };

    /** Werbung: echte Entwickler-Rolle oder Zugriffs-Editor (Navigation zu allen Bereichen). */
    const isAdvertisingDeveloper =
      userRoleKey === "owner" &&
      (effectiveRoleKey === "owner" || editingAccessInRoleTest);

    return {
      activeRole: effectiveRoleKey,
      permissions,
      hasPermission,
      canAccessSidebarItem,
      canViewSection,
      canViewWidget,
      canUseAction,
      canViewAnalytics: hasPermission("export_data") && canAccessSidebarItem("analytics"),
      canManageUsers: hasPermission("manage_users"),
      isAdvertisingDeveloper,
      editingAccessInRoleTest,
    };
  }, [
    activeRole,
    roleTestingEnabled,
    roleTestAccessEditMode,
    rolePermissions,
    roleSidebarItems,
    roleSectionVisibility,
    roleWidgetVisibility,
    roleActionAccess,
    user.roleKey,
  ]);
}
