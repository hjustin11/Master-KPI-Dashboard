import { describe, it, expect } from "vitest";
import {
  normalizeRoleKey,
  isOwnerRole,
  isOwnerOrAdminRole,
  isOwnerFromSources,
  resolveEffectiveRoleKey,
} from "./roles";

describe("normalizeRoleKey", () => {
  it("akzeptiert kanonische Keys", () => {
    expect(normalizeRoleKey("owner")).toBe("owner");
    expect(normalizeRoleKey("admin")).toBe("admin");
    expect(normalizeRoleKey("viewer")).toBe("viewer");
  });

  it("wendet Aliase an", () => {
    expect(normalizeRoleKey("entwickler")).toBe("owner");
    expect(normalizeRoleKey("developer")).toBe("owner");
    expect(normalizeRoleKey("team lead")).toBe("admin");
    expect(normalizeRoleKey("mitglied")).toBe("viewer");
  });

  it("ist case-insensitive und trim-freundlich", () => {
    expect(normalizeRoleKey("  OWNER  ")).toBe("owner");
    expect(normalizeRoleKey("Analyst")).toBe("analyst");
  });

  it("gibt null bei Unbekanntem", () => {
    expect(normalizeRoleKey("random")).toBeNull();
    expect(normalizeRoleKey("")).toBeNull();
    expect(normalizeRoleKey(null)).toBeNull();
    expect(normalizeRoleKey(undefined)).toBeNull();
    expect(normalizeRoleKey(123)).toBeNull();
  });
});

describe("isOwnerRole / isOwnerOrAdminRole", () => {
  it("erkennt Owner", () => {
    expect(isOwnerRole("owner")).toBe(true);
    expect(isOwnerRole("entwickler")).toBe(true);
    expect(isOwnerRole("admin")).toBe(false);
  });

  it("erkennt Owner+Admin", () => {
    expect(isOwnerOrAdminRole("owner")).toBe(true);
    expect(isOwnerOrAdminRole("admin")).toBe(true);
    expect(isOwnerOrAdminRole("manager")).toBe(false);
    expect(isOwnerOrAdminRole("viewer")).toBe(false);
  });
});

describe("resolveEffectiveRoleKey", () => {
  it("priorisiert profile > app > user > fallback", () => {
    expect(
      resolveEffectiveRoleKey({ profileRole: "owner", appRole: "viewer", userRole: "viewer" })
    ).toBe("owner");
    expect(
      resolveEffectiveRoleKey({ profileRole: null, appRole: "admin", userRole: "viewer" })
    ).toBe("admin");
    expect(
      resolveEffectiveRoleKey({ profileRole: null, appRole: null, userRole: "manager" })
    ).toBe("manager");
  });

  it("fällt auf fallback (default 'viewer')", () => {
    expect(resolveEffectiveRoleKey({})).toBe("viewer");
    expect(resolveEffectiveRoleKey({ fallback: "analyst" })).toBe("analyst");
  });
});

describe("isOwnerFromSources", () => {
  it("true, wenn irgendeine Quelle owner liefert", () => {
    expect(isOwnerFromSources({ profileRole: "owner" })).toBe(true);
    expect(isOwnerFromSources({ appRole: "entwickler" })).toBe(true);
    expect(isOwnerFromSources({ userRole: "developer" })).toBe(true);
  });

  it("false, wenn keine Quelle owner liefert", () => {
    expect(isOwnerFromSources({ profileRole: "admin", appRole: "viewer" })).toBe(false);
    expect(isOwnerFromSources({})).toBe(false);
  });
});
