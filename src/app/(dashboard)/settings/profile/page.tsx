"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/shared/lib/supabase/client";
import { useUser } from "@/shared/hooks/useUser";

type ProfileFormState = {
  fullName: string;
  language: string;
  timezone: string;
  notificationsEmail: boolean;
  notificationsWeeklyReport: boolean;
};

export default function SettingsProfilePage() {
  const user = useUser();
  const [formState, setFormState] = useState<ProfileFormState>({
    fullName: "",
    language: "de",
    timezone: "Europe/Berlin",
    notificationsEmail: true,
    notificationsWeeklyReport: true,
  });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const updateField = <K extends keyof ProfileFormState>(
    key: K,
    value: ProfileFormState[K]
  ) => {
    setSaved(false);
    setSaveError(null);
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    // Initialdaten aus Profil laden (primär aus profiles).
    const supabase = createClient();
    const load = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", authUser.id)
        .maybeSingle();

      const fullName =
        (profile?.full_name as string | undefined) ||
        (authUser.user_metadata?.full_name as string | undefined) ||
        user.fullName ||
        "";

      setFormState((prev) => ({
        ...prev,
        fullName,
      }));
    };

    void load();
  }, [user.fullName]);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(false);
    setSaveError(null);
    setIsSaving(true);

    try {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Nicht authentifiziert.");

      const fullName = formState.fullName.trim();

      // In DB sichtbar halten (public.profiles)
      const { error: upsertError } = await supabase.from("profiles").upsert(
        {
          id: authUser.id,
          email: authUser.email ?? "",
          full_name: fullName,
          role: user.roleKey,
        },
        { onConflict: "id" }
      );
      if (upsertError) throw new Error(upsertError.message);

      // Best-effort: auch Auth metadata aktualisieren (falls irgendwo fallback genutzt wird)
      await supabase.auth.updateUser({
        data: { full_name: fullName },
      });

      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Mein Profil</h1>
        <p className="text-muted-foreground">
          Passe deine persönlichen Einstellungen und Benachrichtigungen an.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="space-y-5 rounded-xl border border-border/50 bg-card/80 p-5 backdrop-blur-sm md:p-6"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium">Vollständiger Name</span>
            <input
              value={formState.fullName}
              onChange={(event) => updateField("fullName", event.target.value)}
              className="w-full rounded-md border border-border/50 bg-background px-3 py-2 outline-none focus:border-primary"
            />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">Sprache</span>
            <select
              value={formState.language}
              onChange={(event) => updateField("language", event.target.value)}
              className="w-full rounded-md border border-border/50 bg-background px-3 py-2 outline-none focus:border-primary"
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">Zeitzone</span>
            <select
              value={formState.timezone}
              onChange={(event) => updateField("timezone", event.target.value)}
              className="w-full rounded-md border border-border/50 bg-background px-3 py-2 outline-none focus:border-primary"
            >
              <option value="Europe/Berlin">Europe/Berlin</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York</option>
            </select>
          </label>
        </div>

        <div className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-4">
          <p className="text-sm font-medium">Benachrichtigungen</p>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={formState.notificationsEmail}
              onChange={(event) => updateField("notificationsEmail", event.target.checked)}
            />
            E-Mail-Benachrichtigungen aktivieren
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={formState.notificationsWeeklyReport}
              onChange={(event) =>
                updateField("notificationsWeeklyReport", event.target.checked)
              }
            />
            Woechentlichen KPI-Report erhalten
          </label>
        </div>

        {saveError ? (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
            {saveError}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 hover:opacity-90"
          >
            {isSaving ? "Speichere..." : "Einstellungen speichern"}
          </button>
          {saved ? (
            <span className="text-sm text-emerald-400">
              Profil wurde erfolgreich gespeichert.
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
