/**
 * Optional, 100% free LLM layer. Everything works without it (rule-based cleaner + extractive notes);
 * a local Ollama model only makes the output nicer. No paid / cloud API is used anywhere.
 *   AI_PROVIDER=auto|ollama|none     OLLAMA_URL (default http://127.0.0.1:11434)     OLLAMA_MODEL
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

/** { name: 'ollama', model } or null when no local model is available. */
export const getLlm = async () => {
  const want = (process.env.AI_PROVIDER || 'auto').toLowerCase();
  if (want === 'none') return null;
  const model = await detectOllama();
  return model ? { name: 'ollama', model } : null;
};

/** Send a system+user prompt expecting JSON back. Returns the parsed object (throws on failure). */
export const chatJSON = async ({ system, user, timeoutMs = 120_000 }) => {
  const llm = await getLlm();
  if (!llm) throw new Error('No LLM available');

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
};

/**
 * Fast plain-text completion for short, latency-sensitive jobs (live-caption translation).
 * Small context + capped output + keep_alive keeps the model resident, which is what makes a 3B model usable in real time.
 */
export const chatText = async ({ system, user, timeoutMs = 20_000, maxTokens = 256, numCtx = 1024 }) => {
  const llm = await getLlm();
  if (!llm) throw new Error('No LLM available');
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: llm.model, stream: false, keep_alive: process.env.OLLAMA_KEEP_ALIVE || '30m',
      options: { temperature: 0, num_ctx: numCtx, num_predict: maxTokens },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    })
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  return String((await res.json()).message?.content || '').trim();
};

/** Drop connection-state caches so a freshly started Ollama is noticed immediately. */
export const resetLlmCache = () => { ollamaCache = { at: 0, model: null }; };
