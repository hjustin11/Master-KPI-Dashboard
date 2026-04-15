-- Rollenbasiertes Tutorial-System
-- Typen:
-- - onboarding: Pflicht-/Starttour nach Registrierung
-- - release_update: optionale/steuerbare Update-Tour pro Release

create table if not exists public.tutorial_tours (
  id uuid primary key default gen_random_uuid(),
  tutorial_type text not null check (tutorial_type in ('onboarding', 'release_update')),
  role text not null check (role in ('owner', 'admin', 'manager', 'analyst', 'viewer')),
  release_key text,
  version integer not null default 1,
  title text not null,
  summary text not null default '',
  enabled boolean not null default true,
  required boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tutorial_scenes (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.tutorial_tours(id) on delete cascade,
  order_index integer not null check (order_index >= 0),
  text text not null,
  target_selector text,
  mascot_emotion text not null default 'greeting',
  mascot_animation text not null default 'float',
  unlock_sidebar boolean not null default false,
  advance_mode text not null default 'manual' check (advance_mode in ('manual', 'after_typewriter')),
  estimated_ms integer not null default 3800 check (estimated_ms >= 500),
  created_at timestamptz not null default now()
);

create unique index if not exists tutorial_scenes_tour_order_idx
  on public.tutorial_scenes(tour_id, order_index);

create table if not exists public.tutorial_user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tour_id uuid not null references public.tutorial_tours(id) on delete cascade,
  tutorial_type text not null check (tutorial_type in ('onboarding', 'release_update')),
  role text not null check (role in ('owner', 'admin', 'manager', 'analyst', 'viewer')),
  release_key text,
  current_scene_index integer not null default 0 check (current_scene_index >= 0),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  completed_at timestamptz,
  dismissed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists tutorial_user_progress_user_tour_idx
  on public.tutorial_user_progress(user_id, tour_id);

create index if not exists tutorial_tours_lookup_idx
  on public.tutorial_tours(tutorial_type, role, status, enabled, release_key);

create index if not exists tutorial_progress_user_type_idx
  on public.tutorial_user_progress(user_id, tutorial_type, role, release_key);

alter table public.tutorial_tours enable row level security;
alter table public.tutorial_scenes enable row level security;
alter table public.tutorial_user_progress enable row level security;

drop policy if exists tutorial_tours_select_authenticated on public.tutorial_tours;
create policy tutorial_tours_select_authenticated
  on public.tutorial_tours
  for select
  to authenticated
  using (
    (status = 'published' and enabled = true)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'admin')
    )
  );

drop policy if exists tutorial_tours_insert_owner on public.tutorial_tours;
create policy tutorial_tours_insert_owner
  on public.tutorial_tours
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'admin')
    )
  );

drop policy if exists tutorial_tours_update_owner on public.tutorial_tours;
create policy tutorial_tours_update_owner
  on public.tutorial_tours
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'admin')
    )
  );

drop policy if exists tutorial_tours_delete_owner on public.tutorial_tours;
create policy tutorial_tours_delete_owner
  on public.tutorial_tours
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'admin')
    )
  );

drop policy if exists tutorial_scenes_select_authenticated on public.tutorial_scenes;
create policy tutorial_scenes_select_authenticated
  on public.tutorial_scenes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tutorial_tours t
      where t.id = tutorial_scenes.tour_id
        and (
          (t.status = 'published' and t.enabled = true)
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role in ('owner', 'admin')
          )
        )
    )
  );

drop policy if exists tutorial_scenes_write_owner on public.tutorial_scenes;
create policy tutorial_scenes_write_owner
  on public.tutorial_scenes
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('owner', 'admin')
    )
  );

drop policy if exists tutorial_progress_select_own on public.tutorial_user_progress;
create policy tutorial_progress_select_own
  on public.tutorial_user_progress
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists tutorial_progress_insert_own on public.tutorial_user_progress;
create policy tutorial_progress_insert_own
  on public.tutorial_user_progress
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists tutorial_progress_update_own on public.tutorial_user_progress;
create policy tutorial_progress_update_own
  on public.tutorial_user_progress
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Seed: veröffentlichte Onboarding-Tour je Rolle (Basis)
-- Idempotent ohne ON CONFLICT (kein Unique-Constraint auf diesen Spalten)
insert into public.tutorial_tours (
  tutorial_type, role, release_key, version, title, summary, enabled, required, status
)
select v.tutorial_type, v.role, v.release_key, v.version, v.title, v.summary, v.enabled, v.required, v.status
from (
  values
    ('onboarding'::text, 'owner'::text, null::text, 1, 'Cosmo Onboarding · Owner'::text, 'Technischer Start für Owner'::text, true, true, 'published'::text),
    ('onboarding', 'admin', null, 1, 'Cosmo Onboarding · Admin', 'Team-Lead Starttour', true, true, 'published'),
    ('onboarding', 'manager', null, 1, 'Cosmo Onboarding · Manager', 'Operations Starttour', true, true, 'published'),
    ('onboarding', 'analyst', null, 1, 'Cosmo Onboarding · Analyst', 'Insights Starttour', true, true, 'published'),
    ('onboarding', 'viewer', null, 1, 'Cosmo Onboarding · Viewer', 'Lesender Start', true, true, 'published')
) as v(tutorial_type, role, release_key, version, title, summary, enabled, required, status)
where not exists (
  select 1
  from public.tutorial_tours t
  where t.tutorial_type = v.tutorial_type
    and t.role = v.role
    and t.release_key is not distinct from v.release_key
    and t.version = v.version
    and t.status = v.status
);

with tours as (
  select id, role
  from public.tutorial_tours
  where tutorial_type = 'onboarding' and version = 1 and status = 'published'
),
rows as (
  select
    t.id as tour_id,
    0 as order_index,
    'Willkommen im Dashboard. Ich bin Cosmo und zeige dir alles Schritt fuer Schritt.'::text as text,
    null::text as target_selector,
    'greeting'::text as mascot_emotion,
    'float'::text as mascot_animation,
    false as unlock_sidebar,
    'after_typewriter'::text as advance_mode,
    3600 as estimated_ms
  from tours t
  union all
  select
    t.id, 1,
    case
      when t.role in ('owner', 'admin', 'manager') then 'Jetzt schalten wir die Sidebar frei und schauen uns die wichtigsten Bereiche an.'
      when t.role = 'analyst' then 'Wir starten bei Analytics, dort liegen deine wichtigsten Insights.'
      else 'Du bekommst jetzt die fuer dich relevanten Bereiche freigeschaltet.'
    end,
    '[data-tutorial-target="sidebar"]',
    'point',
    'wave',
    true,
    'manual',
    4200
  from tours t
  union all
  select
    t.id, 2,
    case
      when t.role = 'owner' then 'Als Owner kannst du Team, Rollen und Integrationen steuern.'
      when t.role = 'admin' then 'Als Admin leitest du das Team und haeltst den Betrieb stabil.'
      when t.role = 'manager' then 'Als Manager fokussierst du Orders, Prozesse und operative Kennzahlen.'
      when t.role = 'analyst' then 'Als Analyst konzentrierst du dich auf KPI, Trends und Export.'
      else 'Als Viewer nutzt du die freigegebenen Uebersichten sicher im Read-Only Modus.'
    end,
    '[data-tutorial-target="main-content"]',
    'excited',
    'bounce',
    true,
    'manual',
    4600
  from tours t
)
insert into public.tutorial_scenes (
  tour_id, order_index, text, target_selector, mascot_emotion, mascot_animation, unlock_sidebar, advance_mode, estimated_ms
)
select *
from rows
on conflict (tour_id, order_index) do update
set
  text = excluded.text,
  target_selector = excluded.target_selector,
  mascot_emotion = excluded.mascot_emotion,
  mascot_animation = excluded.mascot_animation,
  unlock_sidebar = excluded.unlock_sidebar,
  advance_mode = excluded.advance_mode,
  estimated_ms = excluded.estimated_ms;

-- Seed: Beispiel-Update-Tutorial
insert into public.tutorial_tours (
  tutorial_type, role, release_key, version, title, summary, enabled, required, status
)
select v.tutorial_type, v.role, v.release_key, v.version, v.title, v.summary, v.enabled, v.required, v.status
from (
  values
    ('release_update'::text, 'owner'::text, '2026-04-release-1'::text, 1, 'Update Tour · Release 2026-04-1'::text, 'Neue Bereiche und Verbesserungen'::text, true, false, 'published'::text),
    ('release_update', 'admin', '2026-04-release-1', 1, 'Update Tour · Release 2026-04-1', 'Neue Bereiche und Verbesserungen', true, false, 'published'),
    ('release_update', 'manager', '2026-04-release-1', 1, 'Update Tour · Release 2026-04-1', 'Neue Bereiche und Verbesserungen', true, false, 'published'),
    ('release_update', 'analyst', '2026-04-release-1', 1, 'Update Tour · Release 2026-04-1', 'Neue Bereiche und Verbesserungen', true, false, 'published'),
    ('release_update', 'viewer', '2026-04-release-1', 1, 'Update Tour · Release 2026-04-1', 'Neue Bereiche und Verbesserungen', true, false, 'published')
) as v(tutorial_type, role, release_key, version, title, summary, enabled, required, status)
where not exists (
  select 1
  from public.tutorial_tours t
  where t.tutorial_type = v.tutorial_type
    and t.role = v.role
    and t.release_key is not distinct from v.release_key
    and t.version = v.version
    and t.status = v.status
);

with update_tours as (
  select id
  from public.tutorial_tours
  where tutorial_type = 'release_update'
    and release_key = '2026-04-release-1'
    and version = 1
    and status = 'published'
),
update_rows as (
  select
    u.id as tour_id,
    0 as order_index,
    'Kurzes Update-Training: Wir zeigen dir die neuen Funktionen in weniger als einer Minute.'::text as text,
    null::text as target_selector,
    'wave'::text as mascot_emotion,
    'float'::text as mascot_animation,
    true as unlock_sidebar,
    'after_typewriter'::text as advance_mode,
    3200 as estimated_ms
  from update_tours u
  union all
  select
    u.id,
    1,
    'Neu: Du kannst Updates jetzt direkt im Dashboard nachlesen und als Tutorial ansehen.',
    '[data-tutorial-target="updates-card"]',
    'celebrate',
    'sparkle',
    true,
    'manual',
    3600
  from update_tours u
)
insert into public.tutorial_scenes (
  tour_id, order_index, text, target_selector, mascot_emotion, mascot_animation, unlock_sidebar, advance_mode, estimated_ms
)
select *
from update_rows
on conflict (tour_id, order_index) do update
set
  text = excluded.text,
  target_selector = excluded.target_selector,
  mascot_emotion = excluded.mascot_emotion,
  mascot_animation = excluded.mascot_animation,
  unlock_sidebar = excluded.unlock_sidebar,
  advance_mode = excluded.advance_mode,
  estimated_ms = excluded.estimated_ms;
