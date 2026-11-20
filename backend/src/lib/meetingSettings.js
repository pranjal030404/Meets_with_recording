/**
 * Whitelist + type-check for meeting settings coming from clients (create meeting, host:update-settings).
 * Unknown keys are dropped (the old code merged arbitrary client JSON into the stored settings).
 */
const BOOLEANS = ['waitingRoom', 'allowScreenShare', 'allowChat', 'allowRecording', 'muteOnEntry', 'hostManagement', 'allowReactions',
  'allowMic', 'allowVideo', 'allowAddOns', 'hostMustJoinFirst', 'allowLinkRequests', 'isLocked', 'webinar'];
const ACCESS_TYPES = ['trusted', 'anyone', 'open'];

export const sanitizeSettings = (input, { maxParticipantsCap = parseInt(process.env.MAX_PARTICIPANTS_CAP) || 10000 } = {}) => {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const k of BOOLEANS) if (typeof input[k] === 'boolean') out[k] = input[k];
  if (typeof input.accessType === 'string' && ACCESS_TYPES.includes(input.accessType)) out.accessType = input.accessType;
  if (Number.isInteger(input.maxParticipants) && input.maxParticipants >= 1) out.maxParticipants = Math.min(input.maxParticipants, maxParticipantsCap);
  return out;
};
