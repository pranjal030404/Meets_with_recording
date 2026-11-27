/**
 * Two checks on what people share with each other:
 *  - files that run when opened are refused by name (BLOCKED_UPLOAD_EXTENSIONS replaces the list; "none" turns it off);
 *  - with CLAMAV_HOST set, every upload is scanned by clamd. A scanner that cannot be reached refuses the upload:
 *    "not scanned" must never look like "clean".
 */
import fs from 'fs';
import net from 'net';

const DEFAULT_BLOCKED = 'exe,msi,msp,bat,cmd,com,scr,pif,cpl,vbs,vbe,jse,wsf,wsh,hta,ps1,psm1,lnk,reg,inf,jar,apk,dll,sys,appx,msix';

export const blockedExtension = (name, env = process.env) => {
  const setting = env.BLOCKED_UPLOAD_EXTENSIONS || DEFAULT_BLOCKED;
  if (setting === 'none') return null;
  // trailing dots and spaces are dropped by Windows: "a.exe. " still runs
  const ext = String(name || '').replace(/[. ]+$/, '').split('.').pop().toLowerCase();
  return setting.split(',').map((e) => e.trim().toLowerCase()).includes(ext) ? ext : null;
};

/** clamd INSTREAM. Resolves to { clean, signature } and rejects when no verdict could be had. */
export const scanFile = (file, { host = process.env.CLAMAV_HOST, port = Number(process.env.CLAMAV_PORT) || 3310, timeoutMs = 60000 } = {}) => new Promise((resolve, reject) => {
  const socket = net.connect(port, host);
  let reply = '';
  const fail = (e) => { socket.destroy(); reject(e); };
  socket.setTimeout(timeoutMs, () => fail(new Error('virus scanner timed out')));
  socket.on('error', fail);
  socket.on('data', (d) => { reply += d; });
  socket.on('close', () => {
    const found = reply.match(/stream: (.+) FOUND/);
    if (found) return resolve({ clean: false, signature: found[1] });
    if (/stream: OK/.test(reply)) return resolve({ clean: true });
    reject(new Error(`virus scanner gave no verdict: ${reply.slice(0, 100)}`));
  });
  socket.on('connect', () => {
    socket.write('zINSTREAM\0');
    const input = fs.createReadStream(file, { highWaterMark: 64 * 1024 });
    input.on('error', fail);
    input.on('data', (chunk) => {
      const size = Buffer.alloc(4);
      size.writeUInt32BE(chunk.length);
      socket.write(size);
      if (!socket.write(chunk)) { input.pause(); socket.once('drain', () => input.resume()); }
    });
    input.on('end', () => socket.write(Buffer.alloc(4)));
  });
});

/** Why this uploaded file may not be kept, as { status, message }, or null. */
export const uploadRefusal = async (file) => {
  const ext = blockedExtension(file.originalname);
  if (ext) return { status: 415, message: `.${ext} files cannot be shared` };
  if (!process.env.CLAMAV_HOST) return null;
  try {
    const { clean, signature } = await scanFile(file.path);
    if (clean) return null;
    console.warn(`[uploads] refused infected file: ${signature}`);
    return { status: 422, message: 'This file was refused by the virus scanner' };
  } catch (e) {
    console.error(`[uploads] scan failed: ${e.message}`);
    return { status: 503, message: 'Files cannot be checked right now. Please try again later.' };
  }
};
