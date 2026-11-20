import os from 'os';
import crypto from 'crypto';

/** Identity of THIS process as a media/meeting-owner node. Nothing here is hardcoded: all from env. */
export const nodeConfig = {
  nodeId: process.env.NODE_ID || `${os.hostname()}-${crypto.randomBytes(3).toString('hex')}`,
  host: os.hostname(),
  region: process.env.NODE_REGION || 'default',
  zone: process.env.NODE_ZONE || 'default',
  // Socket.IO base URL clients must use to reach THIS node directly (e.g. https://sfu-3.example.com).
  // Empty => same-origin / single-node deployment (no redirects are ever issued).
  publicUrl: (process.env.NODE_PUBLIC_URL || '').replace(/\/$/, ''),
  heartbeatMs: parseInt(process.env.NODE_HEARTBEAT_MS) || 5000,
  nodeTtlMs: parseInt(process.env.NODE_TTL_MS) || 15000,
  // Capacity limits. UNSET = that dimension is not constrained (no invented defaults; set from load-test results).
  limits: {
    consumers: parseInt(process.env.SFU_MAX_CONSUMERS) || null,
    producers: parseInt(process.env.SFU_MAX_PRODUCERS) || null,
    transports: parseInt(process.env.SFU_MAX_TRANSPORTS) || null,
    meetings: parseInt(process.env.SFU_MAX_MEETINGS) || null,
    bandwidthMbps: parseInt(process.env.SFU_MAX_BANDWIDTH_MBPS) || null,
    cpu: parseFloat(process.env.SFU_MAX_CPU) || 0.85,
    memory: parseFloat(process.env.SFU_MAX_MEM) || 0.9,
  },
  // Placement weights (heuristic starting point, NOT benchmark-derived; tune after load tests).
  weights: {
    cpu: 0.35, consumers: 0.25, bandwidth: 0.15, memory: 0.10, transports: 0.05, producers: 0.05, meetings: 0.05,
    regionMismatch: 0.5,
    ...(process.env.SFU_PLACEMENT_WEIGHTS ? JSON.parse(process.env.SFU_PLACEMENT_WEIGHTS) : {}),
  },
  meetingTtlSec: parseInt(process.env.MEETING_PLACEMENT_TTL_SEC) || 6 * 3600,
};
