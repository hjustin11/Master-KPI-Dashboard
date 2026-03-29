create table if not exists public.article_forecast_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('fixed', 'temporary')),
  sales_window_days int not null default 90,
  projection_days int not null default 90,
  low_stock_threshold numeric not null default 25,
  critical_stock_threshold numeric not null default 0,
  include_inbound_procurement boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (scope)
);

alter table public.article_forecast_rules enable row level security;

create policy "article_forecast_rules_select_authenticated"
  on public.article_forecast_rules
  for select
  to authenticated
  using (true);
