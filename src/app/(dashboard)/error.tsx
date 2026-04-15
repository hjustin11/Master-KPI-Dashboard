"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard-error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-xl font-semibold">Es ist etwas schiefgelaufen.</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Dieser Bereich konnte nicht geladen werden. Das Problem wurde geloggt. Du kannst es erneut
        versuchen oder zur Startseite zurückkehren.
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">Referenz: {error.digest}</p>
      ) : null}
      <div className="flex gap-2">
        <Button onClick={() => reset()} variant="default">
          Erneut versuchen
        </Button>
        <Button onClick={() => (window.location.href = "/")} variant="outline">
          Zur Startseite
        </Button>
      </div>
    </div>
  );
}
