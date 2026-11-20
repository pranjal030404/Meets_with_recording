import express from 'express';
import { protect } from '../middleware/auth.js';
import { buildIceServers } from '../lib/turnCredentials.js';

const router = express.Router();

// Authenticated clients fetch STUN/TURN config here; TURN credentials are per-user and expire (default 1h).
router.get('/ice-servers', protect, (req, res) => {
  const { iceServers, ttlSec } = buildIceServers(req.user.id);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ success: true, iceServers, ttlSec });
});

export default router;
