import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Meeting from '../models/Meeting.js';
import { generateMinutes, salientText } from './notesEngine.js';
import { chatJSON, getLlm } from './llm.js';
import { getStorage } from '../storage/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads');
const MAX_TRANSCRIPT_CHARS = 12000;

// Artifacts may live only in object storage when this node didn't produce them
const fetchIfMissing = async (abs) => {
  try { await fs.access(abs); return; } catch { /* not local */ }
  const st = getStorage();
  if (st.name === 's3' && st.downloadToFile) await st.downloadToFile(path.relative(UPLOAD_ROOT, abs).split(path.sep).join('/'), abs);
};

// Build transcript text from the meeting's recordings (segments or txt artifacts)
export const buildTranscript = async (meeting) => {
  if (meeting.completeTranscript && meeting.completeTranscript.text) {
    return meeting.completeTranscript.text;
  }
  if (meeting.completeTranscript && Array.isArray(meeting.completeTranscript.segments) && meeting.completeTranscript.segments.length > 0) {
    return meeting.completeTranscript.segments.map(s => s.text || '').join(' ');
  }
  const recordings = meeting.recordings || [];
  for (let i = recordings.length - 1; i >= 0; i--) {
    const rec = recordings[i];
    const transcription = rec.transcription;
    if (!transcription) continue;

    if (Array.isArray(transcription.segments) && transcription.segments.length > 0) {
      return transcription.segments
        .map(s => `[${s.startTime ?? ''}] ${s.speaker ? s.speaker + ': ' : ''}${s.text}`)
        .join('\n');
    }
    if (transcription.files?.txt?.url) {
      try {
        const txtPath = path.join(UPLOAD_ROOT, transcription.files.txt.url.replace('/uploads/', ''));
        await fetchIfMissing(txtPath);
        const text = await fs.readFile(txtPath, 'utf8');
        if (text.trim()) return text;
      } catch {}
    }
    if (transcription.txtUrl) {
      try {
        const txtPath = path.join(UPLOAD_ROOT, transcription.txtUrl.replace('/uploads/', ''));
        await fetchIfMissing(txtPath);
        const text = await fs.readFile(txtPath, 'utf8');
        if (text.trim()) return text;
      } catch {
        // artifact missing, try older recording
      }
    }
  }
  return null;
};



const MINUTES_PROMPT = `You are a professional minute-taker. From the meeting transcript, write accurate, concise, business-ready minutes.
Rules: use only what was actually said; never invent names, dates, owners, or decisions. Attribute to a person only when the transcript makes it clear. Use plain professional language in the transcript's language.
Respond ONLY with JSON:
{"summary": string (3-5 sentence executive summary),
"topics": [{"title": string, "notes": string[] (1-4 short bullets)}] (max 8, in the order discussed),
"keyPoints": string[] (max 6),
"decisions": string[] (explicit decisions only, may be empty),
"actionItems": [{"title": string (starts with a verb), "assigneeHint": string|null, "dueHint": string|null}] (max 10),
"openQuestions": string[] (unresolved issues, may be empty)}`;

/** Generates and stores the AI minutes for a meeting. Idempotent (overwrites aiSummary). Throws {status,message} for caller errors. */
export const generateMeetingSummary = async (meeting, userId) => {
  const transcript = await buildTranscript(meeting);
  if (!transcript) throw Object.assign(new Error('No transcript available. Turn on live transcription during the meeting, or record it with a speech-to-text engine configured.'), { status: 400 });

  const participantNames = [...new Set((meeting.participants || []).map(p => p.user?.name).filter(Boolean))];

  // 1) Free, offline, always works: extractive minutes (every line is something that was actually said).
  let minutes = generateMinutes(transcript, { participants: participantNames, title: meeting.title });
  let engine = 'extractive';
  let modelName = null;

  // 2) Optional upgrade when a model is available (local Ollama is free). Falls back silently.
  const llm = await getLlm();
  if (llm) {
    try {
      const parsed = await chatJSON({
        system: MINUTES_PROMPT,
        user: `Meeting title: ${meeting.title}\nParticipants: ${participantNames.join(', ') || 'unknown'}\n\nTranscript (key excerpts):\n${salientText(transcript, MAX_TRANSCRIPT_CHARS)}`
      });
      if (parsed && typeof parsed.summary === 'string' && parsed.summary.trim()) {
        minutes = {
          summary: parsed.summary,
          topics: Array.isArray(parsed.topics) ? parsed.topics : minutes.topics,
          keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : minutes.keyPoints,
          decisions: Array.isArray(parsed.decisions) ? parsed.decisions : minutes.decisions,
          actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : minutes.actionItems,
          openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions : minutes.openQuestions
        };
        engine = llm.name;
        modelName = llm.model;
      }
    } catch (error) {
      console.error('LLM minutes skipped, using extractive minutes:', error.message);
    }
  }

  const aiSummary = {
    summary: minutes.summary || '',
    keyPoints: minutes.keyPoints || [],
    decisions: minutes.decisions || [],
    actionItems: minutes.actionItems || [],
    topics: minutes.topics || [],
    openQuestions: minutes.openQuestions || [],
    engine,
    model: modelName,
    generatedAt: new Date().toISOString(),
    generatedBy: userId
  };

  await meeting.update({ aiSummary, summaryGeneratedAt: new Date() });
  return aiSummary;
};

export const runSummaryJob = async ({ roomId, userId }) => {
  const meeting = await Meeting.findOne({ where: { roomId } });
  if (!meeting) throw new Error('Meeting not found');
  return generateMeetingSummary(meeting, userId);
};
