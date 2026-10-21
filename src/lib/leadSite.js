import { supabase } from './supabase';

// Webmail domains say nothing about where someone works
const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me', 'comcast.net', 'att.net',
  'verizon.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net', 'gmx.com', 'mail.com', 'zoho.com'
]);

const RAW_WEBSITE_KEYS = ['companywebsite', 'website', 'companyurl', 'companydomain', 'domain', 'url'];

const clean = (v) =>
  String(v ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();

const looksLikeDomain = (d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) && !/linkedin\.com$/.test(d);

/** Best guess at a lead's company website: domain column → raw import fields → work-email domain. */
export function leadWebsite(lead) {
  const direct = clean(lead.company_domain);
  if (looksLikeDomain(direct)) return { domain: direct, source: 'company' };

  if (lead.raw && typeof lead.raw === 'object') {
    for (const [k, v] of Object.entries(lead.raw)) {
      if (RAW_WEBSITE_KEYS.includes(k.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
        const d = clean(v);
        if (looksLikeDomain(d)) return { domain: d, source: 'company' };
      }
    }
  }

  const emailDomain = clean(String(lead.email ?? '').split('@')[1]);
  if (looksLikeDomain(emailDomain) && !FREEMAIL.has(emailDomain)) return { domain: emailDomain, source: 'email' };

  return null;
}

export async function checkSite(domain) {
  const { data, error } = await supabase.functions.invoke('site-check', { body: { url: domain } });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  if (data?.error && data.reachable !== false) throw new Error(data.error);
  return data;
}

// Free tier: 1,000 screenshots/month with no key. Swap the template (e.g. a
// paid screenshot API) with VITE_SCREENSHOT_URL_TEMPLATE; {url} is replaced.
const SCREENSHOT_TEMPLATE =
  import.meta.env.VITE_SCREENSHOT_URL_TEMPLATE || 'https://image.thum.io/get/width/1200/crop/900/{url}';

export const screenshotUrl = (url) => SCREENSHOT_TEMPLATE.replace('{url}', url);
