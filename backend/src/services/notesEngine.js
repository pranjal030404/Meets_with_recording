/**
 * Free, offline meeting-minutes engine. No API, no model download.
 * Extractive: every line of the output is a (lightly trimmed) sentence that was actually said,
 * so it can't hallucinate. Produces the same shape the AI summary route stores.
 */

const STOP = new Set(`a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just let lets me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yeah yes okay ok right like sure great good thanks thank alright anything else need needs prepare share send finish update check um uh gonna wanna going think know really one get got also well thing things`.split(/\s+/));

const ACTION_CUES = /\b(?:i(?:'ll| will| am going to|'m going to| can take| will take)|we (?:need|have|should|must) to|(?:you|he|she|they) (?:need|should|must|will) (?:to )?|needs? to|action item|follow[- ]?up|to-?do|make sure|please (?:send|share|update|review|check|prepare|schedule|create|fix|finish|write)|let's (?:schedule|set up|follow|make|create|prepare)|can you|could you|will (?:also |then |just |definitely )?(?:send|share|update|review|check|prepare|schedule|create|fix|finish|write|look|call|email|deploy|follow))\b/i;
const DECISION_CUES = /\b(?:we (?:decided|agreed|have decided|will go with|are going with|settled on|chose)|decision(?: is| was)?|let's go with|agreed|approved|finali[sz]ed|confirmed|it's settled|final answer|we'll go with|going ahead with)\b/i;
const OPEN_CUES = /\b(?:not sure|unclear|tbd|to be decided|open question|need to figure out|don't know yet|haven't decided|pending|blocked on|waiting (?:on|for)|still need to decide)\b/i;
const IMPORTANT_CUES = /\b(?:important|critical|priority|deadline|risk|issue|problem|blocker|budget|launch|release|milestone|goal|target|key|must|urgent)\b/i;
const DUE_RE = /\b(?:by|before|on|until|due)\s+(?:end of (?:the )?(?:day|week|month|quarter)|eod|eow|tomorrow|today|tonight|next (?:week|month|monday|tuesday|wednesday|thursday|friday)|(?:this )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+\d{1,2}(?:st|nd|rd|th)?)?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b|\b(?:tomorrow|today|tonight|next week|next month|this week|end of (?:the )?(?:day|week|month)|eod)\b/i;

const words = (s) => (s.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || []).filter((w) => !STOP.has(w));
const stem = (w) => w.replace(/(?:ing|ed|es|s|ly)$/,'');

/** Parse "Speaker: text" lines (or plain prose) into sentence records. */
export const parseTranscript = (input) => {
  const lines = Array.isArray(input)
    ? input.map((l) => ({ speaker: l.userName || l.speaker || null, text: l.text }))
    : String(input || '').split(/\n+/).map((l) => {
        const m = l.match(/^\s*(?:\[[^\]]*\]\s*)?([A-Z][\w .'-]{0,40}?):\s+(.+)$/);
        return m ? { speaker: m[1].trim(), text: m[2] } : { speaker: null, text: l };
      });

  const sentences = [];
  for (const line of lines) {
    const parts = String(line.text || '').match(/[^.!?]+[.!?]*/g) || [];
    for (const raw of parts) {
      const text = raw.trim();
      if (text.split(/\s+/).length >= 3) sentences.push({ speaker: line.speaker, text, idx: sentences.length });
    }
  }
  return sentences;
};

const buildIdf = (sentences) => {
  const df = new Map();
  for (const s of sentences) for (const w of new Set(words(s.text).map(stem))) df.set(w, (df.get(w) || 0) + 1);
  const n = sentences.length || 1;
  return (w) => Math.log(1 + n / (df.get(w) || 1));
};

const scoreSentences = (sentences) => {
  const idf = buildIdf(sentences);
  const tf = new Map();
  for (const s of sentences) for (const w of words(s.text).map(stem)) tf.set(w, (tf.get(w) || 0) + 1);

  return sentences.map((s) => {
    const ws = words(s.text).map(stem);
    if (!ws.length) return { ...s, score: 0 };
    let score = ws.reduce((sum, w) => sum + Math.log(1 + (tf.get(w) || 0)) * idf(w), 0) / Math.sqrt(ws.length);
    if (IMPORTANT_CUES.test(s.text)) score *= 1.3;
    if (DECISION_CUES.test(s.text)) score *= 1.4;
    if (ACTION_CUES.test(s.text)) score *= 1.15;
    if (/\d/.test(s.text)) score *= 1.1;
    const len = s.text.split(/\s+/).length;
    if (len < 5) score *= 0.6;
    if (len > 45) score *= 0.7;
    if (/\?$/.test(s.text)) score *= 0.7;
    return { ...s, score };
  });
};

const vec = (sents) => {
  const m = new Map();
  for (const s of sents) for (const w of words(s.text).map(stem)) m.set(w, (m.get(w) || 0) + 1);
  return m;
};
const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (const [, v] of a) na += v * v;
  for (const [, v] of b) nb += v * v;
  for (const [k, v] of a) if (b.has(k)) dot += v * b.get(k);
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

/** TextTiling-style topic segmentation: cut where adjacent windows share the least vocabulary. */
const segmentTopics = (sentences, maxTopics = 7) => {
  const n = sentences.length;
  if (n < 12) return [sentences];
  const win = Math.max(3, Math.min(8, Math.floor(n / 10)));
  const depth = [];
  for (let i = win; i <= n - win; i++) {
    depth.push({ i, sim: cosine(vec(sentences.slice(i - win, i)), vec(sentences.slice(i, i + win))) });
  }
  const mean = depth.reduce((s, d) => s + d.sim, 0) / (depth.length || 1);
  const sd = Math.sqrt(depth.reduce((s, d) => s + (d.sim - mean) ** 2, 0) / (depth.length || 1));
  const cuts = depth
    .filter((d) => d.sim < mean - sd * 0.4)
    .sort((a, b) => a.sim - b.sim)
    .reduce((picked, d) => (picked.every((p) => Math.abs(p.i - d.i) >= win * 1.5) ? [...picked, d] : picked), [])
    .slice(0, maxTopics - 1)
    .map((d) => d.i)
    .sort((a, b) => a - b);

  const segs = [];
  let start = 0;
  for (const c of [...cuts, n]) { if (c > start) segs.push(sentences.slice(start, c)); start = c; }
  return segs;
};

const topicTitle = (seg, idfFn, exclude = new Set()) => {
  const freq = new Map();
  const ok = (w) => !exclude.has(w);
  for (const w of words(seg.map((s) => s.text).join(' ')).filter(ok)) freq.set(stem(w), (freq.get(stem(w)) || 0) + 1);
  const originals = new Map();
  for (const w of words(seg.map((s) => s.text).join(' ')).filter(ok)) if (!originals.has(stem(w))) originals.set(stem(w), w);
  const top = [...freq.entries()]
    .map(([w, c]) => [w, c * idfFn(w)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => originals.get(w));
  return top.map((w) => w[0].toUpperCase() + w.slice(1)).join(' · ') || 'Discussion';
};

const LEAD = /^(?:(?:yeah|yes|sure|okay|ok|well|so|and|but|alright|great|right|then|also),?\s+)+/i;
const trim = (s, max = 220) => {
  let t = s.replace(/\s+/g, ' ').trim().replace(LEAD, '');
  t = t ? t[0].toUpperCase() + t.slice(1) : t;
  return t.length <= max ? t : t.slice(0, max).replace(/\s+\S*$/, '') + '…';
};

const dedupe = (items, key = (x) => (typeof x === "string" ? x : x.text)) => {
  const seen = [];
  return items.filter((it) => {
    const k = new Set(words(key(it)).map(stem));
    if (seen.some((o) => { const inter = [...k].filter((w) => o.has(w)).length; return inter / Math.max(1, Math.min(k.size, o.size)) > 0.7; })) return false;
    seen.push(k);
    return true;
  });
};

const findAssignee = (sentence, participants, speaker) => {
  for (const name of participants) {
    const first = name.split(/\s+/)[0];
    if (new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(sentence.text)) return name;
  }
  if (/\bi(?:'ll| will|'m going to| am going to| can take)\b/i.test(sentence.text) && speaker) return speaker;
  return null;
};

const toTitle = (text) => {
  let t = text
    .replace(LEAD, '')
    .replace(/^(?:[A-Z][a-z]+(?: [A-Z][a-z]+)? (?:will|should|needs to|can|to) )/, '')
    .replace(/^(?:i(?:'ll| will)(?: also)?|we (?:need|have|should|must) to|let's|please|can you|could you|you (?:need|should) to)\s+/i, '')
    .replace(/[.!?]+$/, '')
    .trim();
  t = trim(t, 140);
  return t ? t[0].toUpperCase() + t.slice(1) : text;
};

/**
 * Build minutes from a transcript (string, or array of { userName|speaker, text }).
 * `participants` (names) improves action-item ownership.
 */
export const generateMinutes = (input, { participants = [], title = '' } = {}) => {
  const sentences = parseTranscript(input);
  if (sentences.length < 3) {
    return { summary: sentences.map((s) => s.text).join(' '), topics: [], keyPoints: [], decisions: [], actionItems: [], openQuestions: [], engine: 'extractive' };
  }

  const people = [...new Set([...participants, ...sentences.map((x) => x.speaker).filter(Boolean)])];
  const scored = scoreSentences(sentences);
  const idf = buildIdf(sentences);
  const byIdx = (a, b) => a.idx - b.idx;

  const decisions = dedupe(scored.filter((s) => DECISION_CUES.test(s.text) && !/\?$/.test(s.text)).sort(byIdx)).slice(0, 8).map((s) => trim(s.text));

  const actionItems = dedupe(
    scored.filter((s) => !OPEN_CUES.test(s.text) && (ACTION_CUES.test(s.text) && !/\?$/.test(s.text)) || /^(?:can|could) you\b.*\?$/i.test(s.text)).sort(byIdx),
    (s) => s.text
  )
    .slice(0, 10)
    .map((s) => ({
      title: toTitle(s.text),
      assigneeHint: findAssignee(s, people, s.speaker),
      dueHint: (s.text.match(DUE_RE) || [null])[0]
    }));

  const openQuestions = dedupe(
    scored.filter((s) => OPEN_CUES.test(s.text) || (/\?$/.test(s.text) && s.text.split(/\s+/).length >= 6 && !sentences[s.idx + 1]?.text?.length)).sort(byIdx)
  ).slice(0, 6).map((s) => trim(s.text));

  const keyPoints = dedupe(
    scored.filter((s) => !/\?$/.test(s.text) && !decisions.includes(trim(s.text))).sort((a, b) => b.score - a.score).slice(0, 12)
  ).slice(0, 6).sort(byIdx).map((s) => trim(s.text));

  const names = new Set([...participants, ...sentences.map((x) => x.speaker).filter(Boolean)].flatMap((n) => n.toLowerCase().split(/\s+/)));
  const segs = segmentTopics(scored);
  const topics = segs.map((seg) => ({
    title: topicTitle(seg, idf, names),
    notes: dedupe([...seg].filter((s) => !/\?$/.test(s.text)).sort((a, b) => b.score - a.score).slice(0, 3)).sort(byIdx).map((s) => trim(s.text, 180))
  })).filter((t) => t.notes.length);

  // Executive summary: top sentence from each of the first topics + highest overall, in spoken order.
  const lead = segs.map((seg) => [...seg].sort((a, b) => b.score - a.score)[0]).filter(Boolean);
  const overall = [...scored].sort((a, b) => b.score - a.score).slice(0, 4);
  const picked = dedupe([...lead.slice(0, 3), ...overall]).slice(0, 4).sort(byIdx);
  const lines = new Set(picked.map((s) => s.text));
  const summary = [...lines].map((t) => trim(t, 200)).join(' ');

  return {
    summary,
    topics,
    keyPoints,
    decisions,
    actionItems,
    openQuestions,
    engine: 'extractive'
  };
};

/** Top-scoring sentences in spoken order, trimmed to `maxChars` — lets small/local models handle long meetings. */
export const salientText = (input, maxChars = 9000) => {
  const sentences = parseTranscript(input);
  const full = sentences.map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text)).join('\n');
  if (full.length <= maxChars) return full;
  const scored = scoreSentences(sentences).sort((a, b) => b.score - a.score);
  const keep = [];
  let used = 0;
  for (const s of scored) {
    const line = s.speaker ? `${s.speaker}: ${s.text}` : s.text;
    if (used + line.length + 1 > maxChars) continue;
    keep.push({ idx: s.idx, line });
    used += line.length + 1;
  }
  return keep.sort((a, b) => a.idx - b.idx).map((k) => k.line).join('\n');
};
