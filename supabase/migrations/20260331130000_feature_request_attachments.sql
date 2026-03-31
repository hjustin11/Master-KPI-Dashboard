-- Feature requests: optional page reference + file attachments (private storage)

alter table public.feature_requests
  add column if not exists page_path text null,
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.feature_requests.page_path is
  'Optional dashboard path the user refers to (e.g. /analytics/marketplaces).';
comment on column public.feature_requests.attachments is
  'Uploaded files: [{ "path", "filename", "content_type", "size_bytes" }]';

insert into storage.buckets (id, name, public, file_size_limit)
values ('feedback-attachments', 'feedback-attachments', false, 5242880)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;
