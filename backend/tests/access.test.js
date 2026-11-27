import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessMeeting } from '../src/lib/meetingPermissions.js';

const stranger = { id: 'x', email: 'x@example.test' };
const meeting = (settings) => ({ hostId: 'h', settings, participants: [], participantIds: [], invitees: [] });

test('restriction settings, including rows written before an access type was always stored', () => {
  assert.equal(canAccessMeeting(meeting({ accessType: 'trusted', allowLinkRequests: false }), stranger), false);
  assert.equal(canAccessMeeting(meeting({ allowLinkRequests: false }), stranger), false);
  assert.equal(canAccessMeeting(meeting({}), stranger), true);
  assert.equal(canAccessMeeting(meeting({ accessType: 'open', allowLinkRequests: false }), stranger), true);
  assert.equal(canAccessMeeting(meeting({ accessType: 'trusted' }), stranger), true);
});
