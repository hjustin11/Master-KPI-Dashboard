-- Globale Xentral-Artikel-Tags (alle Dashboard-Nutzer teilen denselben Stand).

create table if not exists public.xentral_product_tag_defs (
  label text primary key,
  color text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table if not exists public.xentral_product_sku_tags (
  sku text primary key,
  tag_label text null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.xentral_product_tag_defs is 'Benannte Tag-Vorlagen (Farbe) für Xentral-Artikel.';
comment on table public.xentral_product_sku_tags is 'Pro SKU: explizite Tag-Zuweisung. Keine Zeile = automatisch (Bestandsregeln). tag_label IS NULL = explizit „Kein Tag“.';

alter table public.xentral_product_tag_defs enable row level security;
alter table public.xentral_product_sku_tags enable row level security;

create policy "xentral_product_tag_defs_select_authenticated"
  on public.xentral_product_tag_defs
  for select
  to authenticated
  using (true);

create policy "xentral_product_sku_tags_select_authenticated"
  on public.xentral_product_sku_tags
  for select
  to authenticated
  using (true);

insert into public.xentral_product_tag_defs (label, color)
values
  ('Abverkauf', '#f97316'),
  ('Stärker Abverkaufen', '#ef4444'),
  ('Nicht mehr verkaufen', '#64748b')
on conflict (label) do nothing;
