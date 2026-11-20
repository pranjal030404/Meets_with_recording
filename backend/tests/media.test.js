import test from 'node:test';
import assert from 'node:assert/strict';
import RedisMock from 'ioredis-mock';
import RealRedis from 'ioredis';
import { setRedisFactory, getRedis, closeRedis } from '../src/infrastructure/redis/redisClient.js';
import { scoreNode, pickBestNode } from '../src/media/loadManager.js';
import { heartbeat, selfRecord, listNodes } from '../src/media/nodeRegistry.js';
import { resolveOwner, } from '../src/media/meetingPlacementService.js';
import { sweepDeadNodes } from '../src/media/meetingRecoveryService.js';
import { nodeConfig } from '../src/config/node.js';

const shared = process.env.REDIS_TEST_URL ? new RealRedis(process.env.REDIS_TEST_URL) : new RedisMock();
if (process.env.REDIS_TEST_URL) await shared.flushall();
setRedisFactory(() => shared.duplicate());

const limits = { cpu: 0.85, memory: 0.9, consumers: 1000, producers: null, transports: null, meetings: null, bandwidthMbps: null };
const weights = { cpu: 0.35, consumers: 0.25, bandwidth: 0.15, memory: 0.1, transports: 0.05, producers: 0.05, meetings: 0.05, regionMismatch: 0.5 };
const node = (o) => ({ nodeId: 'n', region: 'a', status: 'healthy', draining: false, ts: Date.now(), cpu: 0.2, memory: 0.3, consumers: 100, meetings: 1, ...o });
const ctx = { limits, weights, ttlMs: 15000 };

test('scoring: lower load wins; meeting count alone does not decide', () => {
  const busyFew = node({ nodeId: 'busy', meetings: 1, consumers: 900, cpu: 0.7 });   // 1 huge meeting
  const idleMany = node({ nodeId: 'idle', meetings: 50, consumers: 100, cpu: 0.2 }); // 50 small ones
  assert.equal(pickBestNode([busyFew, idleMany], ctx).node.nodeId, 'idle');
});
test('scoring: excludes unhealthy, draining, stale, and at-capacity nodes', () => {
  assert.equal(scoreNode(node({ status: 'unhealthy' }), ctx), null);
  assert.equal(scoreNode(node({ draining: true }), ctx), null);
  assert.equal(scoreNode(node({ ts: Date.now() - 60000 }), ctx), null);
  assert.equal(scoreNode(node({ consumers: 1000 }), ctx), null);
  assert.equal(scoreNode(node({ cpu: 0.9 }), ctx), null);
});
test('scoring: unlimited dimensions are ignored; region mismatch penalised', () => {
  assert.ok(scoreNode(node({ producers: 9e9 }), ctx) != null);
  const near = node({ nodeId: 'near', region: 'eu', cpu: 0.5 }), far = node({ nodeId: 'far', region: 'us', cpu: 0.1 });
  assert.equal(pickBestNode([near, far], { ...ctx, region: 'eu' }).node.nodeId, 'near');
});
test('scoring: deterministic tie-break', () => {
  assert.equal(pickBestNode([node({ nodeId: 'b' }), node({ nodeId: 'a' })], ctx).node.nodeId, 'a');
});

const register = (id, o = {}) => heartbeat({ ...selfRecord({ cpu: 0.1, memory: 0.2, consumers: 0, meetings: 0, transports: 0, producers: 0, workers: 4, bandwidthMbps: null }), nodeId: id, url: `https://${id}.test`, ...o });

test('placement: one consistent owner under concurrent first joins (affinity)', async () => {
  await register('n1'); await register('n2'); await register('n3');
  const results = await Promise.all(Array.from({ length: 20 }, () => resolveOwner('room-A')));
  assert.equal(new Set(results.map((r) => r.nodeId)).size, 1);
  assert.equal((await resolveOwner('room-A')).nodeId, results[0].nodeId);
});
test('placement: breakout rooms co-locate with the parent meeting', async () => {
  const { makeBreakoutRoomId } = await import('../src/lib/breakoutRoomId.js');
  await register('n1'); await register('n2');
  const parent = await resolveOwner('room-B');
  const br = await resolveOwner(makeBreakoutRoomId('room-B', '123e4567-e89b-12d3-a456-426614174000'));
  assert.equal(br.nodeId, parent.nodeId);
});
test('placement: new meetings avoid the loaded node', async () => {
  await register('n1', { consumers: 900, cpu: 0.8 }); await register('n2', { consumers: 10 }); await register('n3', { consumers: 10, draining: '1' });
  nodeConfig.limits.consumers = 1000;
  const o = await resolveOwner('room-C');
  assert.equal(o.nodeId, 'n2');
});
test('failure: dead owner is detected, meeting reassigned to a healthy node', async () => {
  await register('n1'); await register('n2');
  const owner = (await resolveOwner('room-D')).nodeId;
  const other = owner === 'n1' ? 'n2' : 'n1';
  await getRedis().del(`sfu:node:${owner}`); // heartbeat TTL expiry == node death
  const report = await sweepDeadNodes();
  assert.ok(report.some((r) => r.nodeId === owner && r.meetings.includes('room-D')));
  assert.ok(!(await listNodes()).some((n) => n.nodeId === owner));
  await register(other);
  const again = await resolveOwner('room-D');
  assert.equal(again.nodeId, other);
});
test('failure: stale-but-present owner record is reassigned via compare-and-set', async () => {
  await register('s1'); await register('s2');
  const first = (await resolveOwner('room-E')).nodeId;
  await register(first, { status: 'unhealthy' });
  const other = first === 's1' ? 's2' : 's1'; await register(other);
  const second = await resolveOwner('room-E');
  assert.notEqual(second.nodeId, first);
});
test('placement fails closed (null) when no node has capacity', async () => {
  for (const k of await getRedis().smembers('sfu:nodes')) await getRedis().del(`sfu:node:${k}`);
  assert.equal(await resolveOwner('room-F'), null);
});
test.after(async () => { await closeRedis(); shared.disconnect(); });
