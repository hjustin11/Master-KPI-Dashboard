"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { type Role } from "@/shared/lib/invitations";
import {
  DASHBOARD_SECTION_CONFIG,
  PERMISSION_CONFIG,
  ROLE_OPTIONS,
  SIDEBAR_ITEM_CONFIG,
  type DashboardSectionKey,
  type PermissionKey,
  type SidebarItemKey,
} from "@/shared/lib/access-control";
import { useAppStore } from "@/shared/stores/useAppStore";
import { usePermissions } from "@/shared/hooks/usePermissions";

type TeamMember = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};

const SECTION_CLASS =
  "w-full space-y-3 rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur-sm md:p-5";
const TABLE_WRAP_CLASS =
  "overflow-x-auto rounded-lg border border-border/50 [&_th]:px-2.5 [&_th]:py-2 [&_td]:px-2.5 [&_td]:py-2";
const SECTION_ORDER_KEY = "settings-users-section-order-v1";
const DEFAULT_SECTION_ORDER = [
  "roles-manage",
  "invite",
  "members",
  "permissions",
  "sidebar-visibility",
] as const;
const ORDER_CLASSES = [
  "order-1",
  "order-2",
  "order-3",
  "order-4",
  "order-5",
  "order-6",
  "order-7",
  "order-8",
  "order-9",
] as const;
type SectionId = (typeof DEFAULT_SECTION_ORDER)[number];

export default function SettingsUsersPage() {
  const [currentUserRole] = useState<Role>("owner");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("viewer");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [memberActionMessage, setMemberActionMessage] = useState<string | null>(null);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [isPermissionEditMode, setIsPermissionEditMode] = useState(false);
  const [sectionOrder, setSectionOrder] =
    useState<SectionId[]>(DEFAULT_SECTION_ORDER as unknown as SectionId[]);

  const rolePermissions = useAppStore((state) => state.rolePermissions);
  const roleSidebarItems = useAppStore((state) => state.roleSidebarItems);
  const roleSectionVisibility = useAppStore((state) => state.roleSectionVisibility);
  const roleLabels = useAppStore((state) => state.roleLabels);
  const customRoleKeys = useAppStore((state) => state.customRoleKeys);
  const dashboardEditMode = useAppStore((state) => state.dashboardEditMode);
  const textOverrides = useAppStore((state) => state.textOverrides);
  const setDashboardEditMode = useAppStore((state) => state.setDashboardEditMode);
  const toggleRolePermission = useAppStore((state) => state.toggleRolePermission);
  const toggleRoleSidebarItem = useAppStore((state) => state.toggleRoleSidebarItem);
  const toggleRoleSectionVisibility = useAppStore(
    (state) => state.toggleRoleSectionVisibility
  );
  const setRoleLabel = useAppStore((state) => state.setRoleLabel);
  const addCustomRole = useAppStore((state) => state.addCustomRole);
  const removeRole = useAppStore((state) => state.removeRole);
  const setTextOverride = useAppStore((state) => state.setTextOverride);
  const removeTextOverride = useAppStore((state) => state.removeTextOverride);

  const inviteRoleOptions = useMemo(() => ROLE_OPTIONS, []);

  const testRoleKeys = useMemo(
    () => [...inviteRoleOptions.map((r) => r.value), ...customRoleKeys],
    [customRoleKeys, inviteRoleOptions]
  );

  const testRoleOptions = useMemo(
    () =>
      testRoleKeys.map((roleKey) => ({
        value: roleKey,
        label: roleLabels[roleKey] ?? roleKey,
      })),
    [testRoleKeys, roleLabels]
  );

  const [newCustomRoleLabel, setNewCustomRoleLabel] = useState("");
  const [newCustomRoleTemplate, setNewCustomRoleTemplate] = useState<Role>("viewer");

  const { hasPermission, canViewSection } = usePermissions();
  const canManageUsers = hasPermission("manage_users");
  const canManageRoles = hasPermission("manage_roles");

  const text = (key: string, fallback: string) =>
    Object.prototype.hasOwnProperty.call(textOverrides, key)
      ? textOverrides[key]
      : fallback;

  const TextEditor = ({ textKey }: { textKey: string }) =>
    dashboardEditMode ? (
      <div className="mt-2 flex items-center gap-2">
        <input
          value={textOverrides[textKey] ?? ""}
          onChange={(event) => setTextOverride(textKey, event.target.value)}
          placeholder="Text überschreiben..."
          className="w-full rounded-md border border-border/50 bg-background px-2 py-1 text-xs outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => setTextOverride(textKey, "")}
          className="rounded-md border border-border/60 px-2 py-1 text-xs hover:bg-accent/40"
        >
          Entfernen
        </button>
        <button
          type="button"
          onClick={() => removeTextOverride(textKey)}
          className="rounded-md border border-border/60 px-2 py-1 text-xs hover:bg-accent/40"
        >
          Reset
        </button>
      </div>
    ) : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(SECTION_ORDER_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as string[];
      const valid = parsed.filter((item): item is SectionId =>
        (DEFAULT_SECTION_ORDER as readonly string[]).includes(item)
      );
      if (valid.length === DEFAULT_SECTION_ORDER.length) {
        setSectionOrder(valid);
      }
    } catch {
      // Ignoriert invalide Daten im LocalStorage.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(sectionOrder));
  }, [sectionOrder]);

  const parseJsonSafely = async <T,>(response: Response): Promise<T> => {
    const raw = await response.text();
    if (!raw) {
      throw new Error("Leere Serverantwort. Bitte API-Konfiguration prüfen.");
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(
        "Serverantwort war kein gültiges JSON. Bitte API-Logs prüfen."
      );
    }
  };

  useEffect(() => {
    const loadMembers = async () => {
      setIsLoadingMembers(true);
      setMemberActionError(null);
      try {
        const response = await fetch("/api/users");
        const payload = await parseJsonSafely<{
          users?: TeamMember[];
          error?: string;
        }>(response);
        if (!response.ok) {
          throw new Error(payload.error ?? "Benutzer konnten nicht geladen werden.");
        }
        setMembers(payload.users ?? []);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unbekannter Fehler beim Laden.";
        setMemberActionError(message);
      } finally {
        setIsLoadingMembers(false);
      }
    };

    if (canManageUsers) {
      void loadMembers();
    }
  }, [canManageUsers]);

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    setIsSubmittingInvite(true);
    setInviteError(null);
    setInviteMessage(null);

    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });

      const payload = await parseJsonSafely<{
        invitation?: {
          id: string;
          email: string;
          role: Role;
          status: "pending" | "accepted";
          created_at: string;
          expires_at: string;
        };
        message?: string;
        warning?: string;
        error?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "Einladung konnte nicht erstellt werden.");
      }

      setInviteMessage(
        payload.message ??
          payload.warning ??
          "Einladung erstellt. Bitte E-Mail-Status prüfen."
      );
      setInviteEmail("");
      setInviteRole("viewer");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unbekannter Fehler beim Einladen.";
      setInviteError(message);
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    setMemberActionError(null);
    setMemberActionMessage(null);
    try {
      const response = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const payload = await parseJsonSafely<{ message?: string; error?: string }>(
        response
      );
      if (!response.ok) {
        throw new Error(payload.error ?? "Benutzer konnte nicht entfernt werden.");
      }
      setMembers((prev) => prev.filter((member) => member.id !== userId));
      setMemberActionMessage(payload.message ?? "Benutzer entfernt.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unbekannter Fehler beim Entfernen.";
      setMemberActionError(message);
    }
  };

  const togglePermission = (roleKey: string, permission: PermissionKey) => {
    if (roleKey === "owner" || !dashboardEditMode) return;
    toggleRolePermission(roleKey, permission);
  };

  const toggleSidebarItem = (
    roleKey: string,
    itemKey: SidebarItemKey
  ) => {
    if (roleKey === "owner" || !dashboardEditMode) return;
    toggleRoleSidebarItem(roleKey, itemKey);
  };

  const toggleSectionVisibility = (roleKey: string, sectionKey: DashboardSectionKey) => {
    if (roleKey === "owner" || !dashboardEditMode) return;
    toggleRoleSectionVisibility(roleKey, sectionKey);
  };

  const moveSection = (sectionId: SectionId, direction: "up" | "down") => {
    if (!dashboardEditMode) return;
    setSectionOrder((prev) => {
      const index = prev.indexOf(sectionId);
      if (index < 0) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const getSectionOrderClass = (sectionId: SectionId) => {
    const index = sectionOrder.indexOf(sectionId);
    return ORDER_CLASSES[index] ?? "order-last";
  };

  const isFirstSection = (sectionId: SectionId) => sectionOrder.indexOf(sectionId) === 0;
  const isLastSection = (sectionId: SectionId) => sectionOrder.indexOf(sectionId) === sectionOrder.length - 1;

  if (!canManageUsers) {
    return (
      <div className="space-y-3 rounded-xl border border-border/50 bg-card/80 p-6 backdrop-blur-sm">
        <h1 className="text-xl font-semibold">Owner Bereich</h1>
        <p className="text-muted-foreground">
          Nur Owner können Einladungen, Rollen und Rechte verwalten.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-none flex-col gap-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">
            {text("users.page.title", "Benutzerverwaltung")}
          </h1>
          <button
            type="button"
            onClick={() => setDashboardEditMode(!dashboardEditMode)}
            className="rounded-md border border-border/70 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent/40"
          >
            {dashboardEditMode ? "Dashboard Bearbeiten: AN" : "Dashboard Bearbeiten: AUS"}
          </button>
        </div>
        {text("users.page.description", "Owner-Bereich für Einladungen, Rollen und Berechtigungen.") ? (
          <p className="text-sm text-muted-foreground">
            {text("users.page.description", "Owner-Bereich für Einladungen, Rollen und Berechtigungen.")}
          </p>
        ) : null}
        <TextEditor textKey="users.page.title" />
        <TextEditor textKey="users.page.description" />
      </div>

      {canViewSection("roles-manage") ? (
      <section className={`${SECTION_CLASS} ${getSectionOrderClass("roles-manage")}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">
            {text("users.rolesManage.title", "Rollen verwalten (Labels + eigene Rollen)")}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => moveSection("roles-manage", "up")}
              disabled={!dashboardEditMode || isFirstSection("roles-manage")}
              className="rounded-md border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 disabled:opacity-40"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => moveSection("roles-manage", "down")}
              disabled={!dashboardEditMode || isLastSection("roles-manage")}
              className="rounded-md border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 disabled:opacity-40"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {text(
            "users.rolesManage.description",
            "Ändere die Rollenbezeichnungen und füge für Tests eigene Rollen hinzu oder entferne sie wieder."
          )}
        </p>
        <TextEditor textKey="users.rolesManage.title" />
        <TextEditor textKey="users.rolesManage.description" />

        <div className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Standardrollen</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {ROLE_OPTIONS.map((role) => (
                <label key={role.value} className="space-y-2 text-sm">
                  <span className="block text-muted-foreground">
                    {role.label} (Key: {role.value})
                  </span>
                  <input
                    value={roleLabels[role.value] ?? role.label}
                    onChange={(event) => setRoleLabel(role.value, event.target.value)}
                    disabled={!dashboardEditMode || !canManageRoles}
                    className="w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">Eigene Rollen</h3>

            <form
              className="grid gap-3 md:grid-cols-[1fr_220px_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                const label = newCustomRoleLabel.trim();
                if (!label || !dashboardEditMode || !canManageRoles) return;
                addCustomRole(label, newCustomRoleTemplate);
                setNewCustomRoleLabel("");
              }}
            >
              <input
                value={newCustomRoleLabel}
                onChange={(event) => setNewCustomRoleLabel(event.target.value)}
                placeholder="Name der neuen Rolle"
                className="rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <select
                value={newCustomRoleTemplate}
                onChange={(event) =>
                  setNewCustomRoleTemplate(event.target.value as Role)
                }
                disabled={!dashboardEditMode || !canManageRoles}
                className="rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    Vorlage: {role.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!dashboardEditMode || !canManageRoles || !newCustomRoleLabel.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Rolle anlegen
              </button>
            </form>

            {customRoleKeys.length ? (
              <div className={TABLE_WRAP_CLASS}>
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Rolle</th>
                      <th className="px-3 py-2 font-medium">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customRoleKeys.map((roleKey) => (
                      <tr key={roleKey} className="border-t border-border/40">
                        <td className="px-3 py-2">
                          <input
                            value={roleLabels[roleKey] ?? roleKey}
                            onChange={(event) => setRoleLabel(roleKey, event.target.value)}
                            disabled={!dashboardEditMode || !canManageRoles}
                            className="w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeRole(roleKey)}
                            disabled={!dashboardEditMode || !canManageRoles}
                            className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-300 transition-all duration-200 hover:bg-red-500/10"
                          >
                            Löschen
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Keine eigenen Rollen vorhanden.
              </p>
            )}
          </div>
        </div>
      </section>
      ) : null}

      {canViewSection("invite") ? (
      <section className={`${SECTION_CLASS} ${getSectionOrderClass("invite")}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">Benutzer einladen</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => moveSection("invite", "up")}
              disabled={!dashboardEditMode || isFirstSection("invite")}
              className="rounded-md border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 disabled:opacity-40"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => moveSection("invite", "down")}
              disabled={!dashboardEditMode || isLastSection("invite")}
              className="rounded-md border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 disabled:opacity-40"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <form onSubmit={handleInvite} className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <input
            type="email"
            placeholder="name@unternehmen.de"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            className="rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            required
          />

          <select
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value as Role)}
            className="rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            {inviteRoleOptions.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={isSubmittingInvite}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 hover:opacity-90"
          >
            {isSubmittingInvite ? "Sende..." : "Einladung senden"}
          </button>
        </form>

        {inviteMessage ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
            {inviteMessage}
          </p>
        ) : null}

        {inviteError ? (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
            {inviteError}
          </p>
        ) : null}
      </section>
      ) : null}

      {canViewSection("members") ? (
      <section className={`${SECTION_CLASS} ${getSectionOrderClass("members")}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">Teammitglieder</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => moveSection("members", "up")}
              disabled={!dashboardEditMode || isFirstSection("members")}
              className="rounded-md border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 disabled:opacity-40"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => moveSection("members", "down")}
              disabled={!dashboardEditMode || isLastSection("members")}
              className="rounded-md border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 disabled:opacity-40"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {memberActionMessage ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
            {memberActionMessage}
          </p>
        ) : null}

        {memberActionError ? (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
            {memberActionError}
          </p>
        ) : null}

        {isLoadingMembers ? (
          <p className="text-sm text-muted-foreground">Benutzer werden geladen...</p>
        ) : members.length ? (
          <div className={TABLE_WRAP_CLASS}>
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">E-Mail</th>
                  <th className="px-3 py-2 font-medium">Rolle</th>
                  <th className="px-3 py-2 font-medium">Erstellt am</th>
                  <th className="px-3 py-2 font-medium text-right">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-t border-border/40">
                    <td className="px-3 py-2">{member.email}</td>
                    <td className="px-3 py-2 uppercase text-muted-foreground">
                      {member.role}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(member.createdAt).toLocaleString("de-DE")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveUser(member.id)}
                        className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-300 transition-all duration-200 hover:bg-red-500/10"
                      >
                        Entfernen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Keine Benutzer gefunden.</p>
        )}
      </section>
      ) : null}

      {canViewSection("permissions") ? (
      <section className={`${SECTION_CLASS} ${getSectionOrderClass("permissions")}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">Rollen & Berechtigungen</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => moveSection("permissions", "up")}
              disabled={!dashboardEditMode || isFirstSection("permissions")}
              className="rounded-md border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 disabled:opacity-40"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => moveSection("permissions", "down")}
              disabled={!dashboardEditMode || isLastSection("permissions")}
              className="rounded-md border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 disabled:opacity-40"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Owner kann Berechtigungen je Rolle aktivieren oder entziehen.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsPermissionEditMode((prev) => !prev)}
            disabled={!dashboardEditMode}
            className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs transition-colors hover:bg-accent/40"
          >
            {isPermissionEditMode ? "Berechtigung Bearbeiten: AN" : "Berechtigung Bearbeiten: AUS"}
          </button>
        </div>

        <div className={TABLE_WRAP_CLASS}>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Berechtigung</th>
                {testRoleOptions.map((role) => (
                  <th key={role.value} className="px-3 py-2 text-center font-medium">
                    {role.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_CONFIG.map((permission) => (
                <tr key={permission.key} className="border-t border-border/40">
                  <td className="px-3 py-2">{permission.label}</td>
                  {testRoleOptions.map((role) => {
                    const checked =
                      rolePermissions[role.value]?.includes(permission.key) ?? false;
                    const disabled =
                      role.value === "owner" || !isPermissionEditMode || !dashboardEditMode;
                    return (
                      <td key={role.value} className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => togglePermission(role.value, permission.key)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isPermissionEditMode ? (
          <p className="text-xs text-muted-foreground">
            Hinweis: Aktiviere "Berechtigung Bearbeiten", um Rollenrechte zu ändern.
          </p>
        ) : null}
      </section>
      ) : null}

      {canViewSection("sidebar-visibility") ? (
      <section className={`${SECTION_CLASS} ${getSectionOrderClass("sidebar-visibility")}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">Sidebar-Sichtbarkeit pro Rolle</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => moveSection("sidebar-visibility", "up")}
              disabled={!dashboardEditMode || isFirstSection("sidebar-visibility")}
              className="rounded-md border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 disabled:opacity-40"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => moveSection("sidebar-visibility", "down")}
              disabled={!dashboardEditMode || isLastSection("sidebar-visibility")}
              className="rounded-md border border-border/70 p-1.5 text-muted-foreground transition-colors hover:bg-accent/40 disabled:opacity-40"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Im Bearbeitungsmodus kannst du steuern, welche Sidebar-Bereiche je Rolle sichtbar sind.
        </p>
        <div className={TABLE_WRAP_CLASS}>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Sidebar Bereich</th>
                {testRoleOptions.map((role) => (
                  <th key={role.value} className="px-3 py-2 text-center font-medium">
                    {role.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SIDEBAR_ITEM_CONFIG.map((item) => (
                <tr key={item.key} className="border-t border-border/40">
                  <td className="px-3 py-2">{item.label}</td>
                  {testRoleOptions.map((role) => {
                    const checked = Boolean(roleSidebarItems[role.value]?.[item.key]);
                    const disabled =
                      role.value === "owner" || !isPermissionEditMode || !dashboardEditMode;
                    return (
                      <td key={role.value} className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleSidebarItem(role.value, item.key)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {canManageRoles ? (
        <section className={SECTION_CLASS}>
          <h2 className="text-base font-semibold">Karten-Sichtbarkeit pro Rolle</h2>
          <p className="text-sm text-muted-foreground">
            Lege fest, welche Karten im Benutzerbereich je Rolle sichtbar sind.
          </p>
          <div className={TABLE_WRAP_CLASS}>
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Bereich</th>
                  {testRoleOptions.map((role) => (
                    <th key={role.value} className="px-3 py-2 text-center font-medium">
                      {role.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DASHBOARD_SECTION_CONFIG.map((section) => (
                  <tr key={section.key} className="border-t border-border/40">
                    <td className="px-3 py-2">{section.label}</td>
                    {testRoleOptions.map((role) => {
                      const checked = Boolean(roleSectionVisibility[role.value]?.[section.key]);
                      const disabled = role.value === "owner" || !dashboardEditMode;
                      return (
                        <td key={role.value} className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleSectionVisibility(role.value, section.key)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
