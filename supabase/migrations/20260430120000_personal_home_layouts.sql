create table if not exists public.personal_home_layouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  layout_json jsonb not null default '{"version":1,"tiles":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.personal_home_layouts enable row level security;

drop policy if exists "Users can read own personal home layout" on public.personal_home_layouts;
create policy "Users can read own personal home layout"
  on public.personal_home_layouts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can write own personal home layout" on public.personal_home_layouts;
create policy "Users can write own personal home layout"
  on public.personal_home_layouts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own personal home layout" on public.personal_home_layouts;
create policy "Users can update own personal home layout"
  on public.personal_home_layouts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
