/**
 * Queue catalogue. Retry/backoff/timeout/concurrency are per-queue and env-overridable.
 * Failed jobs (after all attempts) stay in BullMQ's `failed` set (kept for inspection/manual retry) = our dead-letter store.
 */
const int = (n, d) => (Number.isFinite(parseInt(process.env[n])) ? parseInt(process.env[n]) : d);

export const QUEUES = {
  transcription: {
    attempts: int('Q_TRANSCRIPTION_ATTEMPTS', 2),
    backoffMs: 30000,
    timeoutMs: int('Q_TRANSCRIPTION_TIMEOUT_MS', 60 * 60 * 1000),
    concurrency: int('Q_TRANSCRIPTION_CONCURRENCY', 1),   // CPU-bound (Whisper): keep low
  },
  summary: {
    attempts: int('Q_SUMMARY_ATTEMPTS', 2),
    backoffMs: 10000,
    timeoutMs: int('Q_SUMMARY_TIMEOUT_MS', 5 * 60 * 1000),
    concurrency: int('Q_SUMMARY_CONCURRENCY', 2),         // LLM-bound
  },
  email: {
    attempts: int('Q_EMAIL_ATTEMPTS', 5),
    backoffMs: 5000,
    timeoutMs: int('Q_EMAIL_TIMEOUT_MS', 30000),
    concurrency: int('Q_EMAIL_CONCURRENCY', 5),
  },
};

export const jobOptions = (name) => {
  const q = QUEUES[name];
  return {
    attempts: q.attempts,
    backoff: { type: 'exponential', delay: q.backoffMs },
    removeOnComplete: { age: 24 * 3600, count: 1000 },
    removeOnFail: { age: 14 * 24 * 3600, count: 5000 },
  };
};
