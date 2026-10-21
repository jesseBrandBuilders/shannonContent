// Supabase Edge Function — Claude AI drafting assistant
// Deploy with: supabase functions deploy claude-draft
// Set env: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...


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

const EOS_CONTEXT = {
  level10: 'Level 10 Meetings — the weekly leadership team meeting structure in EOS',
  rocks: 'Rocks — the 90-day priorities each leader commits to in EOS',
  vto: 'V/TO (Vision/Traction Organizer) — the two-page document capturing vision and execution plan',
  people: 'People component — Right Person, Right Seat using GWC (Gets it, Wants it, Capacity)',
  process: 'Process component — documenting and following the handful of core processes that run the business',
  traction: 'Traction component — the discipline and accountability to execute on the vision',
  general: 'general EOS (Entrepreneurial Operating System) topics'
};

function buildSystemPrompt(eosCategory?: string, tone?: string) {
  return `You are a LinkedIn ghostwriter for Shannon Roberts, an expert EOS (Entrepreneurial Operating System) Implementer who works with leadership teams of growth-minded companies.

Voice guidelines:
- Tone: ${tone || 'conversational'}
- Audience: founders, CEOs, leadership team members at small-to-mid-market companies
- Position Shannon as a practitioner first, not a theorist — draw on real client situations (anonymized)
- Concrete > abstract. Short lines. Use whitespace. No corporate jargon.
- The first 2 lines must hook — they're what shows above LinkedIn's "see more" cutoff
- End with a question or call to engage
- Keep under 1300 characters where possible (LinkedIn engagement sweet spot)
- 3-5 hashtags at the end, EOS-relevant
- Never use emojis unless context strongly calls for it (sparingly, max 1-2)
- Never use phrases like "in today's fast-paced world", "leverage", "synergy", or other LinkedIn-bro clichés

Topic context: ${EOS_CONTEXT[eosCategory as keyof typeof EOS_CONTEXT] || EOS_CONTEXT.general}

Output ONLY the post content. No preamble, no commentary, no markdown wrappers.`;
}

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

function buildOutreachPrompt(kind: string) {
  const shared = `You write 1:1 LinkedIn outreach for Shannon Roberts, an expert EOS (Entrepreneurial Operating System) Implementer who helps leadership teams of growing companies (roughly 10–250 employees) get clear on vision, gain traction and build a healthy team.

Rules:
- Sound like one busy professional writing to another. Warm, direct, specific. No sales pitch, no "I hope this finds you well", no flattery, no buzzwords.
- Reference something concrete about the person (role, company, industry, size) so it could not be sent to anyone else.
- Never invent facts about the person or claim a shared history that isn't given.
- Never use emojis or hashtags.
- If a post of Shannon's is supplied, connect it to a challenge someone in their seat likely faces and offer it as useful, not as self-promotion. Include the post link only if one is given.`;

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

async function callClaude(system: string, userMessage: string, maxTokens = 1500) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Anthropic API error:', errText);
    return { error: errText, status: response.status };
  }
  const data = await response.json();
  return { text: data.content?.[0]?.text || '' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured on the server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { mode, prompt, existingContent, eosCategory, tone, lead, post } = await req.json();

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

      const result = await callClaude(buildOutreachPrompt(mode), userMessage, 800);
      if (result.error) {
        return new Response(JSON.stringify({ error: 'AI generation failed', detail: result.error }), {
          status: result.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const out =
        mode === 'inmail'
          ? parseInmail(result.text!)
          : { subject: '', body: result.text!.trim().replace(/^"|"$/g, '').slice(0, CONNECTION_NOTE_MAX) };

      return new Response(JSON.stringify(out), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!prompt?.trim()) {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userMessage =
      mode === 'refine' && existingContent
        ? `Here is an existing draft:\n\n---\n${existingContent}\n---\n\nRefine this based on the following direction: ${prompt}`
        : `Write a LinkedIn post about: ${prompt}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: buildSystemPrompt(eosCategory, tone),
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return new Response(
        JSON.stringify({ error: 'AI generation failed', detail: errText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
