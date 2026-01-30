import cron from 'node-cron';
import Meeting from '../models/Meeting.js';
import Notification from '../models/Notification.js';
import Team from '../models/Team.js';

class ReminderService {
  constructor(io) {
    this.io = io;
    this.cronJobs = [];
  }

  // Start the reminder service
  start() {
    console.log('🔔 Starting reminder service...');

    // Check for reminders every minute
    const job = cron.schedule('* * * * *', async () => {
      await this.checkReminders();
    });

    this.cronJobs.push(job);
    
    // Check for meeting start times every minute
    const startJob = cron.schedule('* * * * *', async () => {
      await this.checkMeetingStarts();
    });

    this.cronJobs.push(startJob);

    console.log('✅ Reminder service started');
  }

  // Stop the service
  stop() {
    this.cronJobs.forEach(job => job.stop());
    console.log('⏹️  Reminder service stopped');
  }

  // Check for meetings that need reminders
  async checkReminders() {
    try {
      const now = new Date();

      // Find scheduled meetings
      const meetings = await Meeting.find({
        status: 'scheduled',
        scheduledAt: { $exists: true, $ne: null },
        'reminders.sent': false
      })
        .populate('host', 'name email')
        .populate('invitees.user', 'name email')
        .populate('team', 'name members');

      for (const meeting of meetings) {
        const scheduledTime = new Date(meeting.scheduledAt);
        const timeDiff = scheduledTime - now;
        const minutesDiff = Math.floor(timeDiff / (1000 * 60));

        // Check each reminder
        for (const reminder of meeting.reminders) {
          if (reminder.sent) continue;

          let reminderMinutes = reminder.time;
          
          // Convert to minutes
          if (reminder.unit === 'hours') {
            reminderMinutes *= 60;
          } else if (reminder.unit === 'days') {
            reminderMinutes *= 60 * 24;
          }

          // If time matches reminder window (within 1 minute)
          if (minutesDiff <= reminderMinutes && minutesDiff >= (reminderMinutes - 1)) {
            await this.sendReminder(meeting, reminder);
            reminder.sent = true;
            reminder.sentAt = new Date();
          }
        }

        // Save updated reminders
        if (meeting.isModified()) {
          await meeting.save();
        }
      }
    } catch (error) {
      console.error('Error checking reminders:', error);
    }
  }

  // Send reminder notifications
  async sendReminder(meeting, reminder) {
    try {
      const timeString = `${reminder.time} ${reminder.unit}`;
      const message = `"${meeting.title}" starts in ${timeString}`;

      // Get all recipients (invitees who accepted)
      const recipients = new Set();
      
      // Add host
      recipients.add(meeting.host._id.toString());

      // Add accepted invitees
      meeting.invitees.forEach(inv => {
        if (inv.user && inv.status === 'accepted') {
          recipients.add(inv.user._id ? inv.user._id.toString() : inv.user.toString());
        }
      });

      // If team meeting, notify all team members with notifications enabled
      if (meeting.team) {
        const team = await Team.findById(meeting.team).populate('members.user');
        if (team) {
          team.members.forEach(member => {
            if (member.notifications && member.notifications.meetings) {
              recipients.add(member.user._id.toString());
            }
          });
        }
      }

      // Create notifications for all recipients
      const notificationPromises = Array.from(recipients).map(recipientId =>
        Notification.create({
          recipient: recipientId,
          type: 'meeting_reminder',
          title: 'Meeting Reminder',
          message,
          data: {
            meetingId: meeting._id,
            link: meeting.meetingLink,
            metadata: { timeUntilStart: `${reminder.time} ${reminder.unit}` }
          },
          priority: reminder.time <= 15 && reminder.unit === 'minutes' ? 'high' : 'normal'
        })
      );

      await Promise.all(notificationPromises);

      // Send real-time notifications via Socket.IO
      recipients.forEach(recipientId => {
        this.io.to(`user:${recipientId}`).emit('notification:new', {
          type: 'meeting_reminder',
          title: 'Meeting Reminder',
          message,
          meetingId: meeting._id,
          link: meeting.meetingLink
        });
      });

      console.log(`✅ Sent reminder for meeting: ${meeting.title} (${timeString})`);
    } catch (error) {
      console.error('Error sending reminder:', error);
    }
  }

  // Check for meetings that are starting now
  async checkMeetingStarts() {
    try {
      const now = new Date();
      const oneMinuteAgo = new Date(now - 60000);

      // Find meetings scheduled to start in the last minute
      const meetings = await Meeting.find({
        status: 'scheduled',
        scheduledAt: { 
          $gte: oneMinuteAgo,
          $lte: now
        },
        'notificationsSent.started': false
      })
        .populate('host', 'name email')
        .populate('invitees.user', 'name email')
        .populate('team', 'name');

      for (const meeting of meetings) {
        await this.notifyMeetingStart(meeting);
        
        meeting.notificationsSent.started = true;
        await meeting.save();
      }
    } catch (error) {
      console.error('Error checking meeting starts:', error);
    }
  }

  // Notify participants that meeting is starting
  async notifyMeetingStart(meeting) {
    try {
      const message = `"${meeting.title}" is starting now!`;

      // Get all recipients
      const recipients = new Set();
      recipients.add(meeting.host._id.toString());

      meeting.invitees.forEach(inv => {
        if (inv.user && inv.status === 'accepted') {
          recipients.add(inv.user._id ? inv.user._id.toString() : inv.user.toString());
        }
      });

      // Create notifications
      const notificationPromises = Array.from(recipients).map(recipientId =>
        Notification.create({
          recipient: recipientId,
          type: 'meeting_started',
          title: 'Meeting Started',
          message,
          data: {
            meetingId: meeting._id,
            link: meeting.meetingLink
          },
          priority: 'urgent'
        })
      );

      await Promise.all(notificationPromises);

      // Send real-time notifications
      recipients.forEach(recipientId => {
        this.io.to(`user:${recipientId}`).emit('notification:new', {
          type: 'meeting_started',
          title: 'Meeting Started',
          message,
          meetingId: meeting._id,
          link: meeting.meetingLink,
          priority: 'urgent'
        });
      });

      console.log(`✅ Notified meeting start: ${meeting.title}`);
    } catch (error) {
      console.error('Error notifying meeting start:', error);
    }
  }
}

export default ReminderService;
