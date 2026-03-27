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
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [inviteCta, setInviteCta] = useState<{ role: string; url: string } | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  type FormValues = { email: string; password?: string; fullName?: string };

  const schema = useMemo(() => {
    const base = z.object({
      email: z.string().email("Bitte eine gueltige E-Mail eingeben."),
      password: z.string().optional(),
      fullName: z.string().optional(),
    });

    return base.superRefine((value, ctx) => {
      // Login: email + password
      if (mode === "login") {
        if (!value.password || value.password.trim().length < 6) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["password"],
            message: "Das Passwort muss mindestens 6 Zeichen haben.",
          });
        }
        return;
      }

      // Invite completion: fullName + password (email is display only)
      if (inviteToken) {
        if (!value.fullName || value.fullName.trim().length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fullName"],
            message: "Bitte deinen Namen angeben.",
          });
        }
        if (!value.password || value.password.trim().length < 6) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["password"],
            message: "Das Passwort muss mindestens 6 Zeichen haben.",
          });
        }
      }
    });
  }, [inviteToken, mode]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues:
      mode === "login"
        ? { email: initialEmail, password: "" }
        : inviteToken
          ? { email: initialEmail, fullName: "", password: "" }
          : { email: initialEmail },
  });

  const isLoading = form.formState.isSubmitting;

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
    });
  }, []);

  const onSubmit = async (values: FormValues) => {
    setServerMessage(null);
    setInviteCta(null);
    const supabase = createClient();

    if (mode === "login") {
      const payload = {
        email: values.email,
        password: values.password ?? "",
      };
      const { error } = await supabase.auth.signInWithPassword(payload);
      if (error) {
        // Wenn der User eingeladen wurde (Invite-only), leite ihn zur Registrierung/Invite-Abschluss.
        const errorText = error.message.toLowerCase();
        if (errorText.includes("invalid login credentials")) {
          try {
            const res = await fetch("/api/invitations/lookup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: payload.email }),
            });
            const data = (await res.json()) as
              | { invited: true; role: string; inviteUrl: string }
              | { invited: false };
            if ("invited" in data && data.invited) {
              setInviteCta({ role: data.role, url: data.inviteUrl });
              setServerMessage(
                `Du hast eine Einladung als ${data.role.toUpperCase()}. Bitte Registrierung abschliessen.`
              );
              return;
            }
          } catch {
            // ignore, fallback to default error
          }
        }

        setServerMessage(error.message);
        return;
      }
      router.push("/");
      router.refresh();
      return;
    }

    // "Registrieren" im Login-Menue (invite-only): E-Mail gegen Einladungen pruefen und weiterleiten.
    if (!inviteToken) {
      try {
        const res = await fetch("/api/invitations/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: values.email }),
        });
        const data = (await res.json()) as
          | { invited: true; role: string; inviteUrl: string }
          | { invited: false };

        if ("invited" in data && data.invited) {
          router.push(data.inviteUrl);
          router.refresh();
          return;
        }

        setServerMessage(
          "Diese E-Mail entspricht keiner offenen Einladung. Bitte pruefe, ob du dich vertippt hast."
        );
        return;
      } catch {
        setServerMessage(
          "Einladung konnte nicht geprueft werden. Bitte versuche es erneut."
        );
        return;
      }
    }

    // Einladung abschliessen: Passwort setzen + Einladung akzeptieren (Rolle setzen)
    const sessionUser = await supabase.auth.getUser();
    if (!sessionUser.data.user) {
      setServerMessage(
        "Du bist nicht eingeloggt. Bitte oeffne den Einladungslink aus deiner E-Mail erneut."
      );
      return;
    }

    const payload = values;
    const { error: pwError } = await supabase.auth.updateUser({
      password: payload.password ?? "",
      data: { full_name: (payload.fullName ?? "").trim() },
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
          {inviteToken
            ? "Einladung abschliessen: Passwort setzen und Konto aktivieren."
            : mode === "login"
              ? "Bitte anmelden."
              : "Registrieren ist nur mit Einladung moeglich."}
        </p>
      </div>
      {invitedRole ? (
        <p className="mb-4 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
          Du wurdest als <strong>{invitedRole.toUpperCase()}</strong> eingeladen.
        </p>
      ) : null}

      {!inviteToken ? (
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-border/50 bg-muted/20 p-1">
          <button
            type="button"
            onClick={() => {
              setServerMessage(null);
              setInviteCta(null);
              setMode("login");
              form.reset({ email: initialEmail, password: "" });
            }}
            className={`rounded-md px-3 py-2 text-sm transition-colors ${
              mode === "login" ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-accent/40"
            }`}
          >
            Anmelden
          </button>
          <button
            type="button"
            onClick={() => {
              setServerMessage(null);
              setInviteCta(null);
              setMode("register");
              form.reset({ email: initialEmail });
            }}
            className={`rounded-md px-3 py-2 text-sm transition-colors ${
              mode === "register"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:bg-accent/40"
            }`}
          >
            Registrieren
          </button>
        </div>
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
        ) : inviteToken ? (
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
        ) : (
          <div className="space-y-2">
            <label htmlFor="registerEmail" className="text-sm font-medium">
              E-Mail (Einladung)
            </label>
            <input
              id="registerEmail"
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
        )}

        {mode === "login" || inviteToken ? (
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
        ) : null}

        {serverMessage ? (
          <p className="rounded-md border border-border/50 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {serverMessage}
          </p>
        ) : null}
        {mode === "login" && inviteCta ? (
          <Link
            href={inviteCta.url}
            className="inline-flex w-full items-center justify-center rounded-md border border-border/60 bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent/40"
          >
            Registrierung abschliessen (Rolle: {inviteCta.role.toUpperCase()})
          </Link>
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
          {mode === "login"
            ? "Anmelden"
            : inviteToken
              ? "Passwort setzen & starten"
              : "Einladung pruefen"}
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
