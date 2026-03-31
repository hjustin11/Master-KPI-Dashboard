import type { Role } from "@/shared/lib/invitations";

const ROLE_KEYS = ["owner", "admin", "manager", "analyst", "viewer"] as const;

const ROLE_ALIASES: Record<string, Role> = {
  owner: "owner",
  entwickler: "owner",
  developer: "owner",

  admin: "admin",
  "team lead": "admin",
  teamlead: "admin",
  "team-lead": "admin",

  manager: "manager",
  operations: "manager",

  analyst: "analyst",
  insights: "analyst",

  viewer: "viewer",
  mitglied: "viewer",
  member: "viewer",
};

export function normalizeRoleKey(value: unknown): Role | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  const alias = ROLE_ALIASES[key];
  if (alias) return alias;
  if ((ROLE_KEYS as readonly string[]).includes(key)) return key as Role;
  return null;
}

export function isOwnerRole(value: unknown): boolean {
  return normalizeRoleKey(value) === "owner";
}

export function isOwnerOrAdminRole(value: unknown): boolean {
  const role = normalizeRoleKey(value);
  return role === "owner" || role === "admin";
}
