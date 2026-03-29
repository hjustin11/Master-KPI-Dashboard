-- Dashboard-Grundregeln (Rollenrechte, Sidebar, Karten-Sichtbarkeit, Text-Overrides, Kachel-Reihenfolge)
-- Wird von Owner über /api/dashboard-access-config gespeichert; alle Rollen lesen dieselbe Konfiguration.

create table if not exists public.dashboard_access_config (
  id text primary key default 'default',
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.dashboard_access_config enable row level security;

create policy "dashboard_access_config_select_authenticated"
  on public.dashboard_access_config
  for select
  to authenticated
  using (true);

create policy "dashboard_access_config_insert_owner"
  on public.dashboard_access_config
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );

create policy "dashboard_access_config_update_owner"
  on public.dashboard_access_config
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner'
    )
  );
