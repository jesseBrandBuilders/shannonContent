// Supabase Edge Function — quick "is this company real?" check for a lead's website.
// Deploy: supabase functions deploy site-check
//
// Fetches the homepage server-side (the browser can't read cross-origin
// pages) and returns what the Leads page needs to spot posers fast:
// live or down, where it redirects, parked / for-sale / coming-soon pages,
// page title and description, and whether the site allows being shown in
// an iframe (many send X-Frame-Options or CSP frame-ancestors, which make
// an iframe render blank).
//
// Requires a signed-in user (verify_jwt on), and refuses private/loopback
// hosts so it can't be used to probe internal networks.

import { analyze } from './analyze.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const TIMEOUT_MS = 8000;
const MAX_BYTES = 400_000;

function normalizeTarget(input: string): URL | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u;
  } catch {
    return null;
  }
}

function isPrivateHost(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (!h.includes('.') && !h.includes(':')) return true; // single-label names
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.includes(':')) return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
  return false;
}

async function readCapped(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  const buf = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    buf.set(c.subarray(0, Math.min(c.length, size - off)), off);
    off += c.length;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

/** Follows redirects by hand so every hop is checked against private hosts. */
async function fetchSite(start: URL) {
  let url = start;
  const hops: string[] = [];
  for (let i = 0; i < 6; i++) {
    if (isPrivateHost(url.hostname)) throw new Error('blocked host');
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      hops.push(url.toString());
      url = new URL(loc, url);
      res.body?.cancel();
      continue;
    }
    return { res, finalUrl: url, hops };
  }
  throw new Error('too many redirects');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const { url } = await req.json().catch(() => ({}));
  const target = normalizeTarget(url);
  if (!target) return json({ error: 'Not a valid website address' }, 400);
  if (isPrivateHost(target.hostname)) return json({ error: 'That address isn’t a public website' }, 400);

  const tryFetch = async (u: URL) => {
    const { res, finalUrl, hops } = await fetchSite(u);
    const type = res.headers.get('content-type') ?? '';
    const html = type.includes('html') ? await readCapped(res) : (res.body?.cancel(), '');
    return analyze({
      requestedUrl: target.toString(),
      finalUrl: finalUrl.toString(),
      status: res.status,
      hops,
      headers: Object.fromEntries(res.headers),
      html
    });
  };

  try {
    return json(await tryFetch(target));
  } catch (err) {
    // Plenty of small-business sites still only answer on http
    if (target.protocol === 'https:') {
      try {
        const http = new URL(target);
        http.protocol = 'http:';
        return json(await tryFetch(http));
      } catch {
        /* report the original failure */
      }
    }
    const msg = err instanceof Error ? err.message : String(err);
    return json({
      reachable: false,
      requestedUrl: target.toString(),
      error: /timed? ?out|abort/i.test(msg) ? 'Timed out' : /dns|lookup|resolve|name/i.test(msg) ? 'Domain doesn’t resolve' : 'Couldn’t connect',
      signals: [{ level: 'bad', label: /dns|lookup|resolve|name/i.test(msg) ? 'Domain doesn’t resolve' : 'Site unreachable' }]
    });
  }
});
