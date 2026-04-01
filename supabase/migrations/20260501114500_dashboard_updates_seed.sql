create table if not exists public.dashboard_updates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null,
  text text not null,
  release_key text null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create unique index if not exists dashboard_updates_unique_entry_idx
  on public.dashboard_updates (date, title, text);

insert into public.dashboard_updates (date, title, text, release_key, created_by)
values
  ('2026-04-01', 'Marktplatz-Produkte: Manuell aktualisieren', 'Auf allen Produktseiten gibt es jetzt einen „Aktualisieren“-Button. Damit lädst du Artikeldaten sofort neu, ohne auf den automatischen Hintergrundabgleich zu warten.', null, '00000000-0000-0000-0000-000000000000'),
  ('2026-04-01', 'Amazon-Produkte: Statusfilter korrigiert', 'Der Statusfilter auf Amazon-Produkte lädt bei Wechsel auf „Alle“ jetzt zuverlässig den passenden Bestand nach. Aktive und inaktive Listings werden korrekt angezeigt.', null, '00000000-0000-0000-0000-000000000000'),
  ('2026-04-01', 'Benutzerverwaltung vereinfacht', 'Nicht mehr benötigte Konfigurationsblöcke und Eingabefelder wurden aus der Benutzerverwaltung entfernt, damit die Seite klarer und auf die relevanten Aufgaben fokussiert ist.', null, '00000000-0000-0000-0000-000000000000'),
  ('2026-04-01', 'Xentral · Artikel: Verkaufswert gesamt', 'Auf der Artikelübersicht siehst du neben dem Lagerwert den Verkaufswert gesamt (Verkaufspreis bzw. UVP-naher Preis × Bestand) für die angezeigten Zeilen.', null, '00000000-0000-0000-0000-000000000000'),
  ('2026-04-01', 'Hinweis auf neue Updates', 'Wenn es neue Einträge in dieser Liste gibt, ist der Menüpunkt „Update & Feedback“ in der Seitenleiste hervorgehoben – so verpasst du keine Produktneuigkeiten.', '2026-04-release-1', '00000000-0000-0000-0000-000000000000'),
  ('2026-03-27', 'Update & Feedback', 'Produktneuigkeiten und deine Ideen für Verbesserungen findest du unter einem Menüpunkt. Gibt es ein passendes Tutorial zum Release, kannst du es hier starten.', null, '00000000-0000-0000-0000-000000000000'),
  ('2026-03-26', 'Einladung ins Team', 'Einladung annehmen, Passwort setzen und direkt mit deiner Rolle loslegen.', null, '00000000-0000-0000-0000-000000000000')
on conflict (date, title, text) do nothing;
