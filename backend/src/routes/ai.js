import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Meeting from '../models/Meeting.js';
import { protect } from '../middleware/auth.js';
import logAudit from '../services/auditService.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads');

const MAX_TRANSCRIPT_CHARS = 12000;

const getOpenAI = async () => {
  if (!process.env.OPENAI_API_KEY) return null;
  const { default: OpenAI } = await import('openai');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

// Build transcript text from the meeting's recordings (segments or txt artifacts)
const buildTranscript = async (meeting) => {
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

const SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || 'gpt-4o-mini';

// AI summary + action items for a meeting (from its transcript)
router.post('/meetings/:roomId/summary', protect, async (req, res) => {
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

    const openai = await getOpenAI();
    if (!openai) {
      return res.status(503).json({
        success: false,
        message: 'AI features require OPENAI_API_KEY to be configured on the server'
      });
    }

    const transcript = await buildTranscript(meeting);
    if (!transcript) {
      return res.status(400).json({
        success: false,
        message: 'No transcript available. Record the meeting with transcription enabled first.'
      });
    }

    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are an expert meeting analyst. Given a meeting transcript, produce a concise professional summary. Respond ONLY with JSON: {"summary": string (3-5 sentences), "keyPoints": string[] (max 6), "decisions": string[] (decisions made, may be empty), "actionItems": [{"title": string, "assigneeHint": string|null}] (max 8)}.'
        },
        {
          role: 'user',
          content: `Meeting title: ${meeting.title}\n\nTranscript:\n${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}`
        }
      ]
    });

    let parsed;
    try {
      parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    } catch {
      parsed = { summary: completion.choices[0]?.message?.content || 'Summary could not be generated.', keyPoints: [], decisions: [], actionItems: [] };
    }

    const aiSummary = {
      summary: parsed.summary || '',
      keyPoints: parsed.keyPoints || [],
      decisions: parsed.decisions || [],
      actionItems: parsed.actionItems || [],
      model: SUMMARY_MODEL,
      generatedAt: new Date().toISOString(),
      generatedBy: req.user.id
    };

    await meeting.update({ aiSummary, summaryGeneratedAt: new Date() });

    logAudit({ actor: req.user, action: 'ai.meeting_summary', entityType: 'Meeting', entityId: meeting.id, metadata: { model: SUMMARY_MODEL }, req });

    res.json({ success: true, data: { summary: aiSummary, cached: false } });
  } catch (error) {
    console.error('AI meeting summary error:', error);
    res.status(500).json({ success: false, message: 'Error generating meeting summary', error: error.message });
  }
});

// Generic text summarization (threads, channels, notes)
router.post('/summarize', protect, async (req, res) => {
  try {
    const { text, kind = 'conversation' } = req.body;
    if (!text || text.trim().length < 40) {
      return res.status(400).json({ success: false, message: 'Provide at least 40 characters of text to summarize' });
    }

    const openai = await getOpenAI();
    if (!openai) {
      return res.status(503).json({
        success: false,
        message: 'AI features require OPENAI_API_KEY to be configured on the server'
      });
    }

    const completion = await openai.chat.completions.create({
      model: SUMMARY_MODEL,
      messages: [
        {
          role: 'system',
          content: `Summarize the following ${kind} in 2-4 concise sentences. Capture the key points, any decisions and any action items mentioned. Reply with plain text only.`
        },
        { role: 'user', content: text.slice(0, MAX_TRANSCRIPT_CHARS) }
      ]
    });

    const summary = completion.choices[0]?.message?.content?.trim() || '';
    logAudit({ actor: req.user, action: 'ai.summarize', entityType: null, metadata: { kind, chars: text.length }, req });

    res.json({ success: true, data: { summary } });
  } catch (error) {
    console.error('AI summarize error:', error);
    res.status(500).json({ success: false, message: 'Error generating summary', error: error.message });
  }
});

export default router;
