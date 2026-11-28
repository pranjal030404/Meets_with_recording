/**
 * Date arithmetic the web client uses for repeating meetings (frontend/src/lib/recurrence.js).
 * Runs in a daylight-saving timezone: TZ=America/New_York.
 */
process.env.TZ = 'America/New_York';
import test from 'node:test';
import assert from 'node:assert/strict';
const { occurrences, shiftDates } = await import('../../../frontend/src/lib/recurrence.js');

const day = (d) => d.getDay();
const hm = (d) => [d.getHours(), d.getMinutes()];

test('TC-WEB-001 daily and weekly keep local time across a clock change', () => {
  for (const f of ['daily', 'weekly']) for (const d of occurrences(new Date(2027, 2, 12, 10, 0), f, 6)) assert.deepEqual(hm(d), [10, 0]);
});
test('TC-WEB-002 monthly on the 31st skips short months', () => {
  assert.deepEqual(occurrences(new Date(2027, 0, 31, 9), 'monthly', 4).map((d) => d.getMonth()), [0, 2, 4, 6]);
});
test('TC-WEB-003 weekdays never lands on a weekend', () => {
  assert.ok(occurrences(new Date(2027, 0, 1, 9), 'weekdays', 20).every((d) => day(d) % 6 !== 0));
});
test('TC-WEB-004 moving a whole "every weekday" series by a day never puts a date on a weekend', () => {
  const dates = occurrences(new Date(2027, 0, 4, 9), 'weekdays', 10); // Mon..
  const moved = shiftDates(dates, new Date(2027, 0, 5, 9), 'weekdays');
  const weekend = moved.filter((d) => day(d) % 6 === 0).map((d) => d.toDateString());
  assert.deepEqual(weekend, []);
});
test('TC-WEB-005 moving a series keeps dates strictly in order across a clock change', () => {
  const dates = occurrences(new Date(2027, 2, 12, 9), 'daily', 5);
  const moved = shiftDates(dates, new Date(2027, 2, 12, 2, 30));
  assert.ok(moved.every((d, i) => i === 0 || d > moved[i - 1]));
});
test('TC-WEB-006 monthly series moved from the 15th to the 31st keeps one date per month', () => {
  const dates = occurrences(new Date(2027, 0, 15, 9), 'monthly', 4);
  const moved = shiftDates(dates, new Date(2027, 0, 31, 9), 'monthly');
  assert.equal(new Set(moved.map((d) => d.getMonth())).size, moved.length, moved.map((d) => d.toDateString()).join(', '));
});
