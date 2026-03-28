"use client";

import { useEffect, useMemo, useState } from "react";
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

    const loadUser = async () => {
      // Beim Reload nicht kurzzeitig eine Default-Rolle rendern (verhindert UI-Flicker).
      setUser((prev) => ({ ...prev, isLoading: true }));

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
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

      const fullName =
        (profile?.full_name as string | undefined) || fallbackFullName;
      let roleKey = (profile?.role as string | undefined) || fallbackRoleKey;

      // Lokal immer Owner in der UI (hostname localhost / 127.0.0.1). Betrifft nur den Browser —
      // API-Routen prüfen weiter die echte Profil-Rolle in Supabase.
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

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadUser();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return useMemo(() => user, [user]);
}
