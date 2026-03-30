-- Feinsteuerung: sichtbare Sidebar-Hauptpunkte + mehrere Highlight-Selektoren
-- Spalten nullable: bestehende Zeilen ohne Backfill; Default in der App.

alter table public.tutorial_scenes
  add column if not exists visible_sidebar_keys text[] null;

alter table public.tutorial_scenes
  add column if not exists highlight_extra_selectors text null;

alter table public.tutorial_scenes
  add column if not exists highlight_mode text null;

alter table public.tutorial_scenes
  add column if not exists highlight_padding_px integer null;

alter table public.tutorial_scenes drop constraint if exists tutorial_scenes_highlight_mode_check;
alter table public.tutorial_scenes
  add constraint tutorial_scenes_highlight_mode_check
  check (highlight_mode is null or highlight_mode in ('spotlight', 'ring', 'ring_pulse'));

alter table public.tutorial_scenes drop constraint if exists tutorial_scenes_highlight_padding_check;
alter table public.tutorial_scenes
  add constraint tutorial_scenes_highlight_padding_check
  check (
    highlight_padding_px is null
    or (highlight_padding_px >= 0 and highlight_padding_px <= 64)
  );

comment on column public.tutorial_scenes.visible_sidebar_keys is
  'NULL = alle erlaubten Menüpunkte. Leeres Array = keine. Sonst nur genannte SidebarItemKeys (nach Rechten).';

comment on column public.tutorial_scenes.highlight_extra_selectors is
  'Zusätzliche CSS-Selektoren: JSON-Array oder zeilenweise/kommagetrennt.';
