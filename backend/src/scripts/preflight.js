/**
 * Run on the server before deploying:  npm run preflight
 * Exits 1 on anything that must be fixed first. Changes nothing.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const { checkConfig } = await import('../lib/configCheck.js');
const { PUBLISHED_PASSWORDS, weakAdminPassword, checkPassword } = await import('../lib/password.js');
const { sequelize } = await import('../database/index.js');

const { fatal, warnings } = checkConfig();

const [major, minor] = process.versions.node.split('.').map(Number);
if (!((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22)) fatal.push(`Node ${process.versions.node} is too old: install Node 22 LTS`);
if (process.env.NODE_ENV !== 'production') warnings.push('NODE_ENV is not "production" in backend/.env: unless the process manager sets it (pm2 --env production), the start-up safety check is off');
if (process.env.SUPERADMIN_PASSWORD && weakAdminPassword(process.env.SUPERADMIN_PASSWORD)) warnings.push('SUPERADMIN_PASSWORD in .env is published or too short: remove or replace it');

try {
  await sequelize.authenticate();
  const [admins] = await sequelize.query('SELECT email, password FROM Admins').catch(() => [[]]);
  for (const admin of admins) {
    for (const published of PUBLISHED_PASSWORDS) {
      if (!(await checkPassword(published, admin.password))) continue;
      fatal.push(`Administrator ${admin.email} uses a published password. Fix with: npm run set-admin-password -- ${admin.email}`);
      break;
    }
  }
} catch (e) {
  fatal.push(`Cannot reach the database: ${e.message}`);
}

for (const w of warnings) console.log(`WARNING  ${w}`);
for (const f of fatal) console.log(`MUST FIX ${f}`);
console.log(fatal.length ? `\n${fatal.length} problem(s) must be fixed before deploying.` : `\nNo blocking problems (${warnings.length} warning(s)).`);
process.exit(fatal.length ? 1 : 0);
