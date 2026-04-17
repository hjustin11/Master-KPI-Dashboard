create table if not exists public.marketplace_article_mappings (
  id uuid primary key default gen_random_uuid(),
  xentral_sku text not null,
  marketplace_slug text not null,
  marketplace_sku text null,
  marketplace_secondary_id text null,
  ean text null,
  match_type text not null check (match_type in ('sku_exact', 'sku_partial', 'ean_exact', 'asin_exact', 'model_number', 'title_fuzzy', 'manual')),
  confidence numeric(3,2) not null check (confidence >= 0 and confidence <= 1),
  verified_at timestamptz null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (xentral_sku, marketplace_slug)
);

create index if not exists marketplace_article_mappings_sku_idx
  on public.marketplace_article_mappings (xentral_sku);

create index if not exists marketplace_article_mappings_slug_idx
  on public.marketplace_article_mappings (marketplace_slug);

create index if not exists marketplace_article_mappings_ean_idx
  on public.marketplace_article_mappings (ean) where ean is not null;

create index if not exists marketplace_article_mappings_marketplace_sku_idx
  on public.marketplace_article_mappings (marketplace_slug, marketplace_sku) where marketplace_sku is not null;

alter table public.marketplace_article_mappings enable row level security;

create policy "marketplace_article_mappings_owner_select"
  on public.marketplace_article_mappings
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(p.role) = 'owner'
    )
  );

create policy "marketplace_article_mappings_owner_insert"
  on public.marketplace_article_mappings
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(p.role) = 'owner'
    )
  );

create policy "marketplace_article_mappings_owner_update"
  on public.marketplace_article_mappings
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

create policy "marketplace_article_mappings_owner_delete"
  on public.marketplace_article_mappings
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and lower(p.role) = 'owner'
    )
  );
