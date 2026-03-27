"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/shared/lib/supabase/client";

type DashboardUser = {
  id: string;
  email: string;
  fullName: string;
  roleKey: string;
  initials: string;
};

const DEFAULT_USER: DashboardUser = {
  id: "",
  email: "",
  fullName: "Benutzer",
  roleKey: "viewer",
  initials: "U",
};

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
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        setUser(DEFAULT_USER);
        return;
      }

      const fullName =
        (authUser.user_metadata?.full_name as string | undefined) ||
        authUser.email?.split("@")[0] ||
        "Benutzer";

      const email = authUser.email ?? "";
      const roleKey =
        (authUser.user_metadata?.role as string | undefined) ?? "viewer";

      setUser({
        id: authUser.id,
        email,
        fullName,
        roleKey,
        initials: buildInitials(fullName, email),
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
