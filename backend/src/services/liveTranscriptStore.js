import Meeting from '../models/Meeting.js';
import { cleanUtterance } from './localCleaner.js';
import { buildVocabulary } from './transcriptRefiner.js';

/**
 * Saves the in-meeting live captions (browser speech recognition — free, per-speaker) onto the
 * meeting when the room closes, cleaned by the offline rule engine. This is the zero-setup
 * transcript source: notes work even with no Whisper/Ollama/API key installed.
 */
export const persistLiveTranscript = async (roomId, lines) => {
  if (!Array.isArray(lines) || lines.length < 3) return;
  try {
    const meeting = await Meeting.findOne({ where: { roomId } });
    if (!meeting) return;
    if (meeting.completeTranscript?.text && meeting.completeTranscript.provider !== 'live-captions') return;

    const participantNames = [...new Set([
      ...(meeting.participants || []).map((p) => p.user?.name),
      ...lines.map((l) => l.userName)
    ].filter(Boolean))];
    const vocabulary = buildVocabulary({ title: meeting.title, description: meeting.description, participantNames });

    const t0 = lines[0].timestamp;
    const segments = [];
    for (const l of lines) {
      const text = cleanUtterance(l.text, { vocabulary });
      if (!text) continue;
      const start = Math.max(0, (l.timestamp - t0) / 1000);
      segments.push({ id: segments.length + 1, start, end: start + 2, text, speaker: l.userName || null });
    }
    if (segments.length < 3) return;

    await meeting.update({
      completeTranscript: {
        provider: 'live-captions',
        model: null,
        language: null,
        text: segments.map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text)).join('\n'),
        segments,
        refined: true,
        engine: 'rules',
        generatedAt: new Date().toISOString(),
        duration: segments[segments.length - 1].end,
        sources: 1
      }
    });
  } catch (error) {
    console.error('Persist live transcript failed:', error.message);
  }
};

// Checkpoint while the meeting runs so a crash/restart loses at most ~30s of captions, not the whole meeting.
const CHECKPOINT_MS = 30_000;
const pending = new Map(); // roomId -> timer

export const scheduleTranscriptCheckpoint = (roomId, getLines) => {
  if (pending.has(roomId)) return;
  pending.set(roomId, setTimeout(() => {
    pending.delete(roomId);
    persistLiveTranscript(roomId, getLines());
  }, CHECKPOINT_MS));
};

export const cancelTranscriptCheckpoint = (roomId) => {
  clearTimeout(pending.get(roomId));
  pending.delete(roomId);
};
