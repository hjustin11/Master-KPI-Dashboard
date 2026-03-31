import type { DashboardSectionKey, PermissionKey, SidebarItemKey } from "@/shared/lib/access-control";
import {
  isValidSettingsUsersSectionOrder,
  type SettingsUsersSectionId,
} from "@/shared/lib/settings-users-section-order";
import {
  actionAccessForRole,
  type DashboardActionKey,
  type DashboardWidgetKey,
  widgetVisibilityForRole,
} from "@/shared/lib/role-surface-access";

export const DASHBOARD_ACCESS_CONFIG_VERSION = 1 as const;

export type DashboardAccessConfigV1 = {
  v: typeof DASHBOARD_ACCESS_CONFIG_VERSION;
  rolePermissions: Record<string, PermissionKey[]>;
  roleSidebarItems: Record<string, Record<SidebarItemKey, boolean>>;
  roleSectionVisibility: Record<string, Record<DashboardSectionKey, boolean>>;
  roleWidgetVisibility: Record<string, Record<DashboardWidgetKey, boolean>>;
  roleActionAccess: Record<string, Record<DashboardActionKey, boolean>>;
  roleLabels: Record<string, string>;
  customRoleKeys: string[];
  textOverrides: Record<string, string>;
  settingsUsersSectionOrder: SettingsUsersSectionId[];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseDashboardAccessConfig(raw: unknown): DashboardAccessConfigV1 | null {
  if (!isPlainObject(raw)) return null;
  if (raw.v !== DASHBOARD_ACCESS_CONFIG_VERSION) return null;
  if (!isPlainObject(raw.rolePermissions)) return null;
  if (!isPlainObject(raw.roleSidebarItems)) return null;
  if (!isPlainObject(raw.roleSectionVisibility)) return null;
  if (raw.roleWidgetVisibility !== undefined && !isPlainObject(raw.roleWidgetVisibility)) return null;
  if (raw.roleActionAccess !== undefined && !isPlainObject(raw.roleActionAccess)) return null;
  if (!isPlainObject(raw.roleLabels)) return null;
  if (!Array.isArray(raw.customRoleKeys) || !raw.customRoleKeys.every((k) => typeof k === "string")) {
    return null;
  }
  if (!isPlainObject(raw.textOverrides)) return null;
  if (!isValidSettingsUsersSectionOrder(raw.settingsUsersSectionOrder)) return null;

  const customRoleKeys = raw.customRoleKeys as string[];
  const allRoleKeys = [
    "owner",
    "admin",
    "manager",
    "analyst",
    "viewer",
    ...customRoleKeys,
  ];
  const roleWidgetVisibilityRaw = (raw.roleWidgetVisibility ?? {}) as Record<
    string,
    Record<DashboardWidgetKey, boolean>
  >;
  const roleActionAccessRaw = (raw.roleActionAccess ?? {}) as Record<
    string,
    Record<DashboardActionKey, boolean>
  >;
  const roleWidgetVisibility = Object.fromEntries(
    allRoleKeys.map((roleKey) => [
      roleKey,
      {
        ...widgetVisibilityForRole(roleKey),
        ...(roleWidgetVisibilityRaw[roleKey] ?? {}),
      },
    ])
  ) as Record<string, Record<DashboardWidgetKey, boolean>>;
  const roleActionAccess = Object.fromEntries(
    allRoleKeys.map((roleKey) => [
      roleKey,
      {
        ...actionAccessForRole(roleKey),
        ...(roleActionAccessRaw[roleKey] ?? {}),
      },
    ])
  ) as Record<string, Record<DashboardActionKey, boolean>>;

  return {
    v: DASHBOARD_ACCESS_CONFIG_VERSION,
    rolePermissions: raw.rolePermissions as Record<string, PermissionKey[]>,
    roleSidebarItems: raw.roleSidebarItems as Record<string, Record<SidebarItemKey, boolean>>,
    roleSectionVisibility: raw.roleSectionVisibility as Record<
      string,
      Record<DashboardSectionKey, boolean>
    >,
    roleWidgetVisibility,
    roleActionAccess,
    roleLabels: raw.roleLabels as Record<string, string>,
    customRoleKeys,
    textOverrides: raw.textOverrides as Record<string, string>,
    settingsUsersSectionOrder: raw.settingsUsersSectionOrder,
  };
}

export type DashboardAccessStoreSlice = {
  rolePermissions: Record<string, PermissionKey[]>;
  roleSidebarItems: Record<string, Record<SidebarItemKey, boolean>>;
  roleSectionVisibility: Record<string, Record<DashboardSectionKey, boolean>>;
  roleWidgetVisibility: Record<string, Record<DashboardWidgetKey, boolean>>;
  roleActionAccess: Record<string, Record<DashboardActionKey, boolean>>;
  roleLabels: Record<string, string>;
  customRoleKeys: string[];
  textOverrides: Record<string, string>;
  settingsUsersSectionOrder: SettingsUsersSectionId[];
};

export function buildDashboardAccessPayloadFromSlice(
  slice: DashboardAccessStoreSlice
): DashboardAccessConfigV1 {
  return {
    v: DASHBOARD_ACCESS_CONFIG_VERSION,
    rolePermissions: slice.rolePermissions,
    roleSidebarItems: slice.roleSidebarItems,
    roleSectionVisibility: slice.roleSectionVisibility,
    roleWidgetVisibility: slice.roleWidgetVisibility,
    roleActionAccess: slice.roleActionAccess,
    roleLabels: slice.roleLabels,
    customRoleKeys: slice.customRoleKeys,
    textOverrides: slice.textOverrides,
    settingsUsersSectionOrder: slice.settingsUsersSectionOrder,
  };
}

const LEGACY_SECTION_ORDER_LS_KEY = "settings-users-section-order-v1";

/** Einmalige Übernahme alter localStorage-Reihenfolge in den Store (vor Server-Hydration). */
export function readLegacySectionOrderFromLocalStorage(): SettingsUsersSectionId[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_SECTION_ORDER_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidSettingsUsersSectionOrder(parsed)) return null;
    return [...parsed];
  } catch {
    return null;
  }
}

export function clearLegacySectionOrderLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_SECTION_ORDER_LS_KEY);
  } catch {
    // ignore
  }
}

export async function saveDashboardAccessConfigToServer(
  slice: DashboardAccessStoreSlice
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = buildDashboardAccessPayloadFromSlice(slice);
  try {
    const res = await fetch("/api/dashboard-access-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error",
    };
  }
}
