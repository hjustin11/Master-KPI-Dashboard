-- Beschaffung: Upload aus Transportation-Excel (Slack o. ä.), eine aktuelle Import-Version pro Workspace.

create table if not exists public.procurement_imports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  file_name text not null default '',
  row_count int not null default 0
);

create table if not exists public.procurement_lines (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.procurement_imports (id) on delete cascade,
  sort_index int not null,
  container_number text not null default '',
  manufacture text not null default '',
  product_name text not null default '',
  sku text not null default '',
  amount numeric not null default 0,
  arrival_at_port date,
  notes text not null default ''
);

create index if not exists procurement_lines_import_sort_idx
  on public.procurement_lines (import_id, sort_index);

alter table public.procurement_imports enable row level security;
alter table public.procurement_lines enable row level security;

-- Lesen für eingeloggte Nutzer (Dashboard); Schreiben nur über Service-Role-API.
create policy "procurement_imports_select_authenticated"
  on public.procurement_imports
  for select
  to authenticated
  using (true);

create policy "procurement_lines_select_authenticated"
  on public.procurement_lines
  for select
  to authenticated
  using (true);
