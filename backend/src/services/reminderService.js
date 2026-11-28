import { Op } from 'sequelize';
import cron from 'node-cron';
import Meeting from '../models/Meeting.js';
import Notification from '../models/Notification.js';
import Team from '../models/Team.js';
import { runExclusive } from '../infrastructure/redis/lock.js';
import { updateLocked } from '../lib/locked.js';
import { emailMeetingPeople } from './meetingMail.js';
import { ensureSubscription, UNLOCK_ALL_FEATURES } from './subscriptionService.js';
import { endMeeting } from './meetingLifecycle.js';

const MAX_REMINDER_MS = 370 * 24 * 60 * 60 * 1000;

class ReminderService {
  constructor(io) {
    this.io = io;
    this.cronJobs = [];
  }

  start() {
    console.log('Starting reminder service...');

    const job = cron.schedule('* * * * *', async () => {
      await runExclusive('job:reminders', 55000, () => this.checkReminders());
    });

    this.cronJobs.push(job);

    const startJob = cron.schedule('* * * * *', async () => {
      await runExclusive('job:meeting-starts', 55000, () => this.checkMeetingStarts());
    });

    this.cronJobs.push(startJob);

    this.cronJobs.push(cron.schedule('* * * * *', async () => {
      await runExclusive('job:meeting-length', 55000, () => this.enforceDurationLimits());
    }));

    console.log('Reminder service started');
  }

  // Plans with a meeting length limit: close meetings that have run past it
  async enforceDurationLimits() {
    if (UNLOCK_ALL_FEATURES) return; // no limits: do not walk every live meeting each minute
    try {
      const live = await Meeting.findAll({ where: { status: 'active', startedAt: { [Op.lt]: new Date(Date.now() - 60 * 1000) } } });
      for (const meeting of live) {
        const { plan } = await ensureSubscription(meeting.hostId);
        const minutes = plan?.limits?.meetingDurationMinutes;
        if (!(minutes > 0) || Date.now() - new Date(meeting.startedAt) < minutes * 60 * 1000) continue;
        if ((await endMeeting(meeting)).changed) {
          this.io.to(meeting.roomId).emit('meeting:ended', { roomId: meeting.roomId, reason: 'time-limit' });
        }
      }
    } catch (error) {
      console.error('Error enforcing meeting length:', error);
    }
  }

  stop() {
    this.cronJobs.forEach(job => job.stop());
    console.log('Reminder service stopped');
  }

  async checkReminders() {
    try {
      const now = new Date();

      // only meetings near enough for any reminder to be due, not every scheduled meeting every minute
      const meetings = await Meeting.findAll({
        where: {
          status: 'scheduled',
          scheduledAt: { [Op.gte]: new Date(now - 5 * 60 * 1000), [Op.lte]: new Date(now.getTime() + MAX_REMINDER_MS) }
        }
      });

      for (const meeting of meetings) {
        const reminders = meeting.reminders || [];
        const unsentReminders = reminders.filter(r => !r.sent);
        if (unsentReminders.length === 0) continue;

        const scheduledTime = new Date(meeting.scheduledAt);
        const timeDiff = scheduledTime - now;
        const minutesDiff = Math.floor(timeDiff / (1000 * 60));

        const due = (r) => {
          const minutes = r.time * (r.unit === 'days' ? 24 * 60 : r.unit === 'hours' ? 60 : 1);
          return !r.sent && minutesDiff <= minutes && minutesDiff >= minutes - 1;
        };
        if (!reminders.some(due)) continue;

        // Marked as sent first, on the locked row: a second instance or the next tick finds nothing to do
        const claimed = await updateLocked(Meeting, meeting.id, (row) => {
          const mine = (row.reminders || []).filter(due);
          if (!mine.length) return false;
          for (const r of mine) { r.sent = true; r.sentAt = new Date().toISOString(); }
          return mine;
        });
        for (const reminder of claimed?.result || []) await this.sendReminder(meeting, reminder);
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
      emailMeetingPeople(meeting, { kind: 'reminder', userIds: [...recipients], when: timeString });

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

        const claimed = await updateLocked(Meeting, meeting.id, (row) => {
          if (row.notificationsSent?.started) return false;
          row.notificationsSent = { ...(row.notificationsSent || {}), started: true };
          return true;
        });
        if (claimed?.result) await this.notifyMeetingStart(meeting);
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
