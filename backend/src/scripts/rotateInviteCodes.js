/**
 * Replace the old 8-character team invite codes with 16-character ones:  npm run rotate-invite-codes
 * Codes already sent to people stop working, so tell team owners to share the new one.
 */
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const { sequelize } = await import('../database/index.js');
const { default: Team } = await import('../models/Team.js');

let changed = 0;
for (const team of await Team.findAll({ attributes: ['id', 'inviteCode'] })) {
  if ((team.inviteCode || '').length >= 16) continue;
  await Team.update({ inviteCode: crypto.randomBytes(8).toString('hex') }, { where: { id: team.id } });
  changed += 1;
}
console.log(`${changed} invite code(s) replaced.`);
await sequelize.close();
process.exit(0);
