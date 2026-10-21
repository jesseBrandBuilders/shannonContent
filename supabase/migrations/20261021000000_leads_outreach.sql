-- ============================================================
-- Shannon Content Studio — Leads & outreach queue
-- ============================================================
-- Run in the Supabase SQL Editor after the initial schema.
--
-- Leads arrive from AudienceLab (webhook push via AudienceSync, or CSV
-- export imported in the app). Shannon works them one at a time from the
-- Leads queue: the app drafts a connection note or InMail, she copies it,
-- opens the profile on LinkedIn and sends it herself. Nothing here talks to
-- LinkedIn directly.

-- ---------- Lead sources (one per AudienceLab audience / webhook) ----------
create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  provider text not null default 'audiencelab',
  -- Secret token embedded in the webhook URL; rotate by updating this column.
  webhook_token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  records_received int not null default 0,
  last_received_at timestamptz,
  created_at timestamptz not null default now()
);

create index lead_sources_workspace_idx on public.lead_sources(workspace_id);

-- ---------- Leads ----------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_id uuid references public.lead_sources(id) on delete set null,
  source text not null default 'manual' check (source in ('audiencelab', 'csv', 'manual')),
  external_id text,

  first_name text,
  last_name text,
  full_name text,
  title text,
  headline text,
  company text,
  company_domain text,
  company_size text,
  industry text,
  location text,
  email text,
  linkedin_url text not null,

  fit_score int not null default 0,
  fit_reasons text[] not null default '{}',

  status text not null default 'new'
    check (status in ('new', 'contacted', 'connected', 'replied', 'not_a_fit', 'archived')),
  notes text,
  raw jsonb,

  last_touched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (workspace_id, linkedin_url)
);

create index leads_workspace_status_idx on public.leads(workspace_id, status);
create index leads_fit_idx on public.leads(workspace_id, fit_score desc);

-- ---------- Outreach (each drafted / sent message) ----------
create table public.lead_outreach (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('connection', 'inmail', 'message')),
  subject text,
  body text not null default '',
  post_id uuid references public.posts(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index lead_outreach_lead_idx on public.lead_outreach(lead_id);
create index lead_outreach_sent_idx on public.lead_outreach(workspace_id, sent_at);

-- ============================================================
-- Fit scoring — tuned for EOS buyers: owners / visionaries / integrators
-- of companies roughly 10–250 employees. Edit this function to retune;
-- run `update public.leads set updated_at = now();` to rescore everyone.
-- ============================================================
create or replace function public.score_lead(p_title text, p_headline text, p_company_size text)
returns table (score int, reasons text[])
language plpgsql immutable as $$
declare
  t text := lower(coalesce(p_title, '') || ' ' || coalesce(p_headline, ''));
  s int := 0;
  r text[] := '{}';
  size_num int;
begin
  if t ~ '\m(owner|founder|co-founder|cofounder|ceo|chief executive|president|visionary|managing partner|principal)\M' then
    s := s + 50; r := array_append(r, 'Owner / CEO-level title');
  elsif t ~ '\m(coo|chief operating|integrator|general manager|managing director|cfo|chief financial)\M' then
    s := s + 40; r := array_append(r, 'Integrator / ops leader');
  elsif t ~ '\m(vp|vice president|director|head of|partner)\M' then
    s := s + 20; r := array_append(r, 'Senior leader');
  elsif t ~ '\mmanager\M' then
    s := s + 5;
  end if;

  if t ~ '\m(eos|traction|entrepreneurial operating system)\M' then
    s := s + 15; r := array_append(r, 'Mentions EOS / Traction');
  end if;

  -- company_size arrives in many shapes: "11-50", "51 to 200", "120", "1,000+"
  -- take the first number (lower bound of a range)
  size_num := (regexp_match(replace(coalesce(p_company_size, ''), ',', ''), '[0-9]+'))[1]::int;
  if size_num is not null then
    if size_num between 10 and 250 then
      s := s + 35; r := array_append(r, 'Company size in EOS sweet spot');
    elsif size_num between 251 and 1000 then
      s := s + 10;
    elsif size_num < 10 then
      s := s + 5;
    end if;
  end if;

  score := least(s, 100);
  reasons := r;
  return next;
end $$;

-- Normalize LinkedIn URLs so the same person never lands twice
create or replace function public.normalize_linkedin_url(u text)
returns text language sql immutable as $$
  select case
    when u is null or btrim(u) = '' then null
    else 'https://www.linkedin.com/' ||
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(btrim(u)), '^(https?://)?([a-z]{2,3}\.)?(www\.)?linkedin\.com/', ''),
          '[?#].*$', ''),
        '/+$', '')
  end
$$;

create or replace function public.prepare_lead()
returns trigger language plpgsql as $$
declare
  sc record;
begin
  new.linkedin_url := public.normalize_linkedin_url(new.linkedin_url);
  if new.linkedin_url is null then
    raise exception 'linkedin_url is required';
  end if;

  if new.full_name is null or btrim(new.full_name) = '' then
    new.full_name := nullif(btrim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')), '');
  end if;

  select * into sc from public.score_lead(new.title, new.headline, new.company_size);
  new.fit_score := sc.score;
  new.fit_reasons := sc.reasons;
  new.updated_at := now();
  return new;
end $$;

create trigger leads_prepare
  before insert or update on public.leads
  for each row execute function public.prepare_lead();

-- Marking a message sent moves the lead to "contacted"
create or replace function public.on_outreach_sent()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    if new.sent_at is null then
      new.sent_at := now();
    end if;
    update public.leads
      set last_touched_at = new.sent_at,
          status = case when status = 'new' then 'contacted' else status end
      where id = new.lead_id;
  end if;
  return new;
end $$;

create trigger lead_outreach_sent
  before insert or update on public.lead_outreach
  for each row execute function public.on_outreach_sent();

-- ============================================================
-- Row-Level Security
-- ============================================================
alter table public.lead_sources enable row level security;
alter table public.leads enable row level security;
alter table public.lead_outreach enable row level security;

create policy "members read lead sources"
  on public.lead_sources for select
  using (public.is_workspace_member(workspace_id));

create policy "members manage lead sources"
  on public.lead_sources for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "members read leads"
  on public.leads for select
  using (public.is_workspace_member(workspace_id));

create policy "members manage leads"
  on public.leads for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "members read outreach"
  on public.lead_outreach for select
  using (public.is_workspace_member(workspace_id));

create policy "members manage outreach"
  on public.lead_outreach for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
