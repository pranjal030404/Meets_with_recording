import os from 'os';
import fs from 'fs';

/**
 * Per-node load snapshot + the pure placement scoring function.
 * Scoring is a weighted sum of utilisation ratios (lower is better). Dimensions without a configured
 * limit are ignored and their weight redistributed, so we never score against invented capacity numbers.
 */

let lastCpu = null;
const sampleCpu = () => {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const c of cpus) { for (const t of Object.values(c.times)) total += t; idle += c.times.idle; }
  const prev = lastCpu; lastCpu = { idle, total };
  if (!prev || total === prev.total) return os.loadavg()[0] / cpus.length;
  return 1 - (idle - prev.idle) / (total - prev.total);
};

let lastNet = null;
/** Mbps over the interval since last call, summed over non-loopback interfaces (Linux). null elsewhere. */
const sampleNetMbps = () => {
  try {
    const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2);
    let bytes = 0;
    for (const l of lines) {
      const [name, rest] = l.split(':');
      if (!rest || name.trim() === 'lo') continue;
      const f = rest.trim().split(/\s+/).map(Number);
      bytes += f[0] + f[8]; // rx + tx
    }
    const now = Date.now(); const prev = lastNet; lastNet = { bytes, now };
    return prev ? ((bytes - prev.bytes) * 8) / 1e6 / Math.max(1, (now - prev.now) / 1000) : null;
  } catch { return null; }
};

export const collectLoad = (mediasoupService) => {
  const stats = mediasoupService.getStats();
  return {
    cpu: Math.max(0, Math.min(1, sampleCpu())),
    memory: 1 - os.freemem() / os.totalmem(),
    bandwidthMbps: sampleNetMbps(),
    workers: stats.workers, meetings: stats.routers, transports: stats.transports,
    producers: stats.producers, consumers: stats.consumers,
  };
};

/** utilisation ratios per dimension (null when not limited / unknown) */
export const utilisation = (node, limits) => ({
  cpu: node.cpu / limits.cpu,
  memory: node.memory / limits.memory,
  consumers: limits.consumers ? node.consumers / limits.consumers : null,
  producers: limits.producers ? node.producers / limits.producers : null,
  transports: limits.transports ? node.transports / limits.transports : null,
  meetings: limits.meetings ? node.meetings / limits.meetings : null,
  bandwidth: limits.bandwidthMbps && node.bandwidthMbps != null ? node.bandwidthMbps / limits.bandwidthMbps : null,
});

/**
 * @returns {number|null} score (lower = better) or null if the node must not receive new meetings
 * (unhealthy, draining, stale, or any limited dimension already >= 100%).
 */
export const scoreNode = (node, { limits, weights, region, now = Date.now(), ttlMs }) => {
  if (node.status !== 'healthy' || node.draining) return null;
  if (ttlMs && now - node.ts > ttlMs) return null;
  const u = utilisation(node, limits);
  let sum = 0, wsum = 0;
  for (const [dim, ratio] of Object.entries(u)) {
    if (ratio == null) continue;
    if (ratio >= 1) return null;
    const w = weights[dim] ?? 0;
    sum += w * ratio; wsum += w;
  }
  const base = wsum ? sum / wsum : 0;
  return base + (region && node.region !== region ? weights.regionMismatch : 0);
};

export const pickBestNode = (nodes, ctx) => {
  let best = null, bestScore = Infinity;
  for (const n of nodes) {
    const s = scoreNode(n, ctx);
    if (s != null && (s < bestScore || (s === bestScore && n.nodeId < best.nodeId))) { best = n; bestScore = s; }
  }
  return best ? { node: best, score: bestScore } : null;
};
