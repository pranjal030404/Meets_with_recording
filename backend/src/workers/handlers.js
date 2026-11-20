import { registerInlineHandler } from '../queues/index.js';
import { runTranscription } from '../services/recordingService.js';
import { runSummaryJob } from '../services/summaryService.js';
import { sendMail } from '../services/mailService.js';

/**
 * Job handlers. They MUST be idempotent (BullMQ may run a job again after a crash/stall):
 *  - transcription: the status state machine in recordingService refuses invalid transitions and the artifacts are overwritten
 *  - email: de-duplicated by jobId at enqueue time; SMTP resend after a crash is possible (at-least-once) - acceptable for notifications
 */
export const handlers = {
  transcription: async (job) => runTranscription(job.data, { throwOnError: true, final: job.attemptsMade + 1 >= (job.opts?.attempts ?? 1) }),
  summary: async (job) => runSummaryJob(job.data),
  email: async (job) => sendMail(job.data),
};

for (const [name, fn] of Object.entries(handlers)) registerInlineHandler(name, fn);
