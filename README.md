# Shannon Content Studio

A LinkedIn content management tool built for Shannon Roberts — Expert EOS Implementer.
React + Vite + Tailwind CSS, backed by Supabase, with Claude-powered AI drafting.
Installs as a PWA on phones.

---

## Features

- **AI-assisted drafting** — Claude writes in Shannon's voice, calibrated for each EOS topic (Level 10s, Rocks, V/TO, GWC, Process, Traction)
- **EOS-specific templates** — six starter structures matching the EOS framework
- **Post library** — drafts, scheduled, and published in one searchable place
- **Calendar view** — see your posting cadence at a glance
- **Self-rating + analytics** — score what resonated to learn what works
- **Mobile + desktop** — responsive PWA, installs to phone home screen
- **Multi-user workspace** — Shannon + up to 2 collaborators with row-level security
- **Copy + open LinkedIn** — one-tap publish flow (no LinkedIn API approval needed)

---

## Quick start

### 1. Clone & install

```bash
git clone https://github.com/YOUR-USERNAME/shannon-content-studio.git
cd shannon-content-studio
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine)
2. In the Supabase dashboard, go to **SQL Editor** and paste the contents of `supabase/migrations/20260101000000_initial_schema.sql`. Run it.
3. Go to **Authentication → Providers** and confirm "Email" is enabled. Disable the "Confirm email" requirement if you want magic-link login to work without an extra confirmation step.
4. Go to **Settings → API** and copy your **Project URL** and **anon public key**.

### 3. Set up environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and paste your Supabase URL and anon key.

### 4. Deploy the Claude Edge Function

Install the Supabase CLI: [docs.supabase.com/guides/cli](https://supabase.com/docs/guides/cli)

```bash
# Log in & link to your project
supabase login
supabase link --project-ref YOUR-PROJECT-REF

# Set the Anthropic API key as a secret (server-side only)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here

# Deploy
supabase functions deploy claude-draft
```

> **Why a server-side function?** If we called Anthropic directly from the React app, the API key would ship in the browser bundle and anyone could scrape it. The Edge Function keeps the key in Supabase env vars.

### 5. Run it

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Sign in with magic link.

### 6. Deploy to production

The recommended path is **Vercel** (free, auto-deploys from GitHub):

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com), import the repo
3. Add the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars in Vercel
4. Deploy

Vercel will auto-deploy on every push to `main`.

---

## Adding collaborators

Shannon's account is the workspace owner. To add a collaborator:

1. Have them sign up at the live site (they'll get their own auto-created workspace)
2. In Supabase **Table Editor**, open `workspace_members` and add a row:
   - `workspace_id`: Shannon's workspace ID (find it in `workspaces` table)
   - `user_id`: their user ID (find it in `auth.users`)
   - `role`: `collaborator`
3. Optional: delete their auto-created workspace

A small admin UI for this can be added in v1.1.

---

## Architecture

```
┌─────────────────────┐
│   React + Vite      │  ← PWA, Tailwind, TanStack Query
│   (Vercel)          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐         ┌──────────────────────┐
│   Supabase          │ ──────► │  Edge Function       │
│   • Auth (magic)    │         │  claude-draft        │
│   • Postgres + RLS  │         │  ↓                   │
│   • Storage         │         │  Anthropic API       │
└─────────────────────┘         └──────────────────────┘
```

### Database schema

- `workspaces` / `workspace_members` — multi-tenancy
- `posts` — content with status (draft / scheduled / published) and EOS category
- `post_versions` — revision history
- `templates` — reusable post structures
- `ratings` — Shannon's self-ratings on engagement & resonance
- `hashtags` / `post_hashtags` — tag library

All tables have row-level security policies so users only see data in their workspaces.

### Tech choices & why

| Choice | Why |
|--------|-----|
| **Vite + React** | Fastest dev experience for SPAs |
| **Tailwind only** (no custom CSS) | Per spec — keeps styling consistent and trim |
| **Supabase** | Auth + Postgres + Edge Functions in one platform; generous free tier |
| **TanStack Query** | Server state caching, optimistic updates, dedup |
| **Magic-link auth** | No passwords for Shannon to manage |
| **PWA via vite-plugin-pwa** | Installs to iOS/Android home screen, works offline-ish |
| **Edge Function for Claude** | Keeps API key server-side |
| **Copy + open LinkedIn** | Avoids LinkedIn Marketing API approval (which is not granted for personal accounts) |

---

## LinkedIn posting — what's the plan?

LinkedIn deprecated the public posting API for personal profiles. The realistic options are:

1. **Copy + open** (current v1) — copy formatted text to clipboard, open the LinkedIn share dialog. Shannon pastes and posts. Works on every device, requires zero approvals.
2. **Buffer / Typefully API** (v1.5 candidate) — they hold the LinkedIn relationship; we just hit their API. ~$5-15/mo per user.
3. **LinkedIn Marketing Developer Platform** — partner approval, mostly for company pages. Months of process.

Recommendation: stay on option 1 until Shannon outgrows it, then add Buffer.

---

## Development

```bash
npm run dev       # local dev server
npm run build     # production build
npm run preview   # preview production build
npm run lint      # eslint
```

### Project structure

```
src/
├── components/
│   ├── layout/         AppShell, PageHeader
│   └── ui/             Button, Input, Card, Modal, Toast
├── pages/              Login, Dashboard, Composer, Library, Calendar, Templates, Analytics
├── hooks/              useAuth, usePosts
├── lib/                supabase, claude, linkedin
├── App.jsx             Router + auth gate
└── main.jsx            Entry

supabase/
├── migrations/         SQL schema (run in Supabase SQL editor)
└── functions/
    └── claude-draft/   Edge Function for AI drafting
```

---

## Notes for the future

- **Claude model selection** — The Edge Function defaults to `claude-sonnet-4-6` (fast and cost-effective for drafting). To use the more capable `claude-opus-4-7` instead, run `supabase secrets set ANTHROPIC_MODEL=claude-opus-4-7`. Verify model availability at [docs.claude.com](https://docs.claude.com) before deploying.
- **Scheduled publishing** — `scheduled_at` is stored but no scheduler runs yet. Easy v1.5 add: a Supabase pg_cron job that emails Shannon her scheduled posts at the time, or a Vercel cron that emails a "ready to post" notification.
- **Image attachments** — Schema supports it via Supabase Storage but UI not yet wired up.
- **Hashtag library** — Tables exist; UI for managing them is a pending v1.1 task.

---

## License

Private project. Not for distribution.
