import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/models/User.js';
import ConversationMember from '../src/models/ConversationMember.js';
import { syncMeetingStatus } from '../src/services/meetingStatus.js';

let row, sockets, sent;
const io = {
  in: () => ({ fetchSockets: async () => sockets }),
  to: () => ({ emit: (_event, payload) => sent.push(payload) })
};
mock.method(User, 'findByPk', async () => ({ ...row }));
mock.method(User, 'update', async (values) => { Object.assign(row, values); });
mock.method(ConversationMember, 'findAll', async () => []);

const inCall = () => [{ data: { inMeeting: true } }];
const idle = () => [{ data: {} }];
const sync = async (state) => { sockets = state; await syncMeetingStatus(io, row.id); };
let n = 0;
beforeEach(() => { sent = []; row = { id: `u${++n}`, customStatus: 'Available', statusEmoji: '✅', statusExpiresAt: null }; });

test('joining shows "In a meeting", leaving restores the previous status', async () => {
  await sync(inCall());
  assert.equal(row.customStatus, 'In a meeting');
  assert.ok(row.statusExpiresAt > new Date());
  await sync(idle());
  assert.equal(row.customStatus, 'Available');
  assert.equal(row.statusEmoji, '✅');
  assert.equal(sent.length, 2);
});

test('still in a meeting on another device: stays "In a meeting"', async () => {
  await sync(inCall());
  await sync([...idle(), ...inCall()]);
  assert.equal(row.customStatus, 'In a meeting');
});

test('a status picked during the meeting is kept', async () => {
  await sync(inCall());
  row.customStatus = 'On a break';
  await sync(idle());
  assert.equal(row.customStatus, 'On a break');
});

test('"In a meeting" set by hand is not cleared by leaving', async () => {
  row.customStatus = 'In a meeting';
  await sync(inCall());
  await sync(idle());
  assert.equal(row.customStatus, 'In a meeting');
  assert.equal(sent.length, 0);
});

test('no status before means no status after', async () => {
  Object.assign(row, { customStatus: null, statusEmoji: null });
  await sync(inCall());
  await sync(idle());
  assert.equal(row.customStatus, null);
});
