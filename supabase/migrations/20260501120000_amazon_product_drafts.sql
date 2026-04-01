create table if not exists public.amazon_product_drafts (
  id uuid primary key default gen_random_uuid(),
  marketplace_slug text not null default 'amazon',
  mode text not null check (mode in ('edit_existing', 'create_new')),
  status text not null default 'draft' check (status in ('draft', 'ready')),
  sku text null,
  source_snapshot jsonb not null default '{}'::jsonb,
  draft_values jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id) on delete cascade,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists amazon_product_drafts_marketplace_mode_idx
  on public.amazon_product_drafts (marketplace_slug, mode, updated_at desc);

create index if not exists amazon_product_drafts_sku_idx
  on public.amazon_product_drafts (sku);

alter table public.amazon_product_drafts enable row level security;

create policy "amazon_product_drafts_owner_select"
  on public.amazon_product_drafts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(p.role) = 'owner'
    )
  );

create policy "amazon_product_drafts_owner_insert"
  on public.amazon_product_drafts
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(p.role) = 'owner'
    )
  );

create policy "amazon_product_drafts_owner_update"
  on public.amazon_product_drafts
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

create policy "amazon_product_drafts_owner_delete"
  on public.amazon_product_drafts
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(p.role) = 'owner'
    )
  );
