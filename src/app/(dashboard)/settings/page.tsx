"use client";

import Link from "next/link";
import { usePermissions } from "@/shared/hooks/usePermissions";

const cards = [
  {
    title: "Profil",
    description: "Persoenliche Daten, Sprache, Zeitzone und Benachrichtigungen.",
    href: "/settings/profile",
  },
  {
    title: "Benutzer & Rollen",
    description: "Einladungen per E-Mail, Rollen und Berechtigungen verwalten.",
    href: "/settings/users",
  },
];

export default function SettingsPage() {
  const { hasPermission } = usePermissions();
  const visibleCards = cards.filter((card) =>
    card.href === "/settings/users" ? hasPermission("manage_users") : true
  );

  return (
    <div className="w-full max-w-none space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-muted-foreground">
          Verwalte dein Profil sowie Team-, Rollen- und Zugriffsrechte.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {visibleCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-xl border border-border/50 bg-card/80 p-5 backdrop-blur-sm transition-all duration-200 hover:border-primary/40 hover:bg-accent/30"
          >
            <h2 className="text-lg font-semibold">{card.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
