// Supabase Edge Function — Claude AI drafting assistant
// Deploy with: supabase functions deploy claude-draft
// Set env: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Modes:
//   draft | refine      — a LinkedIn post (Composer, Review "redo")
//   connection | inmail — 1:1 outreach for a lead
//   voice               — distill Shannon's style guide from her voice_samples and save it
//
// Runs as the signed-in user (their JWT is forwarded), so RLS scopes every
// read to their workspace — that's how drafts pick up her learned voice.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { postRules, EOS_CONTEXT } from '../_shared/postPrompt.ts';
import { callClaude, loadVoiceContext, voiceBlock, voiceProfilePrompts } from '../_shared/voice.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

// Model selection:
// - claude-sonnet-4-6   → fast & cheap, great for drafting (default)
// - claude-opus-4-7     → most capable, ~5x cost; use if drafts need more depth
// Override via ANTHROPIC_MODEL env var.
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const MIN_VOICE_SAMPLES = 3;

// ---------- 1:1 outreach (connection notes + InMail) ----------
// LinkedIn caps connection notes at 300 characters on paid plans and InMail
// subjects at 200; bodies allow ~1900 but short ones get far more replies.
const CONNECTION_NOTE_MAX = 300;

function describeLead(lead: Record<string, string | null> = {}) {
  const parts = [
    lead.full_name && `Name: ${lead.full_name}`,
    lead.title && `Title: ${lead.title}`,
    lead.headline && `Headline: ${lead.headline}`,
    lead.company && `Company: ${lead.company}`,
    lead.company_size && `Company size: ${lead.company_size}`,
    lead.industry && `Industry: ${lead.industry}`,
    lead.location && `Location: ${lead.location}`
  ].filter(Boolean);
  return parts.length ? parts.join('\n') : 'No profile details available.';
}

function buildOutreachPrompt(kind: string, voiceProfile: string | null) {
  const shared = `You write 1:1 LinkedIn outreach for Shannon Roberts, an expert EOS (Entrepreneurial Operating System) Implementer who helps leadership teams of growing companies (roughly 10–250 employees) get clear on vision, gain traction and build a healthy team.

Rules:
- Sound like one busy professional writing to another. Warm, direct, specific. No sales pitch, no "I hope this finds you well", no flattery, no buzzwords.
- Reference something concrete about the person (role, company, industry, size) so it could not be sent to anyone else.
- Never invent facts about the person or claim a shared history that isn't given.
- Never use emojis or hashtags.
- If a post of Shannon's is supplied, connect it to a challenge someone in their seat likely faces and offer it as useful, not as self-promotion. Include the post link only if one is given.${
    voiceProfile
      ? `\n\nShannon's writing voice (from her posts — carry her word choice and rhythm into this shorter, more personal format):\n${voiceProfile}`
      : ''
  }`;

  if (kind === 'connection') {
    return `${shared}

Write a LinkedIn connection request note. HARD LIMIT: ${CONNECTION_NOTE_MAX} characters including spaces — aim for 180–260. One or two sentences plus a short sign-off ("— Shannon"). No links (they look spammy in invites).

Output ONLY the note text.`;
  }

  return `${shared}

Write a LinkedIn InMail. Subject under 60 characters, curiosity-driven, not salesy. Body 450–800 characters: a one-line personal opener, one insight or question relevant to their situation, an easy low-commitment ask (a reply, not a meeting), sign off "Shannon".

Respond with ONLY a JSON object: {"subject": "...", "body": "..."}`;
}

function parseInmail(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj.body) return { subject: String(obj.subject || '').trim(), body: String(obj.body).trim() };
    } catch {
      /* fall through */
    }
  }
  return { subject: '', body: text.trim() };
}

// deno-lint-ignore no-explicit-any
async function workspaceFor(supabase: any): Promise<string | null> {
  const { data } = await supabase.from('workspace_members').select('workspace_id').limit(1).maybeSingle();
  return data?.workspace_id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ error: 'ANTHROPIC_API_KEY not configured on the server' }, 500);
    }

    // User-scoped client: RLS limits reads to the caller's workspace
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false }
    });
    const workspaceId = await workspaceFor(supabase);
    const claude = (system: string, user: string, maxTokens?: number) =>
      callClaude({ apiKey: ANTHROPIC_API_KEY, model: MODEL, system, user, maxTokens });

    const { mode, prompt, existingContent, eosCategory, tone, lead, post } = await req.json();

    // ---- Voice profile: learn Shannon's style from her own posts ----
    if (mode === 'voice') {
      if (!workspaceId) return json({ error: 'No workspace for this user' }, 403);
      const { data: samples, error } = await supabase
        .from('voice_samples')
        .select('content')
        .eq('workspace_id', workspaceId)
        .order('posted_at', { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) return json({ error: error.message }, 500);

      const texts = (samples ?? []).map((s: { content: string }) => s.content.trim()).filter((t: string) => t.length > 80);
      if (texts.length < MIN_VOICE_SAMPLES) {
        return json({ error: `Add at least ${MIN_VOICE_SAMPLES} of Shannon's posts first (${texts.length} so far).` }, 400);
      }

      const { system, user, used } = voiceProfilePrompts(texts);
      const result = await claude(system, user, 1500);
      if (result.error) return json({ error: 'AI generation failed', detail: result.error }, result.status);

      const profile = result.text!.trim();
      const { error: saveErr } = await supabase.from('content_settings').upsert(
        { workspace_id: workspaceId, voice_profile: profile, voice_profile_updated_at: new Date().toISOString() },
        { onConflict: 'workspace_id' }
      );
      if (saveErr) return json({ error: saveErr.message }, 500);
      return json({ profile, used });
    }

    const voice = workspaceId ? await loadVoiceContext(supabase, workspaceId) : null;

    // ---- Outreach modes: 'connection' | 'inmail' ----
    if (mode === 'connection' || mode === 'inmail') {
      const userMessage = [
        `Recipient:\n${describeLead(lead)}`,
        post?.content &&
          `Shannon's post to share:\n---\n${String(post.content).slice(0, 2500)}\n---${post.linkedin_url ? `\nLink: ${post.linkedin_url}` : ''}`,
        prompt?.trim() && `Angle / extra direction from Shannon: ${prompt.trim()}`,
        existingContent?.trim() && `Current draft to improve:\n${existingContent.trim()}`
      ]
        .filter(Boolean)
        .join('\n\n');

      const result = await claude(buildOutreachPrompt(mode, voice?.profile ?? null), userMessage, 800);
      if (result.error) return json({ error: 'AI generation failed', detail: result.error }, result.status);

      return json(
        mode === 'inmail'
          ? parseInmail(result.text!)
          : { subject: '', body: result.text!.trim().replace(/^"|"$/g, '').slice(0, CONNECTION_NOTE_MAX) }
      );
    }

    // ---- Posts: 'draft' | 'refine' ----
    if (!prompt?.trim()) return json({ error: 'prompt is required' }, 400);

    const userMessage =
      mode === 'refine' && existingContent
        ? `Here is an existing draft:\n\n---\n${existingContent}\n---\n\nRefine this based on the following direction: ${prompt}`
        : `Write a LinkedIn post about: ${prompt}`;

    const system = `${postRules(tone)}

Topic context: ${EOS_CONTEXT[eosCategory] || EOS_CONTEXT.general}${voiceBlock(voice)}

Output ONLY the post content. No preamble, no commentary, no markdown wrappers.`;

    const result = await claude(system, userMessage, 1500);
    if (result.error) return json({ error: 'AI generation failed', detail: result.error }, result.status);
    return json({ content: result.text });
  } catch (err) {
    console.error('Edge function error:', err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
