import path from 'path';

/** Object keys are server-generated paths like `recordings/<roomId>/<file>`. Reject anything that could escape. */
export const assertSafeKey = (key) => {
  if (typeof key !== 'string' || !key || key.length > 512) throw new Error('Invalid storage key');
  if (key.startsWith('/') || key.includes('\\') || key.includes('\0')) throw new Error('Invalid storage key');
  const norm = path.posix.normalize(key);
  if (norm !== key || norm.split('/').some((p) => p === '..' || p === '')) throw new Error('Invalid storage key');
  return key;
};
