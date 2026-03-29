"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
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
import { useTranslation } from "@/i18n/I18nProvider";
import { resolveRoleLabel } from "@/i18n/resolve-role-label";
import { saveDashboardAccessConfigToServer } from "@/shared/lib/dashboard-access-config";
import type { SettingsUsersSectionId } from "@/shared/lib/settings-users-section-order";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_COMPACT_CARD,
  DASHBOARD_PAGE_TITLE,
  DASHBOARD_PLAIN_TABLE_WRAP,
} from "@/shared/lib/dashboardUi";

type TeamMember = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};

const SECTION_CLASS = cn("w-full space-y-3", DASHBOARD_COMPACT_CARD);
const TABLE_WRAP_CLASS = DASHBOARD_PLAIN_TABLE_WRAP;
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
type SectionId = SettingsUsersSectionId;

export default function SettingsUsersPage() {
  const { t, locale } = useTranslation();
  const dateLocale = locale === "de" ? "de-DE" : locale === "zh" ? "zh-CN" : "en-US";
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
  const sectionOrder = useAppStore((state) => state.settingsUsersSectionOrder);
  const setSettingsUsersSectionOrder = useAppStore((state) => state.setSettingsUsersSectionOrder);

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
        label: resolveRoleLabel(roleKey, roleLabels[roleKey], locale),
      })),
    [testRoleKeys, roleLabels, locale]
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
          placeholder={t("settingsUsers.textOverridePlaceholder")}
          className="w-full rounded-md border border-border/50 bg-background px-2 py-1 text-xs outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => setTextOverride(textKey, "")}
          className="rounded-md border border-border/60 px-2 py-1 text-xs hover:bg-accent/40"
        >
          {t("settingsUsers.removeOverride")}
        </button>
        <button
          type="button"
          onClick={() => removeTextOverride(textKey)}
          className="rounded-md border border-border/60 px-2 py-1 text-xs hover:bg-accent/40"
        >
          {t("settingsUsers.resetOverride")}
        </button>
      </div>
    ) : null;

  const parseJsonSafely = useCallback(
    async <T,>(response: Response): Promise<T> => {
      const raw = await response.text();
      if (!raw) {
        throw new Error(t("settingsUsers.errors.emptyResponse"));
      }
      try {
        return JSON.parse(raw) as T;
      } catch {
        throw new Error(t("settingsUsers.errors.invalidJson"));
      }
    },
    [t]
  );

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
          throw new Error(payload.error ?? t("settingsUsers.errors.loadUsersFailed"));
        }
        setMembers(payload.users ?? []);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settingsUsers.errors.loadUsersUnknown");
        setMemberActionError(message);
      } finally {
        setIsLoadingMembers(false);
      }
    };

    if (canManageUsers) {
      void loadMembers();
    }
  }, [canManageUsers, parseJsonSafely, t]);

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
        throw new Error(payload.error ?? t("settingsUsers.errors.inviteFailed"));
      }

      setInviteMessage(
        payload.message ??
          payload.warning ??
          t("settingsUsers.errors.inviteSuccessDefault")
      );
      setInviteEmail("");
      setInviteRole("viewer");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("settingsUsers.errors.inviteUnknown");
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
        throw new Error(payload.error ?? t("settingsUsers.errors.removeUserFailed"));
      }
      setMembers((prev) => prev.filter((member) => member.id !== userId));
      setMemberActionMessage(payload.message ?? t("settingsUsers.memberRemoved"));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("settingsUsers.errors.removeUserUnknown");
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
    const prev = useAppStore.getState().settingsUsersSectionOrder;
    const index = prev.indexOf(sectionId);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= prev.length) return;
    const next = [...prev];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setSettingsUsersSectionOrder(next);
  };

  const handleToggleDashboardEdit = async () => {
    if (dashboardEditMode) {
      const s = useAppStore.getState();
      const result = await saveDashboardAccessConfigToServer({
        rolePermissions: s.rolePermissions,
        roleSidebarItems: s.roleSidebarItems,
        roleSectionVisibility: s.roleSectionVisibility,
        roleLabels: s.roleLabels,
        customRoleKeys: s.customRoleKeys,
        textOverrides: s.textOverrides,
        settingsUsersSectionOrder: s.settingsUsersSectionOrder,
      });
      if (!result.ok) {
        toast.error(t("settingsUsers.dashboardConfigSaveFailed", { message: result.error }));
      } else {
        toast.success(t("settingsUsers.dashboardConfigSaved"));
      }
      setIsPermissionEditMode(false);
    }
    setDashboardEditMode(!dashboardEditMode);
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
        <h1 className="text-xl font-semibold">{t("settingsUsers.accessDeniedTitle")}</h1>
        <p className="text-muted-foreground">{t("settingsUsers.accessDeniedBody")}</p>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-none flex-col gap-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className={DASHBOARD_PAGE_TITLE}>
            {text("users.page.title", t("settingsUsers.pageTitle"))}
          </h1>
          <button
            type="button"
            onClick={() => void handleToggleDashboardEdit()}
            className="rounded-md border border-border/70 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent/40"
          >
            {dashboardEditMode ? t("settingsUsers.dashboardEditOn") : t("settingsUsers.dashboardEditOff")}
          </button>
        </div>
        {text("users.page.description", t("settingsUsers.pageDescription")) ? (
          <p className="text-sm text-muted-foreground">
            {text("users.page.description", t("settingsUsers.pageDescription"))}
          </p>
        ) : null}
        <TextEditor textKey="users.page.title" />
        <TextEditor textKey="users.page.description" />
      </div>

      {canViewSection("roles-manage") ? (
      <section className={`${SECTION_CLASS} ${getSectionOrderClass("roles-manage")}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">
            {text("users.rolesManage.title", t("settingsUsers.rolesManageTitle"))}
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
          {text("users.rolesManage.description", t("settingsUsers.rolesManageDescription"))}
        </p>
        <TextEditor textKey="users.rolesManage.title" />
        <TextEditor textKey="users.rolesManage.description" />

        <div className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">{t("settingsUsers.standardRoles")}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {ROLE_OPTIONS.map((role) => (
                <label key={role.value} className="space-y-2 text-sm">
                  <span className="block text-muted-foreground">
                    {resolveRoleLabel(role.value, roleLabels[role.value], locale)} ({t("settingsUsers.roleKeyLabel")}:{" "}
                    {role.value})
                  </span>
                  <input
                    value={roleLabels[role.value] ?? ""}
                    placeholder={resolveRoleLabel(role.value, "", locale)}
                    onChange={(event) => setRoleLabel(role.value, event.target.value)}
                    disabled={!dashboardEditMode || !canManageRoles}
                    className="w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">{t("settingsUsers.customRoles")}</h3>

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
                placeholder={t("settingsUsers.newRolePlaceholder")}
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
                    {t("settingsUsers.templatePrefix")}:{" "}
                    {resolveRoleLabel(role.value, roleLabels[role.value], locale)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!dashboardEditMode || !canManageRoles || !newCustomRoleLabel.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("settingsUsers.createRole")}
              </button>
            </form>

            {customRoleKeys.length ? (
              <div className={TABLE_WRAP_CLASS}>
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t("settingsUsers.roleColumn")}</th>
                      <th className="px-3 py-2 font-medium">{t("settingsUsers.actionColumn")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customRoleKeys.map((roleKey) => (
                      <tr key={roleKey} className="border-t border-border/40">
                        <td className="px-3 py-2">
                          <input
                            value={roleLabels[roleKey] ?? ""}
                            placeholder={resolveRoleLabel(roleKey, "", locale)}
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
                            {t("settingsUsers.deleteRole")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("settingsUsers.noCustomRoles")}</p>
            )}
          </div>
        </div>
      </section>
      ) : null}

      {canViewSection("invite") ? (
      <section className={`${SECTION_CLASS} ${getSectionOrderClass("invite")}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{t("settingsUsers.inviteTitle")}</h2>
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
            placeholder={t("settingsUsers.inviteEmailPlaceholder")}
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
                {resolveRoleLabel(role.value, roleLabels[role.value], locale)}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={isSubmittingInvite}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 hover:opacity-90"
          >
            {isSubmittingInvite ? t("settingsUsers.inviteSending") : t("settingsUsers.inviteSend")}
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
          <h2 className="text-base font-semibold">{t("settingsUsers.membersTitle")}</h2>
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
          <p className="text-sm text-muted-foreground">{t("settingsUsers.loadingUsers")}</p>
        ) : members.length ? (
          <div className={TABLE_WRAP_CLASS}>
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("settingsUsers.emailColumn")}</th>
                  <th className="px-3 py-2 font-medium">{t("settingsUsers.roleColumnMember")}</th>
                  <th className="px-3 py-2 font-medium">{t("settingsUsers.createdAt")}</th>
                  <th className="px-3 py-2 font-medium text-right">{t("settingsUsers.actionColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-t border-border/40">
                    <td className="px-3 py-2">{member.email}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {resolveRoleLabel(member.role, roleLabels[member.role], locale)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(member.createdAt).toLocaleString(dateLocale)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveUser(member.id)}
                        className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-300 transition-all duration-200 hover:bg-red-500/10"
                      >
                        {t("settingsUsers.removeUser")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("settingsUsers.noUsersFound")}</p>
        )}
      </section>
      ) : null}

      {canViewSection("permissions") ? (
      <section className={`${SECTION_CLASS} ${getSectionOrderClass("permissions")}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{t("settingsUsers.permissionsTitle")}</h2>
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
        <p className="text-sm text-muted-foreground">{t("settingsUsers.permissionsOwnerHint")}</p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsPermissionEditMode((prev) => !prev)}
            disabled={!dashboardEditMode}
            className="rounded-md border border-border/70 bg-background px-3 py-1.5 text-xs transition-colors hover:bg-accent/40"
          >
            {isPermissionEditMode ? t("settingsUsers.permissionEditOn") : t("settingsUsers.permissionEditOff")}
          </button>
        </div>

        <div className={TABLE_WRAP_CLASS}>
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t("settingsUsers.permissionColumn")}</th>
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
                  <td className="px-3 py-2">{t(`permissions.${permission.key}`)}</td>
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
          <p className="text-xs text-muted-foreground">{t("settingsUsers.permissionHintNote")}</p>
        ) : null}
      </section>
      ) : null}

      {canViewSection("sidebar-visibility") ? (
      <section className={`${SECTION_CLASS} ${getSectionOrderClass("sidebar-visibility")}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{t("settingsUsers.sidebarVisibilityTitle")}</h2>
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
        <p className="text-sm text-muted-foreground">{t("settingsUsers.sidebarVisibilityDescription")}</p>
        <div className={TABLE_WRAP_CLASS}>
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t("settingsUsers.sidebarAreaColumn")}</th>
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
                  <td className="px-3 py-2">{t(`sidebarItems.${item.key}`)}</td>
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
          <h2 className="text-base font-semibold">{t("settingsUsers.cardVisibilityTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("settingsUsers.cardVisibilityDescription")}</p>
          <div className={TABLE_WRAP_CLASS}>
            <table className="w-full text-xs">
              <thead className="bg-muted/30 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("settingsUsers.areaColumn")}</th>
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
                    <td className="px-3 py-2">{t(`dashboardSections.${section.key}`)}</td>
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
