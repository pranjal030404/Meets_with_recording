import test from 'node:test';
import assert from 'node:assert/strict';
import { modeFor, limitsFor, decideConsume, policyConfig, preferredSpatialLayer } from '../src/media/subscriptionPolicy.js';

const cfg = policyConfig();
const base = { kind: 'video', mediaType: 'video', current: { audio: 0, video: 0, screen: 0 }, requesterIsManager: false, ownerIsManager: false, priority: false };

test('mode thresholds', () => {
  assert.equal(modeFor({ participantCount: 5 }), 'small');
  assert.equal(modeFor({ participantCount: cfg.smallMax + 1 }), 'medium');
  assert.equal(modeFor({ participantCount: cfg.mediumMax + 1 }), 'large');
  assert.equal(modeFor({ participantCount: 3, webinar: true }), 'webinar');
});

test('video budget is enforced and priority gets bounded extra room', () => {
  const lim = limitsFor('large');
  const full = { ...base, mode: 'large', current: { audio: 0, video: lim.maxVideo, screen: 0 } };
  assert.deepEqual(decideConsume(full), { allow: false, reason: 'video-limit' });
  assert.equal(decideConsume({ ...full, priority: true }).allow, true);
  const over = { ...full, priority: true, current: { audio: 0, video: lim.maxVideo + cfg.priorityExtra, screen: 0 } };
  assert.equal(decideConsume(over).allow, false); // priority is bounded, not a bypass
});

test('consumers per viewer stay bounded in a 1000-person meeting (O(N*budget), not O(N^2))', () => {
  const mode = modeFor({ participantCount: 1000 }), lim = limitsFor(mode);
  let video = 0, audio = 0;
  for (let p = 0; p < 999; p++) {          // one viewer tries to subscribe to everyone
    if (decideConsume({ ...base, mode, kind: 'video', current: { audio, video, screen: 0 } }).allow) video++;
    if (decideConsume({ ...base, mode, kind: 'audio', mediaType: 'audio', current: { audio, video, screen: 0 } }).allow) audio++;
  }
  assert.equal(video, lim.maxVideo); assert.equal(audio, lim.maxAudio);
  assert.ok(video + audio < 100); // vs 1998 for subscribe-to-all
});

test('screen share is always allowed within its own small budget, independent of the video budget', () => {
  const lim = limitsFor('large');
  const d = decideConsume({ ...base, mode: 'large', mediaType: 'screen', current: { audio: 99, video: lim.maxVideo, screen: 0 } });
  assert.equal(d.allow, true);
  assert.equal(decideConsume({ ...base, mode: 'large', mediaType: 'screen', current: { audio: 0, video: 0, screen: lim.maxScreen } }).allow, false);
});

test('webinar: attendees only get managers and screen share; managers see more', () => {
  const w = { ...base, mode: 'webinar' };
  assert.equal(decideConsume(w).reason, 'webinar-restricted');
  assert.equal(decideConsume({ ...w, kind: 'audio', mediaType: 'audio' }).reason, 'webinar-restricted');
  assert.equal(decideConsume({ ...w, ownerIsManager: true }).allow, true);
  assert.equal(decideConsume({ ...w, mediaType: 'screen' }).allow, true);
  assert.equal(decideConsume({ ...w, requesterIsManager: true }).allow, true);
});

test('preferred layer: pinned high, thumbnails low in big grids', () => {
  assert.equal(preferredSpatialLayer({ mode: 'large', pinned: true, tileCount: 9 }), 2);
  assert.equal(preferredSpatialLayer({ mode: 'large', activeSpeaker: true, tileCount: 9 }), 1);
  assert.equal(preferredSpatialLayer({ mode: 'large', tileCount: 16 }), 0);
  assert.equal(preferredSpatialLayer({ mode: 'small', tileCount: 3 }), 2);
});
