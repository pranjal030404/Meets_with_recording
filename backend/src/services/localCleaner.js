/**
 * Free, offline "spoken → written" cleaner (the dictation-polish idea, rule based).
 * No model, no network: filler removal, stutter collapse, self-correction resolution,
 * vocabulary snapping (fuzzy), punctuation and casing. Deterministic and instant.
 * English-first; other languages still get stutter/casing/vocabulary fixes only.
 */

const FILLERS = [
  'um+', 'uh+', 'er+', 'erm', 'ah+', 'hmm+', 'mm+', 'uh-huh',
  'you know', 'i mean', 'sort of', 'kind of', 'basically', 'actually', 'literally',
  'you see', 'okay so', 'so yeah', 'yeah so', 'right so', 'like'
];

// "like" / "actually" etc. are only dropped as fillers when set off by commas, at clause start, or doubled.
const HARD_FILLERS = /\b(?:um+|uh+|er+|erm|ah+|hmm+|mm+|uh-huh)\b[,.]?\s*/gi;
const SOFT_FILLERS = /\b(?:you know|i mean|sort of|kind of|basically|actually|literally|you see|like|so yeah|yeah so|okay so|right so)\s*,\s*/gi;

// "send it Tuesday, no, Wednesday" / "sorry, I meant" / "or rather" → keep the corrected part.
const CORRECTION = /([^.!?]*?)\b(?:no wait|no,? sorry|sorry,? (?:i mean|i meant)|i mean|or rather|rather|scratch that|actually no|no no|wait no)\b[,\s]+([^.!?]+)/i;

const lev = (a, b) => {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
};

// Cheap phonetic key so "Pranjal"/"Pranjul"/"Pranjall" collide.
const soundKey = (w) => w.toLowerCase()
  .replace(/[^a-z]/g, '')
  .replace(/ph/g, 'f').replace(/ck|c(?=[aou])|q/g, 'k').replace(/c/g, 's')
  .replace(/[aeiouy]+/g, (v, i) => (i === 0 ? v[0] : 'a'))
  .replace(/(.)\1+/g, '$1');

/** Snap words that sound/spell like a known term to the term's exact spelling. */
export const applyVocabulary = (text, vocabulary = []) => {
  if (!vocabulary.length) return text;
  const singles = new Map(); // lowercase word → canonical
  const phrases = [];
  for (const term of vocabulary) {
    if (/\s/.test(term)) phrases.push(term); else singles.set(term.toLowerCase(), term);
  }

  let out = text;
  for (const phrase of phrases) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+')}\\b`, 'gi');
    out = out.replace(re, phrase);
  }

  // "media soup" → "MediaSoup": adjacent words that join into a known single term
  {
    const words = out.split(' ');
    const joined = [];
    for (let i = 0; i < words.length; i++) {
      const next = words[i + 1];
      const hit = next && singles.get((words[i].replace(/[^A-Za-z]/g, '') + next.replace(/[^A-Za-z]/g, '')).toLowerCase());
      if (hit && /^[A-Za-z]+$/.test(words[i]) && /^[A-Za-z]+[,.?!]?$/.test(next)) {
        joined.push(hit + (next.match(/[,.?!]$/)?.[0] || ''));
        i++;
      } else joined.push(words[i]);
    }
    out = joined.join(' ');
  }

  const keys = [...singles.entries()].map(([lower, canon]) => ({ lower, canon, key: soundKey(lower) }));
  return out.replace(/\b[A-Za-z][A-Za-z0-9'-]{3,}\b/g, (word) => {
    const lw = word.toLowerCase();
    const exact = singles.get(lw);
    if (exact) return exact;
    for (const k of keys) {
      if (Math.abs(k.lower.length - lw.length) > 2) continue;
      const dist = lev(lw, k.lower);
      const limit = k.lower.length >= 8 ? 2 : 1;
      if (dist <= limit || (soundKey(lw) === k.key && dist <= 3)) return k.canon;
    }
    return word;
  });
};

const collapseStutters = (t) => t
  // "I I think" / "the the plan" (also 3x) → single
  .replace(/\b([A-Za-z']+)(?:[,\s]+\1\b){1,3}/gi, '$1')
  // "wh- what" / "we-we" partial-word restarts
  .replace(/\b[A-Za-z]{1,3}-\s*(?=[A-Za-z])/g, '')
  // repeated two-word phrase: "we need to we need to"
  .replace(/\b((?:\w+\s+){1,3}\w+)\s+\1\b/gi, '$1');

const resolveCorrections = (t) => {
  let out = t;
  for (let i = 0; i < 3; i++) {
    const m = out.match(CORRECTION);
    if (!m) break;
    const before = m[1].trim();
    const after = m[2].trim();
    // Replace the last word(s) of the earlier clause with the correction, when the correction is short.
    const afterWords = after.split(/\s+/);
    if (afterWords.length <= 3 && before) {
      const bw = before.split(/\s+/);
      const head = bw.slice(0, Math.max(0, bw.length - afterWords.length)).join(' ');
      out = out.replace(m[0], `${head} ${after}`.trim());
    } else {
      out = out.replace(m[0], after);
    }
  }
  return out;
};

const sentenceCase = (t) => t
  .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|april|june|july|august|september|october|november|december)\b/gi, (d) => d[0].toUpperCase() + d.slice(1).toLowerCase())
  .replace(/\bi\b/g, 'I')
  .replace(/\bi'(m|ll|ve|d)\b/gi, (_, s) => `I'${s.toLowerCase()}`)
  .replace(/(^|[.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());

/** Clean one utterance. Returns '' for utterances that are only filler. */
export const cleanUtterance = (raw, { vocabulary = [] } = {}) => {
  let t = ` ${String(raw || '')} `.replace(/\s+/g, ' ').trim();
  if (!t) return '';

  t = t.replace(HARD_FILLERS, ' ');
  t = collapseStutters(t);
  t = resolveCorrections(t);
  t = t.replace(SOFT_FILLERS, '');
  t = t.replace(/\b(?:like)\s+(?=(?:like|um|uh)\b)/gi, '');
  t = applyVocabulary(t, vocabulary);

  t = t
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/,\s*,+/g, ',')
    .replace(/^[,.\s-]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!/[A-Za-z0-9]/.test(t) || t.split(/\s+/).length < 2 && /^(yeah|yes|no|okay|ok|right|sure|mhm)$/i.test(t)) {
    return /^(yes|no|okay|ok|sure)$/i.test(t) ? sentenceCase(t) + '.' : '';
  }

  t = sentenceCase(t);
  if (!/[.!?…]$/.test(t)) {
    const isQuestion = /^(who|what|when|where|why|how|which|can|could|would|should|do|does|did|is|are|was|were|will|shall)\b/i.test(t);
    t += isQuestion ? '?' : '.';
  }
  return t;
};

export const cleanSegments = (segments, opts = {}) => segments
  .map((s) => ({ ...s, rawText: s.rawText ?? s.text, text: cleanUtterance(s.text, opts) }))
  .filter((s) => s.text);

export { FILLERS };
