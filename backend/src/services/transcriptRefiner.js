import { cleanSegments } from './localCleaner.js';
import { chatJSON, getLlm } from './llm.js';

/**
 * Dictation-style transcript polishing, free by default:
 *   1. context-biased ASR (vocabulary prompt)            — buildVocabulary / buildAsrPrompt
 *   2. deterministic rule cleaner (always on, offline)   — localCleaner.js
 *   3. optional LLM polish when a local Ollama model is present — never required, falls back per chunk
 */

const CHUNK_SEGMENTS = Number(process.env.REFINE_CHUNK_SEGMENTS) || 25;
const MAX_VOCAB_TERMS = 80;

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'meeting', 'call', 'sync', 'weekly', 'daily', 'team', 'review', 'discussion']);

/** Build the vocabulary list: env dictionary + participant names + capitalised/technical words from title & description. */
export const buildVocabulary = ({ title, description, participantNames = [], extra = [] } = {}) => {
  const terms = new Set();
  const add = (t) => {
    const v = String(t || '').trim();
    if (v.length >= 2 && v.length <= 60) terms.add(v);
  };

  (process.env.MEETING_VOCABULARY || '').split(',').forEach(add);
  extra.forEach(add);
  participantNames.forEach(add);
  participantNames.forEach((n) => String(n || '').split(/\s+/).forEach((part) => part.length > 2 && add(part)));

  const text = `${title || ''} ${description || ''}`;
  // Only distinctive tokens (acronyms, CamelCase, names with digits) - plain capitalised words like
  // "Launch" are ordinary English and would otherwise be force-capitalised everywhere.
  for (const match of text.matchAll(/\b([A-Z]{2,}[\w.+#-]*|[A-Z][a-z]+[A-Z]\w*|[a-z]+[A-Z]\w*|\w*\d\w*)\b/g)) {
    if (!STOPWORDS.has(match[1].toLowerCase())) add(match[1]);
  }

  return [...terms].slice(0, MAX_VOCAB_TERMS);
};

/** Short natural-language prompt that biases Whisper-family models toward the right spellings. */
export const buildAsrPrompt = ({ title, vocabulary = [] } = {}) => {
  const parts = [];
  if (title) parts.push(`Meeting: ${title}.`);
  if (vocabulary.length) parts.push(`Names and terms that may be spoken: ${vocabulary.join(', ')}.`);
  parts.push('Transcribe with correct punctuation and capitalisation.');
  return parts.join(' ').slice(0, 800);
};

const SYSTEM_PROMPT = `You are a transcript editor. You receive numbered lines of an already roughly cleaned meeting transcript. Polish each line into professional written text.
Rules: fix remaining recognition errors, punctuation and casing; use the vocabulary for exact spellings of names/products/jargon; keep meaning, numbers, dates and facts exactly; never add information, summarise, merge or drop lines; keep the original language.
Respond ONLY with JSON: {"lines": [{"i": number, "text": string}]} with one entry per input line, same numbering.`;

const polishChunk = async (chunk, { title, vocabulary }) => {
  const parsed = await chatJSON({
    system: SYSTEM_PROMPT,
    user: `Meeting title: ${title || 'n/a'}\nVocabulary: ${vocabulary.join(', ') || 'n/a'}\n\nLines:\n${chunk.map((s, i) => `${i}: ${s.text}`).join('\n')}`
  });
  const byIndex = new Map((parsed.lines || []).map((l) => [Number(l.i), typeof l.text === 'string' ? l.text.trim() : null]));
  return chunk.map((s, i) => {
    const t = byIndex.get(i);
    // Reject empty or wildly different rewrites (a small model drifting) and keep the rule-cleaned line.
    const ok = t && t.length >= s.text.length * 0.4 && t.length <= s.text.length * 1.8 + 20;
    return ok ? { ...s, text: t } : s;
  });
};

/**
 * Refine transcript segments. Never throws: returns { segments, text, refined, engine }.
 * engine: 'rules' (free, offline) or 'rules+<provider>' when an LLM polished it too.
 */
export const refineSegments = async (segments, context = {}) => {
  if (!segments.length) return { segments, text: '', refined: false, engine: 'none' };

  const vocabulary = context.vocabulary || buildVocabulary(context);
  let out = cleanSegments(segments, { vocabulary });
  let engine = 'rules';

  const llm = process.env.REFINE_WITH_LLM === 'off' ? null : await getLlm();
  if (llm && out.length) {
    const polished = [];
    let anyOk = false;
    for (let i = 0; i < out.length; i += CHUNK_SEGMENTS) {
      const chunk = out.slice(i, i + CHUNK_SEGMENTS);
      try {
        polished.push(...await polishChunk(chunk, { title: context.title, vocabulary }));
        anyOk = true;
      } catch (error) {
        console.error('Transcript LLM polish skipped for a chunk:', error.message);
        polished.push(...chunk);
      }
    }
    if (anyOk) { out = polished; engine = `rules+${llm.name}`; }
  }

  return { segments: out, text: out.map((s) => s.text).join(' '), refined: true, engine };
};
