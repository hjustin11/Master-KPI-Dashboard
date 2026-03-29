"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "@/shared/lib/supabase/client";

type DashboardUser = {
  id: string;
  email: string;
  fullName: string;
  roleKey: string;
  initials: string;
  isLoading: boolean;
};

const DEFAULT_USER: DashboardUser = {
  id: "",
  email: "",
  fullName: "Benutzer",
  roleKey: "",
  initials: "U",
  isLoading: true,
};

function isLocalHostName(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function buildInitials(name: string, email: string) {
  const source = name.trim() || email.trim();
  if (!source) return "U";

  const nameParts = source
    .replace(/[@._-]+/g, " ")
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!nameParts.length) return "U";
  if (nameParts.length === 1) return nameParts[0].slice(0, 2).toUpperCase();
  return `${nameParts[0][0] ?? ""}${nameParts[1][0] ?? ""}`.toUpperCase();
}

export function useUser() {
  const [user, setUser] = useState<DashboardUser>(DEFAULT_USER);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let hydrateGen = 0;

    /**
     * Kein getUser() hier: parallel zu onAuthStateChange (INITIAL_SESSION) löst das den
     * GoTrue-Storage-Lock aus („another request stole it“). Session kommt aus dem Callback bzw. getSession.
     */
    const hydrateFromSession = async (session: Session | null) => {
      const gen = ++hydrateGen;
      setUser((prev) => ({ ...prev, isLoading: true }));

      const authUser = session?.user ?? null;
      if (!authUser) {
        if (cancelled || gen !== hydrateGen) return;
        setUser({ ...DEFAULT_USER, isLoading: false });
        return;
      }

      const email = authUser.email ?? "";
      const fallbackFullName =
        (authUser.user_metadata?.full_name as string | undefined) ||
        authUser.email?.split("@")[0] ||
        "Benutzer";
      const fallbackRoleKey =
        (authUser.user_metadata?.role as string | undefined) ??
        (authUser.app_metadata?.role as string | undefined) ??
        "viewer";

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name,role")
        .eq("id", authUser.id)
        .maybeSingle();

      if (cancelled || gen !== hydrateGen) return;

      const fullName =
        (profile?.full_name as string | undefined) || fallbackFullName;
      let roleKey = (profile?.role as string | undefined) || fallbackRoleKey;

      try {
        const hostname = typeof window !== "undefined" ? window.location.hostname : "";
        if (isLocalHostName(hostname)) {
          roleKey = "owner";
        }
      } catch {
        // ignore
      }

      setUser({
        id: authUser.id,
        email,
        fullName,
        roleKey,
        initials: buildInitials(fullName, email),
        isLoading: false,
      });
    };

    void supabase.auth.getSession().then((result: Awaited<ReturnType<typeof supabase.auth.getSession>>) => {
      if (cancelled) return;
      void hydrateFromSession(result.data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (cancelled) return;
      void hydrateFromSession(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return useMemo(() => user, [user]);
}
