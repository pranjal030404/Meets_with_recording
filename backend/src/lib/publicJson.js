/** Server-side file locations are for the server. Returns a copy without them. */
const PRIVATE = new Set(['path', 'storageKey']);
export const withoutServerPaths = (value) => {
  if (Array.isArray(value)) return value.map(withoutServerPaths);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => !PRIVATE.has(k)).map(([k, v]) => [k, withoutServerPaths(v)]));
};
