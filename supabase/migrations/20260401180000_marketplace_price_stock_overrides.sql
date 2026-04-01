create table if not exists public.marketplace_price_stock_overrides (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  marketplace_slug text not null,
  price_eur numeric(12, 2),
  stock_qty numeric(12, 2),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_price_stock_overrides_sku_slug_unique unique (sku, marketplace_slug)
);

create index if not exists marketplace_price_stock_overrides_slug_idx
  on public.marketplace_price_stock_overrides (marketplace_slug);

create index if not exists marketplace_price_stock_overrides_sku_idx
  on public.marketplace_price_stock_overrides (sku);
