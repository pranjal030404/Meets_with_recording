import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSettings } from '../src/lib/meetingSettings.js';

test('settings whitelist drops unknown keys and wrong types, clamps participants', () => {
  assert.deepEqual(sanitizeSettings({ webinar: true, isLocked: 'yes', evil: { $set: 1 }, __proto__: { x: 1 }, accessType: 'hax', maxParticipants: 999999 }), { webinar: true, maxParticipants: 10000 });
  assert.deepEqual(sanitizeSettings({ accessType: 'open', muteOnEntry: false }), { accessType: 'open', muteOnEntry: false });
  for (const bad of [null, undefined, 'str', 5, [1, 2]]) assert.deepEqual(sanitizeSettings(bad), {});
  assert.deepEqual(sanitizeSettings({ maxParticipants: 0 }), {});
});
