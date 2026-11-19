import Setting from '../models/Setting.js';

export const DEFAULTS = {
  // When true (and SMTP is configured), new accounts must verify their email before logging in.
  emailVerificationEnabled: false
};

export async function getSetting(key) {
  try {
    const row = await Setting.findByPk(key);
    if (row && row.value !== null && row.value !== undefined) return row.value;
  } catch (e) {
    // Settings table missing (migration 017 not run yet) -> fall back to defaults.
    console.warn(`Settings read failed for "${key}":`, e.message);
  }
  return DEFAULTS[key];
}

export async function setSetting(key, value) {
  await Setting.upsert({ key, value });
  return value;
}
