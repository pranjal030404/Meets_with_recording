import { nodeConfig } from '../config/node.js';
import { MediaHealthMonitor } from './mediaHealthMonitor.js';
import { startRecovery } from './meetingRecoveryService.js';
import { resolveOwner, releaseMeeting } from './meetingPlacementService.js';

/** Facade used by index.js / sockets: lifecycle + ownership guard. */
let monitor = null, stopRecovery = null;

export const startSfuManager = (mediasoupService) => {
  monitor = new MediaHealthMonitor(mediasoupService);
  monitor.start();
  stopRecovery = startRecovery(10000);
  return monitor;
};

export const drainSfu = async () => { await monitor?.drain(); };
export const stopSfuManager = () => { monitor?.stop(); stopRecovery?.(); };
export const getMonitor = () => monitor;

/**
 * Ownership guard for signaling/media events. Returns null when this node owns (or may take) the meeting;
 * otherwise a redirect descriptor { nodeId, url } the client must follow. Fails CLOSED when no node can host.
 */
export const ownershipGuard = async (roomId, { region } = {}) => {
  const owner = await resolveOwner(roomId, { region });
  if (!owner) return { error: 'No media capacity available' };
  if (owner.self) return null;
  if (!owner.url) return { error: 'Meeting is on another node that has no NODE_PUBLIC_URL configured' };
  return { redirect: { nodeId: owner.nodeId, url: owner.url } };
};

export { resolveOwner, releaseMeeting, nodeConfig };
