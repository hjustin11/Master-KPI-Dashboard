"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { createClient } from "@/shared/lib/supabase/client";

type AuthMode = "login" | "register";

type UserAuthOverlayProps = {
  initialMode: AuthMode;
  initialEmail?: string;
  invitedRole?: string;
  inviteToken?: string;
};

export function UserAuthOverlay({
  initialMode,
  initialEmail = "",
  invitedRole,
  inviteToken,
}: UserAuthOverlayProps) {
  const router = useRouter();
  const [mode] = useState<AuthMode>(initialMode);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  const schema = useMemo(() => {
    if (mode === "login") {
      return z.object({
        email: z.string().email("Bitte eine gueltige E-Mail eingeben."),
        password: z.string().min(6, "Das Passwort muss mindestens 6 Zeichen haben."),
      });
    }

    // Invitation completion: only set password (email comes from invite)
    return z.object({
      fullName: z.string().min(2, "Bitte deinen Namen angeben."),
      password: z.string().min(6, "Das Passwort muss mindestens 6 Zeichen haben."),
    });
  }, [mode]);

  type LoginValues = { email: string; password: string };
  type InviteValues = { fullName: string; password: string };

  const form = useForm<LoginValues | InviteValues>({
    resolver: zodResolver(schema),
    defaultValues: (mode === "login"
      ? { email: initialEmail, password: "" }
      : { fullName: "", password: "" }) as LoginValues | InviteValues,
  });

  const isLoading = form.formState.isSubmitting;

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
    });
  }, []);

  const onSubmit = async (values: LoginValues | InviteValues) => {
    setServerMessage(null);
    const supabase = createClient();

    if (mode === "login") {
      const payload = values as LoginValues;
      const { error } = await supabase.auth.signInWithPassword(payload);
      if (error) {
        setServerMessage(error.message);
        return;
      }
      router.push("/");
      router.refresh();
      return;
    }

    // Einladung abschliessen: Passwort setzen + Einladung akzeptieren (Rolle setzen)
    const sessionUser = await supabase.auth.getUser();
    if (!sessionUser.data.user) {
      setServerMessage(
        "Du bist nicht eingeloggt. Bitte oeffne den Einladungslink aus deiner E-Mail erneut."
      );
      return;
    }

    const payload = values as InviteValues;
    const { error: pwError } = await supabase.auth.updateUser({
      password: payload.password,
      data: { full_name: payload.fullName.trim() },
    });
    if (pwError) {
      setServerMessage(pwError.message);
      return;
    }

    if (inviteToken) {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: inviteToken }),
      });
      const text = await res.text();
      if (!res.ok) {
        setServerMessage(text || "Einladung konnte nicht akzeptiert werden.");
        return;
      }
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-card/80 p-6 shadow-lg backdrop-blur-sm">
      <div className="mb-6 space-y-3 text-center">
        <div className="flex justify-center">
          <img
            src="/brand/petrhein-logo-attached.png"
            alt="PetRhein"
            className="h-11 w-auto object-contain"
            loading="eager"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {mode === "login"
            ? "Bitte anmelden."
            : "Einladung abschliessen: Passwort setzen und Konto aktivieren."}
        </p>
      </div>
      {invitedRole ? (
        <p className="mb-4 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
          Du wurdest als <strong>{invitedRole.toUpperCase()}</strong> eingeladen.
        </p>
      ) : null}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {mode === "login" ? (
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              className="w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-primary"
              {...form.register("email" as const)}
            />
            {"email" in form.formState.errors ? (
              <p className="text-xs text-red-400">
                {(form.formState.errors as unknown as { email?: { message?: string } }).email
                  ?.message ?? ""}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1 rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-sm">
              <p className="text-xs text-muted-foreground">E-Mail</p>
              <p className="font-medium">{initialEmail}</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="fullName" className="text-sm font-medium">
                Name
              </label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                className="w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-primary"
                {...form.register("fullName" as const)}
              />
              {"fullName" in form.formState.errors ? (
                <p className="text-xs text-red-400">
                  {(form.formState.errors as unknown as { fullName?: { message?: string } })
                    .fullName?.message ?? ""}
                </p>
              ) : null}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Passwort
          </label>
          <input
            id="password"
            type="password"
            className="w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-primary"
            {...form.register("password" as const)}
          />
          {"password" in form.formState.errors ? (
            <p className="text-xs text-red-400">
              {(form.formState.errors as unknown as { password?: { message?: string } }).password
                ?.message ?? ""}
            </p>
          ) : null}
        </div>

        {serverMessage ? (
          <p className="rounded-md border border-border/50 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {serverMessage}
          </p>
        ) : null}

        {mode === "register" && hasSession === false ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
            Hinweis: Du musst den Einladungslink aus der E-Mail oeffnen, damit du hier das Passwort
            setzen kannst.
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === "login" ? "Anmelden" : "Passwort setzen & starten"}
        </button>

        {mode === "login" ? (
          <div className="text-right">
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              Passwort vergessen?
            </Link>
          </div>
        ) : null}
      </form>
    </div>
  );
}
