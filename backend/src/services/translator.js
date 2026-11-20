import { chatText, getLlm } from './llm.js';
import { trackState } from '../lib/stateRegistry.js';

/**
 * Live-caption translation. Providers (first that is configured/available wins):
 *   TRANSLATE_PROVIDER=libretranslate + LIBRETRANSLATE_URL   a self-hosted LibreTranslate (opt-in; captions go only to the URL YOU set)
 *   otherwise a local Ollama model (default, nothing leaves the machine)
 * Protections: result cache with TTL, de-duplication of identical in-flight requests (every participant asks for the same line),
 * and a concurrency cap so a burst of captions can't saturate the CPU and make every translation slow.
 */
const MAX_CACHE = int('TRANSLATE_CACHE_ENTRIES', 2000);
const CACHE_TTL_MS = 60 * 60 * 1000;
const CONCURRENCY = int('TRANSLATE_CONCURRENCY', 2);
const MAX_WAITING = int('TRANSLATE_MAX_QUEUE', 20);   // beyond this we shed load: stale captions aren't worth translating
function int(n, d) { const v = parseInt(process.env[n]); return Number.isFinite(v) ? v : d; }

const cache = trackState('translationCache', new Map(), 'cache'); // key -> { v, at }
const inflight = trackState('translationInflight', new Map(), 'cache');
let active = 0;
const waiting = trackState('translationWaiting', [], 'global');

export class TranslationUnavailable extends Error { constructor(m) { super(m); this.status = 503; } }
export class TranslationBusy extends Error { constructor() { super('Translation is busy, showing original'); this.status = 429; } }

const slot = () => new Promise((resolve, reject) => {
  if (active < CONCURRENCY) { active++; return resolve(); }
  if (waiting.length >= MAX_WAITING) return reject(new TranslationBusy());
  waiting.push(resolve);
});
const release = () => { const next = waiting.shift(); if (next) next(); else active--; };

const SYSTEM = (lang) => `You are a professional real-time interpreter. Translate the user's message into ${lang}. Output ONLY the translation: no quotes, notes or explanations. Keep names, numbers and technical terms. If it is already in ${lang}, output it unchanged.`;

export const providerStatus = async () => {
  if (process.env.TRANSLATE_PROVIDER === 'libretranslate' && process.env.LIBRETRANSLATE_URL) return { available: true, provider: 'libretranslate' };
  const llm = await getLlm();
  return llm ? { available: true, provider: 'ollama', model: llm.model }
    : { available: false, provider: 'none', hint: 'Start Ollama (`ollama serve`) with a model pulled (e.g. `ollama pull qwen2.5:3b`), or set TRANSLATE_PROVIDER=libretranslate and LIBRETRANSLATE_URL.' };
};

const viaLibre = async (text, lang) => {
  const base = process.env.LIBRETRANSLATE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}/translate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ q: text, source: 'auto', target: libreCode(lang), format: 'text', api_key: process.env.LIBRETRANSLATE_API_KEY || undefined })
  });
  if (!res.ok) throw new Error(`LibreTranslate ${res.status}`);
  return String((await res.json()).translatedText || '').trim();
};

const CODES = { english: 'en', hindi: 'hi', spanish: 'es', french: 'fr', german: 'de', portuguese: 'pt', italian: 'it', japanese: 'ja', korean: 'ko', 'chinese (simplified)': 'zh', arabic: 'ar', russian: 'ru', bengali: 'bn', tamil: 'ta', telugu: 'te', marathi: 'mr', urdu: 'ur', turkish: 'tr', dutch: 'nl', indonesian: 'id' };
export const libreCode = (lang) => CODES[lang.toLowerCase()] || lang.toLowerCase().slice(0, 2);

const cleanModelOutput = (t) => t.replace(/^["“'`]+|["”'`]+$/g, '').split('\n')[0].trim();

const compute = async (text, lang) => {
  if (process.env.TRANSLATE_PROVIDER === 'libretranslate' && process.env.LIBRETRANSLATE_URL) return viaLibre(text, lang);
  if (!(await getLlm())) throw new TranslationUnavailable('Speech translation needs a running local model: start Ollama (`ollama serve`) and pull one, e.g. `ollama pull qwen2.5:3b`');
  return cleanModelOutput(await chatText({ system: SYSTEM(lang), user: text, maxTokens: Math.min(400, text.length * 2 + 40) }));
};

export const translate = async (text, lang) => {
  const key = `${lang}\u0000${text}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.v;
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    await slot();
    try {
      const v = (await compute(text, lang)) || text;
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
      cache.set(key, { v, at: Date.now() });
      return v;
    } finally { release(); }
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
};

export const _reset = () => { cache.clear(); inflight.clear(); waiting.length = 0; active = 0; };
