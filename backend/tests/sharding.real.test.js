import test from 'node:test';
import assert from 'node:assert/strict';
console.log = () => {}; // service logs interleave with the test runner's IPC stream on stdout
process.env.MEDIASOUP_NUM_WORKERS = '3';
process.env.MEDIASOUP_MIN_PORT = '31000'; process.env.MEDIASOUP_MAX_PORT = '31999'; // own port range: test files run in parallel
process.env.MEDIASOUP_ANNOUNCED_IP = '127.0.0.1';
process.env.MEDIASOUP_SHARD_TRANSPORTS = '2';
const { default: svc } = await import('../src/lib/mediasoup.js');

const opus = { mid: '0', codecs: [{ mimeType: 'audio/opus', payloadType: 111, clockRate: 48000, channels: 2, parameters: { minptime: 10, useinbandfec: 1 } }], encodings: [{ ssrc: 11111111 }] };
const caps = () => svc.routers.get('big').rtpCapabilities;

test('a room spreads over several workers and media is piped between shards', async () => {
  await svc.init();
  const t = [];
  for (let i = 0; i < 6; i++) t.push(await svc.createWebRtcTransport('big', i % 2 ? 'recv' : 'send'));
  const shards = svc.shards.get('big');
  assert.ok(shards.length >= 2, `expected >=2 shards, got ${shards.length}`);
  assert.equal(new Set(shards.map((r) => r.appData.worker)).size, shards.length, 'each shard on a different worker');
  assert.ok(shards.every((r) => r.appData.transports <= 2), 'threshold respected');

  // producer on transport 0's shard; consumer transports on every other shard
  const src = svc.transports.get(t[0].id);
  const { id: producerId } = await svc.produce(t[0].id, 'audio', opus, { mediaType: 'audio', userId: 'u1' });
  const consumerShards = new Set();
  let piped = 0;
  for (const tr of t.slice(1)) {
    const transport = svc.transports.get(tr.id);
    const cp = await svc.consume('big', tr.id, producerId, caps());
    assert.ok(cp.id && cp.kind === 'audio');
    consumerShards.add(transport.appData.router);
    if (transport.appData.router !== src.appData.router) piped++;
  }
  assert.ok(piped > 0, 'at least one consumer was on a different shard than the producer');
  // forwarded across a shard boundary once per target shard, not once per consumer
  const crossKeys = [...svc._piped.keys()].filter((k) => k.startsWith(producerId));
  assert.equal(crossKeys.length, consumerShards.size - (consumerShards.has(src.appData.router) ? 1 : 0));
  const st = svc.getStats();
  assert.ok(st.shardedRooms >= 1 && st.shards >= 2);
});

test('closing the room closes every shard; producer close removes pipe bookkeeping', async () => {
  const [producerId] = [...svc.producers.keys()];
  svc.producers.get(producerId).close();
  assert.equal([...svc._piped.keys()].filter((k) => k.startsWith(producerId)).length, 0);
  const shards = [...svc.shards.get('big')];
  svc.closeRouter('big');
  assert.ok(shards.every((r) => r.closed));
  assert.equal(svc.shards.has('big'), false);
});

test('worker death on ANY shard reports the whole room lost', async () => {
  let lost = null; svc.onRoomsLost = (rooms, reason) => { lost = { rooms, reason }; };
  for (let i = 0; i < 4; i++) await svc.createWebRtcTransport('r2', 'send');
  const shards = svc.shards.get('r2'); assert.ok(shards.length >= 2);
  process.kill(shards[1].appData.worker.pid, 'SIGKILL');   // kill a NON-primary shard's worker
  await new Promise((r) => setTimeout(r, 1500));
  assert.deepEqual(lost, { rooms: ['r2'], reason: 'worker-died' });
  assert.equal(svc.shards.has('r2'), false);
  assert.equal(svc.workers.length, 3);
});

test('with sharding disabled a room stays on one worker', async () => {
  svc.shardTransportThreshold = 0;
  for (let i = 0; i < 5; i++) await svc.createWebRtcTransport('small', 'send');
  assert.equal(svc.shards.get('small').length, 1);
});

test.after(async () => { await svc.close(); });
