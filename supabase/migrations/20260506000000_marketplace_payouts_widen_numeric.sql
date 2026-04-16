-- Numeric-Spalten von (12,2) auf (14,2) erweitern für große Settlements.
alter table public.marketplace_payouts
  alter column gross_sales type numeric(14,2),
  alter column refunds_amount type numeric(14,2),
  alter column refunds_fees_returned type numeric(14,2),
  alter column marketplace_fees type numeric(14,2),
  alter column fulfillment_fees type numeric(14,2),
  alter column advertising_fees type numeric(14,2),
  alter column shipping_fees type numeric(14,2),
  alter column promotion_discounts type numeric(14,2),
  alter column other_fees type numeric(14,2),
  alter column reserve_amount type numeric(14,2),
  alter column net_payout type numeric(14,2);
