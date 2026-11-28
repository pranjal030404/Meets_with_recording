/**
 * Ending live access. Tokens are only checked when a socket connects, so anything that takes access away
 * has to reach the sockets that are already open.
 */
import crypto from 'crypto';
import { _clearSocketAuthCache } from '../middleware/auth.js';
import { redisEnabled } from '../infrastructure/redis/redisClient.js';

export const roomOfSessionHash = (hash) => `session:${String(hash).slice(0, 32)}`;
export const sessionRoom = (token) => roomOfSessionHash(crypto.createHash('sha256').update(String(token)).digest('hex'));

/**
 * One signed-out session (this device only). A client signing out closes its own socket as soon as it has the
 * reply; waiting a moment avoids both sides closing at once, which throws in the mobile socket library.
 */
const LOGOUT_GRACE_MS = 500;
export const disconnectSession = (io, token) => {
  setTimeout(() => io?.in(sessionRoom(token)).disconnectSockets(true), LOGOUT_GRACE_MS).unref?.();
};

const FORGET_AUTH = 'auth:forget';
export const listenForAuthChanges = (io) => io.on(FORGET_AUTH, _clearSocketAuthCache);

/** Every open connection of a user: suspension, password change or reset. */
export const disconnectUser = (io, userId) => {
  _clearSocketAuthCache();
  // every server keeps its own short cache of who is allowed in; the others must forget too, or they let the user back
  if (redisEnabled()) io?.serverSideEmit(FORGET_AUTH);
  io?.in(`user:${userId}`).disconnectSockets(true);
};

/** Take a removed member's sockets out of a team or conversation room. */
export const removeFromRoom = (io, userId, room) => io?.in(`user:${userId}`).socketsLeave(room);
