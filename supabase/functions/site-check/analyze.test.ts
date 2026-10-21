// Run: deno test supabase/functions/site-check/analyze.test.ts
import { analyze, isFrameable } from './analyze.ts';

function eq(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected ${e}\n  actual   ${a}`);
}
const labels = (r: ReturnType<typeof analyze>) => r.signals.map((s) => `${s.level}:${s.label}`);
const body = (inner: string) => `<html><head>${inner}</head><body>${'Real company copy about services and team. '.repeat(10)}</body></html>`;

Deno.test('live company site', () => {
  const r = analyze({
    requestedUrl: 'https://brightline.com/',
    finalUrl: 'https://www.brightline.com/',
    status: 200,
    headers: {},
    html: body(`<title>Brightline Mechanical | Tampa HVAC</title><meta name="description" content="Commercial HVAC &amp; plumbing since 1998."><meta property="og:image" content="/og.jpg">`)
  });
  eq(labels(r), ['good:Live site']);
  eq(r.title, 'Brightline Mechanical | Tampa HVAC');
  eq(r.description, 'Commercial HVAC & plumbing since 1998.');
  eq(r.image, 'https://www.brightline.com/og.jpg');
  eq(r.frameable, true);
});

Deno.test('parked domain via marketplace redirect', () => {
  const r = analyze({ requestedUrl: 'https://acme-consulting.com/', finalUrl: 'https://www.hugedomains.com/domain_profile.cfm?d=acme-consulting.com', status: 200, headers: {}, html: body('<title>acme-consulting.com is for sale</title>') });
  eq(labels(r)[0], 'bad:Parked / domain for sale');
});

Deno.test('parked by page text', () => {
  const r = analyze({ requestedUrl: 'https://webbco.net/', finalUrl: 'https://webbco.net/', status: 200, headers: {}, html: '<html><title>webbco.net</title><body>This domain may be for sale. Buy this domain today.</body></html>' });
  eq(labels(r), ['bad:Parked / domain for sale']);
});

Deno.test('coming soon page and http only', () => {
  const r = analyze({ requestedUrl: 'http://newco.io/', finalUrl: 'http://newco.io/', status: 200, headers: {}, html: body('<title>Coming Soon</title>') });
  eq(labels(r), ['warn:Coming soon / unfinished', 'warn:No HTTPS']);
});

Deno.test('redirect to a different company', () => {
  const r = analyze({ requestedUrl: 'https://oldname.com/', finalUrl: 'https://acquirer.com/about', status: 200, headers: {}, html: body('<title>Acquirer</title>') });
  eq(labels(r), ['warn:Redirects to acquirer.com']);
});

Deno.test('co.uk subdomain is not treated as off-domain', () => {
  const r = analyze({ requestedUrl: 'https://smith.co.uk/', finalUrl: 'https://shop.smith.co.uk/', status: 200, headers: {}, html: body('<title>Smith</title>') });
  eq(labels(r), ['good:Live site']);
});

Deno.test('error status', () => {
  const r = analyze({ requestedUrl: 'https://gone.com/', finalUrl: 'https://gone.com/', status: 503, headers: {}, html: '' });
  eq(labels(r), ['bad:Site returns 503']);
  eq(r.reachable, false);
});

Deno.test('frame blocking headers', () => {
  eq(isFrameable({ 'X-Frame-Options': 'SAMEORIGIN' }), false, 'xfo sameorigin');
  eq(isFrameable({ 'x-frame-options': 'DENY' }), false, 'xfo deny');
  eq(isFrameable({ 'content-security-policy': "default-src 'self'; frame-ancestors 'self' https://partner.com" }), false, 'csp self');
  eq(isFrameable({ 'content-security-policy': 'frame-ancestors *' }), true, 'csp star');
  eq(isFrameable({ 'content-security-policy': "default-src 'self'" }), true, 'csp without frame-ancestors');
  eq(isFrameable({}), true, 'no headers');
});
