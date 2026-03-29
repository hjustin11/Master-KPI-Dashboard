-- Vergleich zum vorherigen Import (Ankunft / Menge pro Container)
alter table public.procurement_imports
  add column if not exists import_comparison jsonb;
