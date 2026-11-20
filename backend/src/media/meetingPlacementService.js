import { getRedis } from '../infrastructure/redis/redisClient.js';
import { nodeConfig } from '../config/node.js';
import { listNodes, getNode } from './nodeRegistry.js';
import { pickBestNode } from './loadManager.js';
import { parseBreakoutRoomId } from '../lib/breakoutRoomId.js';

/**
 * Meeting affinity: ONE owner node per meeting (signaling, in-meeting state, mediasoup router together).
 *   meeting:node:<roomId>  -> nodeId        (SET NX, TTL refreshed on activity)
 *   sfu:node-meetings:<id> -> set of roomIds (so recovery can find a dead node's meetings)
 * Breakout rooms resolve to their PARENT meeting's owner so they stay co-located.
 * Without Redis every meeting is owned by this process (single-node behaviour).
 */

const key = (roomId) => `meeting:node:${roomId}`;
export const baseRoomId = (roomId) => parseBreakoutRoomId(roomId)?.parentRoomId || roomId;

// Compare-and-set: replace owner only if it is still the expected (dead) one.
const CAS = `if redis.call("get",KEYS[1])==ARGV[1] then redis.call("set",KEYS[1],ARGV[2],"EX",ARGV[3]) return 1 else return 0 end`;

const view = (n) => ({ nodeId: n.nodeId, url: n.url || '', region: n.region, self: n.nodeId === nodeConfig.nodeId });
const selfView = () => ({ nodeId: nodeConfig.nodeId, url: nodeConfig.publicUrl, region: nodeConfig.region, self: true });

const usable = (n) => n && n.status === 'healthy' && Date.now() - n.ts <= nodeConfig.nodeTtlMs;

/**
 * Resolve (and if necessary create) the owner for a meeting.
 * @param {{region?:string, allowAssign?:boolean}} opts  allowAssign=false => lookup only
 * @returns {Promise<{nodeId,url,region,self}|null>} null only when no node can take the meeting
 */
export const resolveOwner = async (roomIdRaw, { region, allowAssign = true } = {}) => {
  const roomId = baseRoomId(roomIdRaw);
  const r = getRedis();
  if (!r) return selfView();

  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await r.get(key(roomId));
    if (current) {
      const node = await getNode(current);
      if (usable(node) || (node && node.draining && node.status === 'healthy')) {
        r.expire(key(roomId), nodeConfig.meetingTtlSec).catch(() => {});
        return view(node);
      }
      // owner is dead/unhealthy: reassign atomically (only one racer wins)
      if (!allowAssign) return null;
      const pick = pickBestNode(await listNodes(), { limits: nodeConfig.limits, weights: nodeConfig.weights, region, ttlMs: nodeConfig.nodeTtlMs });
      if (!pick) return null;
      if (await r.eval(CAS, 1, key(roomId), current, pick.node.nodeId, nodeConfig.meetingTtlSec)) {
        await r.sadd(`sfu:node-meetings:${pick.node.nodeId}`, roomId);
        await r.srem(`sfu:node-meetings:${current}`, roomId);
        console.warn(`[placement] ${roomId}: owner ${current} unavailable, reassigned to ${pick.node.nodeId}`);
        return view(pick.node);
      }
      continue; // someone else reassigned; re-read
    }
    if (!allowAssign) return null;
    const pick = pickBestNode(await listNodes(), { limits: nodeConfig.limits, weights: nodeConfig.weights, region, ttlMs: nodeConfig.nodeTtlMs });
    if (!pick) return null;
    if ((await r.set(key(roomId), pick.node.nodeId, 'EX', nodeConfig.meetingTtlSec, 'NX')) === 'OK') {
      await r.sadd(`sfu:node-meetings:${pick.node.nodeId}`, roomId);
      console.log(`[placement] ${roomId} -> ${pick.node.nodeId} (score ${pick.score.toFixed(3)})`);
      return view(pick.node);
    }
  }
  return null;
};

export const releaseMeeting = async (roomIdRaw) => {
  const roomId = baseRoomId(roomIdRaw);
  const r = getRedis();
  if (!r) return;
  const owner = await r.get(key(roomId));
  if (owner === nodeConfig.nodeId) await r.multi().del(key(roomId)).srem(`sfu:node-meetings:${owner}`, roomId).exec();
};

export const meetingsOwnedBy = async (nodeId) => (getRedis() ? getRedis().smembers(`sfu:node-meetings:${nodeId}`) : []);
export const unassign = async (nodeId, roomId) => {
  const r = getRedis(); if (!r) return;
  await r.eval(`if redis.call("get",KEYS[1])==ARGV[1] then redis.call("del",KEYS[1]) end return 1`, 1, key(roomId), nodeId);
  await r.srem(`sfu:node-meetings:${nodeId}`, roomId);
};
