-- ============================================================
-- Shannon Content Studio — Content autopilot
-- ============================================================
-- Run in the Supabase SQL Editor after the earlier migrations.
--
-- The app learns Shannon's voice from her own posts (LinkedIn data export
-- or pasted samples), drafts a week of posts on a schedule, and puts them in
-- a review queue. She approves (→ scheduled), edits, or rejects with a note;
-- approvals and rejection notes steer the next batch.

-- ---------- Posts: review workflow ----------
alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts
  add constraint posts_status_check
  check (status in ('review', 'draft', 'scheduled', 'published', 'rejected'));

alter table public.posts
  add column if not exists generated_by text,         -- 'autopilot' for batch drafts
  add column if not exists batch_id uuid,             -- groups one batch run
  add column if not exists review_note text;          -- why Shannon rejected / what to change

create index if not exists posts_review_idx on public.posts(workspace_id, status) where status in ('review', 'rejected');

-- ---------- Voice samples (her real writing) ----------
create table public.voice_samples (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source text not null check (source in ('linkedin_export', 'paste')),
  content text not null check (length(btrim(content)) > 0),
  content_hash text generated always as (md5(btrim(content))) stored,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, content_hash)
);

create index voice_samples_workspace_idx on public.voice_samples(workspace_id, posted_at desc);

-- ---------- Autopilot settings + voice profile (one row per workspace) ----------
create table public.content_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  autopilot_enabled boolean not null default false,
  posts_per_week int not null default 3 check (posts_per_week between 1 and 7),
  topics text[] not null default array['level10', 'rocks', 'vto', 'people', 'process', 'traction', 'general'],
  posting_days int[] not null default array[2, 3, 4],   -- ISO weekdays: 1 = Mon … 7 = Sun
  posting_time time not null default '08:30',
  timezone text not null default 'America/New_York',
  guidance text,                -- "this month, lean into…" — read by every batch
  voice_profile text,           -- style guide distilled from voice_samples (editable)
  voice_profile_updated_at timestamptz,
  last_batch_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger content_settings_touch_updated_at
  before update on public.content_settings
  for each row execute function public.touch_updated_at();

-- ============================================================
-- Row-Level Security
-- ============================================================
alter table public.voice_samples enable row level security;
alter table public.content_settings enable row level security;

create policy "members read voice samples"
  on public.voice_samples for select
  using (public.is_workspace_member(workspace_id));

create policy "members manage voice samples"
  on public.voice_samples for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "members read content settings"
  on public.content_settings for select
  using (public.is_workspace_member(workspace_id));

create policy "members manage content settings"
  on public.content_settings for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
