/**
 * Explicit registry of every in-process collection that holds runtime state (Maps/Sets/arrays).
 * Purpose: make hidden per-process state visible. Each entry is exported as a Prometheus gauge
 * (inmemory_state_entries{store}) so a leak — a Map that only grows — shows up on a dashboard, and tests can assert
 * that closing a room/socket leaves nothing behind.
 */
const stores = new Map(); // name -> { ref, scope }

/** scope: 'room' | 'socket' | 'user' | 'cache' | 'global' — documents who is responsible for cleanup. */
export const trackState = (name, collection, scope = 'global') => {
  stores.set(name, { ref: collection, scope });
  return collection;
};

const sizeOf = (c) => (typeof c.size === 'number' ? c.size : Array.isArray(c) ? c.length : 0);

export const stateSizes = () => {
  const out = {};
  for (const [name, { ref, scope }] of stores) out[name] = { size: sizeOf(ref), scope };
  return out;
};

export const stateEntries = () => [...stores.entries()].map(([name, { ref, scope }]) => ({ name, scope, size: sizeOf(ref) }));
