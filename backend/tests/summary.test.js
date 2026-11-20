import test from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET ||= 'x';
const { generateMeetingSummary } = await import('../src/services/summaryService.js');
const { QUEUES } = await import('../src/queues/definitions.js');
const { handlers } = await import('../src/workers/handlers.js');

test('summary queue is defined and has a handler', () => {
  assert.ok(QUEUES.summary.attempts >= 1);
  assert.equal(typeof handlers.summary, 'function');
});

test('generateMeetingSummary stores extractive minutes from the transcript', async () => {
  let saved;
  const meeting = {
    id: 1, title: 'Sync', participants: [], recordings: [],
    completeTranscript: { text: 'Alice: We decided to ship on Friday.\nBob: I will update the docs by Thursday.\nAlice: Any open questions about the rollout plan?' },
    update: async (v) => { saved = v; }
  };
  const out = await generateMeetingSummary(meeting, 7);
  assert.equal(out.generatedBy, 7);
  assert.ok(out.summary.length > 0);
  assert.ok(saved.aiSummary && saved.summaryGeneratedAt);
});

test('no transcript -> 400-style error', async () => {
  const meeting = { id: 2, participants: [], recordings: [], update: async () => {} };
  await assert.rejects(() => generateMeetingSummary(meeting, 1), (e) => e.status === 400);
});
