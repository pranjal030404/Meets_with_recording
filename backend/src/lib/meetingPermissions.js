export const isMeetingHost = (meeting, userId) => {
  if (!meeting || !userId) return false;
  return meeting.hostId === userId;
};

export const isCoHost = (meeting, userId) => {
  if (!meeting || !userId) return false;
  const participants = meeting.participants || [];
  return participants.some(p => p.userId === userId && p.role === 'co-host');
};

export const canManageMeeting = (meeting, userId) =>
  isMeetingHost(meeting, userId) || isCoHost(meeting, userId);

export const getMeetingRole = (meeting, userId) => {
  if (isMeetingHost(meeting, userId)) return 'host';
  if (isCoHost(meeting, userId)) return 'co-host';
  return 'participant';
};
