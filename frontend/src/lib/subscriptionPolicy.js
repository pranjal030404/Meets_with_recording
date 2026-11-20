// Mirrors backend/src/media/subscriptionPolicy.js#preferredSpatialLayer (server clamps/enforces limits; this only picks quality).
export const preferredSpatialLayer = ({ mode, pinned, activeSpeaker, tileCount }) => {
  if (pinned) return 2
  if (activeSpeaker) return mode === 'small' ? 2 : 1
  if (mode === 'small' && tileCount <= 4) return 2
  if (mode === 'small' || tileCount <= 9) return 1
  return 0 // thumbnails
}
