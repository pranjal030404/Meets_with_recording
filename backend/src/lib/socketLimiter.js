/**
 * Per-socket token bucket for inbound events (abuse / runaway-client protection).
 * Defaults are heuristics (burst 300, 100 events/s sustained); tune with SOCKET_EVENT_BURST / SOCKET_EVENT_RATE.
 * Excess events are dropped (acks get an error); a socket that keeps hammering is disconnected.
 */
export const createSocketLimiter = ({ burst = parseInt(process.env.SOCKET_EVENT_BURST) || 300, rate = parseInt(process.env.SOCKET_EVENT_RATE) || 100, maxDrops = parseInt(process.env.SOCKET_MAX_DROPS) || 2000, now = () => Date.now() } = {}) => {
  let tokens = burst, last = now(), drops = 0;
  return {
    /** @returns {'ok'|'drop'|'kick'} */
    take() {
      const t = now();
      tokens = Math.min(burst, tokens + ((t - last) / 1000) * rate); last = t;
      if (tokens >= 1) { tokens -= 1; return 'ok'; }
      return ++drops >= maxDrops ? 'kick' : 'drop';
    },
  };
};
