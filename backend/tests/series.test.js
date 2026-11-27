import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSeries, hiddenSeriesDates } from '../src/services/meetingSeries.js';

const HOUR = 3600e3;
const now = Date.parse('2030-01-10T10:00:00Z');
const row = (id, hours, seriesId = 's', status = 'scheduled') => ({
  id, status, scheduledAt: new Date(now + hours * HOUR), recurrence: seriesId ? { seriesId } : { enabled: false }
});

test('a list keeps only the next date of each series', () => {
  const rows = [row('b', 48), row('a', 24), row('c', 72), row('x', 30, 't'), row('y', 60, 't'), row('one', 90, null), row('done', -24, 's', 'ended')];
  assert.deepEqual(hiddenSeriesDates(rows, now).sort(), ['b', 'c', 'y']);
});

test('a date that is a few hours late does not hide the next one; long missed dates are left out', () => {
  const rows = [row('missed', -30), row('late', -3), row('next', 21), row('later', 45)];
  assert.deepEqual(hiddenSeriesDates(rows, now).sort(), ['later', 'missed']);
});

test('repeat requests are validated', () => {
  const dates = ['2030-01-01T10:00:00Z', '2030-01-02T10:00:00Z'];
  assert.equal(parseSeries({ enabled: false }), null);
  assert.equal(parseSeries({ frequency: 'daily', dates }).dates.length, 2);
  assert.ok(parseSeries({ frequency: 'hourly', dates }).error);
  assert.ok(parseSeries({ frequency: 'daily', dates: [...dates].reverse() }).error);
  assert.ok(parseSeries({ frequency: 'daily', dates: Array(53).fill(dates[0]) }).error);
});
