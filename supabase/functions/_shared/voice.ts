// Shannon's voice: everything a drafting prompt needs to sound like her.
// Used by claude-draft (Composer, outreach) and weekly-batch (autopilot).
//
// Sources, strongest first:
//   1. content_settings.voice_profile — a style guide distilled from her own
//      posts (built by claude-draft mode 'voice', editable in Autopilot)
//   2. A few of her real posts as examples (voice_samples)
//   3. Feedback loop: autopilot drafts she approved, and notes on ones she rejected
//   4. content_settings.guidance — what she wants to lean into right now

// deno-lint-ignore no-explicit-any
type Client = any;

export interface VoiceContext {
  profile: string | null;
  guidance: string | null;
  examples: string[];
  approved: string[];
  rejections: string[];
}

const EXAMPLE_COUNT = 5;
const EXAMPLE_MAX_CHARS = 1800;

export async function loadVoiceContext(supabase: Client, workspaceId: string): Promise<VoiceContext> {
  const [settings, samples, approved, rejected] = await Promise.all([
    supabase
      .from('content_settings')
      .select('voice_profile, guidance')
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    // Pull a wider pool, then keep the substantive ones
    supabase
      .from('voice_samples')
      .select('content')
      .eq('workspace_id', workspaceId)
      .order('posted_at', { ascending: false, nullsFirst: false })
      .limit(40),
    supabase
      .from('posts')
      .select('content')
      .eq('workspace_id', workspaceId)
      .eq('generated_by', 'autopilot')
      .in('status', ['scheduled', 'published'])
      .order('updated_at', { ascending: false })
      .limit(3),
    supabase
      .from('posts')
      .select('review_note')
      .eq('workspace_id', workspaceId)
      .eq('status', 'rejected')
      .not('review_note', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(8)
  ]);

  const examples = (samples.data ?? [])
    .map((s: { content: string }) => s.content.trim())
    .filter((c: string) => c.length >= 250)
    .slice(0, EXAMPLE_COUNT)
    .map((c: string) => c.slice(0, EXAMPLE_MAX_CHARS));

  return {
    profile: settings.data?.voice_profile?.trim() || null,
    guidance: settings.data?.guidance?.trim() || null,
    examples,
    approved: (approved.data ?? []).map((p: { content: string }) => p.content.slice(0, EXAMPLE_MAX_CHARS)),
    rejections: (rejected.data ?? [])
      .map((p: { review_note: string }) => p.review_note.trim())
      .filter(Boolean)
  };
}

/** Appended to a system prompt. Empty string when nothing has been learned yet. */
export function voiceBlock(ctx: VoiceContext | null): string {
  if (!ctx) return '';
  const parts: string[] = [];

  if (ctx.profile) {
    parts.push(
      `SHANNON'S VOICE — learned from her own posts. When this conflicts with the generic guidelines above, follow this.\n${ctx.profile}`
    );
  }
  if (ctx.examples.length) {
    parts.push(
      `Posts Shannon actually wrote (match their rhythm, structure and word choice; never copy their sentences or reuse their stories as new):\n` +
        ctx.examples.map((e, i) => `<example ${i + 1}>\n${e}\n</example ${i + 1}>`).join('\n')
    );
  }
  if (ctx.approved.length) {
    parts.push(
      `Drafts Shannon approved recently (this is the target):\n` +
        ctx.approved.map((e, i) => `<approved ${i + 1}>\n${e}\n</approved ${i + 1}>`).join('\n')
    );
  }
  if (ctx.rejections.length) {
    parts.push(`Feedback from drafts Shannon rejected — avoid these:\n` + ctx.rejections.map((r) => `- ${r}`).join('\n'));
  }
  if (ctx.guidance) {
    parts.push(`What Shannon wants to emphasize right now:\n${ctx.guidance}`);
  }

  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}

/** Prompt for distilling a style guide from her samples (claude-draft mode 'voice'). */
export function voiceProfilePrompts(samples: string[]) {
  const system = `You analyze a writer's LinkedIn posts and write a style guide another writer can follow to produce new posts that are indistinguishable from hers. The writer is Shannon Roberts, an EOS (Entrepreneurial Operating System) Implementer.

Be specific and evidence-based: describe what she actually does, with short quoted fragments (under 10 words) as illustrations. Skip generic advice that would apply to anyone.

Cover, as a compact bulleted guide under these headings:
- Hooks: how her first two lines work
- Structure & length: typical shape, paragraph length, line breaks, lists
- Sentence style: length, rhythm, person (I/you/we), contractions, questions
- Vocabulary: words and phrases she favors; EOS terms she uses and how she explains them
- Stories & proof: how she uses client situations, numbers, her own experience
- Closings: how she ends (questions, CTAs, sign-offs)
- Formatting habits: emojis, hashtags (how many, which), bold/caps, links
- Never: things she clearly avoids

Keep it under 450 words. Output only the guide.`;

  let budget = 40000;
  const picked: string[] = [];
  for (const s of samples) {
    if (budget - s.length < 0) break;
    picked.push(s);
    budget -= s.length;
  }

  const user = `Here are ${picked.length} of Shannon's posts, newest first:\n\n${picked
    .map((s, i) => `<post ${i + 1}>\n${s}\n</post ${i + 1}>`)
    .join('\n\n')}`;

  return { system, user, used: picked.length };
}

export async function callClaude(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{ text?: string; error?: string; status?: number }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1500,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }]
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
