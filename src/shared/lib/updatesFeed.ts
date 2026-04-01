"use client";

/**
 * ─── Redaktionsregeln für UPDATE_CHANGELOG (für Endnutzer des Dashboards) ───
 *
 * Nur Einträge, die konkrete Nutzung oder sichtbares Verhalten im UI betreffen.
 *
 * Dazugehört:
 * - Neue oder geänderte Funktionen, die Nutzer mit ihren typischen Rollen anwenden können.
 * - Kurze, sachliche Beschreibung des Nutzens (was ist neu, wo finde ich es).
 *
 * Nicht dazugehört (lieber interne Doku / Changelog außerhalb der App):
 * - Rechte/Rollen-Editor, wer welche Admin-Aktion sieht, interne Berechtigungsschlüssel.
 * - Infrastruktur (Supabase, Migrationen, API-Details, Datenbankfelder).
 * - Technische Fehlerbehebungen ohne sichtbare Auswirkung für Nutzer.
 * - Meta-Infos nur für Entwickler (Debug, Konfiguration, Deployment).
 *
 * Bei Unklarheit: lieber weglassen oder auf eine Zeile Nutzen für den Alltag kürzen.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ChangelogEntry = {
  date: string;
  title: string;
  text: string;
  /** Entspricht `release_key` eines veröffentlichten Update-Tutorials (optional). */
  releaseKey?: string;
};

export const UPDATE_CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-04-01",
    title: "Marktplatz-Produkte: Manuell aktualisieren",
    text: "Auf allen Produktseiten gibt es jetzt einen „Aktualisieren“-Button. Damit lädst du Artikeldaten sofort neu, ohne auf den automatischen Hintergrundabgleich zu warten.",
  },
  {
    date: "2026-04-01",
    title: "Amazon-Produkte: Statusfilter korrigiert",
    text: "Der Statusfilter auf Amazon-Produkte lädt bei Wechsel auf „Alle“ jetzt zuverlässig den passenden Bestand nach. Aktive und inaktive Listings werden korrekt angezeigt.",
  },
  {
    date: "2026-04-01",
    title: "Benutzerverwaltung vereinfacht",
    text: "Nicht mehr benötigte Konfigurationsblöcke und Eingabefelder wurden aus der Benutzerverwaltung entfernt, damit die Seite klarer und auf die relevanten Aufgaben fokussiert ist.",
  },
  {
    date: "2026-04-01",
    title: "Xentral · Artikel: Verkaufswert gesamt",
    text: "Auf der Artikelübersicht siehst du neben dem Lagerwert den Verkaufswert gesamt (Verkaufspreis bzw. UVP-naher Preis × Bestand) für die angezeigten Zeilen.",
  },
  {
    date: "2026-04-01",
    title: "Hinweis auf neue Updates",
    text: "Wenn es neue Einträge in dieser Liste gibt, ist der Menüpunkt „Update & Feedback“ in der Seitenleiste hervorgehoben – so verpasst du keine Produktneuigkeiten.",
    releaseKey: "2026-04-release-1",
  },
  {
    date: "2026-03-27",
    title: "Update & Feedback",
    text: "Produktneuigkeiten und deine Ideen für Verbesserungen findest du unter einem Menüpunkt. Gibt es ein passendes Tutorial zum Release, kannst du es hier starten.",
  },
  {
    date: "2026-03-26",
    title: "Einladung ins Team",
    text: "Einladung annehmen, Passwort setzen und direkt mit deiner Rolle loslegen.",
  },
];

export const UPDATES_SEEN_SIGNATURE_KEY = "dashboard_updates_seen_signature_v1";
export const UPDATES_SEEN_EVENT = "dashboard:updates-seen";

/** Owner: offene/in Bearbeitung befindliche Vorschläge – „gelesen“ wenn Signatur in localStorage. */
export const FEEDBACK_INBOX_SEEN_SIGNATURE_KEY = "dashboard_feedback_inbox_seen_signature_v1";
export const FEEDBACK_INBOX_SEEN_EVENT = "dashboard:feedback-inbox-seen";

export function getUpdatesSignature(entries: ChangelogEntry[] = UPDATE_CHANGELOG): string {
  return entries.map((entry) => `${entry.date}|${entry.title}|${entry.releaseKey ?? ""}`).join("::");
}

export function readSeenUpdatesSignature(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(UPDATES_SEEN_SIGNATURE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function markUpdatesAsSeen(signature: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(UPDATES_SEEN_SIGNATURE_KEY, signature);
    window.dispatchEvent(new Event(UPDATES_SEEN_EVENT));
  } catch {
    // ignore quota/private mode errors
  }
}

export function getFeedbackInboxSignature(
  items: Array<{ id: string; status: string }> | undefined | null
): string {
  const list = items ?? [];
  const ids = list
    .filter((i) => i.status === "open" || i.status === "in_progress")
    .map((i) => i.id)
    .sort();
  return ids.join("|");
}

export function readSeenFeedbackInboxSignature(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(FEEDBACK_INBOX_SEEN_SIGNATURE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function markFeedbackInboxAsSeen(signature: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FEEDBACK_INBOX_SEEN_SIGNATURE_KEY, signature);
    window.dispatchEvent(new Event(FEEDBACK_INBOX_SEEN_EVENT));
  } catch {
    // ignore
  }
}
