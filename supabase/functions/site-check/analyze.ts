// Pure analysis of a fetched homepage (unit-tested in analyze.test.ts).

export interface Signal {
  level: 'good' | 'warn' | 'bad' | 'info';
  label: string;
}

export interface SiteReport {
  reachable: boolean;
  requestedUrl: string;
  finalUrl: string;
  finalHost: string;
  status: number;
  frameable: boolean;
  title: string | null;
  description: string | null;
  siteName: string | null;
  image: string | null;
  signals: Signal[];
}

const PARKING_HOSTS = [
  'sedo.com', 'sedoparking.com', 'afternic.com', 'dan.com', 'hugedomains.com', 'godaddy.com',
  'parkingcrew.net', 'bodis.com', 'above.com', 'undeveloped.com', 'squadhelp.com', 'atom.com', 'brandbucket.com'
];

const PARKED_TEXT = [
  /this domain (name )?(is|may be) for sale/i,
  /buy this domain/i,
  /domain (is )?parked/i,
  /parked (free|domain)/i,
  /make an offer on this domain/i,
  /the domain .{1,60} is for sale/i,
  /hugedomains|afternic|sedo\.com|dan\.com\/buy/i
];

const UNFINISHED_TEXT = [
  /coming soon/i,
  /under construction/i,
  /launching soon/i,
  /site is being (built|updated)/i,
  /just another wordpress site/i,
  /welcome to (your|my) new (site|website)/i,
  /this is a placeholder/i
];

const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, '');

/** Rough registrable domain: last two labels, or three for co.uk-style suffixes. */
function baseDomain(host: string) {
  const parts = bareHost(host).split('.');
  const twoPartSuffix = parts.length > 2 && /^(co|com|net|org|ac|gov)$/.test(parts[parts.length - 2]) && parts[parts.length - 1].length === 2;
  return parts.slice(twoPartSuffix ? -3 : -2).join('.');
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function meta(html: string, ...names: string[]) {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`,
      'i'
    );
    const m = html.match(re);
    const v = m?.[1] ?? m?.[2];
    if (v?.trim()) return decodeEntities(v.trim());
  }
  return null;
}

export function isFrameable(headers: Record<string, string>) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const xfo = (h['x-frame-options'] ?? '').toLowerCase();
  if (xfo && /deny|sameorigin|allow-from/.test(xfo)) return false;
  const csp = h['content-security-policy'] ?? '';
  const fa = csp.split(';').map((d) => d.trim()).find((d) => /^frame-ancestors\b/i.test(d));
  if (fa) {
    const sources = fa.split(/\s+/).slice(1);
    return sources.includes('*') || sources.includes('https:');
  }
  return true;
}

export function analyze(input: {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  hops?: string[];
  headers: Record<string, string>;
  html: string;
}): SiteReport {
  const requested = new URL(input.requestedUrl);
  const final = new URL(input.finalUrl);
  const html = input.html ?? '';
  const signals: Signal[] = [];

  const title = (() => {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return m ? decodeEntities(m[1].replace(/\s+/g, ' ').trim()) || null : null;
  })();
  const description = meta(html, 'description', 'og:description', 'twitter:description');
  const siteName = meta(html, 'og:site_name', 'application-name');
  let image = meta(html, 'og:image', 'twitter:image');
  if (image) {
    try {
      image = new URL(image, final).toString();
    } catch {
      image = null;
    }
  }

  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
  const haystack = `${title ?? ''} ${description ?? ''} ${text.slice(0, 20000)}`;

  const finalHost = bareHost(final.hostname);
  const parkedHost = PARKING_HOSTS.some((p) => finalHost === p || finalHost.endsWith(`.${p}`));
  const parkedText = PARKED_TEXT.some((re) => re.test(haystack));
  const unfinished = UNFINISHED_TEXT.some((re) => re.test(haystack));
  const offDomain = baseDomain(final.hostname) !== baseDomain(requested.hostname);

  if (input.status >= 400) {
    signals.push({ level: 'bad', label: `Site returns ${input.status}` });
  }
  if (parkedHost || parkedText) {
    signals.push({ level: 'bad', label: 'Parked / domain for sale' });
  } else if (offDomain) {
    signals.push({ level: 'warn', label: `Redirects to ${finalHost}` });
  }
  if (unfinished && !parkedText) {
    signals.push({ level: 'warn', label: 'Coming soon / unfinished' });
  }
  if (final.protocol === 'http:') {
    signals.push({ level: 'warn', label: 'No HTTPS' });
  }
  if (input.status < 400 && text.length < 200 && !parkedText) {
    // Could be a JS-only site — worth a look, not a verdict
    signals.push({ level: 'info', label: 'Very little text' });
  }
  if (!signals.some((s) => s.level === 'bad' || s.level === 'warn')) {
    signals.unshift({ level: 'good', label: 'Live site' });
  }

  return {
    reachable: input.status < 400,
    requestedUrl: requested.toString(),
    finalUrl: final.toString(),
    finalHost,
    status: input.status,
    frameable: isFrameable(input.headers),
    title,
    description,
    siteName,
    image,
    signals
  };
}
