import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DASHBOARD_SECTION_CONFIG,
  INITIAL_ROLE_SECTION_VISIBILITY,
  INITIAL_ROLE_PERMISSIONS,
  INITIAL_ROLE_SIDEBAR_ITEMS,
  ROLE_OPTIONS,
  type DashboardSectionKey,
  type PermissionKey,
  type SidebarItemKey,
} from "@/shared/lib/access-control";

type AppState = {
  sidebarOpen: boolean;
  dashboardEditMode: boolean;
  roleTestingEnabled: boolean;
  activeRole: string;
  rolePermissions: Record<string, PermissionKey[]>;
  roleSidebarItems: Record<string, Record<SidebarItemKey, boolean>>;
  roleSectionVisibility: Record<string, Record<DashboardSectionKey, boolean>>;
  roleLabels: Record<string, string>;
  customRoleKeys: string[];
  textOverrides: Record<string, string>;
  setSidebarOpen: (open: boolean) => void;
  setDashboardEditMode: (enabled: boolean) => void;
  setRoleTestingEnabled: (enabled: boolean) => void;
  setActiveRole: (roleKey: string) => void;
  setRoleLabel: (roleKey: string, label: string) => void;
  toggleRolePermission: (roleKey: string, permission: PermissionKey) => void;
  toggleRoleSidebarItem: (roleKey: string, itemKey: SidebarItemKey) => void;
  toggleRoleSectionVisibility: (roleKey: string, sectionKey: DashboardSectionKey) => void;
  addCustomRole: (label: string, templateRoleKey: string) => string;
  removeRole: (roleKey: string) => void;
  setTextOverride: (key: string, value: string) => void;
  removeTextOverride: (key: string) => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      dashboardEditMode: false,
      // Owner soll standardmäßig immer "Owner" sehen.
      // Test-Rollen werden nur genutzt, wenn roleTestingEnabled aktiv ist.
      roleTestingEnabled: false,
      activeRole: "owner",
      rolePermissions: INITIAL_ROLE_PERMISSIONS as Record<string, PermissionKey[]>,
      roleSidebarItems:
        INITIAL_ROLE_SIDEBAR_ITEMS as Record<string, Record<SidebarItemKey, boolean>>,
      roleSectionVisibility:
        INITIAL_ROLE_SECTION_VISIBILITY as Record<string, Record<DashboardSectionKey, boolean>>,
      roleLabels: ROLE_OPTIONS.reduce(
        (acc, item) => {
          acc[item.value] = item.label;
          return acc;
        },
        {} as Record<string, string>
      ),
      customRoleKeys: [],
      textOverrides: {},
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setDashboardEditMode: (enabled) => set({ dashboardEditMode: enabled }),
      setRoleTestingEnabled: (enabled) => set({ roleTestingEnabled: enabled }),
      setActiveRole: (roleKey) => set({ activeRole: roleKey }),
      setRoleLabel: (roleKey, label) =>
        set((state) => {
          return {
            roleLabels: {
              ...state.roleLabels,
              [roleKey]: label,
            },
          };
        }),
      toggleRolePermission: (roleKey, permission) =>
        set((state) => {
          const current = state.rolePermissions[roleKey] ?? [];
          const hasPermission = current.includes(permission);
          return {
            rolePermissions: {
              ...state.rolePermissions,
              [roleKey]: hasPermission
                ? current.filter((item) => item !== permission)
                : [...current, permission],
            },
          };
        }),
      toggleRoleSidebarItem: (roleKey, itemKey) =>
        set((state) => ({
          roleSidebarItems: {
            ...state.roleSidebarItems,
            [roleKey]: {
              ...(state.roleSidebarItems[roleKey] ?? {
                overview: true,
              }),
              [itemKey]: !Boolean(state.roleSidebarItems[roleKey]?.[itemKey]),
            },
          },
        })),
      toggleRoleSectionVisibility: (roleKey, sectionKey) =>
        set((state) => ({
          roleSectionVisibility: {
            ...state.roleSectionVisibility,
            [roleKey]: {
              ...(state.roleSectionVisibility[roleKey] ??
                DASHBOARD_SECTION_CONFIG.reduce(
                  (acc, item) => {
                    acc[item.key] = false;
                    return acc;
                  },
                  {} as Record<DashboardSectionKey, boolean>
                )),
              [sectionKey]: !Boolean(state.roleSectionVisibility[roleKey]?.[sectionKey]),
            },
          },
        })),
      addCustomRole: (label, templateRoleKey) => {
        const roleKey = `custom-${Date.now().toString(36)}`;

        set((state) => {
          const templatePermissions = state.rolePermissions[templateRoleKey] ?? [];
          const templateSidebarItems = state.roleSidebarItems[templateRoleKey] ?? {};

          return {
            activeRole: roleKey,
            roleLabels: {
              ...state.roleLabels,
              [roleKey]: label,
            },
            rolePermissions: {
              ...state.rolePermissions,
              [roleKey]: [...templatePermissions],
            },
            roleSidebarItems: {
              ...state.roleSidebarItems,
              [roleKey]: { ...templateSidebarItems },
            },
            customRoleKeys: [...state.customRoleKeys, roleKey],
          };
        });

        return roleKey;
      },
      removeRole: (roleKey) =>
        set((state) => {
          if (!state.customRoleKeys.includes(roleKey)) return state;

          const nextCustomRoleKeys = state.customRoleKeys.filter((key) => key !== roleKey);

          const nextRolePermissions = { ...state.rolePermissions };
          const nextRoleSidebarItems = { ...state.roleSidebarItems };
          const nextRoleSectionVisibility = { ...state.roleSectionVisibility };
          const nextRoleLabels = { ...state.roleLabels };

          delete nextRolePermissions[roleKey];
          delete nextRoleSidebarItems[roleKey];
          delete nextRoleSectionVisibility[roleKey];
          delete nextRoleLabels[roleKey];

          const nextActiveRole = state.activeRole === roleKey ? "owner" : state.activeRole;

          return {
            activeRole: nextActiveRole,
            customRoleKeys: nextCustomRoleKeys,
            rolePermissions: nextRolePermissions,
            roleSidebarItems: nextRoleSidebarItems,
            roleSectionVisibility: nextRoleSectionVisibility,
            roleLabels: nextRoleLabels,
          };
        }),
      setTextOverride: (key, value) =>
        set((state) => ({
          textOverrides: {
            ...state.textOverrides,
            [key]: value,
          },
        })),
      removeTextOverride: (key) =>
        set((state) => {
          const next = { ...state.textOverrides };
          delete next[key];
          return { textOverrides: next };
        }),
    }),
    {
      name: "master-dashboard-app-store-v1",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
