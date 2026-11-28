import { v4 as uuidv4 } from 'uuid';

/** Marks `user` as attending on this (locked) meeting row. Returns false when nothing changed. */
export const addAttendee = (meeting, user) => {
  const participants = meeting.participants || [];
  const open = participants.find((p) => p.userId === user.id && !p.leftAt);
  if (open) {
    // Seeded entries (scheduled host, accepted invitee) only count as present once they really join
    if (open.joinedAt) return false;
    open.joinedAt = new Date().toISOString();
    meeting.participants = [...participants];
    return true;
  }
  const wasCoHost = participants.some((p) => p.userId === user.id && p.role === 'co-host');
  meeting.participants = [...participants, {
    id: uuidv4(),
    userId: user.id,
    user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
    role: wasCoHost ? 'co-host' : 'participant',
    joinedAt: new Date().toISOString(),
    isMuted: meeting.settings?.muteOnEntry
  }];
  meeting.participantIds = [...new Set([...(meeting.participantIds || []), user.id])];
  return true;
};
