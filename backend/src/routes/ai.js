import { requirePermission } from '../lib/permissions.js';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Meeting from '../models/Meeting.js';
import { protect } from '../middleware/auth.js';
import { enforceTranscriptionAllowed } from '../middleware/subscription.js';
import logAudit from '../services/auditService.js';
import { generateMinutes, salientText } from '../services/notesEngine.js';
import { chatJSON, getLlm } from '../services/llm.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads');

const MAX_TRANSCRIPT_CHARS = 12000;


// Build transcript text from the meeting's recordings (segments or txt artifacts)
const buildTranscript = async (meeting) => {
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
        const text = await fs.readFile(txtPath, 'utf8');
        if (text.trim()) return text;
      } catch {}
    }
    if (transcription.txtUrl) {
      try {
        const txtPath = path.join(UPLOAD_ROOT, transcription.txtUrl.replace('/uploads/', ''));
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

// AI summary + action items for a meeting (from its transcript)
router.post('/meetings/:roomId/summary', protect, enforceTranscriptionAllowed, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });
    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }

    const isParticipant = (meeting.participantIds || []).includes(req.user.id);
    const isInvitee = (meeting.inviteeIds || []).some(i => i.userId === req.user.id);
    if (meeting.hostId !== req.user.id && !isParticipant && !isInvitee) {
      return res.status(403).json({ success: false, message: 'No access to this meeting' });
    }

    if (meeting.aiSummary && !req.body.regenerate) {
      return res.json({ success: true, data: { summary: meeting.aiSummary, cached: true } });
    }

    const transcript = await buildTranscript(meeting);
    if (!transcript) {
      return res.status(400).json({
        success: false,
        message: 'No transcript available. Turn on live transcription during the meeting, or record it with a speech-to-text engine configured.'
      });
    }

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
      generatedBy: req.user.id
    };

    await meeting.update({ aiSummary, summaryGeneratedAt: new Date() });

    logAudit({ actor: req.user, action: 'ai.meeting_summary', entityType: 'Meeting', entityId: meeting.id, metadata: { engine: aiSummary.engine, model: aiSummary.model }, req });

    res.json({ success: true, data: { summary: aiSummary, cached: false } });
  } catch (error) {
    console.error('AI meeting summary error:', error);
    res.status(500).json({ success: false, message: 'Error generating meeting summary', error: error.message });
  }
});

// Generic text summarization (threads, channels, notes)
router.post('/summarize', protect, requirePermission('ai.use'), async (req, res) => {
  try {
    const { text, kind = 'conversation' } = req.body;
    if (!text || text.trim().length < 40) {
      return res.status(400).json({ success: false, message: 'Provide at least 40 characters of text to summarize' });
    }

    let summary = '';
    if (await getLlm()) {
      try {
        const out = await chatJSON({
          system: `Summarize the following ${kind} in 2-4 concise sentences. Capture the key points, any decisions and any action items mentioned. Respond ONLY with JSON: {"summary": string}.`,
          user: text.slice(0, MAX_TRANSCRIPT_CHARS)
        });
        summary = String(out.summary || '').trim();
      } catch (error) {
        console.error('LLM summarize skipped:', error.message);
      }
    }
    if (!summary) summary = generateMinutes(text).summary || text.slice(0, 300);

    logAudit({ actor: req.user, action: 'ai.summarize', entityType: null, metadata: { kind, chars: text.length }, req });

    res.json({ success: true, data: { summary } });
  } catch (error) {
    console.error('AI summarize error:', error);
    res.status(500).json({ success: false, message: 'Error generating summary', error: error.message });
  }
});

// Live caption translation (Meet "Speech translation"). Short phrases only; cached per phrase.
const translationCache = new Map();
const MAX_CACHE_ENTRIES = 500;
const MAX_TRANSLATE_CHARS = 600;

router.post('/translate', protect, requirePermission('ai.use'), async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;
    if (typeof text !== 'string' || !text.trim() || typeof targetLanguage !== 'string' || !/^[A-Za-z][A-Za-z -]{1,40}$/.test(targetLanguage)) {
      return res.status(400).json({ success: false, message: 'Provide text and a target language' });
    }

    const input = text.trim().slice(0, MAX_TRANSLATE_CHARS);
    const cacheKey = `${targetLanguage}\u0000${input}`;
    if (translationCache.has(cacheKey)) {
      return res.json({ success: true, data: { translation: translationCache.get(cacheKey) } });
    }

    if (!(await getLlm())) {
      return res.status(503).json({
        success: false,
        message: 'Speech translation needs a language model: run Ollama locally (free) or set OPENAI_API_KEY'
      });
    }

    const out = await chatJSON({
      system: `Translate the user's message into ${targetLanguage}. If it is already in ${targetLanguage}, return it unchanged. Respond ONLY with JSON: {"translation": string}.`,
      user: input,
      timeoutMs: 30_000
    });
    const translation = String(out.translation || '').trim() || input;
    if (translationCache.size >= MAX_CACHE_ENTRIES) {
      translationCache.delete(translationCache.keys().next().value);
    }
    translationCache.set(cacheKey, translation);

    res.json({ success: true, data: { translation } });
  } catch (error) {
    console.error('AI translate error:', error);
    res.status(500).json({ success: false, message: 'Error translating text', error: error.message });
  }
});

export default router;
