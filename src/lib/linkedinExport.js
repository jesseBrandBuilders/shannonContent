import Papa from 'papaparse';

// LinkedIn's "Download your data" archive (Settings → Data privacy → Get a
// copy of your data) includes Shares.csv: one row per post she wrote, with
// Date, ShareLink, ShareCommentary, SharedUrl, MediaUrl, Visibility.
// Accepts the .zip exactly as LinkedIn sends it, or Shares.csv on its own.

const MIN_CHARS = 80; // skip bare reshares and one-liners — too little voice signal

function normalizeCommentary(text) {
  let t = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  // Some exports double-encode the cell: wrapped in quotes with inner quotes
  // doubled. Only unwrap that case — a post can legitimately open with a quote.
  if (t.length > 1 && t.startsWith('"') && t.endsWith('"') && t.includes('""')) {
    t = t.slice(1, -1).replace(/""/g, '"').trim();
  }
  return t;
}

function rowsToSamples(rows) {
  return rows
    .map((r) => {
      const keyOf = (name) => Object.keys(r).find((k) => k.trim().toLowerCase() === name);
      const text = normalizeCommentary(r[keyOf('sharecommentary')] ?? r[keyOf('commentary')]);
      const dateRaw = r[keyOf('date')];
      const date = dateRaw ? new Date(dateRaw.replace(' ', 'T') + (/[zZ+]/.test(dateRaw) ? '' : 'Z')) : null;
      return {
        source: 'linkedin_export',
        content: text,
        posted_at: date && !Number.isNaN(date.valueOf()) ? date.toISOString() : null
      };
    })
    .filter((s) => s.content.length >= MIN_CHARS);
}

async function csvFromFile(file) {
  if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(file);
    const entry = Object.values(zip.files).find((f) => /(^|\/)shares\.csv$/i.test(f.name));
    if (!entry) {
      throw new Error(
        'No Shares.csv in that archive. Request the full archive from LinkedIn (not just connections), or upload Shares.csv directly.'
      );
    }
    return entry.async('string');
  }
  return file.text();
}

/** @returns {Promise<{source, content, posted_at}[]>} */
export async function parseLinkedInExport(file) {
  const csv = await csvFromFile(file);
  const { data, errors } = Papa.parse(csv, { header: true, skipEmptyLines: true });
  if (!data.length && errors.length) throw new Error(`Couldn’t read the CSV: ${errors[0].message}`);
  if (data.length && !Object.keys(data[0]).some((k) => /sharecommentary|commentary/i.test(k))) {
    throw new Error('That file doesn’t look like LinkedIn’s Shares.csv (no ShareCommentary column).');
  }
  return rowsToSamples(data);
}

/** Pasted text: separate several posts with a line containing only --- */
export function parsePastedSamples(text) {
  return text
    .split(/^\s*---+\s*$/m)
    .map((t) => t.trim())
    .filter((t) => t.length >= 40)
    .map((content) => ({ source: 'paste', content, posted_at: null }));
}
