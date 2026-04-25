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
