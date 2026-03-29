create table if not exists public.otto_sync (
  id bigint generated always as identity primary key,
  period_from date not null,
  period_to date not null,
  status text not null default 'ok',
  error text,
  summary jsonb not null,
  previous_summary jsonb,
  points jsonb not null default '[]'::jsonb,
  previous_points jsonb,
  revenue_delta_pct numeric,
  meta jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint otto_sync_period_unique unique (period_from, period_to)
);

create index if not exists otto_sync_period_idx
  on public.otto_sync (period_from, period_to);
