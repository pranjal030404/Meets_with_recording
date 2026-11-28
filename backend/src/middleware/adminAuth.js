import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import { tokenFrom, ADMIN_COOKIE } from '../lib/webSession.js';
import { isRevoked } from '../lib/sessionRevocation.js';
import { getAdminPermissions } from '../lib/permissions.js';

// Ties a token to the password it was issued under: changing the password ends every older admin session
const passwordStamp = (hash) => crypto.createHash('sha256').update(String(hash)).digest('hex').slice(0, 16);

export const generateAdminToken = (admin) =>
  jwt.sign({ id: admin.id, type: 'admin', pv: passwordStamp(admin.password) }, process.env.JWT_SECRET, { expiresIn: '12h' });

// Accepts only tokens issued by the admin login (type: 'admin') for a row in Admins.
export const protectAdmin = async (req, res, next) => {
  try {
    const token = tokenFrom(req, ADMIN_COOKIE);
    if (!token) return res.status(401).json({ success: false, message: 'Not authorized - no token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'admin') {
      return res.status(401).json({ success: false, message: 'Not authorized - admin token required' });
    }
    const admin = await Admin.findByPk(decoded.id, { attributes: { include: ['password'] }, useMaster: true });
    if (!admin) return res.status(401).json({ success: false, message: 'Not authorized - admin not found' });
    if (decoded.pv !== passwordStamp(admin.password)) return res.status(401).json({ success: false, message: 'Not authorized - sign in again' });

    if (await isRevoked(token, decoded)) return res.status(401).json({ success: false, message: 'Not authorized - session ended' });

    req.admin = admin;
    req.sessionToken = token;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Not authorized - invalid token' });
  }
};

export const requireAdminPermission = (permission) => async (req, res, next) => {
  try {
    const perms = await getAdminPermissions(req.admin);
    if (!perms.includes(permission)) {
      return res.status(403).json({ success: false, message: 'Your admin role does not allow this action' });
    }
    next();
  } catch (e) {
    next(e);
  }
};
