import { Op } from 'sequelize';
import cron from 'node-cron';
import Meeting from '../models/Meeting.js';
import Notification from '../models/Notification.js';
import Team from '../models/Team.js';

class ReminderService {
  constructor(io) {
    this.io = io;
    this.cronJobs = [];
  }

  start() {
    console.log('Starting reminder service...');

    const job = cron.schedule('* * * * *', async () => {
      await this.checkReminders();
    });

    this.cronJobs.push(job);

    const startJob = cron.schedule('* * * * *', async () => {
      await this.checkMeetingStarts();
    });

    this.cronJobs.push(startJob);

    console.log('Reminder service started');
  }

  stop() {
    this.cronJobs.forEach(job => job.stop());
    console.log('Reminder service stopped');
  }

  async checkReminders() {
    try {
      const now = new Date();

      const meetings = await Meeting.findAll({
        where: {
          status: 'scheduled',
          scheduledAt: { [Op.ne]: null }
        }
      });

      for (const meeting of meetings) {
        const reminders = meeting.reminders || [];
        const unsentReminders = reminders.filter(r => !r.sent);
        if (unsentReminders.length === 0) continue;

        const scheduledTime = new Date(meeting.scheduledAt);
        const timeDiff = scheduledTime - now;
        const minutesDiff = Math.floor(timeDiff / (1000 * 60));

        let changed = false;

        for (const reminder of reminders) {
          if (reminder.sent) continue;

          let reminderMinutes = reminder.time;

          if (reminder.unit === 'hours') {
            reminderMinutes *= 60;
          } else if (reminder.unit === 'days') {
            reminderMinutes *= 60 * 24;
          }

          if (minutesDiff <= reminderMinutes && minutesDiff >= (reminderMinutes - 1)) {
            await this.sendReminder(meeting, reminder);
            reminder.sent = true;
            reminder.sentAt = new Date().toISOString();
            changed = true;
          }
        }

        if (changed) {
          meeting.reminders = reminders;
          await meeting.save();
        }
      }
    } catch (error) {
      console.error('Error checking reminders:', error);
    }
  }

  async sendReminder(meeting, reminder) {
    try {
      const timeString = `${reminder.time} ${reminder.unit}`;
      const message = `"${meeting.title}" starts in ${timeString}`;

      const recipients = new Set();

      recipients.add(meeting.hostId);

      const invitees = meeting.invitees || [];
      invitees.forEach(inv => {
        if (inv.userId && inv.status === 'accepted') {
          recipients.add(inv.userId);
        }
      });

      if (meeting.teamId) {
        const team = await Team.findByPk(meeting.teamId);
        if (team) {
          const members = team.members || [];
          members.forEach(member => {
            if (member.notifications && member.notifications.meetings) {
              recipients.add(member.userId);
            }
          });
        }
      }

      const notificationPromises = Array.from(recipients).map(recipientId =>
        Notification.create({
          recipientId,
          type: 'meeting_reminder',
          title: 'Meeting Reminder',
          message,
          data: {
            meetingId: meeting.id,
            link: meeting.meetingLink,
            metadata: { timeUntilStart: `${reminder.time} ${reminder.unit}` }
          },
          priority: reminder.time <= 15 && reminder.unit === 'minutes' ? 'high' : 'normal'
        })
      );

      await Promise.all(notificationPromises);

      recipients.forEach(recipientId => {
        this.io.to(`user:${recipientId}`).emit('notification:new', {
          type: 'meeting_reminder',
          title: 'Meeting Reminder',
          message,
          meetingId: meeting.id,
          link: meeting.meetingLink
        });
      });

      console.log(`Sent reminder for meeting: ${meeting.title} (${timeString})`);
    } catch (error) {
      console.error('Error sending reminder:', error);
    }
  }

  async checkMeetingStarts() {
    try {
      const now = new Date();
      const oneMinuteAgo = new Date(now - 60000);

      const meetings = await Meeting.findAll({
        where: {
          status: 'scheduled',
          scheduledAt: {
            [Op.gte]: oneMinuteAgo,
            [Op.lte]: now
          }
        }
      });

      for (const meeting of meetings) {
        const notificationsSent = meeting.notificationsSent || {};
        if (notificationsSent.started) continue;

        await this.notifyMeetingStart(meeting);

        notificationsSent.started = true;
        meeting.notificationsSent = notificationsSent;
        await meeting.save();
      }
    } catch (error) {
      console.error('Error checking meeting starts:', error);
    }
  }

  async notifyMeetingStart(meeting) {
    try {
      const message = `"${meeting.title}" is starting now!`;

      const recipients = new Set();
      recipients.add(meeting.hostId);

      const invitees = meeting.invitees || [];
      invitees.forEach(inv => {
        if (inv.userId && inv.status === 'accepted') {
          recipients.add(inv.userId);
        }
      });

      const notificationPromises = Array.from(recipients).map(recipientId =>
        Notification.create({
          recipientId,
          type: 'meeting_started',
          title: 'Meeting Started',
          message,
          data: {
            meetingId: meeting.id,
            link: meeting.meetingLink
          },
          priority: 'urgent'
        })
      );

      await Promise.all(notificationPromises);

      recipients.forEach(recipientId => {
        this.io.to(`user:${recipientId}`).emit('notification:new', {
          type: 'meeting_started',
          title: 'Meeting Started',
          message,
          meetingId: meeting.id,
          link: meeting.meetingLink,
          priority: 'urgent'
        });
      });

      console.log(`Notified meeting start: ${meeting.title}`);
    } catch (error) {
      console.error('Error notifying meeting start:', error);
    }
  }
}

export default ReminderService;
