import type { Role } from "@/shared/lib/invitations";

export type DashboardWidgetKey =
  | "updates.changelog"
  | "updates.feedbackForm"
  | "updates.ownerInbox";

export type DashboardActionKey =
  | "updates.tutorial.start"
  | "updates.feedback.submit"
  | "updates.ownerInbox.status"
  | "updates.ownerInbox.reply"
  | "xentral.orders.correctAddress"
  | "analytics.marketplaces.parity.editPrice"
  | "analytics.marketplaces.parity.editStock";

export const DASHBOARD_WIDGET_CONFIG: Array<{ key: DashboardWidgetKey; label: string }> = [
  { key: "updates.changelog", label: "Updates-Kachel" },
  { key: "updates.feedbackForm", label: "Vorschlag/Wünsche Formular" },
  { key: "updates.ownerInbox", label: "Owner Inbox (Verbesserung und Wünsche)" },
];

export const DASHBOARD_ACTION_CONFIG: Array<{ key: DashboardActionKey; label: string }> = [
  { key: "updates.tutorial.start", label: "Update-Tutorial starten" },
  { key: "updates.feedback.submit", label: "Vorschlag absenden" },
  { key: "updates.ownerInbox.status", label: "Owner: Status ändern" },
  { key: "updates.ownerInbox.reply", label: "Owner: Antwort speichern" },
  { key: "xentral.orders.correctAddress", label: "Xentral Bestellungen: Adresse korrigieren" },
  { key: "analytics.marketplaces.parity.editPrice", label: "Analytics Marktplätze: Preise bearbeiten" },
  { key: "analytics.marketplaces.parity.editStock", label: "Analytics Marktplätze: Bestand bearbeiten" },
];

export const INITIAL_ROLE_WIDGET_VISIBILITY: Record<Role, Record<DashboardWidgetKey, boolean>> = {
  owner: {
    "updates.changelog": true,
    "updates.feedbackForm": true,
    "updates.ownerInbox": true,
  },
  admin: {
    "updates.changelog": true,
    "updates.feedbackForm": true,
    "updates.ownerInbox": false,
  },
  manager: {
    "updates.changelog": true,
    "updates.feedbackForm": true,
    "updates.ownerInbox": false,
  },
  analyst: {
    "updates.changelog": true,
    "updates.feedbackForm": true,
    "updates.ownerInbox": false,
  },
  viewer: {
    "updates.changelog": true,
    "updates.feedbackForm": true,
    "updates.ownerInbox": false,
  },
};

export const INITIAL_ROLE_ACTION_ACCESS: Record<Role, Record<DashboardActionKey, boolean>> = {
  owner: {
    "updates.tutorial.start": true,
    "updates.feedback.submit": true,
    "updates.ownerInbox.status": true,
    "updates.ownerInbox.reply": true,
    "xentral.orders.correctAddress": true,
    "analytics.marketplaces.parity.editPrice": true,
    "analytics.marketplaces.parity.editStock": true,
  },
  admin: {
    "updates.tutorial.start": true,
    "updates.feedback.submit": true,
    "updates.ownerInbox.status": false,
    "updates.ownerInbox.reply": false,
    "xentral.orders.correctAddress": true,
    "analytics.marketplaces.parity.editPrice": true,
    "analytics.marketplaces.parity.editStock": true,
  },
  manager: {
    "updates.tutorial.start": true,
    "updates.feedback.submit": true,
    "updates.ownerInbox.status": false,
    "updates.ownerInbox.reply": false,
    "xentral.orders.correctAddress": true,
    "analytics.marketplaces.parity.editPrice": true,
    "analytics.marketplaces.parity.editStock": true,
  },
  analyst: {
    "updates.tutorial.start": true,
    "updates.feedback.submit": true,
    "updates.ownerInbox.status": false,
    "updates.ownerInbox.reply": false,
    "xentral.orders.correctAddress": false,
    "analytics.marketplaces.parity.editPrice": false,
    "analytics.marketplaces.parity.editStock": false,
  },
  viewer: {
    "updates.tutorial.start": true,
    "updates.feedback.submit": true,
    "updates.ownerInbox.status": false,
    "updates.ownerInbox.reply": false,
    "xentral.orders.correctAddress": false,
    "analytics.marketplaces.parity.editPrice": false,
    "analytics.marketplaces.parity.editStock": false,
  },
};

function emptyWidgetVisibility(): Record<DashboardWidgetKey, boolean> {
  return DASHBOARD_WIDGET_CONFIG.reduce(
    (acc, item) => {
      acc[item.key] = false;
      return acc;
    },
    {} as Record<DashboardWidgetKey, boolean>
  );
}

function emptyActionAccess(): Record<DashboardActionKey, boolean> {
  return DASHBOARD_ACTION_CONFIG.reduce(
    (acc, item) => {
      acc[item.key] = false;
      return acc;
    },
    {} as Record<DashboardActionKey, boolean>
  );
}

export function widgetVisibilityForRole(roleKey: string): Record<DashboardWidgetKey, boolean> {
  const initial = INITIAL_ROLE_WIDGET_VISIBILITY[roleKey as Role];
  if (initial) return { ...initial };
  return emptyWidgetVisibility();
}

export function actionAccessForRole(roleKey: string): Record<DashboardActionKey, boolean> {
  const initial = INITIAL_ROLE_ACTION_ACCESS[roleKey as Role];
  if (initial) return { ...initial };
  return emptyActionAccess();
}
