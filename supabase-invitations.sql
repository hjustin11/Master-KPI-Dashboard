-- Einmalig in Supabase SQL Editor ausfuehren.
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('owner','admin','manager','analyst','viewer')),
  token uuid not null unique,
  status text not null default 'pending' check (status in ('pending','accepted')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists invitations_email_idx on public.invitations(email);
create index if not exists invitations_status_idx on public.invitations(status);
