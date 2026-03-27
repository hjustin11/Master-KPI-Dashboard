import { type Role } from "@/shared/lib/invitations";

export type PermissionKey =
  | "view_dashboard"
  | "manage_integrations"
  | "manage_users"
  | "manage_roles"
  | "export_data";

export type SidebarItemKey =
  | "overview"
  | "amazon"
  | "xentral"
  | "advertising"
  | "analytics"
  | "settings"
  | "updates";

export type DashboardSectionKey =
  | "roles-manage"
  | "invite"
  | "members"
  | "permissions"
  | "sidebar-visibility";

export const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "analyst", label: "Analyst" },
  { value: "viewer", label: "Viewer" },
];

export const PERMISSION_CONFIG: Array<{ key: PermissionKey; label: string }> = [
  { key: "view_dashboard", label: "Dashboard ansehen" },
  { key: "manage_integrations", label: "Integrationen verwalten" },
  { key: "manage_users", label: "Benutzer verwalten" },
  { key: "manage_roles", label: "Rollen & Rechte verwalten" },
  { key: "export_data", label: "Daten exportieren" },
];

export const SIDEBAR_ITEM_CONFIG: Array<{ key: SidebarItemKey; label: string }> = [
  { key: "overview", label: "Übersicht" },
  { key: "amazon", label: "Amazon" },
  { key: "xentral", label: "Xentral" },
  { key: "advertising", label: "Werbung" },
  { key: "analytics", label: "Analytics" },
  { key: "settings", label: "Einstellungen" },
  { key: "updates", label: "Tasks" },
];

export const DASHBOARD_SECTION_CONFIG: Array<{ key: DashboardSectionKey; label: string }> = [
  { key: "roles-manage", label: "Rollen verwalten" },
  { key: "invite", label: "Benutzer einladen" },
  { key: "members", label: "Teammitglieder" },
  { key: "permissions", label: "Rollen & Berechtigungen" },
  { key: "sidebar-visibility", label: "Sidebar-Sichtbarkeit" },
];

export const INITIAL_ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  owner: [
    "view_dashboard",
    "manage_integrations",
    "manage_users",
    "manage_roles",
    "export_data",
  ],
  admin: ["view_dashboard", "manage_integrations", "manage_users", "export_data"],
  manager: ["view_dashboard", "manage_integrations", "export_data"],
  analyst: ["view_dashboard", "export_data"],
  viewer: ["view_dashboard"],
};

export const INITIAL_ROLE_SIDEBAR_ITEMS: Record<Role, Record<SidebarItemKey, boolean>> = {
  owner: {
    overview: true,
    amazon: true,
    xentral: true,
    advertising: true,
    analytics: true,
    settings: true,
    updates: true,
  },
  admin: {
    overview: true,
    amazon: true,
    xentral: true,
    advertising: true,
    analytics: true,
    settings: true,
    updates: true,
  },
  manager: {
    overview: true,
    amazon: true,
    xentral: true,
    advertising: true,
    analytics: true,
    settings: true,
    updates: true,
  },
  analyst: {
    overview: true,
    amazon: false,
    xentral: false,
    advertising: false,
    analytics: true,
    settings: true,
    updates: true,
  },
  viewer: {
    overview: true,
    amazon: false,
    xentral: false,
    advertising: false,
    analytics: false,
    settings: true,
    updates: true,
  },
};

export const INITIAL_ROLE_SECTION_VISIBILITY: Record<
  Role,
  Record<DashboardSectionKey, boolean>
> = {
  owner: {
    "roles-manage": true,
    invite: true,
    members: true,
    permissions: true,
    "sidebar-visibility": true,
  },
  admin: {
    "roles-manage": false,
    invite: true,
    members: true,
    permissions: false,
    "sidebar-visibility": false,
  },
  manager: {
    "roles-manage": false,
    invite: false,
    members: false,
    permissions: false,
    "sidebar-visibility": false,
  },
  analyst: {
    "roles-manage": false,
    invite: false,
    members: false,
    permissions: false,
    "sidebar-visibility": false,
  },
  viewer: {
    "roles-manage": false,
    invite: false,
    members: false,
    permissions: false,
    "sidebar-visibility": false,
  },
};
