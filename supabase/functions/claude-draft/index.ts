// Supabase Edge Function — Claude AI drafting assistant
// Deploy with: supabase functions deploy claude-draft
// Set env: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

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

function buildSystemPrompt(eosCategory, tone) {
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

Topic context: ${EOS_CONTEXT[eosCategory] || EOS_CONTEXT.general}

Output ONLY the post content. No preamble, no commentary, no markdown wrappers.`;
}

serve(async (req) => {
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

    const { mode, prompt, existingContent, eosCategory, tone } = await req.json();

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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
