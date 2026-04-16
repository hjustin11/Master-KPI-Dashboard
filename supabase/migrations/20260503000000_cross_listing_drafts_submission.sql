alter table public.cross_listing_drafts
  add column if not exists submission_id text,
  add column if not exists submission_status text,
  add column if not exists submission_issues jsonb,
  add column if not exists submitted_at timestamptz;

create index if not exists cross_listing_drafts_submission_id_idx
  on public.cross_listing_drafts (submission_id)
  where submission_id is not null;
