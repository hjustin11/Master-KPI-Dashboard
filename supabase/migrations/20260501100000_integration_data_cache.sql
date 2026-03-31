create table if not exists public.integration_data_cache (
  cache_key text primary key,
  source text not null,
  payload jsonb not null,
  fresh_until timestamptz not null,
  stale_until timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists integration_data_cache_source_idx
  on public.integration_data_cache (source);

create index if not exists integration_data_cache_fresh_until_idx
  on public.integration_data_cache (fresh_until);
