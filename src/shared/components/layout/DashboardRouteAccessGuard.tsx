"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { useUser } from "@/shared/hooks/useUser";
import { resolveSidebarItemKeyFromDashboardPath } from "@/shared/lib/dashboard-sidebar-paths";

/**
 * Laufzeit-Schutz für Dashboard-Seiten:
 * Auch bei direktem Link oder manueller URL-Navigation werden Seitenrechte geprüft.
 */
export function DashboardRouteAccessGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useUser();
  const { canAccessPageByPath, isSidebarItemWipLocked } = usePermissions();

  useEffect(() => {
    if (user.isLoading) return;
    if (!canAccessPageByPath(pathname)) {
      router.replace("/");
      return;
    }
    const sectionKey = resolveSidebarItemKeyFromDashboardPath(pathname);
    if (sectionKey && isSidebarItemWipLocked(sectionKey)) {
      router.replace("/");
    }
  }, [user.isLoading, pathname, canAccessPageByPath, isSidebarItemWipLocked, router]);

  return null;
}

