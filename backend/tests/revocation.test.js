import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import RedisMock from 'ioredis-mock';
import RealRedis from 'ioredis';
import { setRedisFactory, closeRedis } from '../src/infrastructure/redis/redisClient.js';
import { revokeToken, revokeUserSessions, isRevoked } from '../src/lib/sessionRevocation.js';

const shared = process.env.REDIS_TEST_URL ? new RealRedis(process.env.REDIS_TEST_URL) : new RedisMock();
setRedisFactory(() => shared.duplicate());

test('logout revokes exactly that token, visible to every node (shared Redis)', async () => {
  const t1 = jwt.sign({ id: 'u1', n: 1 }, 'k', { expiresIn: '7d' }), t2 = jwt.sign({ id: 'u1', n: 2 }, 'k', { expiresIn: '7d' });
  assert.equal(await isRevoked(t1), false);
  await revokeToken(t1);
  assert.equal(await isRevoked(t1), true);
  assert.equal(await isRevoked(t2), false);
});

test('sign-out-everywhere rejects older tokens, accepts newer ones', async () => {
  const old = jwt.sign({ id: 'u2', iat: Math.floor(Date.now() / 1000) - 100 }, 'k', { expiresIn: '7d' });
  await revokeUserSessions('u2');
  assert.equal(await isRevoked(old), true);
  const fresh = jwt.sign({ id: 'u2', iat: Math.floor(Date.now() / 1000) + 5 }, 'k', { expiresIn: '7d' });
  assert.equal(await isRevoked(fresh), false);
});

test('Redis failure: fails open by default, closed when configured', async () => {
  const t = jwt.sign({ id: 'u3' }, 'k', { expiresIn: '1h' });
  const orig = shared.duplicate; const broken = { exists: () => { throw new Error('down'); }, get: () => { throw new Error('down'); }, set: () => { throw new Error('down'); } };
  await closeRedis(); setRedisFactory(() => Object.assign(broken, { on() {}, quit: async () => {}, disconnect() {} }));
  assert.equal(await isRevoked(t), false);
  process.env.SESSION_REVOCATION_FAIL_CLOSED = 'true';
  assert.equal(await isRevoked(t), true);
  delete process.env.SESSION_REVOCATION_FAIL_CLOSED;
  await closeRedis(); setRedisFactory(() => shared.duplicate());
});
test.after(async () => { await closeRedis(); shared.disconnect(); });
