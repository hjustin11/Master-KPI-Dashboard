create table if not exists public.weekly_report_notes (
  id uuid primary key default gen_random_uuid(),
  iso_year smallint not null check (iso_year between 2000 and 2100),
  iso_week smallint not null check (iso_week between 1 and 53),
  marketplace_slug text not null,
  note text not null default '',
  created_by uuid null references auth.users (id) on delete set null,
  updated_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (iso_year, iso_week, marketplace_slug)
);

create index if not exists weekly_report_notes_week_idx
  on public.weekly_report_notes (iso_year, iso_week);

alter table public.weekly_report_notes enable row level security;

create policy "weekly_report_notes_authenticated_select"
  on public.weekly_report_notes
  for select
  to authenticated
  using (true);

create policy "weekly_report_notes_authenticated_insert"
  on public.weekly_report_notes
  for insert
  to authenticated
  with check (true);

create policy "weekly_report_notes_authenticated_update"
  on public.weekly_report_notes
  for update
  to authenticated
  using (true)
  with check (true);

create policy "weekly_report_notes_authenticated_delete"
  on public.weekly_report_notes
  for delete
  to authenticated
  using (true);
