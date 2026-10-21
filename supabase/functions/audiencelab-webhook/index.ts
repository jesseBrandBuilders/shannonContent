// Supabase Edge Function — receives leads pushed from AudienceLab (AudienceSync
// HTTP endpoint destination) and upserts them into public.leads.
//
// Deploy:   supabase functions deploy audiencelab-webhook --no-verify-jwt
// URL:      https://<project-ref>.supabase.co/functions/v1/audiencelab-webhook?token=<lead_sources.webhook_token>
//           (the Leads → Sources panel in the app shows the full URL to paste into AudienceLab)
//
// The token identifies which workspace + source the records belong to, so
// this function needs no user JWT. It runs with the service-role key, which
// Supabase injects automatically as SUPABASE_SERVICE_ROLE_KEY.
//
// Accepts a single record, an array of records, or { records | data | contacts | leads | items: [...] }.
// Records without a LinkedIn profile URL are skipped.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { mapLeadRecord, extractRecords, dedupeByLinkedIn } from '../_shared/leadFields.js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const CHUNK = 500;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('x-webhook-token');

  if (!token) return json({ error: 'missing token' }, 401);

  const { data: source, error: sourceErr } = await supabase
    .from('lead_sources')
    .select('id, workspace_id, records_received')
    .eq('webhook_token', token)
    .maybeSingle();

  if (sourceErr) return json({ error: 'lookup failed' }, 500);
  if (!source) return json({ error: 'invalid token' }, 401);

  // AudienceLab (and most webhook UIs) ping the URL when you save the destination
  if (req.method === 'GET' || req.method === 'HEAD') return json({ ok: true });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'body must be JSON' }, 400);
  }

  const records = extractRecords(payload);
  const mapped = records.map(mapLeadRecord).filter(Boolean) as Record<string, unknown>[];
  const rows = dedupeByLinkedIn(mapped).map((r) => ({
    ...r,
    workspace_id: source.workspace_id,
    source_id: source.id,
    source: 'audiencelab'
  }));

  let imported = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error, count } = await supabase
      .from('leads')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'workspace_id,linkedin_url', count: 'exact' });
    if (error) {
      console.error('upsert failed', error);
      return json({ error: 'upsert failed', detail: error.message, imported }, 500);
    }
    imported += count ?? 0;
  }

  await supabase
    .from('lead_sources')
    .update({
      records_received: source.records_received + records.length,
      last_received_at: new Date().toISOString()
    })
    .eq('id', source.id);

  return json({ received: records.length, imported, skipped_no_linkedin: records.length - mapped.length });
});
