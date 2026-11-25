import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPresent, presentParticipants, leaveOutcome } from '../src/services/meetingLifecycle.js';
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

test('leaving a scheduled meeting early does not end it', () => {
  const now = Date.parse('2026-01-01T10:00:00Z');
  const joined = '2026-01-01T09:00:00Z';
  const early = { hostId: 'h', scheduledAt: '2026-01-01T12:00:00Z', participants: [{ userId: 'h', joinedAt: joined, leftAt: joined }] };
  assert.equal(leaveOutcome(early, 'h', now), 'reschedule');
  // past its time, but the host never turned up
  const noHost = { hostId: 'h', scheduledAt: '2026-01-01T09:00:00Z', participants: [{ userId: 'h' }, { userId: 'g', joinedAt: joined, leftAt: joined }] };
  assert.equal(leaveOutcome(noHost, 'g', now), 'reschedule');
  // it really took place
  const held = { hostId: 'h', scheduledAt: '2026-01-01T09:00:00Z', participants: [{ userId: 'h', joinedAt: joined, leftAt: joined }] };
  assert.equal(leaveOutcome(held, 'h', now), 'end');
  // instant meetings are unchanged
  assert.equal(leaveOutcome({ hostId: 'h', participants: [{ userId: 'g', joinedAt: joined }] }, 'h', now), 'end');
});
