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
import type { Role } from "@/shared/lib/invitations";
import type { DashboardAccessConfigV1 } from "@/shared/lib/dashboard-access-config";
import {
  DEFAULT_SETTINGS_USERS_SECTION_ORDER,
  type SettingsUsersSectionId,
} from "@/shared/lib/settings-users-section-order";
import {
  type DashboardActionKey,
  type DashboardWidgetKey,
  actionAccessForRole,
  widgetVisibilityForRole,
} from "@/shared/lib/role-surface-access";
import { pageAccessForRole, type DashboardPageAccessKey } from "@/shared/lib/role-page-access";

function emptySectionVisibility(): Record<DashboardSectionKey, boolean> {
  return DASHBOARD_SECTION_CONFIG.reduce(
    (acc, item) => {
      acc[item.key] = false;
      return acc;
    },
    {} as Record<DashboardSectionKey, boolean>
  );
}

function sectionVisibilityForTemplate(
  state: Pick<AppState, "roleSectionVisibility">,
  templateRoleKey: string
): Record<DashboardSectionKey, boolean> {
  const existing = state.roleSectionVisibility[templateRoleKey];
  if (existing) return { ...existing };
  if (templateRoleKey in INITIAL_ROLE_SECTION_VISIBILITY) {
    return {
      ...INITIAL_ROLE_SECTION_VISIBILITY[templateRoleKey as Role],
    };
  }
  return emptySectionVisibility();
}

type AppState = {
  sidebarOpen: boolean;
  dashboardEditMode: boolean;
  roleTestingEnabled: boolean;
  /** Nur Entwickler + Rollen-Test: Sidebar/Berechtigungen/Kacheln pro Testrolle per Checkbox bearbeiten. */
  roleTestAccessEditMode: boolean;
  activeRole: string;
  rolePermissions: Record<string, PermissionKey[]>;
  roleSidebarItems: Record<string, Record<SidebarItemKey, boolean>>;
  roleSectionVisibility: Record<string, Record<DashboardSectionKey, boolean>>;
  rolePageAccess: Record<string, Record<DashboardPageAccessKey, boolean>>;
  roleWidgetVisibility: Record<string, Record<DashboardWidgetKey, boolean>>;
  roleActionAccess: Record<string, Record<DashboardActionKey, boolean>>;
  roleLabels: Record<string, string>;
  customRoleKeys: string[];
  textOverrides: Record<string, string>;
  settingsUsersSectionOrder: SettingsUsersSectionId[];
  setSidebarOpen: (open: boolean) => void;
  setDashboardEditMode: (enabled: boolean) => void;
  setRoleTestingEnabled: (enabled: boolean) => void;
  setRoleTestAccessEditMode: (enabled: boolean) => void;
  setActiveRole: (roleKey: string) => void;
  setRoleLabel: (roleKey: string, label: string) => void;
  toggleRolePermission: (roleKey: string, permission: PermissionKey) => void;
  toggleRoleSidebarItem: (roleKey: string, itemKey: SidebarItemKey) => void;
  toggleRoleSectionVisibility: (roleKey: string, sectionKey: DashboardSectionKey) => void;
  toggleRolePageAccess: (roleKey: string, pageKey: DashboardPageAccessKey) => void;
  toggleRoleWidgetVisibility: (roleKey: string, widgetKey: DashboardWidgetKey) => void;
  toggleRoleActionAccess: (roleKey: string, actionKey: DashboardActionKey) => void;
  addCustomRole: (label: string, templateRoleKey: string) => string;
  removeRole: (roleKey: string) => void;
  setTextOverride: (key: string, value: string) => void;
  removeTextOverride: (key: string) => void;
  setSettingsUsersSectionOrder: (order: SettingsUsersSectionId[]) => void;
  hydrateDashboardAccessFromRemote: (config: DashboardAccessConfigV1) => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      dashboardEditMode: false,
      roleTestingEnabled: false,
      roleTestAccessEditMode: false,
      activeRole: "owner",
      rolePermissions: INITIAL_ROLE_PERMISSIONS as Record<string, PermissionKey[]>,
      roleSidebarItems:
        INITIAL_ROLE_SIDEBAR_ITEMS as Record<string, Record<SidebarItemKey, boolean>>,
      roleSectionVisibility:
        INITIAL_ROLE_SECTION_VISIBILITY as Record<string, Record<DashboardSectionKey, boolean>>,
      rolePageAccess: {
        owner: pageAccessForRole("owner"),
        admin: pageAccessForRole("admin"),
        manager: pageAccessForRole("manager"),
        analyst: pageAccessForRole("analyst"),
        viewer: pageAccessForRole("viewer"),
      },
      roleWidgetVisibility: {
        owner: widgetVisibilityForRole("owner"),
        admin: widgetVisibilityForRole("admin"),
        manager: widgetVisibilityForRole("manager"),
        analyst: widgetVisibilityForRole("analyst"),
        viewer: widgetVisibilityForRole("viewer"),
      },
      roleActionAccess: {
        owner: actionAccessForRole("owner"),
        admin: actionAccessForRole("admin"),
        manager: actionAccessForRole("manager"),
        analyst: actionAccessForRole("analyst"),
        viewer: actionAccessForRole("viewer"),
      },
      roleLabels: ROLE_OPTIONS.reduce(
        (acc, item) => {
          acc[item.value] = "";
          return acc;
        },
        {} as Record<string, string>
      ),
      customRoleKeys: [],
      textOverrides: {},
      settingsUsersSectionOrder: [...DEFAULT_SETTINGS_USERS_SECTION_ORDER],
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setDashboardEditMode: (enabled) => set({ dashboardEditMode: enabled }),
      setRoleTestingEnabled: (enabled) =>
        set({
          roleTestingEnabled: enabled,
          ...(enabled ? {} : { roleTestAccessEditMode: false }),
        }),
      setRoleTestAccessEditMode: (enabled) => set({ roleTestAccessEditMode: enabled }),
      setActiveRole: (roleKey) => set({ activeRole: roleKey }),
      setRoleLabel: (roleKey, label) =>
        set((state) => ({
          roleLabels: {
            ...state.roleLabels,
            [roleKey]: label,
          },
        })),
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
      toggleRolePageAccess: (roleKey, pageKey) =>
        set((state) => ({
          rolePageAccess: {
            ...state.rolePageAccess,
            [roleKey]: {
              ...(state.rolePageAccess[roleKey] ?? pageAccessForRole(roleKey)),
              [pageKey]: !Boolean(state.rolePageAccess[roleKey]?.[pageKey]),
            },
          },
        })),
      toggleRoleWidgetVisibility: (roleKey, widgetKey) =>
        set((state) => ({
          roleWidgetVisibility: {
            ...state.roleWidgetVisibility,
            [roleKey]: {
              ...(state.roleWidgetVisibility[roleKey] ?? widgetVisibilityForRole(roleKey)),
              [widgetKey]: !Boolean(state.roleWidgetVisibility[roleKey]?.[widgetKey]),
            },
          },
        })),
      toggleRoleActionAccess: (roleKey, actionKey) =>
        set((state) => ({
          roleActionAccess: {
            ...state.roleActionAccess,
            [roleKey]: {
              ...(state.roleActionAccess[roleKey] ?? actionAccessForRole(roleKey)),
              [actionKey]: !Boolean(state.roleActionAccess[roleKey]?.[actionKey]),
            },
          },
        })),
      addCustomRole: (label, templateRoleKey) => {
        const roleKey = `custom-${Date.now().toString(36)}`;

        set((state) => {
          const templatePermissions = state.rolePermissions[templateRoleKey] ?? [];
          const templateSidebarItems = state.roleSidebarItems[templateRoleKey] ?? {};
          const templateSectionVisibility = sectionVisibilityForTemplate(state, templateRoleKey);
          const templatePageAccess =
            state.rolePageAccess[templateRoleKey] ?? pageAccessForRole(templateRoleKey);
          const templateWidgetVisibility =
            state.roleWidgetVisibility[templateRoleKey] ?? widgetVisibilityForRole(templateRoleKey);
          const templateActionAccess =
            state.roleActionAccess[templateRoleKey] ?? actionAccessForRole(templateRoleKey);

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
            roleSectionVisibility: {
              ...state.roleSectionVisibility,
              [roleKey]: { ...templateSectionVisibility },
            },
            rolePageAccess: {
              ...state.rolePageAccess,
              [roleKey]: { ...templatePageAccess },
            },
            roleWidgetVisibility: {
              ...state.roleWidgetVisibility,
              [roleKey]: { ...templateWidgetVisibility },
            },
            roleActionAccess: {
              ...state.roleActionAccess,
              [roleKey]: { ...templateActionAccess },
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
          const nextRolePageAccess = { ...state.rolePageAccess };
          const nextRoleWidgetVisibility = { ...state.roleWidgetVisibility };
          const nextRoleActionAccess = { ...state.roleActionAccess };
          const nextRoleLabels = { ...state.roleLabels };

          delete nextRolePermissions[roleKey];
          delete nextRoleSidebarItems[roleKey];
          delete nextRoleSectionVisibility[roleKey];
          delete nextRolePageAccess[roleKey];
          delete nextRoleWidgetVisibility[roleKey];
          delete nextRoleActionAccess[roleKey];
          delete nextRoleLabels[roleKey];

          const nextActiveRole = state.activeRole === roleKey ? "owner" : state.activeRole;

          return {
            activeRole: nextActiveRole,
            customRoleKeys: nextCustomRoleKeys,
            rolePermissions: nextRolePermissions,
            roleSidebarItems: nextRoleSidebarItems,
            roleSectionVisibility: nextRoleSectionVisibility,
            rolePageAccess: nextRolePageAccess,
            roleWidgetVisibility: nextRoleWidgetVisibility,
            roleActionAccess: nextRoleActionAccess,
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
      setSettingsUsersSectionOrder: (order) => set({ settingsUsersSectionOrder: order }),
      hydrateDashboardAccessFromRemote: (config) =>
        set({
          rolePermissions: config.rolePermissions,
          roleSidebarItems: config.roleSidebarItems,
          roleSectionVisibility: config.roleSectionVisibility,
          rolePageAccess: config.rolePageAccess,
          roleWidgetVisibility: config.roleWidgetVisibility,
          roleActionAccess: config.roleActionAccess,
          roleLabels: config.roleLabels,
          customRoleKeys: config.customRoleKeys,
          textOverrides: config.textOverrides,
          settingsUsersSectionOrder: config.settingsUsersSectionOrder,
        }),
    }),
    {
      name: "master-dashboard-app-store-v2",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
