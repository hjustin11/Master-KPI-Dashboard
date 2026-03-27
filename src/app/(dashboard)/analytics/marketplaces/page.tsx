"use client";

export default function AnalyticsMarketplacesPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Marktplätze</h1>
        <p className="text-sm text-muted-foreground">
          Grundgerüst für Marktplatz-Analysen (analog zum Amazon-Aufbau, aktuell ohne Datenlogik).
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[
          "Otto",
          "eBay",
          "Kaufland",
          "Fressnapf",
          "MediaMarkt & Saturn",
          "ZooPlus",
          "TikTok",
        ].map((name) => (
          <div key={name} className="rounded-xl border border-border/60 bg-card/80 p-4">
            <p className="text-sm font-medium">{name}</p>
            <p className="mt-1 text-xs text-muted-foreground">Modul vorbereitet, Datenanbindung folgt.</p>
          </div>
        ))}
      </div>
    </div>
  );
}

