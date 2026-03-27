"use client";

import { usePermissions } from "@/shared/hooks/usePermissions";

export default function UpdatesPage() {
  const { hasPermission } = usePermissions();

  if (!hasPermission("manage_users")) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Dieser Bereich ist nur fuer Admin und Owner freigegeben.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
      <p className="text-sm text-muted-foreground">
        Task- und Update-Bereich fuer Admin und Owner.
      </p>
    </div>
  );
}
