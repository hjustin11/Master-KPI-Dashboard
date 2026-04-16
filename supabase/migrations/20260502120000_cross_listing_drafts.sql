create table if not exists public.cross_listing_drafts (
  id uuid primary key default gen_random_uuid(),

  sku text not null,
  ean text,
  source_marketplace_slug text not null,
  target_marketplace_slug text not null,

  source_data jsonb not null,
  generated_listing jsonb,
  user_edits jsonb,

  status text not null default 'draft'
    check (status in ('draft','generating','ready','reviewing','uploading','uploaded','failed')),
  error_message text,

  llm_model text,
  llm_prompt_tokens integer,
  llm_completion_tokens integer,

  uploaded_at timestamptz,
  marketplace_listing_id text,

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cross_listing_drafts_sku_idx
  on public.cross_listing_drafts (sku);

create index if not exists cross_listing_drafts_target_idx
  on public.cross_listing_drafts (target_marketplace_slug);

create index if not exists cross_listing_drafts_status_idx
  on public.cross_listing_drafts (status);

create unique index if not exists cross_listing_drafts_sku_target_active_idx
  on public.cross_listing_drafts (sku, target_marketplace_slug)
  where status not in ('uploaded','failed');

alter table public.cross_listing_drafts enable row level security;

create policy "cross_listing_drafts_select_authenticated"
  on public.cross_listing_drafts
  for select
  to authenticated
  using (true);

create policy "cross_listing_drafts_insert_own"
  on public.cross_listing_drafts
  for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "cross_listing_drafts_update_own"
  on public.cross_listing_drafts
  for update
  to authenticated
  using (auth.uid() = created_by or auth.uid() = updated_by)
  with check (auth.uid() = created_by or auth.uid() = updated_by);

create policy "cross_listing_drafts_delete_own"
  on public.cross_listing_drafts
  for delete
  to authenticated
  using (auth.uid() = created_by);
