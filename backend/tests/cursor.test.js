import test from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';
import { encodeCursor, decodeCursor, pageNewestFirst, olderThan } from '../src/lib/cursor.js';

test('cursor round-trips and rejects garbage', () => {
  const c = encodeCursor({ createdAt: '2026-01-01T00:00:00.000Z', id: 'abc' });
  const d = decodeCursor(c);
  assert.equal(d.id, 'abc'); assert.equal(d.createdAt.toISOString(), '2026-01-01T00:00:00.000Z');
  for (const bad of [null, '', 'x', 'e30', 'a'.repeat(400), Buffer.from('{"t":"nope","id":"1"}').toString('base64url')]) assert.equal(decodeCursor(bad), null);
});

test('keyset paging over rows with IDENTICAL timestamps loses nothing and repeats nothing', async () => {
  const t = new Date('2026-01-01T00:00:00Z');
  const all = Array.from({ length: 23 }, (_, i) => ({ id: String(100 - i).padStart(3, '0'), createdAt: i < 12 ? t : new Date(t - 1000) })); // newest first
  const run = (extra, n) => { // tiny in-memory evaluator of olderThan()
    const c = extra && extra[Op.or];
    let rows = all;
    if (c) { const [a, b] = c; rows = all.filter((r) => r.createdAt < a.createdAt[Op.lt] || (r.createdAt.getTime() === b.createdAt.getTime() && r.id < b.id[Op.lt])); }
    return Promise.resolve(rows.slice(0, n));
  };
  const seen = []; let cursor = null;
  for (let i = 0; i < 20; i++) {
    const { rows, nextCursor } = await pageNewestFirst({ cursor, limit: 5, query: (extra, n) => run(extra, n) });
    seen.push(...rows.map((r) => r.id)); cursor = nextCursor; if (!cursor) break;
  }
  assert.deepEqual(seen, all.map((r) => r.id));
});
