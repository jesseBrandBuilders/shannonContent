// Run: deno test supabase/functions/weekly-batch/plan.test.ts
import { planSlots, pickTopics, zonedToUtc } from './plan.ts';

function eq(actual: unknown, expected: unknown, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected ${e}\n  actual   ${a}`);
}

const TZ = 'America/New_York';

Deno.test('8:30 in New York converts correctly on both sides of DST', () => {
  eq(zonedToUtc({ y: 2026, m: 10, d: 27 }, '08:30', TZ).toISOString(), '2026-10-27T12:30:00.000Z', 'EDT');
  eq(zonedToUtc({ y: 2026, m: 11, d: 3 }, '08:30', TZ).toISOString(), '2026-11-03T13:30:00.000Z', 'EST');
});

Deno.test('picks next Tue/Wed/Thu from a Wednesday afternoon', () => {
  // Wed Oct 21 2026, 3:40pm ET
  const slots = planSlots({ now: new Date('2026-10-21T19:40:00Z'), count: 3, postingDays: [2, 3, 4], postingTime: '08:30', timezone: TZ });
  eq(slots.map((s) => s.label), ['Thu Oct 22', 'Tue Oct 27', 'Wed Oct 28']);
});

Deno.test('skips days that already have a post', () => {
  const slots = planSlots({
    now: new Date('2026-10-21T19:40:00Z'),
    count: 3,
    postingDays: [2, 3, 4],
    postingTime: '08:30',
    timezone: TZ,
    taken: ['2026-10-22T12:30:00Z', '2026-10-27T12:30:00Z']
  });
  eq(slots.map((s) => s.label), ['Wed Oct 28', 'Thu Oct 29', 'Tue Nov 3']);
});

Deno.test('spills onto other weekdays when preferred days run out', () => {
  const slots = planSlots({ now: new Date('2026-10-23T14:00:00Z'), count: 5, postingDays: [3], postingTime: '09:00', timezone: TZ });
  eq(slots.length, 5);
  eq(slots.every((s) => !/^(Sat|Sun)/.test(s.label)), true, 'no weekend posts needed');
});

Deno.test('topics rotate least-covered first', () => {
  const recent = [{ eos_category: 'rocks' }, { eos_category: 'level10' }, { eos_category: 'rocks' }];
  eq(pickTopics(['level10', 'rocks', 'vto', 'people'], recent, 3), ['vto', 'people', 'level10']);
  eq(pickTopics(['rocks'], [], 3), ['rocks', 'rocks', 'rocks']);
});
