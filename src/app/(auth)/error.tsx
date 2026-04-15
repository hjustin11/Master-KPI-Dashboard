"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[auth-error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-xl font-semibold">Anmeldung aktuell nicht möglich.</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Bitte versuche es in einem Moment erneut.
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">Referenz: {error.digest}</p>
      ) : null}
      <Button onClick={() => reset()}>Erneut versuchen</Button>
    </div>
  );
}
