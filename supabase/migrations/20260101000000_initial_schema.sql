-- ============================================================
-- Shannon Content Studio — initial schema
-- ============================================================
-- Run this in the Supabase SQL Editor on a fresh project.

-- ---------- Workspaces & members ----------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'collaborator')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- ---------- Posts ----------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete set null,
  content text default '',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  eos_category text,
  scheduled_at timestamptz,
  published_at timestamptz,
  linkedin_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index posts_workspace_idx on public.posts(workspace_id);
create index posts_status_idx on public.posts(status);
create index posts_scheduled_idx on public.posts(scheduled_at);

-- ---------- Post versions (revision history) ----------
create table public.post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  content text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index post_versions_post_idx on public.post_versions(post_id);

-- ---------- Templates ----------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  category text,
  structure text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Ratings ----------
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade unique,
  engagement_score int check (engagement_score between 0 and 5),
  resonance_score int check (resonance_score between 0 and 5),
  notes text,
  rated_at timestamptz not null default now()
);

-- ---------- Hashtags ----------
create table public.hashtags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tag text not null,
  category text,
  use_count int not null default 0,
  unique (workspace_id, tag)
);

create table public.post_hashtags (
  post_id uuid not null references public.posts(id) on delete cascade,
  hashtag_id uuid not null references public.hashtags(id) on delete cascade,
  primary key (post_id, hashtag_id)
);

-- ============================================================
-- Triggers
-- ============================================================

-- Auto-update posts.updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger posts_touch_updated_at
  before update on public.posts
  for each row execute function public.touch_updated_at();

-- Auto-create workspace + membership on user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_workspace_id uuid;
begin
  insert into public.workspaces (name, owner_id)
  values (coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)) || '''s Workspace', new.id)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Set author_id and workspace_id automatically on post insert if missing
create or replace function public.set_post_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.author_id is null then
    new.author_id = auth.uid();
  end if;
  if new.workspace_id is null then
    select workspace_id into new.workspace_id
    from public.workspace_members
    where user_id = auth.uid()
    limit 1;
  end if;
  return new;
end $$;

create trigger posts_set_defaults
  before insert on public.posts
  for each row execute function public.set_post_defaults();

-- ============================================================
-- Row-Level Security
-- ============================================================

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.posts enable row level security;
alter table public.post_versions enable row level security;
alter table public.templates enable row level security;
alter table public.ratings enable row level security;
alter table public.hashtags enable row level security;
alter table public.post_hashtags enable row level security;

-- Helper: is the current user a member of this workspace?
create or replace function public.is_workspace_member(ws uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws and user_id = auth.uid()
  );
$$;

-- Workspaces: members can read; owner can update/delete
create policy "members read workspaces"
  on public.workspaces for select
  using (public.is_workspace_member(id));

create policy "owner updates workspace"
  on public.workspaces for update
  using (owner_id = auth.uid());

-- workspace_members: visible to members of the workspace
create policy "members read workspace members"
  on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));

create policy "owner manages members"
  on public.workspace_members for all
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_members.workspace_id and w.owner_id = auth.uid()
    )
  );

-- Posts: members can CRUD posts in their workspaces
create policy "members read posts"
  on public.posts for select
  using (public.is_workspace_member(workspace_id));

create policy "members insert posts"
  on public.posts for insert
  with check (public.is_workspace_member(workspace_id) or workspace_id is null);

create policy "members update posts"
  on public.posts for update
  using (public.is_workspace_member(workspace_id));

create policy "members delete posts"
  on public.posts for delete
  using (public.is_workspace_member(workspace_id));

-- Post versions: read by workspace members, insert by anyone with post access
create policy "members read versions"
  on public.post_versions for select
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_versions.post_id and public.is_workspace_member(p.workspace_id)
    )
  );

create policy "members insert versions"
  on public.post_versions for insert
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_versions.post_id and public.is_workspace_member(p.workspace_id)
    )
  );

-- Templates: workspace-scoped
create policy "members read templates"
  on public.templates for select
  using (public.is_workspace_member(workspace_id));

create policy "members manage templates"
  on public.templates for all
  using (public.is_workspace_member(workspace_id));

-- Ratings: only owner of workspace can rate
create policy "members read ratings"
  on public.ratings for select
  using (
    exists (
      select 1 from public.posts p
      where p.id = ratings.post_id and public.is_workspace_member(p.workspace_id)
    )
  );

create policy "owner rates posts"
  on public.ratings for all
  using (
    exists (
      select 1 from public.posts p
      join public.workspaces w on w.id = p.workspace_id
      where p.id = ratings.post_id and w.owner_id = auth.uid()
    )
  );

-- Hashtags: workspace-scoped
create policy "members read hashtags"
  on public.hashtags for select
  using (public.is_workspace_member(workspace_id));

create policy "members manage hashtags"
  on public.hashtags for all
  using (public.is_workspace_member(workspace_id));

-- post_hashtags: read by workspace members
create policy "members read post_hashtags"
  on public.post_hashtags for select
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_hashtags.post_id and public.is_workspace_member(p.workspace_id)
    )
  );

create policy "members manage post_hashtags"
  on public.post_hashtags for all
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_hashtags.post_id and public.is_workspace_member(p.workspace_id)
    )
  );
