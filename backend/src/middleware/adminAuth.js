import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import { getAdminPermissions } from '../lib/permissions.js';

export const generateAdminToken = (adminId) =>
  jwt.sign({ id: adminId, type: 'admin' }, process.env.JWT_SECRET, { expiresIn: '12h' });

// Accepts only tokens issued by the admin login (type: 'admin') for a row in Admins.
export const protectAdmin = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    const token = header && header.startsWith('Bearer') ? header.split(' ')[1] : null;
    if (!token) return res.status(401).json({ success: false, message: 'Not authorized - no token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'admin') {
      return res.status(401).json({ success: false, message: 'Not authorized - admin token required' });
    }
    const admin = await Admin.findByPk(decoded.id);
    if (!admin) return res.status(401).json({ success: false, message: 'Not authorized - admin not found' });

    req.admin = admin;
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
