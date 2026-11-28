/** Invitation and reminder email. Fire-and-forget: a mail problem must never fail the request or the job. */
import User from '../models/User.js';
import { isSmtpConfigured, sendMeetingEmail } from './mailService.js';

export const emailMeetingPeople = (meeting, { kind, from, entries = [], userIds = [], when }) => {
  if (!isSmtpConfigured()) return;
  (async () => {
    const ids = [...new Set([...userIds, ...entries.map((e) => e.userId)].filter(Boolean))];
    const users = ids.length ? await User.findAll({ where: { id: ids, isActive: true }, attributes: ['email', 'name'] }) : [];
    const recipients = new Map(users.map((u) => [u.email.toLowerCase(), u.name]));
    for (const e of entries) if (e.email && !e.userId) recipients.set(e.email.toLowerCase(), '');
    for (const [to, name] of recipients) {
      await sendMeetingEmail({ to, name, kind, from, meeting, when }).catch((e) => console.error('Meeting email failed:', e.message));
    }
  })().catch((e) => console.error('Meeting email failed:', e.message));
};
