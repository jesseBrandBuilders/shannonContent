import { createClient } from '@supabase/supabase-js';

// Resolved at build time by vite.config.js (accepts VITE_* or the
// NEXT_PUBLIC_* / SUPABASE_* names Vercel's Supabase integration sets).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!supabaseConfigured) {
  console.error(
    'Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or connect the Vercel Supabase integration) and rebuild.'
  );
}

// createClient throws on an empty URL, which would blank the whole app before
// React can render the setup message, so fall back to an inert placeholder.
export const supabase = createClient(
  supabaseUrl || 'https://not-configured.invalid',
  supabaseAnonKey || 'not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
