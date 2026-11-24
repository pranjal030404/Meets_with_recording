import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { UPLOADS_ROOT } from '../routes/uploads.js';

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Multer middleware: one image in field "avatar", kept in memory so we can verify the real file type before writing. */
export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
}).single('avatar');

// Trust the file's bytes, not the client-supplied mimetype/extension.
export const sniffImage = (buf) => {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.slice(0, 3).toString('ascii') === 'GIF') return 'gif';
  return null; // SVG and everything else rejected on purpose (script risk)
};

const avatarDir = (userId) => path.join(UPLOADS_ROOT, 'avatars', userId);
const urlToFile = (url) => (typeof url === 'string' && url.startsWith('/uploads/avatars/'))
  ? path.join(UPLOADS_ROOT, url.replace('/uploads/', '')) : null;

/** Saves the uploaded image for `user`, removes their previous uploaded avatar, returns the new public path. */
export async function saveAvatar(user, file) {
  const ext = sniffImage(file?.buffer);
  if (!ext) { const e = new Error('Please choose a JPG, PNG, WebP or GIF image'); e.status = 400; throw e; }
  const dir = avatarDir(user.id);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), file.buffer);
  removeAvatarFile(user.avatar);
  user.avatar = `/uploads/avatars/${user.id}/${name}`;
  await user.save();
  return user.avatar;
}

export function removeAvatarFile(url) {
  const f = urlToFile(url);
  if (!f) return;
  const abs = path.resolve(f);
  if (abs.startsWith(path.resolve(UPLOADS_ROOT, 'avatars') + path.sep)) fs.unlink(abs, () => {});
}

export async function clearAvatar(user) {
  removeAvatarFile(user.avatar);
  user.avatar = null;
  await user.save();
}

// Express wrapper turning multer errors into clean 400s
export const handleAvatarUpload = (req, res, next) => avatarUpload(req, res, (err) => {
  if (!err) return next();
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (max 5 MB)' : 'Upload failed';
  res.status(400).json({ success: false, message });
});

// Shared validation for personal details (used by self-service and admin edits)
const LIMITS = { name: 100, title: 100, department: 100, phone: 30, bio: 300, location: 100, timezone: 50 };
export function pickProfileFields(body = {}) {
  const out = {};
  for (const [k, max] of Object.entries(LIMITS)) {
    if (body[k] === undefined) continue;
    const v = body[k] === null ? '' : String(body[k]).trim();
    if (k === 'name') { if (v.length >= 2) out.name = v.slice(0, max); continue; }
    out[k] = v ? v.slice(0, max) : null;
  }
  return out;
}
