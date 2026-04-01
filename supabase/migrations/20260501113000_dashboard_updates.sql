create table if not exists public.dashboard_updates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null,
  text text not null,
  release_key text null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists dashboard_updates_date_idx
  on public.dashboard_updates (date desc, created_at desc);

alter table if exists public.dashboard_updates
  enable row level security;
