import { useMemo } from "react";
import { useAppStore } from "@/shared/stores/useAppStore";
import {
  type DashboardSectionKey,
  type PermissionKey,
  type SidebarItemKey,
} from "@/shared/lib/access-control";

export function usePermissions() {
  const activeRole = useAppStore((state) => state.activeRole);
  const rolePermissions = useAppStore((state) => state.rolePermissions);
  const roleSidebarItems = useAppStore((state) => state.roleSidebarItems);
  const roleSectionVisibility = useAppStore((state) => state.roleSectionVisibility);

  return useMemo(() => {
    const permissions = rolePermissions[activeRole] ?? [];
    const sidebarItems = roleSidebarItems[activeRole];
    const sectionVisibility = roleSectionVisibility[activeRole];

    const hasPermission = (permission: PermissionKey) => permissions.includes(permission);
    const canAccessSidebarItem = (itemKey: SidebarItemKey) => Boolean(sidebarItems?.[itemKey]);
    const canViewSection = (sectionKey: DashboardSectionKey) =>
      Boolean(sectionVisibility?.[sectionKey]);

    return {
      activeRole,
      permissions,
      hasPermission,
      canAccessSidebarItem,
      canViewSection,
      canViewAnalytics: hasPermission("export_data") && canAccessSidebarItem("analytics"),
      canManageUsers: hasPermission("manage_users"),
    };
  }, [activeRole, rolePermissions, roleSidebarItems, roleSectionVisibility]);
}
