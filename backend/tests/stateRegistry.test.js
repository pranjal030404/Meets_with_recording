import test from 'node:test';
import assert from 'node:assert/strict';
import { trackState, stateSizes } from '../src/lib/stateRegistry.js';

test('registry reports sizes for Maps, Sets and arrays', () => {
  const m = trackState('t-map', new Map([[1, 1]]), 'room');
  const a = trackState('t-arr', [1, 2, 3]);
  assert.equal(stateSizes()['t-map'].size, 1);
  assert.equal(stateSizes()['t-arr'].size, 3);
  m.clear(); a.length = 0;
  assert.equal(stateSizes()['t-map'].size, 0);
  assert.equal(stateSizes()['t-arr'].size, 0);
});

test('every per-process store in the socket layer is registered', async () => {
  await import('../src/sockets/index.js'); await import('../src/routes/ai.js');
  const names = Object.keys(stateSizes());
  for (const n of ['roomParticipants', 'roomTranscripts', 'restoredRooms', 'userTransports', 'userConsumers', 'userProducers', 'socketUserCache', 'translationCache']) {
    assert.ok(names.includes(n), `${n} not registered`);
  }
});
