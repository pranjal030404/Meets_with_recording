import test from 'node:test';
import assert from 'node:assert/strict';
console.log = () => {}; // service logs interleave with the test runner's IPC stream on stdout
process.env.MEDIASOUP_NUM_WORKERS = '2';
process.env.MEDIASOUP_MIN_PORT = '30000'; process.env.MEDIASOUP_MAX_PORT = '30999'; // own port range: test files run in parallel
process.env.MEDIASOUP_ANNOUNCED_IP = '127.0.0.1';
const { default: svc } = await import('../src/lib/mediasoup.js');

test('real worker: router gets an audio-level observer; worker load tracked; stats observable', async () => {
  await svc.init();
  const r = await svc.getRouter('real-room');
  assert.ok(r.appData.audioLevelObserver);
  assert.equal(svc.isActiveSpeaker('real-room', 'nope'), false);
  const s = svc.getStats();
  assert.equal(s.perWorker.length, 2);
  assert.ok('allowed' in s.subscriptions);
  await assert.rejects(() => svc.setConsumerLayers('missing', 0, 0));
});

test('real worker: worker death notifies lost rooms and is replaced', async () => {
  let lost = null;
  svc.onRoomsLost = (rooms, reason) => { lost = { rooms, reason }; };
  const r = await svc.getRouter('doomed-room');
  const w = r.appData.worker;
  process.kill(w.pid, 'SIGKILL');
  await new Promise((res) => setTimeout(res, 1500));
  assert.deepEqual(lost, { rooms: ['doomed-room'], reason: 'worker-died' });
  assert.equal(svc.workers.length, 2); // replacement spawned
});

test.after(async () => { await svc.close(); });
