import express from 'express';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const { limit = 50, page = 1, unreadOnly = false } = req.query;

    const whereClause = { recipientId: req.user.id };

    if (unreadOnly === 'true') {
      whereClause.isRead = false;
    }

    const notifications = await Notification.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const total = await Notification.count({ where: whereClause });
    const unreadCount = await Notification.count({
      where: { recipientId: req.user.id, isRead: false }
    });

    res.json({
      success: true,
      data: {
        notifications: notifications.map(n => n.toJSON()),
        unreadCount,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
});

router.put('/:notificationId/read', async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    if (notification.recipientId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    await notification.markAsRead();

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read',
      error: error.message
    });
  }
});

router.put('/read-all', async (req, res) => {
  try {
    await Notification.update(
      { isRead: true, readAt: new Date() },
      { where: { recipientId: req.user.id, isRead: false } }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking all notifications as read',
      error: error.message
    });
  }
});

router.delete('/:notificationId', async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    if (notification.recipientId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    await notification.destroy();

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification',
      error: error.message
    });
  }
});

router.delete('/', async (req, res) => {
  try {
    await Notification.destroy({
      where: { recipientId: req.user.id, isRead: true }
    });

    res.json({
      success: true,
      message: 'Read notifications deleted'
    });
  } catch (error) {
    console.error('Delete notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notifications',
      error: error.message
    });
  }
});

export default router;
