import { getRedis } from '../infrastructure/redis/redisClient.js';
import { nodeConfig } from '../config/node.js';

/**
 * Distributed registry of media nodes. Each node writes hash  sfu:node:<id>  with PX TTL on every heartbeat,
 * and keeps  sfu:nodes  (set of ids) and  sfu:seen  (zset id -> last heartbeat) so a leader can tell a node
 * that EXPIRED (died) from one that never existed. Without Redis the registry contains only this node.
 */

const NUM = ['workers', 'meetings', 'transports', 'producers', 'consumers', 'cpu', 'memory', 'bandwidthMbps', 'ts'];
let selfLocal = null;

const encode = (n) => Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]));
const decode = (h) => {
  if (!h || !h.nodeId) return null;
  const n = { ...h };
  for (const k of NUM) n[k] = h[k] === '' || h[k] === undefined ? null : Number(h[k]);
  n.draining = h.draining === '1';
  return n;
};

export const selfRecord = (load, extra = {}) => ({
  nodeId: nodeConfig.nodeId, host: nodeConfig.host, region: nodeConfig.region, zone: nodeConfig.zone,
  url: nodeConfig.publicUrl, mediaAddress: extra.mediaAddress || '', status: extra.status || 'healthy',
  draining: extra.draining ? '1' : '0', ts: Date.now(), ...load,
});

export const heartbeat = async (record) => {
  selfLocal = decode(encode(record));
  const r = getRedis();
  if (!r) return;
  await r.multi()
    .hset(`sfu:node:${record.nodeId}`, encode(record))
    .pexpire(`sfu:node:${record.nodeId}`, nodeConfig.nodeTtlMs)
    .sadd('sfu:nodes', record.nodeId)
    .zadd('sfu:seen', Date.now(), record.nodeId)
    .exec();
};

/** Live nodes (heartbeat not expired). */
export const listNodes = async () => {
  const r = getRedis();
  if (!r) return selfLocal ? [selfLocal] : [];
  const ids = await r.smembers('sfu:nodes');
  if (!ids.length) return [];
  const p = r.pipeline(); ids.forEach((id) => p.hgetall(`sfu:node:${id}`));
  const res = await p.exec();
  return res.map(([e, h]) => (e ? null : decode(h))).filter(Boolean);
};

export const getNode = async (nodeId) => {
  const r = getRedis();
  if (!r) return selfLocal?.nodeId === nodeId ? selfLocal : null;
  return decode(await r.hgetall(`sfu:node:${nodeId}`));
};

/** ids in the registry whose hash has expired = presumed dead. */
export const findExpiredNodes = async () => {
  const r = getRedis();
  if (!r) return [];
  const ids = await r.smembers('sfu:nodes');
  const out = [];
  for (const id of ids) if (!(await r.exists(`sfu:node:${id}`))) out.push(id);
  return out;
};

export const forgetNode = async (nodeId) => {
  const r = getRedis();
  if (!r) return;
  await r.multi().srem('sfu:nodes', nodeId).zrem('sfu:seen', nodeId).del(`sfu:node:${nodeId}`).exec();
};
