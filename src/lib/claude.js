import { supabase } from './supabase';

/**
 * Generate AI-assisted draft via Supabase Edge Function.
 * The Edge Function holds the Anthropic API key — never exposed to the browser.
 *
 * @param {Object} params
 * @param {string} params.mode - 'draft' | 'refine' | 'hook' | 'cta'
 * @param {string} params.prompt - User's input or topic
 * @param {string} [params.existingContent] - For refine mode
 * @param {string} [params.eosCategory] - 'level10' | 'rocks' | 'vto' | 'people' | 'general'
 * @param {string} [params.tone] - 'authoritative' | 'conversational' | 'storytelling'
 */
export async function generateDraft({ mode, prompt, existingContent, eosCategory, tone }) {
  const { data, error } = await supabase.functions.invoke('claude-draft', {
    body: { mode, prompt, existingContent, eosCategory, tone }
  });

  if (error) throw new Error(error.message || 'AI draft failed');
  return data;
}

/**
 * Draft a 1:1 outreach message for a lead.
 * @param {Object} params
 * @param {'connection'|'inmail'} params.kind
 * @param {Object} params.lead - row from public.leads
 * @param {Object} [params.post] - { content, linkedin_url } of a library post to share
 * @param {string} [params.angle] - optional direction from Shannon
 * @param {string} [params.existing] - current draft, to rework instead of starting over
 * @returns {Promise<{subject: string, body: string}>}
 */
export async function generateOutreach({ kind, lead, post, angle, existing }) {
  const { full_name, title, headline, company, company_size, industry, location } = lead;
  const { data, error } = await supabase.functions.invoke('claude-draft', {
    body: {
      mode: kind,
      lead: { full_name, title, headline, company, company_size, industry, location },
      post: post ? { content: post.content, linkedin_url: post.linkedin_url } : undefined,
      prompt: angle,
      existingContent: existing
    }
  });

  if (error) throw new Error(error.message || 'AI draft failed');
  if (data?.error) throw new Error(data.error);
  return data;
}
