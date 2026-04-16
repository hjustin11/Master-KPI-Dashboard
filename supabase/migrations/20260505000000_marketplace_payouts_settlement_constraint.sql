-- Partieller Index kann nicht für ON CONFLICT genutzt werden.
-- Ersetze durch echte UNIQUE CONSTRAINT (NULL-Werte erlaubt, PostgreSQL ignoriert NULLs bei UNIQUE).
drop index if exists public.idx_payouts_settlement;

alter table public.marketplace_payouts
  add constraint uq_payouts_marketplace_settlement
  unique (marketplace_slug, settlement_id);
