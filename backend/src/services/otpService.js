import crypto from 'crypto';
import { getRedis } from '../infrastructure/redis/redisClient.js';
import { trackState } from '../lib/stateRegistry.js';

/**
 * One-time 6-digit codes. Only a hash is kept, a code works once, and it dies after 10 minutes or 5 wrong tries.
 * Stored in Redis when configured (all instances agree), otherwise in this process.
 */
export const OTP_TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const MAX_TRIES = 5;

const local = trackState('otpCodes', new Map(), 'user'); // key -> entry
const hash = (code) => crypto.createHash('sha256').update(code).digest('hex');

const read = async (key) => {
  const r = getRedis();
  if (r) { try { return JSON.parse(await r.get(`otp:${key}`)); } catch { /* local */ } }
  const entry = local.get(key);
  if (entry && entry.expires <= Date.now()) { local.delete(key); return null; }
  return entry || null;
};

const write = async (key, entry) => {
  const r = getRedis();
  if (r) { try { await r.set(`otp:${key}`, JSON.stringify(entry), 'PX', Math.max(1, entry.expires - Date.now())); return; } catch { /* local */ } }
  local.set(key, entry);
};

export const clearCode = async (key) => {
  local.delete(key);
  try { await getRedis()?.del(`otp:${key}`); } catch { /* expires by itself */ }
};

/** A fresh code for this key, or null if one was sent less than a minute ago. */
export const issueCode = async (key) => {
  const previous = await read(key);
  if (previous && Date.now() - previous.sentAt < COOLDOWN_MS) return null;
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await write(key, { hash: hash(code), tries: 0, sentAt: Date.now(), expires: Date.now() + OTP_TTL_MS });
  return code;
};

/** True once for the right code; wrong guesses are counted against it. */
export const consumeCode = async (key, code) => {
  const entry = await read(key);
  if (!entry) return false;
  if (hash(String(code || '').trim()) === entry.hash) {
    await clearCode(key);
    return true;
  }
  entry.tries += 1;
  if (entry.tries >= MAX_TRIES) await clearCode(key);
  else await write(key, entry);
  return false;
};
