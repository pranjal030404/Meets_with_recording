import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { primary } from '../database/index.js';
import { isRevoked, revokeToken } from '../lib/sessionRevocation.js';

const ASSET_COOKIE = 'mc_assets';
/** Keep the HttpOnly file-access cookie in step with the session token (Path=/uploads only). Lets <img>/<video>/<a> load private files with no frontend change. */
const syncAssetCookie = (req, res, token) => {
  if (req.headers.cookie?.includes(`${ASSET_COOKIE}=${token}`)) return;
  const secure = req.secure || process.env.NODE_ENV === 'production';
  res.append('Set-Cookie', `${ASSET_COOKIE}=${token}; Path=/uploads; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secure ? '; Secure' : ''}`);
};
export { revokeToken };
export const clearAssetCookie = (res) => res.append('Set-Cookie', `${ASSET_COOKIE}=; Path=/uploads; HttpOnly; SameSite=Lax; Max-Age=0`);

export const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - no token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (await isRevoked(token, decoded)) {
      return res.status(401).json({ success: false, message: 'Not authorized - session ended' });
    }

    const user = await User.findByPk(decoded.id, {
      attributes: { include: ['password'] },
      ...primary // suspension/role changes must take effect immediately, not after replica lag
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized - user not found'
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Contact an administrator.'
      });
    }

    req.user = user;
    syncAssetCookie(req, res, token);
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Not authorized - invalid token'
    });
  }
};

// Socket handshakes arrive in storms (a node restarts and every client reconnects at once). A short per-process cache of the
// user row turns N lookups per user into 1 per window. Suspensions/role changes take effect within SOCKET_AUTH_CACHE_MS.
import { trackState } from '../lib/stateRegistry.js';
const SOCKET_AUTH_CACHE_MS = process.env.SOCKET_AUTH_CACHE_MS !== undefined ? parseInt(process.env.SOCKET_AUTH_CACHE_MS) : 10000;
const socketUserCache = trackState('socketUserCache', new Map(), 'cache'); // userId -> { user, at }
export const _clearSocketAuthCache = () => socketUserCache.clear();

export const verifySocketToken = async (token) => {
  try {
    if (!token) return null;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (await isRevoked(token, decoded)) return null; // revocation is checked on every handshake, never cached

    const hit = SOCKET_AUTH_CACHE_MS > 0 ? socketUserCache.get(decoded.id) : null;
    if (hit && Date.now() - hit.at < SOCKET_AUTH_CACHE_MS) return hit.user;

    const user = await User.findByPk(decoded.id, primary);
    if (user && user.isActive === false) { socketUserCache.delete(decoded.id); return null; }
    if (user && SOCKET_AUTH_CACHE_MS > 0) {
      socketUserCache.set(decoded.id, { user, at: Date.now() });
      if (socketUserCache.size > 20000) for (const k of socketUserCache.keys()) { socketUserCache.delete(k); if (socketUserCache.size <= 10000) break; }
    }

    return user;
  } catch (error) {
    console.error('Socket auth error:', error.message);
    return null;
  }
};

export const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};
