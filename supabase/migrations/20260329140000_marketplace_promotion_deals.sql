create table if not exists public.marketplace_promotion_deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  date_from date not null,
  date_to date not null,
  color text not null,
  marketplace_slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_promotion_deals_user_id_idx
  on public.marketplace_promotion_deals (user_id);

alter table public.marketplace_promotion_deals enable row level security;

create policy "marketplace_promotion_deals_select_own"
  on public.marketplace_promotion_deals
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "marketplace_promotion_deals_insert_own"
  on public.marketplace_promotion_deals
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "marketplace_promotion_deals_update_own"
  on public.marketplace_promotion_deals
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "marketplace_promotion_deals_delete_own"
  on public.marketplace_promotion_deals
  for delete
  to authenticated
  using (auth.uid() = user_id);
