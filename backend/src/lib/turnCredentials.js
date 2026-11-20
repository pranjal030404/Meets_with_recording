import crypto from 'crypto';

/**
 * coturn "TURN REST API" time-limited credentials (turnserver `use-auth-secret` + `static-auth-secret`):
 *   username   = <unix expiry>:<userId>
 *   credential = base64( HMAC-SHA1(secret, username) )
 * The shared secret never leaves the server; clients only get a credential that expires on its own.
 * (HMAC-SHA1 is mandated by the coturn REST scheme, not a choice here.)
 */
export const makeTurnCredential = (userId, secret, ttlSec = 3600, now = Date.now()) => {
  const username = `${Math.floor(now / 1000) + ttlSec}:${userId}`;
  return { username, credential: crypto.createHmac('sha1', secret).update(username).digest('base64') };
};

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

/** ICE server list for one authenticated user. TURN entries appear only when TURN_SECRET + TURN_URLS are configured. */
export const buildIceServers = (userId, env = process.env, now = Date.now()) => {
  const out = [];
  const stun = list(env.STUN_URLS || 'stun:stun.l.google.com:19302');
  if (stun.length) out.push({ urls: stun });
  const turn = list(env.TURN_URLS);
  if (env.TURN_SECRET && turn.length) {
    const ttl = parseInt(env.TURN_TTL_SEC) || 3600;
    out.push({ urls: turn, ...makeTurnCredential(userId, env.TURN_SECRET, ttl, now) });
    return { iceServers: out, ttlSec: ttl };
  }
  // Legacy static credential (previous behaviour). Static secrets sent to every client are weak: prefer TURN_SECRET.
  if (env.TURN_SERVER_URL && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    out.push({ urls: env.TURN_SERVER_URL, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  }
  return { iceServers: out, ttlSec: 3600 };
};
