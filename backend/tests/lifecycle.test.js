import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPresent, presentParticipants } from '../src/services/meetingLifecycle.js';
import { meetingMachine, transcriptionMachine } from '../src/lib/stateMachines.js';

test('seeded host/invitee entries (no joinedAt) are not counted as present', () => {
  const meeting = { participants: [
    { userId: 'host', role: 'host' },                                   // scheduled-meeting seed
    { userId: 'invitee', role: 'participant' },                         // accepted, never joined
    { userId: 'a', joinedAt: '2026-01-01T00:00:00Z' },                  // in the call
    { userId: 'b', joinedAt: '2026-01-01T00:00:00Z', leftAt: '2026-01-01T00:05:00Z' } // left
  ] };
  assert.deepEqual(presentParticipants(meeting).map((p) => p.userId), ['a']);
  assert.equal(isPresent({ joinedAt: 'x' }), true);
  assert.equal(isPresent({}), false);
});

test('meeting machine: ended/cancelled are terminal', () => {
  assert.doesNotThrow(() => meetingMachine.assertTransition('scheduled', 'active'));
  assert.throws(() => meetingMachine.assertTransition('ended', 'active'));
  assert.throws(() => meetingMachine.assertTransition('cancelled', 'active'));
});

test('transcription machine: a retry goes failed -> queued', () => {
  assert.doesNotThrow(() => transcriptionMachine.assertTransition('failed', 'queued'));
});
