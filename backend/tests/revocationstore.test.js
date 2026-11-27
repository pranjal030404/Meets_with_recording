import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { revokeToken, revokeUserSessions, isRevoked, usePersistentStore, _forgetRevocations } from '../src/lib/sessionRevocation.js';

test('signed-out sessions stay signed out after a restart', async () => {
  const rows = new Map();
  const store = { save: async (key, value) => rows.set(key, value), load: async () => [...rows].map(([key, value]) => ({ key, value })) };
  await usePersistentStore(store);
  const sign = (id) => jwt.sign({ id, iat: Math.floor(Date.now() / 1000) - 10 }, 's', { expiresIn: '1h' });
  const out = sign('a'); const changed = sign('b'); const untouched = jwt.sign({ id: 'c' }, 's', { expiresIn: '1h' });
  await revokeToken(out);
  await revokeUserSessions('b');
  _forgetRevocations(); // restart
  assert.equal(await isRevoked(out), false, 'control: gone from memory');
  await usePersistentStore(store);
  assert.deepEqual([await isRevoked(out), await isRevoked(changed), await isRevoked(untouched)], [true, true, false]);
});
