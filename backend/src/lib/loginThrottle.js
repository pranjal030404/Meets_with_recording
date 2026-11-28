/** Per-account protection against password guessing, on top of the per-address rate limit. */
import { createRateLimiter } from '../middleware/rateLimit.js';
import { knownDevice } from './knownDevice.js';

const WINDOW_MS = 15 * 60 * 1000;
const PER_ADDRESS = createRateLimiter({ windowMs: WINDOW_MS, max: 10, prefix: 'rl:login-ip', durable: true });
const PER_ACCOUNT = createRateLimiter({ windowMs: WINDOW_MS, max: 30, prefix: 'rl:login', durable: true });
const PER_DEVICE = createRateLimiter({ windowMs: WINDOW_MS, max: 10, prefix: 'rl:login-dev', durable: true });

// A device that has signed in before is counted on its own; strangers share the account's allowance
const keys = (req, account) => {
  const device = knownDevice(req, account);
  return device
    ? [[PER_DEVICE, `${account}|${device}`, 10]]
    : [[PER_ADDRESS, `${account}|${req.ip}`, 10], [PER_ACCOUNT, account, 30]];
};

/** Answers 429 and returns true when this account has had too many wrong passwords recently. `hint`: a way on. */
export const tooManyAttempts = async (req, res, account, hint = '') => {
  for (const [limiter, key, max] of keys(req, account)) {
    if (await limiter.count(key) >= max) {
      res.status(429).json({ success: false, message: `Too many wrong passwords. Try again in 15 minutes.${hint}` });
      return true;
    }
  }
  return false;
};
export const recordFailure = async (req, account) => { for (const [limiter, key] of keys(req, account)) await limiter.hit(key); };
export const clearFailures = async (req, account) => {
  for (const [limiter, key] of keys(req, account)) if (limiter !== PER_ACCOUNT) await limiter.reset(key);
};
