-- Feature Requests / Verbesserungen / Wunschfunktionen
-- Diese Tabelle speichert Vorschlaege aus dem "Tasks" Bereich.

create table if not exists public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  user_email text not null,
  title text not null,
  message text not null,
  status text not null default 'open' check (status in ('open','in_progress','done')),
  owner_reply text null
);

create index if not exists feature_requests_created_at_idx
  on public.feature_requests (created_at desc);

create index if not exists feature_requests_user_id_idx
  on public.feature_requests (user_id);

