create table if not exists public.marketplace_payouts (
  id uuid primary key default gen_random_uuid(),
  marketplace_slug text not null,
  period_from date not null,
  period_to date not null,
  settlement_id text,

  -- Kernbeträge (EUR)
  gross_sales numeric(12,2),
  refunds_amount numeric(12,2),
  refunds_fees_returned numeric(12,2),
  marketplace_fees numeric(12,2),
  fulfillment_fees numeric(12,2),
  advertising_fees numeric(12,2),
  shipping_fees numeric(12,2),
  promotion_discounts numeric(12,2),
  other_fees numeric(12,2),
  other_fees_breakdown jsonb,
  reserve_amount numeric(12,2),
  net_payout numeric(12,2),

  -- Metriken
  orders_count integer,
  returns_count integer,
  units_sold integer,
  payout_ratio numeric(5,4),
  return_rate numeric(5,4),
  acos numeric(5,4),
  tacos numeric(5,4),

  -- Rohdaten
  raw_settlement jsonb,
  product_breakdown jsonb,

  -- Metadaten
  currency text not null default 'EUR',
  fx_rate numeric(10,6) default 1.0,
  fetched_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_payouts_settlement
  on public.marketplace_payouts (marketplace_slug, settlement_id)
  where settlement_id is not null;

create unique index if not exists idx_payouts_marketplace_period
  on public.marketplace_payouts (marketplace_slug, period_from, period_to);

create index if not exists idx_payouts_period
  on public.marketplace_payouts (period_from, period_to);

create index if not exists idx_payouts_slug
  on public.marketplace_payouts (marketplace_slug);

alter table public.marketplace_payouts enable row level security;

create policy "payouts_select_authenticated"
  on public.marketplace_payouts
  for select
  to authenticated
  using (true);
