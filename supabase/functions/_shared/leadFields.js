// Maps a raw contact record (AudienceLab webhook payload or CSV row) onto
// the `leads` table columns. Shared by the audiencelab-webhook Edge Function
// and the in-app CSV import, so both paths map fields identically.
//
// Header names vary between AudienceLab exports, AudienceSync payloads and
// hand-built CSVs ("LINKEDIN_URL", "LinkedIn Url", "linkedin"), so every key
// is compared after lowercasing and stripping non-alphanumerics.

const FIELD_CANDIDATES = {
  linkedin_url: [
    'linkedinurl', 'linkedin', 'linkedinprofile', 'linkedinprofileurl', 'personallinkedinurl',
    'individuallinkedinurl', 'profileurl', 'liurl'
  ],
  first_name: ['firstname', 'first', 'givenname', 'fname'],
  last_name: ['lastname', 'last', 'surname', 'familyname', 'lname'],
  full_name: ['fullname', 'name', 'contactname'],
  title: ['jobtitle', 'title', 'position', 'role', 'jobtitlenormalized'],
  headline: ['headline', 'linkedinheadline', 'professionalheadline'],
  company: ['companyname', 'company', 'organization', 'organisation', 'employer', 'account'],
  company_domain: ['companydomain', 'domain', 'companywebsite', 'website', 'companyurl'],
  company_size: [
    'companyemployeecount', 'companysize', 'employeecount', 'employees', 'numberofemployees',
    'companyemployees', 'headcount', 'companyheadcount', 'employeerange'
  ],
  industry: ['companyindustry', 'industry', 'sector'],
  email: ['businessemail', 'workemail', 'email', 'emailaddress', 'personalemail', 'personalemails'],
  location: ['location', 'personallocation', 'city', 'personalcity', 'companycity', 'region'],
  external_id: ['uuid', 'id', 'recordid', 'contactid', 'personid', 'audiencelabid']
};

const norm = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

function pick(index, candidates) {
  for (const c of candidates) {
    const v = index[c];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      // Some exports pack several emails into one cell: keep the first
      return String(v).split(/[,;]\s*/)[0].trim();
    }
  }
  return null;
}

export function looksLikeLinkedIn(url) {
  return !!url && /linkedin\.com\/(in|pub|sales\/lead|sales\/people)\//i.test(url);
}

/** Returns a leads row (without workspace/source columns), or null if the record has no usable LinkedIn URL. */
export function mapLeadRecord(record) {
  if (!record || typeof record !== 'object') return null;

  const index = {};
  for (const [k, v] of Object.entries(record)) {
    if (v !== null && typeof v === 'object') continue;
    const nk = norm(k);
    if (!(nk in index)) index[nk] = v;
  }

  let linkedin = pick(index, FIELD_CANDIDATES.linkedin_url);
  if (linkedin && !/^https?:\/\//i.test(linkedin) && /linkedin\.com/i.test(linkedin)) {
    linkedin = `https://${linkedin.replace(/^\/+/, '')}`;
  }
  if (!looksLikeLinkedIn(linkedin)) return null;

  const city = pick(index, FIELD_CANDIDATES.location);
  const state = pick(index, ['personalstate', 'state', 'companystate']);
  const location = city && state && !city.includes(state) ? `${city}, ${state}` : city || state;

  return {
    linkedin_url: linkedin,
    first_name: pick(index, FIELD_CANDIDATES.first_name),
    last_name: pick(index, FIELD_CANDIDATES.last_name),
    full_name: pick(index, FIELD_CANDIDATES.full_name),
    title: pick(index, FIELD_CANDIDATES.title),
    headline: pick(index, FIELD_CANDIDATES.headline),
    company: pick(index, FIELD_CANDIDATES.company),
    company_domain: pick(index, FIELD_CANDIDATES.company_domain),
    company_size: pick(index, FIELD_CANDIDATES.company_size),
    industry: pick(index, FIELD_CANDIDATES.industry),
    email: pick(index, FIELD_CANDIDATES.email),
    location: location || null,
    external_id: pick(index, FIELD_CANDIDATES.external_id),
    raw: record
  };
}

/** Accepts a single record, an array, or a wrapper object ({ records | data | contacts | leads | items: [...] }). */
export function extractRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    for (const key of ['records', 'data', 'contacts', 'leads', 'items', 'results', 'members']) {
      if (Array.isArray(payload[key])) return payload[key];
    }
    return [payload];
  }
  return [];
}

/** Same person twice in one batch breaks a Postgres upsert, so collapse by normalized URL. */
export function dedupeByLinkedIn(rows) {
  const seen = new Map();
  for (const r of rows) {
    const key = r.linkedin_url
      .toLowerCase()
      .replace(/^(https?:\/\/)?([a-z]{2,3}\.)?(www\.)?linkedin\.com\//, '')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '');
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, r);
      continue;
    }
    // Merge: a later duplicate fills gaps but never blanks out known fields
    const merged = { ...prev };
    for (const [k, v] of Object.entries(r)) {
      if (v !== null && v !== undefined && v !== '') merged[k] = v;
    }
    seen.set(key, merged);
  }
  return [...seen.values()];
}
