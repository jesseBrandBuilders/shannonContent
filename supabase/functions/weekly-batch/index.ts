// Supabase Edge Function — content autopilot.
// Drafts a week of LinkedIn posts in Shannon's voice and drops them into the
// Review queue (status 'review') with suggested posting times.
//
// Deploy:  supabase functions deploy weekly-batch --no-verify-jwt
// Secrets: supabase secrets set AUTOPILOT_CRON_SECRET=<long random string>
//
// Two ways in:
//   • Scheduled (pg_cron → pg_net, see README): header x-cron-secret.
//     Runs every workspace with autopilot on, skipping any that still have a
//     full batch waiting for review — drafts never pile up unread.
//   • "Generate now" button: the signed-in user's JWT. Runs their workspace
//     regardless of the autopilot toggle. Body may include { count }.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { postRules, EOS_CONTEXT, EOS_LABELS } from '../_shared/postPrompt.ts';
import { callClaude, loadVoiceContext, voiceBlock } from '../_shared/voice.ts';
import { planSlots, pickTopics } from './plan.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6';
const CRON_SECRET = Deno.env.get('AUTOPILOT_CRON_SECRET');

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const DEFAULT_SETTINGS = {
  autopilot_enabled: false,
  posts_per_week: 3,
  topics: Object.keys(EOS_CONTEXT),
  posting_days: [2, 3, 4],
  posting_time: '08:30',
  timezone: 'America/New_York'
};

const FORMATS = [
  'a pattern she sees in leadership teams, and what fixes it',
  'a contrarian take on common business advice, grounded in EOS',
  'a short, practical how-to (3–5 steps or bullets)',
  'a myth vs. reality about running on EOS',
  'one sharp question leaders should ask their team, and why it matters',
  'a before/after of what changes when a team gets this right'
];

function extractPosts(text: string): { category?: string; content?: string }[] {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : parsed.posts ?? [];
  } catch {
    return [];
  }
}

async function runWorkspace(workspaceId: string, opts: { manual: boolean; count?: number }) {
  const [{ data: ws }, { data: s }, { data: recent }, { data: upcoming }] = await Promise.all([
    admin.from('workspaces').select('owner_id').eq('id', workspaceId).single(),
    admin.from('content_settings').select('*').eq('workspace_id', workspaceId).maybeSingle(),
    admin
      .from('posts')
      .select('content, eos_category, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('posts')
      .select('scheduled_at, status')
      .eq('workspace_id', workspaceId)
      .in('status', ['review', 'scheduled'])
      .gte('scheduled_at', new Date().toISOString())
  ]);

  const settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  const pendingReview = (upcoming ?? []).filter((p) => p.status === 'review').length;

  if (!opts.manual && pendingReview >= settings.posts_per_week) {
    return { workspaceId, skipped: `${pendingReview} drafts still waiting for review` };
  }

  const count = Math.max(1, Math.min(7, opts.count ?? settings.posts_per_week));
  const slots = planSlots({
    now: new Date(),
    count,
    postingDays: settings.posting_days,
    postingTime: String(settings.posting_time).slice(0, 5),
    timezone: settings.timezone,
    taken: (upcoming ?? []).map((p) => p.scheduled_at).filter(Boolean)
  });
  const topics = pickTopics(settings.topics?.length ? settings.topics : DEFAULT_SETTINGS.topics, recent ?? [], count);

  const voice = await loadVoiceContext(admin, workspaceId);
  const system = `${postRules('conversational')}${voiceBlock(voice)}

You are drafting Shannon's posts for the coming week in one pass. Each post must stand alone, and the set should feel varied: different hooks, different shapes, no two posts opening the same way.`;

  const avoid = (recent ?? [])
    .map((p) => p.content?.split('\n').find((l: string) => l.trim())?.slice(0, 140))
    .filter(Boolean);

  const assignments = slots.map((slot, i) => {
    const cat = topics[i];
    return `${i + 1}. ${slot.label} — topic: ${EOS_LABELS[cat] ?? cat} (${EOS_CONTEXT[cat] ?? EOS_CONTEXT.general}). Format: ${FORMATS[(i + slot.dayIndex) % FORMATS.length]}.`;
  });

  const user = `Write ${slots.length} LinkedIn posts, one per assignment:
${assignments.join('\n')}

${avoid.length ? `Recent posts already covered (don't repeat their angle or hook):\n${avoid.map((a) => `- ${a}`).join('\n')}\n\n` : ''}Respond with ONLY JSON: {"posts": [{"category": "<topic key>", "content": "<full post text>"}]} in assignment order. Topic keys: ${topics.join(', ')}.`;

  const result = await callClaude({
    apiKey: ANTHROPIC_API_KEY!,
    model: MODEL,
    system,
    user,
    maxTokens: Math.min(8000, 900 * slots.length + 500)
  });
  if (result.error) throw new Error(`Claude: ${result.error.slice(0, 300)}`);

  const drafts = extractPosts(result.text!).filter((p) => p.content?.trim());
  if (!drafts.length) throw new Error('Claude returned no parsable posts');

  const batchId = crypto.randomUUID();
  const rows = drafts.slice(0, slots.length).map((d, i) => ({
    workspace_id: workspaceId,
    author_id: ws!.owner_id,
    content: d.content!.trim(),
    eos_category: EOS_CONTEXT[d.category ?? ''] ? d.category : topics[i],
    status: 'review',
    scheduled_at: slots[i].iso,
    generated_by: 'autopilot',
    batch_id: batchId
  }));

  const { error } = await admin.from('posts').insert(rows);
  if (error) throw new Error(error.message);

  await admin
    .from('content_settings')
    .upsert({ workspace_id: workspaceId, last_batch_at: new Date().toISOString() }, { onConflict: 'workspace_id' });

  return { workspaceId, created: rows.length, batchId };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured on the server' }, 500);

  const body = await req.json().catch(() => ({}));

  // --- Scheduled run ---
  const cronHeader = req.headers.get('x-cron-secret');
  if (cronHeader) {
    if (!CRON_SECRET || cronHeader !== CRON_SECRET) return json({ error: 'invalid cron secret' }, 401);
    const { data: enabled, error } = await admin
      .from('content_settings')
      .select('workspace_id')
      .eq('autopilot_enabled', true);
    if (error) return json({ error: error.message }, 500);

    const results = [];
    for (const { workspace_id } of enabled ?? []) {
      try {
        results.push(await runWorkspace(workspace_id, { manual: false }));
      } catch (err) {
        console.error('batch failed', workspace_id, err);
        results.push({ workspaceId: workspace_id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return json({ results });
  }

  // --- "Generate now" from the app ---
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'sign in required' }, 401);

  const { data: membership } = await admin
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userData.user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return json({ error: 'no workspace for this user' }, 403);

  try {
    const count = Number.isInteger(body.count) ? body.count : undefined;
    return json(await runWorkspace(membership.workspace_id, { manual: true, count }));
  } catch (err) {
    console.error('batch failed', err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
