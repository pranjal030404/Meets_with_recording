/**
 * Set an administrator's password from the server:  npm run set-admin-password -- admin@example.com
 * The password is typed at a hidden prompt (or piped in), never given on the command line.
 * Signs out that administrator's existing sessions.
 */
import dotenv from 'dotenv';
import path from 'path';
import readline from 'readline';
import { Writable } from 'stream';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const { weakAdminPassword } = await import('../lib/password.js');
const { sequelize } = await import('../database/index.js');
const { default: Admin } = await import('../models/Admin.js');

const stop = (message) => { console.error(message); process.exit(1); };

const readSecret = (question) => new Promise((resolve) => {
  const muted = new Writable({ write: (chunk, enc, done) => done() });
  const rl = readline.createInterface({ input: process.stdin, output: muted, terminal: !!process.stdin.isTTY });
  process.stdout.write(question);
  rl.once('line', (line) => { rl.close(); process.stdout.write('\n'); resolve(line); });
});

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) stop('Usage: npm run set-admin-password -- <admin email>');
const admin = await Admin.findOne({ where: { email } });
if (!admin) stop(`No administrator with the address ${email}`);

const password = await readSecret('New password (at least 10 characters, hidden): ');
if (weakAdminPassword(password)) stop('Too short, or a password that has been published. Nothing changed.');
if (process.stdin.isTTY && (await readSecret('Repeat it: ')) !== password) stop('The two did not match. Nothing changed.');

admin.password = password; // hashed by the model; existing admin sessions end because the hash changes
await admin.save();
console.log(`Password changed for ${email}.`);
await sequelize.close();
process.exit(0);
