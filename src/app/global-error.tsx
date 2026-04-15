"use client";

import { useEffect } from "react";

// Root-Error-Boundary: fängt Fehler im Root-Layout selbst ab.
// Enthält bewusst eigenen <html>/<body>-Scope, weil das Root-Layout an dieser Stelle nicht rendert.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error-boundary]", error);
  }, [error]);

  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#0f172a",
          color: "#f8fafc",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Unerwarteter Fehler</h1>
          <p style={{ opacity: 0.8, marginBottom: "1.5rem" }}>
            Die Anwendung konnte nicht geladen werden. Bitte lade die Seite neu.
          </p>
          {error.digest ? (
            <p style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "1rem" }}>
              Referenz: {error.digest}
            </p>
          ) : null}
          <button
            onClick={() => reset()}
            style={{
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: 6,
              padding: "0.5rem 1rem",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Seite neu laden
          </button>
        </div>
      </body>
    </html>
  );
}
