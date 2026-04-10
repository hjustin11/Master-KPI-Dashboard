alter table public.article_forecast_rules
  add column if not exists forecast_sales_marketplace_keys text[] not null default '{}'::text[];
