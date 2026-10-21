// Pure planning helpers for weekly-batch (unit-tested in plan.test.ts).

const DAY_MS = 86_400_000;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface YMD {
  y: number;
  m: number; // 1-12
  d: number;
}

/** Calendar date of an instant in a given IANA time zone. */
export function localDate(instant: Date, timeZone: string): YMD {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

const ymdKey = ({ y, m, d }: YMD) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function addDays({ y, m, d }: YMD, n: number): YMD {
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** ISO weekday: 1 = Mon … 7 = Sun */
function isoWeekday({ y, m, d }: YMD) {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Wall-clock time on a date in a time zone → UTC instant (DST-safe). */
export function zonedToUtc(date: YMD, hhmm: string, timeZone: string): Date {
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(date.y, date.m - 1, date.d, hh, mm);
  // Offset of the zone at (roughly) that moment; apply twice to settle DST edges
  const offsetAt = (t: number) => {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).formatToParts(new Date(t));
    const g = (k: string) => Number(p.find((x) => x.type === k)!.value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - t;
  };
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return new Date(t);
}

export interface Slot {
  iso: string;
  label: string;
  dayIndex: number;
}

/**
 * The next `count` open posting slots, starting tomorrow (her time zone).
 * Prefers her posting days; if those can't fit `count` posts within two
 * weeks, spills onto other weekdays. Days that already hold a scheduled or
 * in-review post are skipped, so batches fill gaps instead of doubling up.
 */
export function planSlots(opts: {
  now: Date;
  count: number;
  postingDays: number[];
  postingTime: string;
  timezone: string;
  taken?: string[];
}): Slot[] {
  const { now, count, postingTime, timezone } = opts;
  const preferred = new Set(opts.postingDays?.length ? opts.postingDays : [2, 3, 4]);
  const taken = new Set((opts.taken ?? []).map((iso) => ymdKey(localDate(new Date(iso), timezone))));
  const today = localDate(now, timezone);

  const chosen: YMD[] = [];
  const pick = (allowed: (wd: number) => boolean, horizon: number) => {
    for (let i = 1; i <= horizon && chosen.length < count; i++) {
      const day = addDays(today, i);
      const key = ymdKey(day);
      if (taken.has(key) || chosen.some((c) => ymdKey(c) === key)) continue;
      if (allowed(isoWeekday(day))) chosen.push(day);
    }
  };

  pick((wd) => preferred.has(wd), 14);
  if (chosen.length < count) pick((wd) => wd <= 5, 14);
  if (chosen.length < count) pick(() => true, 28);

  return chosen
    .sort((a, b) => ymdKey(a).localeCompare(ymdKey(b)))
    .map((day, i) => {
      const wd = new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();
      return {
        iso: zonedToUtc(day, postingTime, timezone).toISOString(),
        label: `${WEEKDAY_SHORT[wd]} ${MONTH_SHORT[day.m - 1]} ${day.d}`,
        dayIndex: i
      };
    });
}

/**
 * Topics for the batch: least-covered first, then least-recent, so the mix
 * rotates through everything she has switched on.
 */
export function pickTopics(
  topics: string[],
  recent: { eos_category?: string | null }[],
  count: number
): string[] {
  const uses = new Map(topics.map((t) => [t, 0]));
  const lastSeen = new Map<string, number>(); // index in recent (0 = newest)
  recent.forEach((p, i) => {
    const c = p.eos_category ?? '';
    if (!uses.has(c)) return;
    uses.set(c, uses.get(c)! + 1);
    if (!lastSeen.has(c)) lastSeen.set(c, i);
  });

  const order = [...topics].sort(
    (a, b) =>
      uses.get(a)! - uses.get(b)! || (lastSeen.get(b) ?? Infinity) - (lastSeen.get(a) ?? Infinity)
  );
  return Array.from({ length: count }, (_, i) => order[i % order.length]);
}
