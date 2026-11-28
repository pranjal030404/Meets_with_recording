/**
 * Password hashing in libuv's thread pool. The pure-JavaScript library ran on the event loop: about three
 * logins a second, with every meeting stalled meanwhile. Hashes are compatible, so nobody has to reset.
 */
import os from 'os';
import bcrypt from 'bcrypt';

// Never occupy every pool thread with hashing: file and name lookups share that pool
const slots = Math.max(1, Math.min((Number(process.env.UV_THREADPOOL_SIZE) || 4) - 1, os.availableParallelism?.() || os.cpus().length));
let busy = 0;
const waiting = [];
const inSlot = async (work) => {
  if (busy >= slots) await new Promise((resolve) => waiting.push(resolve));
  else busy += 1;
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next(); // hand the slot straight on
    else busy -= 1;
  }
};

export const MIN_PASSWORD_LENGTH = 6;
export const hashPassword = (plain) => inSlot(async () => bcrypt.hash(String(plain), await bcrypt.genSalt(12)));
export const checkPassword = (plain, hash) => inSlot(() => bcrypt.compare(String(plain), String(hash)));

// Values that have been published in this repository: never acceptable for an administrator
export const PUBLISHED_PASSWORDS = ['SuperAdmin@2026', 'Admin@hellohere', 'changeme', 'password'];
export const weakAdminPassword = (p) => !p || String(p).length < 10 || PUBLISHED_PASSWORDS.includes(String(p));
