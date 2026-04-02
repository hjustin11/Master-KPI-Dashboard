"use client";

import { useAppStore } from "@/shared/stores/useAppStore";
import { useUser } from "@/shared/hooks/useUser";
import { isEntwicklerProfileRole } from "@/shared/lib/roles";

/**
 * Technische UI nur für die Rolle „Entwickler“ (Rohwert `profiles.role`:
 * `owner`, `developer` oder `entwickler` — nicht der Localhost-`roleKey`-Boost).
 * Im Rollen-Testmodus nur sichtbar, wenn die effektive Testrolle ebenfalls `owner` ist.
 */
export function useDeveloperUiVisible(): boolean {
  const user = useUser();
  const activeRole = useAppStore((state) => state.activeRole);
  const roleTestingEnabled = useAppStore((state) => state.roleTestingEnabled);
  if (user.isLoading) return false;
  if (!isEntwicklerProfileRole(user.profileRoleRaw)) return false;

  const userRoleKey = user.roleKey || "viewer";
  const effectiveRoleKey =
    userRoleKey === "owner" ? (roleTestingEnabled ? activeRole : "owner") : userRoleKey;

  return effectiveRoleKey === "owner";
}
