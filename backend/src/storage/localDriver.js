import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { assertSafeKey } from './keys.js';

/**
 * Local-disk driver (current behaviour) with HMAC-signed, expiring download URLs served by
 * GET /api/storage/local. Suitable for single-node/dev; use the S3 driver for multi-node (disk is not shared).
 */
export const createLocalDriver = ({ root, secret, baseUrl = '/api/storage/local' }) => {
  if (!secret) throw new Error('Local storage signing needs a secret');
  const abs = (key) => {
    const p = path.resolve(root, assertSafeKey(key));
    if (!p.startsWith(path.resolve(root) + path.sep)) throw new Error('Invalid storage key');
    return p;
  };
  const sign = (payload) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

  return {
    name: 'local',
    async putObject(key, body) {
      const p = abs(key);
      await fsp.mkdir(path.dirname(p), { recursive: true });
      if (Buffer.isBuffer(body) || typeof body === 'string') await fsp.writeFile(p, body);
      else await new Promise((res, rej) => body.pipe(fs.createWriteStream(p)).on('finish', res).on('error', rej));
    },
    async headObject(key) {
      try { const st = await fsp.stat(abs(key)); return { size: st.size }; } catch { return null; }
    },
    async deleteObject(key) { await fsp.unlink(abs(key)).catch(() => {}); },
    async getSignedDownloadUrl(key, { expiresSec = 300, filename } = {}) {
      assertSafeKey(key);
      const payload = Buffer.from(JSON.stringify({ k: key, e: Math.floor(Date.now() / 1000) + expiresSec, f: filename || null })).toString('base64url');
      return `${baseUrl}?t=${payload}.${sign(payload)}`;
    },
    /** Verify a token from getSignedDownloadUrl; returns { path, filename } or null. */
    verifyToken(token) {
      const [payload, sig] = String(token || '').split('.');
      if (!payload || !sig) return null;
      const expected = sign(payload);
      if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
      try {
        const { k, e, f } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!Number.isFinite(e) || e < Date.now() / 1000) return null;
        return { path: abs(k), filename: f };
      } catch { return null; }
    },
    // Direct-to-storage uploads only make sense with S3; local keeps using the multer routes.
    async getSignedUploadUrl() { throw new Error('Signed uploads require STORAGE_DRIVER=s3'); },
  };
};
