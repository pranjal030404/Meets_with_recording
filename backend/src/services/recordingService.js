import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

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

const locks = new Map(); // meetingId -> Promise tail
const withMeetingLock = (meetingId, fn) => {
  const run = (locks.get(meetingId) || Promise.resolve()).catch(() => {}).then(fn);
  locks.set(meetingId, run);
  run.finally(() => { if (locks.get(meetingId) === run) locks.delete(meetingId); }).catch(() => {});
  return run;
};

const updateRecording = (meetingId, recordingId, mutate) => withMeetingLock(meetingId, async () => {
  const meeting = await Meeting.findByPk(meetingId);
  if (!meeting) return null;
  const recordings = [...(meeting.recordings || [])];
  const idx = recordings.findIndex((r) => recordingIdOf(r) === recordingId);
  if (idx === -1) return null;
  const next = mutate(recordings[idx]);
  if (!next) return null;
  recordings[idx] = next;
  meeting.recordings = recordings;
  meeting.changed('recordings', true);
  await meeting.save();
  return next;
});

/** Add a recording entry (status 'queued') under the same lock, so it can't race a status update. */
export const appendRecording = (meetingId, recording) => withMeetingLock(meetingId, async () => {
  const meeting = await Meeting.findByPk(meetingId);
  meeting.recordings = [...(meeting.recordings || []), recording];
  meeting.changed('recordings', true);
  await meeting.save();
  return recording;
});

const setTranscriptionStatus = (meetingId, recordingId, to, patch = {}) =>
  updateRecording(meetingId, recordingId, (rec) => {
    const from = rec.transcription?.status || transcriptionMachine.initial;
    transcriptionMachine.assertTransition(from, to);
    return { ...rec, transcription: { ...(rec.transcription || {}), ...patch, status: to } };
  });

// ---- one transcription at a time: Whisper is CPU-heavy ----
const queue = [];
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

const runTranscription = async ({ meetingId, roomId, recording, language, context }) => {
  try {
    await setTranscriptionStatus(meetingId, recording.id, 'processing', { startedAt: new Date().toISOString(), error: null });
    const transcript = await generateTranscriptionArtifacts({
      recordingPath: recording.path,
      transcriptsDir: path.join(uploadsRoot, 'transcripts', roomId),
      transcriptBaseName: recording.id,
      recordingDuration: recording.duration,
      language,
      context
    });
    const record = buildTranscriptionRecord(transcript, roomId, recording.id, recording.duration);
    await setTranscriptionStatus(meetingId, recording.id, record.status, record);
  } catch (error) {
    console.error('Transcription failed:', error.message);
    await setTranscriptionStatus(meetingId, recording.id, 'failed', { error: error.message, finishedAt: new Date().toISOString() }).catch(() => {});
  }
};

export const enqueueTranscription = (job) => {
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

  return {
    recording: {
      id: recordingId,
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
  const from = found.transcription?.status;
  if (from === 'queued' || from === 'processing') throw new StateTransitionError('transcription', from, 'processing'); // already running
  const recording = { ...found, id: recordingIdOf(found) };
  // Show 'queued' immediately so the UI reflects the retry before the worker picks it up
  await updateRecording(meeting.id, recording.id, (rec) => ({ ...rec, transcription: { ...(rec.transcription || {}), status: 'queued', error: null } }));
  enqueueTranscription({ meetingId: meeting.id, roomId: meeting.roomId, recording, language, context });
  return recording;
};

/** On boot: anything left queued/processing by a crash can never finish by itself - mark failed so it can be retried. */
export const recoverStuckTranscriptions = async () => {
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
