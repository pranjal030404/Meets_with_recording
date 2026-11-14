import OpenAI from 'openai';

/**
 * Optional LLM layer. Everything works without it (rule-based cleaner + extractive notes);
 * a model only makes the output nicer. Order for AI_PROVIDER=auto: local Ollama (free) → OpenAI → none.
 *   AI_PROVIDER=auto|ollama|openai|none     OLLAMA_URL (default http://127.0.0.1:11434)     OLLAMA_MODEL
 */

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const PREFERRED = ['qwen2.5', 'llama3.2', 'llama3.1', 'gemma3', 'gemma2', 'mistral', 'phi3', 'phi4'];

let ollamaCache = { at: 0, model: null };

const detectOllama = async () => {
  if (Date.now() - ollamaCache.at < 30_000) return ollamaCache.model;
  let model = null;
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const names = ((await res.json()).models || []).map((m) => m.name);
      model = process.env.OLLAMA_MODEL
        || PREFERRED.map((p) => names.find((n) => n.startsWith(p))).find(Boolean)
        || names[0]
        || null;
    }
  } catch { /* not running */ }
  ollamaCache = { at: Date.now(), model };
  return model;
};

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

/** { name: 'ollama'|'openai', model } or null when no model is available. */
export const getLlm = async () => {
  const want = (process.env.AI_PROVIDER || 'auto').toLowerCase();
  if (want === 'none') return null;
  if (want === 'auto' || want === 'ollama') {
    const model = await detectOllama();
    if (model) return { name: 'ollama', model };
    if (want === 'ollama') return null;
  }
  if (openai) return { name: 'openai', model: process.env.OPENAI_SUMMARY_MODEL || 'gpt-4o-mini' };
  return null;
};

/** Send a system+user prompt expecting JSON back. Returns the parsed object (throws on failure). */
export const chatJSON = async ({ system, user, timeoutMs = 120_000 }) => {
  const llm = await getLlm();
  if (!llm) throw new Error('No LLM available');

  if (llm.name === 'ollama') {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model: llm.model,
        stream: false,
        format: 'json',
        options: { temperature: 0.1, num_ctx: 8192 },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    return JSON.parse((await res.json()).message?.content || '{}');
  }

  const c = await openai.chat.completions.create({
    model: llm.model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
  });
  return JSON.parse(c.choices[0]?.message?.content || '{}');
};
