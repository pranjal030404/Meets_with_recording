/**
 * A browser or phone that has signed in to an account before gets its own allowance of wrong passwords and codes, so
 * somebody else guessing at that address cannot lock its owner out. The mark only affects throttling: it never signs
 * anyone in. The web app holds it in a cookie; other clients send it back as `X-Device-Token`.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { isWebClient, readCookie } from './webSession.js';

const COOKIE = 'mc_device';
const DAYS = 180;
const accountKey = (account) => crypto.createHash('sha256').update(String(account).toLowerCase()).digest('hex').slice(0, 24);

const read = (req) => {
  const raw = req.headers['x-device-token'] || readCookie(req.headers.cookie, COOKIE);
  if (!raw) return null;
  try {
    const mark = jwt.verify(String(raw), process.env.JWT_SECRET);
    return mark.type === 'device' && Array.isArray(mark.accounts) ? mark : null;
  } catch {
    return null;
  }
};

/** The device's id if it has signed in to this account before, else null. */
export const knownDevice = (req, account) => {
  const mark = read(req);
  return mark?.accounts.includes(accountKey(account)) ? mark.did : null;
};

/** Mark this device after a proven sign-in. Returns what to add to the answer for clients without cookies. */
export const rememberDevice = (req, res, account) => {
  const mark = read(req);
  const key = accountKey(account);
  const accounts = [key, ...(mark?.accounts || []).filter((a) => a !== key)].slice(0, 5);
  const token = jwt.sign({ type: 'device', did: mark?.did || crypto.randomUUID(), accounts }, process.env.JWT_SECRET, { expiresIn: `${DAYS}d` });
  if (!isWebClient(req)) return { deviceToken: token };
  const secure = req.secure || (process.env.NODE_ENV === 'production' && !String(process.env.CLIENT_URL).startsWith('http://')) ? '; Secure' : '';
  res.append('Set-Cookie', `${COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${DAYS * 86400}${secure}`);
  return {};
};
