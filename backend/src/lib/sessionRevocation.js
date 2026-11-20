import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getRedis } from '../infrastructure/redis/redisClient.js';

/**
 * Token revocation for the stateless 7-day JWTs. Denylist entries live exactly as long as the token would still be valid.
 *   revoked:<sha256(token)>        -> one session (logout)
 *   session:min-iat:<userId>       -> every token issued before this instant (password change / "sign out everywhere")
 * Shared through Redis so ALL nodes agree. Without Redis it falls back to a process-local set (single-node only).
 * Failure policy: if Redis is unreachable the check FAILS OPEN (availability over strictness) and logs once; set
 * SESSION_REVOCATION_FAIL_CLOSED=true to reject all tokens instead while Redis is down.
 */
const local = { tokens: new Map(), minIat: new Map() }; // fallback (key -> expiresAtMs / userId -> iatSec)
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const withTimeout = (p, ms = 300) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('redis timeout')), ms))]);
let warned = 0;
const warnOnce = (e) => { if (Date.now() - warned > 30000) { warned = Date.now(); console.warn(`[revocation] check skipped: ${e.message}`); } };

export const revokeToken = async (token) => {
  const decoded = jwt.decode(token);
  const ttl = Math.max(1, (decoded?.exp || Math.floor(Date.now() / 1000) + 3600) - Math.floor(Date.now() / 1000));
  const r = getRedis();
  if (r) { try { await withTimeout(r.set(`revoked:${hash(token)}`, '1', 'EX', ttl)); return; } catch (e) { warnOnce(e); } }
  local.tokens.set(hash(token), Date.now() + ttl * 1000);
};

export const revokeUserSessions = async (userId) => {
  const nowSec = Math.floor(Date.now() / 1000);
  const r = getRedis();
  if (r) { try { await withTimeout(r.set(`session:min-iat:${userId}`, String(nowSec), 'EX', 8 * 24 * 3600)); return; } catch (e) { warnOnce(e); } }
  local.minIat.set(userId, nowSec);
};

/** @returns {Promise<boolean>} true => reject this token */
export const isRevoked = async (token, decoded = jwt.decode(token)) => {
  const h = hash(token);
  const exp = local.tokens.get(h);
  if (exp) { if (exp > Date.now()) return true; local.tokens.delete(h); }
  if (decoded?.id && (local.minIat.get(decoded.id) || 0) > (decoded.iat || 0)) return true;
  const r = getRedis();
  if (!r) return false;
  try {
    const [rev, minIat] = await withTimeout(Promise.all([r.exists(`revoked:${h}`), decoded?.id ? r.get(`session:min-iat:${decoded.id}`) : null]));
    return rev === 1 || (minIat != null && Number(minIat) > (decoded?.iat || 0));
  } catch (e) {
    warnOnce(e);
    return process.env.SESSION_REVOCATION_FAIL_CLOSED === 'true';
  }
};
