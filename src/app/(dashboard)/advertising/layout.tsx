"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useUser } from "@/shared/hooks/useUser";
import { usePermissions } from "@/shared/hooks/usePermissions";

export default function AdvertisingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useUser();
  const { isSidebarItemWipLocked } = usePermissions();

  useEffect(() => {
    if (user.isLoading) return;
    if (isSidebarItemWipLocked("advertising")) {
      router.replace("/");
    }
  }, [user.isLoading, isSidebarItemWipLocked, router]);

  if (user.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      </div>
    );
  }

  if (isSidebarItemWipLocked("advertising")) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      </div>
    );
  }

  return <>{children}</>;
}
