import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Op } from 'sequelize';
import FileEntry from '../models/FileEntry.js';
import Team from '../models/Team.js';
import ConversationMember from '../models/ConversationMember.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';
import logAudit from '../services/auditService.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads/files');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_ROOT, req.user.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeOriginal}`);
  }
});

const FILE_SIZE_LIMIT = parseInt(process.env.FILE_SIZE_LIMIT_MB) * 1024 * 1024 || 50 * 1024 * 1024;

const upload = multer({
  storage,
  limits: { fileSize: FILE_SIZE_LIMIT }
});

// Upload a file (optionally attached to a team channel or conversation)
router.post('/upload', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { teamId, conversationId, meetingId } = req.body;

    if (teamId) {
      const team = await Team.findByPk(teamId);
      if (!team || !team.isMember(req.user.id)) {
        fs.unlink(req.file.path, () => {});
        return res.status(403).json({ success: false, message: 'Not a member of this team' });
      }
    }
    if (conversationId) {
      const membership = await ConversationMember.findOne({
        where: { conversationId, userId: req.user.id }
      });
      if (!membership) {
        fs.unlink(req.file.path, () => {});
        return res.status(403).json({ success: false, message: 'Not a member of this conversation' });
      }
    }

    const relativeUrl = `/uploads/files/${req.user.id}/${req.file.filename}`;

    const fileEntry = await FileEntry.create({
      ownerId: req.user.id,
      teamId: teamId || null,
      conversationId: conversationId || null,
      meetingId: meetingId || null,
      originalName: req.file.originalname,
      fileName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: relativeUrl,
      category: teamId ? 'team' : conversationId ? 'shared' : 'personal'
    });

    logAudit({
      actor: req.user,
      action: 'file.upload',
      entityType: 'File',
      entityId: fileEntry.id,
      metadata: { name: req.file.originalname, size: req.file.size, teamId: teamId || null },
      req
    });

    const full = await FileEntry.findByPk(fileEntry.id, {
      include: [{ model: User, as: 'owner', attributes: ['id', 'name', 'avatar'] }]
    });

    res.status(201).json({ success: true, data: { file: full.toJSON() } });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ success: false, message: 'Error uploading file', error: error.message });
  }
});

// List files
router.get('/', protect, async (req, res) => {
  try {
    const { scope = 'mine', teamId, search } = req.query;
    const where = { isDeleted: false };

    if (scope === 'team') {
      if (!teamId) return res.status(400).json({ success: false, message: 'teamId is required for team scope' });
      const team = await Team.findByPk(teamId);
      if (!team || !team.isMember(req.user.id)) {
        return res.status(403).json({ success: false, message: 'Not a member of this team' });
      }
      where.teamId = teamId;
    } else {
      where.ownerId = req.user.id;
    }

    if (search) {
      where.originalName = { [Op.like]: `%${search}%` };
    }

    const files = await FileEntry.findAll({
      where,
      include: [{ model: User, as: 'owner', attributes: ['id', 'name', 'avatar'] }],
      order: [['createdAt', 'DESC']],
      limit: 300
    });

    res.json({ success: true, data: { files: files.map(f => f.toJSON()) } });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ success: false, message: 'Error fetching files', error: error.message });
  }
});

// Storage usage summary
router.get('/storage/summary', protect, async (req, res) => {
  try {
    const [personal] = await FileEntry.findAll({
      where: { ownerId: req.user.id, isDeleted: false },
      attributes: [[FileEntry.sequelize.fn('COALESCE', FileEntry.sequelize.fn('SUM', FileEntry.sequelize.col('size')), 0), 'bytes']],
      raw: true
    });

    res.json({ success: true, data: { personalBytes: Number(personal?.bytes || 0) } });
  } catch (error) {
    console.error('Storage summary error:', error);
    res.status(500).json({ success: false, message: 'Error fetching storage summary', error: error.message });
  }
});

// Download a file
router.get('/:fileId/download', protect, async (req, res) => {
  try {
    const fileEntry = await FileEntry.findByPk(req.params.fileId);
    if (!fileEntry || fileEntry.isDeleted) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Permission: owner, team member, or conversation member
    let allowed = fileEntry.ownerId === req.user.id;
    if (!allowed && fileEntry.teamId) {
      const team = await Team.findByPk(fileEntry.teamId);
      allowed = !!team && team.isMember(req.user.id);
    }
    if (!allowed && fileEntry.conversationId) {
      const membership = await ConversationMember.findOne({
        where: { conversationId: fileEntry.conversationId, userId: req.user.id }
      });
      allowed = !!membership;
    }
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'No access to this file' });
    }

    const filePath = path.join(UPLOAD_ROOT, fileEntry.ownerId, fileEntry.fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File missing from storage' });
    }

    logAudit({ actor: req.user, action: 'file.download', entityType: 'File', entityId: fileEntry.id, req });
    res.download(filePath, fileEntry.originalName);
  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({ success: false, message: 'Error downloading file', error: error.message });
  }
});

// Soft-delete a file (owner only) — restorable
router.delete('/:fileId', protect, async (req, res) => {
  try {
    const fileEntry = await FileEntry.findByPk(req.params.fileId);
    if (!fileEntry || fileEntry.isDeleted) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    if (fileEntry.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Only the owner can delete this file' });
    }

    await fileEntry.update({ isDeleted: true });
    logAudit({ actor: req.user, action: 'file.delete', entityType: 'File', entityId: fileEntry.id, req });

    res.json({ success: true, message: 'File moved to trash' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ success: false, message: 'Error deleting file', error: error.message });
  }
});

// List trashed files of mine
router.get('/trash/list', protect, async (req, res) => {
  try {
    const files = await FileEntry.findAll({
      where: { ownerId: req.user.id, isDeleted: true },
      order: [['updatedAt', 'DESC']],
      limit: 100
    });
    res.json({ success: true, data: { files: files.map(f => f.toJSON()) } });
  } catch (error) {
    console.error('List trash error:', error);
    res.status(500).json({ success: false, message: 'Error fetching trash', error: error.message });
  }
});

// Restore from trash
router.put('/:fileId/restore', protect, async (req, res) => {
  try {
    const fileEntry = await FileEntry.findOne({ where: { id: req.params.fileId, ownerId: req.user.id, isDeleted: true } });
    if (!fileEntry) return res.status(404).json({ success: false, message: 'File not found in trash' });
    await fileEntry.update({ isDeleted: false });
    res.json({ success: true, data: { file: fileEntry.toJSON() } });
  } catch (error) {
    console.error('Restore file error:', error);
    res.status(500).json({ success: false, message: 'Error restoring file', error: error.message });
  }
});

export default router;
