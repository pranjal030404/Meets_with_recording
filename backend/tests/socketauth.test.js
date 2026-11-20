import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
process.env.JWT_SECRET = 'test-secret';
process.env.SOCKET_AUTH_CACHE_MS = '200';
const { default: User } = await import('../src/models/User.js');
const { verifySocketToken, _clearSocketAuthCache } = await import('../src/middleware/auth.js');
const { revokeToken } = await import('../src/lib/sessionRevocation.js');

let lookups = 0, row = { id: 'u1', isActive: true };
User.findByPk = async () => { lookups++; return row; };
const tok = () => jwt.sign({ id: 'u1' }, 'test-secret', { expiresIn: '1h' });

test('handshake storm: one DB lookup per window; suspension applies after the window; revocation is immediate', async () => {
  _clearSocketAuthCache(); lookups = 0;
  const t = tok();
  await Promise.all(Array.from({ length: 50 }, () => verifySocketToken(t)));
  assert.ok(lookups <= 50 && (await verifySocketToken(t)) === row);
  const before = lookups;
  for (let i = 0; i < 20; i++) await verifySocketToken(t);
  assert.equal(lookups, before, 'served from cache');
  row = { id: 'u1', isActive: false };
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(await verifySocketToken(t), null, 'suspended user rejected once the cache window passes');
  row = { id: 'u1', isActive: true }; _clearSocketAuthCache();
  const t2 = jwt.sign({ id: 'u1', n: 2 }, 'test-secret', { expiresIn: '1h' });
  assert.ok(await verifySocketToken(t2));
  await revokeToken(t2);
  assert.equal(await verifySocketToken(t2), null, 'revoked token rejected even while cached');
});
