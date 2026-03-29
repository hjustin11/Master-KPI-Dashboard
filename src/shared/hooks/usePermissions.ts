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
  const rolePermissions = useAppStore((state) => state.rolePermissions);
  const roleSidebarItems = useAppStore((state) => state.roleSidebarItems);
  const roleSectionVisibility = useAppStore((state) => state.roleSectionVisibility);

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

    const hasPermission = (permission: PermissionKey) => permissions.includes(permission);
    const canAccessSidebarItem = (itemKey: SidebarItemKey) => Boolean(sidebarItems[itemKey]);
    const canViewSection = (sectionKey: DashboardSectionKey) =>
      Boolean(sectionVisibility?.[sectionKey]);

    return {
      activeRole: effectiveRoleKey,
      permissions,
      hasPermission,
      canAccessSidebarItem,
      canViewSection,
      canViewAnalytics: hasPermission("export_data") && canAccessSidebarItem("analytics"),
      canManageUsers: hasPermission("manage_users"),
    };
  }, [
    activeRole,
    roleTestingEnabled,
    rolePermissions,
    roleSidebarItems,
    roleSectionVisibility,
    user.roleKey,
  ]);
}
