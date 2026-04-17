create table if not exists public.amazon_marketplace_config (
  marketplace_id text primary key,
  slug text unique not null,
  enabled boolean not null default false,
  activated_at timestamptz null,
  last_sync_at timestamptz null,
  last_participation_check_at timestamptz null,
  participation_check_ok boolean null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists amazon_marketplace_config_enabled_idx
  on public.amazon_marketplace_config (enabled);

-- Seed: DE ist aktiv, weil das bestehende System bereits DE nutzt.
insert into public.amazon_marketplace_config (marketplace_id, slug, enabled, activated_at)
values ('A1PA6795UKMFR9', 'amazon-de', true, now())
on conflict (marketplace_id) do nothing;

alter table public.amazon_marketplace_config enable row level security;

create policy "amazon_marketplace_config_owner_select"
  on public.amazon_marketplace_config
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(p.role) = 'owner'
    )
  );

create policy "amazon_marketplace_config_owner_insert"
  on public.amazon_marketplace_config
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(p.role) = 'owner'
    )
  );

create policy "amazon_marketplace_config_owner_update"
  on public.amazon_marketplace_config
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(p.role) = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(p.role) = 'owner'
    )
  );

create policy "amazon_marketplace_config_owner_delete"
  on public.amazon_marketplace_config
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(p.role) = 'owner'
    )
  );
