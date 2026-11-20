import { runExclusive } from '../infrastructure/redis/lock.js';
import { findExpiredNodes, forgetNode } from './nodeRegistry.js';
import { meetingsOwnedBy, unassign } from './meetingPlacementService.js';

/**
 * Leader-elected sweep. For every node whose heartbeat expired:
 *   1. un-assign its meetings (compare-and-delete, so a meeting already moved is untouched),
 *   2. forget the node.
 * The next client that (re)joins is placed on a healthy node by resolveOwner(). What is NOT recoverable:
 * live WebRTC transports/producers/consumers (clients must reconnect and rebuild media) and any in-memory
 * meeting state that was not mirrored to Redis (see roomRuntimeStore: timer/notes/admitted are mirrored).
 */
export const sweepDeadNodes = async ({ onRecovered } = {}) => {
  const dead = await findExpiredNodes();
  const report = [];
  for (const nodeId of dead) {
    const meetings = await meetingsOwnedBy(nodeId);
    for (const roomId of meetings) await unassign(nodeId, roomId);
    await forgetNode(nodeId);
    report.push({ nodeId, meetings });
    console.warn(`[recovery] node ${nodeId} expired; released ${meetings.length} meeting(s)`);
    onRecovered?.(nodeId, meetings);
  }
  return report;
};

export const startRecovery = (intervalMs = 10000, hooks) => {
  const t = setInterval(() => runExclusive('job:sfu-recovery', intervalMs, () => sweepDeadNodes(hooks)).catch((e) => console.warn('[recovery] sweep failed:', e.message)), intervalMs);
  t.unref?.();
  return () => clearInterval(t);
};
