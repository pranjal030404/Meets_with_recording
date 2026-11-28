import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { updateLocked } from '../lib/locked.js';
import Meeting from '../models/Meeting.js';
import { generateTranscriptionArtifacts } from './transcriptionService.js';
import { transcriptionMachine, StateTransitionError } from '../lib/stateMachines.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '../../uploads');

const toPublicUrl = (...segments) => `/${path.posix.join(...segments)}`;

/**
 * Recording transcription lifecycle:  queued -> processing -> completed | failed   (retry: failed|completed -> processing)
 * The upload request returns as soon as the file is stored; transcription runs in a background queue
 * and writes its progress onto the recording entry inside Meeting.recordings.
 */

// ---- serialised read-modify-write on one recording entry (Meeting.recordings is a JSON column) ----
// Older recordings have no `id`; their filename (without extension) is the same value.
export const recordingIdOf = (r) => r.id || path.parse(r.filename || '').name;

import { redisEnabled } from '../infrastructure/redis/redisClient.js';
import { enqueue } from '../queues/index.js';
import { trackState } from '../lib/stateRegistry.js';
import { getStorage } from '../storage/index.js';
import fsSync from 'fs';
import { withLock } from '../infrastructure/redis/lock.js';

const locks = trackState('recordingLocks', new Map(), 'room'); // meetingId -> Promise tail
const withLocalLock = (meetingId, fn) => {
  const run = (locks.get(meetingId) || Promise.resolve()).catch(() => {}).then(fn);
  locks.set(meetingId, run);
  run.finally(() => { if (locks.get(meetingId) === run) locks.delete(meetingId); }).catch(() => {});
  return run;
};

// In-process queue first (cheap), then a Redis mutex so concurrent instances can't lose each other's JSON updates
const withMeetingLock = (meetingId, fn) => withLocalLock(meetingId, () => withLock(`meeting-recordings:${meetingId}`, 15000, fn));

const updateRecording = (meetingId, recordingId, mutate) => withMeetingLock(meetingId, async () => {
  const updated = await updateLocked(Meeting, meetingId, (meeting) => {
    const recordings = [...(meeting.recordings || [])];
    const idx = recordings.findIndex((r) => recordingIdOf(r) === recordingId);
    const next = idx === -1 ? null : mutate(recordings[idx]);
    if (!next) return false;
    recordings[idx] = next;
    meeting.recordings = recordings;
    return next;
  });
  return updated?.result || null;
});

/** Add a recording entry (status 'queued') under the same lock, so it can't race a status update. */
export const appendRecording = (meetingId, recording) => withMeetingLock(meetingId, async () => {
  await updateLocked(Meeting, meetingId, (meeting) => {
    meeting.recordings = [...(meeting.recordings || []), recording];
  });
  return recording;
});

const setTranscriptionStatus = (meetingId, recordingId, to, patch = {}) =>
  updateRecording(meetingId, recordingId, (rec) => {
    const from = rec.transcription?.status || transcriptionMachine.initial;
    transcriptionMachine.assertTransition(from, to);
    return { ...rec, transcription: { ...(rec.transcription || {}), ...patch, status: to } };
  });

// ---- one transcription at a time: Whisper is CPU-heavy ----
const queue = trackState('transcriptionLocalQueue', [], 'global');
let running = false;
const pump = async () => {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    try { await job(); } catch (e) { console.error('Transcription job crashed:', e.message); }
  }
  running = false;
};

const buildTranscriptionRecord = (transcript, roomId, recordingId, duration) => ({
  status: transcript.error ? 'failed' : 'completed',
  language: transcript.language,
  provider: transcript.provider,
  model: transcript.model,
  text: transcript.text,
  rawText: transcript.rawText,
  refined: transcript.refined,
  duration,
  generatedAt: transcript.generatedAt,
  error: transcript.error,
  segments: transcript.segments,
  files: Object.fromEntries(['json', 'txt', 'srt', 'vtt'].map((ext) => [ext, {
    path: transcript.files[ext],
    url: toPublicUrl('uploads', 'transcripts', roomId, `${recordingId}.${ext}`)
  }]))
});

const keyFor = (rel) => path.relative(uploadsRoot, rel).split(path.sep).join('/');

/** Copy a local file to object storage (S3 driver only); the local copy is kept until it has been processed. Never throws. */
export const mirrorFile = async (absPath, contentType, storage = getStorage()) => {
  if (storage.name !== 's3') return null;
  try {
    const key = keyFor(absPath);
    await storage.putObject(key, fsSync.createReadStream(absPath), { contentType });
    return key;
  } catch (e) { console.error(`[storage] mirror of ${absPath} failed: ${e.message}`); return null; }
};

/** The worker may run on another node than the one that received the upload: fetch the recording from the bucket if it isn't on local disk. */
export const ensureLocalRecording = async (recording, storage = getStorage()) => {
  if (fsSync.existsSync(recording.path)) return recording.path;
  if (storage.name === 's3' && recording.storageKey && storage.downloadToFile) {
    await storage.downloadToFile(recording.storageKey, recording.path);
    return recording.path;
  }
  throw new Error('Recording file is not available on this node');
};

const stillListed = async (meetingId, recordingId) => {
  const meeting = await Meeting.findByPk(meetingId, { attributes: ['recordings'] });
  return !!meeting && (meeting.recordings || []).some((r) => recordingIdOf(r) === recordingId);
};

/** The recording was erased while it was being worked on: nothing about it may stay behind. */
const discardTranscript = async (roomId, recording, storage = getStorage()) => {
  const dir = path.join(uploadsRoot, 'transcripts', roomId);
  for (const ext of ['json', 'txt', 'srt', 'vtt']) {
    const file = path.join(dir, `${recording.id}.${ext}`);
    await fs.rm(file, { force: true });
    if (storage.name === 's3') await storage.deleteObject(keyFor(file)).catch((e) => console.error(`[erase] could not delete ${keyFor(file)} from object storage: ${e.message}`));
  }
  await fs.rmdir(dir).catch(() => {}); // only when nothing else is in it
  await fs.rm(recording.path, { force: true }); // a worker on another node holds its own copy
};

export const runTranscription = async ({ meetingId, roomId, recording, language, context }, { throwOnError = false, final = true } = {}) => {
  try {
    await setTranscriptionStatus(meetingId, recording.id, 'processing', { startedAt: new Date().toISOString(), error: null });
    await ensureLocalRecording(recording);
    const transcript = await generateTranscriptionArtifacts({
      recordingPath: recording.path,
      transcriptsDir: path.join(uploadsRoot, 'transcripts', roomId),
      transcriptBaseName: recording.id,
      recordingDuration: recording.duration,
      language,
      context
    });
    const record = buildTranscriptionRecord(transcript, roomId, recording.id, recording.duration);
    for (const ext of ['json', 'txt', 'srt', 'vtt']) if (transcript.files?.[ext]) await mirrorFile(transcript.files[ext], 'text/plain'); // so any node / the summary worker can read them
    if (!(await setTranscriptionStatus(meetingId, recording.id, record.status, record))) await discardTranscript(roomId, recording);
  } catch (error) {
    // erased while we were working on it: that is not a failure, and not worth a retry
    if (!(await stillListed(meetingId, recording.id).catch(() => true))) return discardTranscript(roomId, recording);
    console.error('Transcription failed:', error.message);
    // With a durable queue a non-final attempt is retried by BullMQ: only mark `failed` (UI-visible) on the last one
    if (!throwOnError || final) await setTranscriptionStatus(meetingId, recording.id, 'failed', { error: error.message, finishedAt: new Date().toISOString() }).catch(() => {});
    if (throwOnError) throw error;
  }
};

/**
 * Durable (BullMQ) when Redis is configured, otherwise the previous in-process queue.
 * jobId makes the enqueue idempotent per recording.
 */
export const enqueueTranscription = (job) => {
  if (redisEnabled()) {
    enqueue('transcription', job, { jobId: `transcribe-${job.meetingId}-${job.recording.id}-${Date.now()}` })
      .catch((e) => { console.error('Could not enqueue transcription:', e.message); queue.push(() => runTranscription(job)); pump(); });
    return;
  }
  queue.push(() => runTranscription(job));
  pump();
};

/** Store the file, return the recording entry (status 'queued'). Transcription is started separately. */
export const saveMeetingRecording = async ({
  roomId,
  sourcePath,
  originalName,
  mimeType,
  size,
  duration = 0,
  recordedBy
}) => {
  const recordingId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const extension = path.extname(originalName || '').toLowerCase() || '.webm';
  const recordingFileName = `${recordingId}${extension}`;

  const recordingDir = path.join(uploadsRoot, 'recordings', roomId);
  await fs.mkdir(recordingDir, { recursive: true });
  const recordingPath = path.join(recordingDir, recordingFileName);
  try {
    await fs.copyFile(sourcePath, recordingPath);
  } finally {
    await fs.unlink(sourcePath).catch(() => {});
  }

  const storageKey = await mirrorFile(recordingPath, mimeType || 'video/webm');

  return {
    recording: {
      id: recordingId,
      ...(storageKey ? { storageKey } : {}),
      filename: recordingFileName,
      originalName: originalName || recordingFileName,
      url: toPublicUrl('uploads', 'recordings', roomId, recordingFileName),
      path: recordingPath,
      duration,
      mimeType,
      size,
      recordedBy,
      createdAt: new Date().toISOString(),
      transcription: { status: 'queued', queuedAt: new Date().toISOString() }
    }
  };
};

/** failed|completed -> processing again. Throws StateTransitionError if it's already queued/processing. */
export const retryTranscription = async ({ meeting, recordingId, language, context }) => {
  const found = (meeting.recordings || []).find((r) => recordingIdOf(r) === recordingId);
  if (!found) return null;
  const recording = { ...found, id: recordingIdOf(found) };
  // Check-and-set inside updateRecording's per-meeting lock so two quick retries can't both enqueue.
  // Show 'queued' immediately so the UI reflects the retry before the worker picks it up.
  await updateRecording(meeting.id, recording.id, (rec) => {
    const from = rec.transcription?.status;
    if (from === 'queued' || from === 'processing') throw new StateTransitionError('transcription', from, 'queued'); // already running
    transcriptionMachine.assertTransition(from || 'queued', 'queued');
    return { ...rec, transcription: { ...(rec.transcription || {}), status: 'queued', error: null } };
  });
  enqueueTranscription({ meetingId: meeting.id, roomId: meeting.roomId, recording, language, context });
  return recording;
};

/** On boot: anything left queued/processing by a crash can never finish by itself - mark failed so it can be retried. */
export const recoverStuckTranscriptions = async () => {
  // A durable queue resumes/retries stalled jobs itself; marking them failed here would also clobber other instances' live jobs
  if (redisEnabled()) return 0;
  const meetings = await Meeting.findAll({ attributes: ['id', 'recordings'] });
  let fixed = 0;
  for (const m of meetings) {
    for (const r of m.recordings || []) {
      const st = r.transcription?.status;
      const rid = recordingIdOf(r);
      if (st === 'queued' || st === 'processing') {
        await setTranscriptionStatus(m.id, rid, 'failed', { error: 'Interrupted by a server restart. Use Retry.' }).catch(() => {});
        fixed++;
      }
    }
  }
  return fixed;
};
