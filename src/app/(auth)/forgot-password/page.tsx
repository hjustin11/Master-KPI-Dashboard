"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/shared/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/auth/reset` : undefined;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setMessage(
      "Wenn die E-Mail existiert, wurde ein Link zum Zurücksetzen des Passworts versendet."
    );
    setLoading(false);
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
        <p className="text-sm text-muted-foreground">Passwort zuruecksetzen</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            E-Mail
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-border/50 bg-background px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-primary"
            required
          />
        </div>

        {message ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-800">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Sende..." : "Reset-Link senden"}
        </button>
      </form>

      <div className="mt-4 text-center text-xs text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">
          Zum Login
        </Link>
      </div>
    </div>
  );
}

