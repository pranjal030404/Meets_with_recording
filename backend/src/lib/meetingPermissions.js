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

// Contributor restrictions only apply while "Host management" is on, and never
// to the host or co-hosts. A missing key defaults to allowed.
export const contributorAllowed = (meeting, userId, key) => {
  const settings = (meeting && meeting.settings) || {};
  if (!settings.hostManagement) return true;
  if (canManageMeeting(meeting, userId)) return true;
  return settings[key] !== false;
};

// "Trusted" meetings admit the host, invitees, prior participants and team
// members; everyone else needs the "anyone with the link" option.
export const canAccessMeeting = (meeting, user) => {
  const settings = meeting.settings || {};
  // Older rows may say "no link requests" without naming an access type: that was meant as a restriction
  const restrictable = settings.accessType === 'trusted' || (!settings.accessType && settings.allowLinkRequests === false);
  if (!restrictable) return true;
  if (canManageMeeting(meeting, user.id)) return true;
  if ((meeting.participantIds || []).includes(user.id)) return true;
  const invited = (meeting.invitees || []).some(
    i => i.userId === user.id || (i.email && i.email === user.email)
  );
  if (invited) return true;
  return settings.allowLinkRequests !== false;
};

export const hostHasJoined = (meeting) =>
  meeting.status === 'active' &&
  (meeting.participants || []).some(p => p.userId === meeting.hostId && p.joinedAt && !p.leftAt);
