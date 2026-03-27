import { useEffect, useMemo } from "react";
import { useAppStore } from "@/shared/stores/useAppStore";
import { useUser } from "@/shared/hooks/useUser";
import {
  type DashboardSectionKey,
  type PermissionKey,
  type SidebarItemKey,
} from "@/shared/lib/access-control";

export function usePermissions() {
  const user = useUser();
  const activeRole = useAppStore((state) => state.activeRole);
  const setActiveRole = useAppStore((state) => state.setActiveRole);
  const roleTestingEnabled = useAppStore((state) => state.roleTestingEnabled);
  const rolePermissions = useAppStore((state) => state.rolePermissions);
  const roleSidebarItems = useAppStore((state) => state.roleSidebarItems);
  const roleSectionVisibility = useAppStore((state) => state.roleSectionVisibility);

  // Nur Owner darf eine abweichende Test-Rolle nutzen. Alle anderen werden auf ihre echte Rolle synchronisiert.
  useEffect(() => {
    if (!user.roleKey) return;

    // Non-Owner: niemals eine Test-Rolle zulassen (auch nicht über localStorage).
    if (user.roleKey !== "owner") {
      if (activeRole !== user.roleKey) setActiveRole(user.roleKey);
      return;
    }

    // Owner: wenn Testmodus AUS ist, immer Owner-Ansicht erzwingen.
    if (!roleTestingEnabled && activeRole !== "owner") {
      setActiveRole("owner");
    }
  }, [activeRole, roleTestingEnabled, setActiveRole, user.roleKey]);

  return useMemo(() => {
    const effectiveRoleKey =
      user.roleKey === "owner" ? (roleTestingEnabled ? activeRole : "owner") : user.roleKey;
    const permissions = rolePermissions[effectiveRoleKey] ?? [];
    const sidebarItems = roleSidebarItems[effectiveRoleKey];
    const sectionVisibility = roleSectionVisibility[effectiveRoleKey];

    const hasPermission = (permission: PermissionKey) => permissions.includes(permission);
    const canAccessSidebarItem = (itemKey: SidebarItemKey) => Boolean(sidebarItems?.[itemKey]);
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
