create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  display_name text,
  video_storage_enabled boolean not null default false,
  consent_version text,
  consented_at timestamptz
);

create table if not exists public.daily_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date_key text not null,
  created_at timestamptz not null default now(),
  duration_ms integer not null,
  overall_symmetry_score integer not null,
  quality_score integer not null,
  video_path text,
  algorithm_version text not null,
  notes text
);

create table if not exists public.fau_metrics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  fau_id text not null,
  au text not null,
  label text not null,
  balance double precision not null,
  symmetry_score integer not null,
  affected_side text not null check (affected_side in ('left', 'right', 'balanced'))
);

alter table public.profiles enable row level security;
alter table public.daily_sessions enable row level security;
alter table public.fau_metrics enable row level security;

create policy "profiles are owned by user"
on public.profiles
for all
using (id = auth.uid())
with check (id = auth.uid());

create policy "daily sessions are owned by user"
on public.daily_sessions
for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "metrics follow owned sessions"
on public.fau_metrics
for all
using (
  exists (
    select 1
    from public.daily_sessions
    where daily_sessions.id = fau_metrics.session_id
      and daily_sessions.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.daily_sessions
    where daily_sessions.id = fau_metrics.session_id
      and daily_sessions.user_id = auth.uid()
  )
);

create index if not exists daily_sessions_user_date_idx
on public.daily_sessions (user_id, date_key desc);

create index if not exists fau_metrics_session_idx
on public.fau_metrics (session_id);

-- Storage setup:
-- Videos are optional. If enabled, files use paths like:
-- {auth.uid()}/{session_id}/check-in.webm
insert into storage.buckets (id, name, public)
values ('patient-videos', 'patient-videos', false)
on conflict (id) do nothing;

create policy "patients can read their own videos"
on storage.objects
for select
using (
  bucket_id = 'patient-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "patients can upload their own videos"
on storage.objects
for insert
with check (
  bucket_id = 'patient-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "patients can update their own videos"
on storage.objects
for update
using (
  bucket_id = 'patient-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'patient-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "patients can delete their own videos"
on storage.objects
for delete
using (
  bucket_id = 'patient-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
