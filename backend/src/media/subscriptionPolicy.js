/**
 * Selective-subscription policy (pure functions; enforced server-side in `mediasoup:consume`).
 * Goal: consumers per meeting grow ~O(N x maxVideo) instead of O(N^2) for video.
 *
 * Modes (by participant count, or webinar when the meeting sets settings.webinar=true):
 *   small   : everyone sees everyone
 *   medium  : up to maxVideo tiles
 *   large   : fewer tiles, capped audio (active speakers beyond the cap)
 *   webinar : attendees only receive hosts/co-hosts/screen-share; managers behave like `medium`
 * The numeric defaults below are PRODUCT HEURISTICS, not benchmark results; override via env and
 * retune after load testing (docs/LOAD_TESTING.md).
 */

const int = (name, d) => (Number.isFinite(parseInt(process.env[name])) ? parseInt(process.env[name]) : d);

export const policyConfig = () => ({
  smallMax: int('SUB_SMALL_MAX', 12),
  mediumMax: int('SUB_MEDIUM_MAX', 50),
  limits: {
    small:   { maxVideo: int('SUB_SMALL_MAX_VIDEO', 12),  maxAudio: int('SUB_SMALL_MAX_AUDIO', 12),  maxScreen: 4 },
    medium:  { maxVideo: int('SUB_MEDIUM_MAX_VIDEO', 16), maxAudio: int('SUB_MEDIUM_MAX_AUDIO', 50), maxScreen: 4 },
    large:   { maxVideo: int('SUB_LARGE_MAX_VIDEO', 9),   maxAudio: int('SUB_LARGE_MAX_AUDIO', 25),  maxScreen: 4 },
    webinar: { maxVideo: int('SUB_WEBINAR_MAX_VIDEO', 6), maxAudio: int('SUB_WEBINAR_MAX_AUDIO', 6), maxScreen: 4 },
  },
  priorityExtra: int('SUB_PRIORITY_EXTRA', 4), // pinned / active-speaker streams may exceed the soft cap by this much
});

export const modeFor = ({ participantCount, webinar = false }, cfg = policyConfig()) => {
  if (webinar) return 'webinar';
  if (participantCount <= cfg.smallMax) return 'small';
  if (participantCount <= cfg.mediumMax) return 'medium';
  return 'large';
};

export const limitsFor = (mode, cfg = policyConfig()) => cfg.limits[mode];

/**
 * @param {object} a
 * @param {'small'|'medium'|'large'|'webinar'} a.mode
 * @param {'audio'|'video'} a.kind
 * @param {'audio'|'video'|'screen'} a.mediaType
 * @param {{audio:number,video:number,screen:number}} a.current  consumers this socket already holds
 * @param {boolean} a.requesterIsManager
 * @param {boolean} a.ownerIsManager   producer belongs to host/co-host
 * @param {boolean} a.priority         pinned (client-claimed) or active speaker (server-known)
 * @returns {{allow:boolean, reason?:string}}
 */
export const decideConsume = ({ mode, kind, mediaType, current, requesterIsManager, ownerIsManager, priority }, cfg = policyConfig()) => {
  const lim = limitsFor(mode, cfg);
  const extra = priority ? cfg.priorityExtra : 0;

  if (mode === 'webinar' && !requesterIsManager && mediaType !== 'screen' && !ownerIsManager) {
    return { allow: false, reason: 'webinar-restricted' };
  }
  if (mediaType === 'screen') {
    return current.screen < lim.maxScreen ? { allow: true } : { allow: false, reason: 'screen-limit' };
  }
  if (kind === 'audio') {
    return current.audio < lim.maxAudio + extra ? { allow: true } : { allow: false, reason: 'audio-limit' };
  }
  return current.video < lim.maxVideo + extra ? { allow: true } : { allow: false, reason: 'video-limit' };
};

/** Quality a viewer should ask for on a video consumer (spatial layer 0..2). Used by tests/clients as the reference rule. */
export const preferredSpatialLayer = ({ mode, pinned, activeSpeaker, tileCount }) => {
  if (pinned) return 2;
  if (activeSpeaker) return mode === 'small' ? 2 : 1;
  if (mode === 'small' && tileCount <= 4) return 2;
  if (mode === 'small' || tileCount <= 9) return 1;
  return 0; // thumbnails
};
