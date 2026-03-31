"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { useUser } from "@/shared/hooks/useUser";

/**
 * Laufzeit-Schutz für Dashboard-Seiten:
 * Auch bei direktem Link oder manueller URL-Navigation werden Seitenrechte geprüft.
 */
export function DashboardRouteAccessGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useUser();
  const { canAccessPageByPath } = usePermissions();

  useEffect(() => {
    if (user.isLoading) return;
    if (canAccessPageByPath(pathname)) return;
    router.replace("/");
  }, [user.isLoading, pathname, canAccessPageByPath, router]);

  return null;
}

