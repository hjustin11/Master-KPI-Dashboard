# Supabase Setup fuer echte Einladungen

Diese Schritte sind noetig, damit Einladungen wirklich E-Mails versenden und Benutzer in `auth.users` angelegt werden.

## 1) `.env.local` setzen

In `master-dashboard/.env.local` folgende Werte setzen:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<dein-projekt>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<dein-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<dein-service-role-key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Hinweis: `SUPABASE_SERVICE_ROLE_KEY` nur serverseitig nutzen und niemals im Client ausgeben.

## 2) Invitations-Tabelle in Supabase erstellen

Im Supabase SQL Editor ausfuehren:

```sql
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('owner','admin','manager','analyst','viewer')),
  token uuid not null unique,
  status text not null default 'pending' check (status in ('pending','accepted')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists invitations_email_idx on public.invitations(email);
create index if not exists invitations_status_idx on public.invitations(status);
```

## 3) Auth URL-Settings in Supabase

In Supabase Dashboard:

- Authentication -> URL Configuration
  - Site URL: `http://localhost:3000`
  - Redirect URLs:
    - `http://localhost:3000/register`
    - `http://localhost:3000/login`
    - `http://localhost:3000/auth/callback`

Falls du mit einer Domain arbeitest, diese URLs analog mit deiner Domain eintragen.

### E-Mail-Bestaetigung bei Einladungen

Eingeladene Nutzer werden serverseitig als bestaetigt markiert (`email_confirm` ueber die Admin-API), damit **keine zusaetzliche Bestaetigungs-Mail** noetig ist — die Einladung durch eine berechtigte Person gilt als Verifizierung.

Optional im Dashboard: **Authentication → Providers → Email → „Confirm email“** deaktivieren, falls du trotzdem noch eine Blockade durch globale Einstellungen siehst.

## 4) Einladungs-Mail testen

1. Als Owner einloggen
2. Zu `Einstellungen -> Benutzer`
3. Neue Einladung senden
4. In Supabase pruefen:
   - Authentication -> Users: neuer invited user vorhanden
   - `public.invitations`: neuer Eintrag vorhanden

## 5) Dashboard-Grundregeln (Rollen, Sidebar, Karten, Texte)

Speichert die Konfiguration aus **Einstellungen → Benutzer** sobald ein Owner **„Dashboard bearbeiten“** wieder ausschaltet (Kachel-Reihenfolge, Karten-Sichtbarkeit, Sidebar, Rollenrechte, Text-Overrides).

Im Supabase SQL Editor ausfuehren (oder Migration `supabase/migrations/20260328120000_dashboard_access_config.sql`):

```sql
-- siehe Datei supabase/migrations/20260328120000_dashboard_access_config.sql
```

Kurz: Tabelle `public.dashboard_access_config` mit einer Zeile `id = 'default'` und Spalte `config` (jsonb). RLS: alle eingeloggten Nutzer duerfen lesen, nur `profiles.role = 'owner'` darf schreiben.

Ohne diese Tabelle: die App nutzt weiterhin nur den lokalen Browser-Store (`localStorage`).

## 6) Haeufige Fehlerbilder

- `Missing SUPABASE_SERVICE_ROLE_KEY`
  - Service-Role-Key fehlt in `.env.local`
- `Einladung gespeichert, aber Supabase konnte die Einladungs-Mail nicht versenden`
  - URL Configuration / Redirect URL prüfen
  - E-Mail-Provider in Supabase Authentication prüfen
- `Nicht authentifiziert` bei API
  - Du bist im Browser nicht als Owner eingeloggt

## 7) Profitabilitaet: Gebuehren-Fallback konfigurieren

Fuer `Analytics -> Marktplaetze` koennen Gebuehren als Fallback-Prozentsatz je Marktplatz gesetzt werden.
Die App liest zuerst `process.env`, danach `public.integration_secrets`.

Empfohlene Keys:

- `MARKETPLACE_FEE_DEFAULT_PERCENT` (global, z. B. `10`)
- `MARKETPLACE_FEE_AMAZON_PERCENT` (z. B. `15`)
- `MARKETPLACE_FEE_EBAY_PERCENT` (z. B. `12`)
- `MARKETPLACE_FEE_OTTO_PERCENT` (z. B. `14`)
- `MARKETPLACE_FEE_KAUFLAND_PERCENT` (z. B. `12`)
- `MARKETPLACE_FEE_FRESSNAPF_PERCENT` (z. B. `10`)
- `MARKETPLACE_FEE_MEDIAMARKT_SATURN_PERCENT` (z. B. `10`)
- `MARKETPLACE_FEE_ZOOPLUS_PERCENT` (z. B. `10`)
- `MARKETPLACE_FEE_TIKTOK_PERCENT` (z. B. `9`)
- `MARKETPLACE_FEE_SHOPIFY_PERCENT` (z. B. `2`)

Optional je Marktplatz:

- `MARKETPLACE_FEE_<MARKTPLATZ>_FIXED_PER_ORDER`

Beispiel in `integration_secrets`:

- `key = MARKETPLACE_FEE_AMAZON_PERCENT`, `value = 15`
