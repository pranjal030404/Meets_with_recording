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
import { generateMeetingSummary } from '../services/summaryService.js';
import { enqueue } from '../queues/index.js';
import { chatJSON, getLlm } from '../services/llm.js';
import { translate, providerStatus } from '../services/translator.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads');

const MAX_TRANSCRIPT_CHARS = 12000;


// AI summary + action items for a meeting (from its transcript)
router.post('/meetings/:roomId/summary', protect, enforceTranscriptionAllowed, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });
    if (!meeting) {
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }

    const isParticipant = (meeting.participantIds || []).includes(req.user.id);
    const isInvitee = (meeting.inviteeIds || []).includes(req.user.id);
    if (meeting.hostId !== req.user.id && !isParticipant && !isInvitee) {
      return res.status(403).json({ success: false, message: 'No access to this meeting' });
    }

    if (meeting.aiSummary && !req.body.regenerate) {
      return res.json({ success: true, data: { summary: meeting.aiSummary, cached: true } });
    }

    const wantsAsync = req.query.async === '1' || req.body.async === true;
    if (wantsAsync) {
      // Heavy LLM work off the request path: 202 + poll GET /meetings/:roomId/summary. The default (sync) contract is unchanged.
      const job = await enqueue('summary', { roomId: meeting.roomId, userId: req.user.id }, { jobId: `summary-${meeting.id}-${Date.now() - (Date.now() % 60000)}` });
      return res.status(202).json({ success: true, data: { status: 'queued', jobId: job.id, mode: job.mode } });
    }

    let aiSummary;
    try { aiSummary = await generateMeetingSummary(meeting, req.user.id); }
    catch (e) { if (e.status) return res.status(e.status).json({ success: false, message: e.message }); throw e; }


    logAudit({ actor: req.user, action: 'ai.meeting_summary', entityType: 'Meeting', entityId: meeting.id, metadata: { engine: aiSummary.engine, model: aiSummary.model }, req });

    res.json({ success: true, data: { summary: aiSummary, cached: false } });
  } catch (error) {
    console.error('AI meeting summary error:', error);
    res.status(500).json({ success: false, message: 'Error generating meeting summary', error: error.message });
  }
});

// Poll target for the async flow
router.get('/meetings/:roomId/summary', protect, async (req, res) => {
  const meeting = await Meeting.findOne({ where: { roomId: req.params.roomId } });
  if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });
  const ok = meeting.hostId === req.user.id || (meeting.participantIds || []).includes(req.user.id) || (meeting.inviteeIds || []).includes(req.user.id);
  if (!ok) return res.status(403).json({ success: false, message: 'No access to this meeting' });
  if (!meeting.aiSummary) return res.status(202).json({ success: true, data: { status: 'pending' } });
  res.json({ success: true, data: { status: 'ready', summary: meeting.aiSummary } });
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

// Live caption translation (Meet "Speech translation"). Short phrases only; see services/translator.js for providers/limits.
const MAX_TRANSLATE_CHARS = 600;

router.get('/translate/status', protect, async (_req, res) => {
  res.json({ success: true, data: await providerStatus() });
});

router.post('/translate', protect, requirePermission('ai.use'), async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;
    if (typeof text !== 'string' || !text.trim() || typeof targetLanguage !== 'string' || !/^[A-Za-z][A-Za-z() -]{1,40}$/.test(targetLanguage)) {
      return res.status(400).json({ success: false, message: 'Provide text and a target language' });
    }
    const translation = await translate(text.trim().slice(0, MAX_TRANSLATE_CHARS), targetLanguage);
    res.json({ success: true, data: { translation } });
  } catch (error) {
    if (error.status === 503 || error.status === 429) {
      return res.status(error.status).json({ success: false, message: error.message, code: error.status === 429 ? 'TRANSLATION_BUSY' : 'TRANSLATION_UNAVAILABLE' });
    }
    console.error('AI translate error:', error.message);
    res.status(502).json({ success: false, message: 'Translation failed', code: 'TRANSLATION_FAILED' });
  }
});

export default router;
