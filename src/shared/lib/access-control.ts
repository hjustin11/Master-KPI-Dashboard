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
  | "otto"
  | "kaufland"
  | "fressnapf"
  | "mediamarktSaturn"
  | "zooplus"
  | "tiktok"
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

/** Anzeigenamen kommen aus i18n (`roles.*`), nicht aus festen Labels. */
export const ROLE_OPTIONS: Array<{ value: Role }> = [
  { value: "owner" },
  { value: "admin" },
  { value: "manager" },
  { value: "analyst" },
  { value: "viewer" },
];

export const PERMISSION_CONFIG: Array<{ key: PermissionKey }> = [
  { key: "view_dashboard" },
  { key: "manage_integrations" },
  { key: "manage_users" },
  { key: "manage_roles" },
  { key: "export_data" },
];

export const SIDEBAR_ITEM_CONFIG: Array<{ key: SidebarItemKey }> = [
  { key: "overview" },
  { key: "amazon" },
  { key: "otto" },
  { key: "kaufland" },
  { key: "fressnapf" },
  { key: "mediamarktSaturn" },
  { key: "zooplus" },
  { key: "tiktok" },
  { key: "xentral" },
  { key: "advertising" },
  { key: "analytics" },
  { key: "settings" },
  { key: "updates" },
];

export const DASHBOARD_SECTION_CONFIG: Array<{ key: DashboardSectionKey }> = [
  { key: "roles-manage" },
  { key: "invite" },
  { key: "members" },
  { key: "permissions" },
  { key: "sidebar-visibility" },
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
    otto: true,
    kaufland: true,
    fressnapf: true,
    mediamarktSaturn: true,
    zooplus: true,
    tiktok: true,
    xentral: true,
    advertising: true,
    analytics: true,
    settings: true,
    updates: true,
  },
  admin: {
    overview: true,
    amazon: true,
    otto: true,
    kaufland: true,
    fressnapf: true,
    mediamarktSaturn: true,
    zooplus: true,
    tiktok: true,
    xentral: true,
    advertising: true,
    analytics: true,
    settings: true,
    updates: true,
  },
  manager: {
    overview: true,
    amazon: true,
    otto: true,
    kaufland: true,
    fressnapf: true,
    mediamarktSaturn: true,
    zooplus: true,
    tiktok: true,
    xentral: true,
    advertising: true,
    analytics: true,
    settings: true,
    updates: true,
  },
  analyst: {
    overview: true,
    amazon: false,
    otto: false,
    kaufland: false,
    fressnapf: false,
    mediamarktSaturn: false,
    zooplus: false,
    tiktok: false,
    xentral: false,
    advertising: false,
    analytics: true,
    settings: true,
    updates: true,
  },
  viewer: {
    overview: true,
    amazon: false,
    otto: false,
    kaufland: false,
    fressnapf: false,
    mediamarktSaturn: false,
    zooplus: false,
    tiktok: false,
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
