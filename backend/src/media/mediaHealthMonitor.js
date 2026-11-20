import { nodeConfig } from '../config/node.js';
import { collectLoad } from './loadManager.js';
import { heartbeat, selfRecord } from './nodeRegistry.js';
import { mediasoupConfig } from '../config/mediasoup.js';

/** Publishes this node's load + health to the registry every heartbeat. Stops (and marks draining) on shutdown. */
export class MediaHealthMonitor {
  constructor(mediasoupService) { this.ms = mediasoupService; this.timer = null; this.draining = false; this.lastError = null; }

  snapshot() {
    const load = collectLoad(this.ms);
    // No workers => this node cannot host media at all: advertise as unhealthy so it receives no meetings.
    const status = this.ms.workers.length > 0 ? 'healthy' : 'unhealthy';
    return selfRecord(load, { status, draining: this.draining, mediaAddress: mediasoupConfig.webRtcTransport.listenIps[0].announcedIp });
  }

  async beat() {
    try { await heartbeat(this.snapshot()); this.lastError = null; }
    catch (e) { if (this.lastError !== e.message) console.warn(`[media-health] heartbeat failed: ${e.message}`); this.lastError = e.message; }
  }

  start() {
    this.beat();
    this.timer = setInterval(() => this.beat(), nodeConfig.heartbeatMs);
    this.timer.unref?.();
  }

  /** Stop receiving NEW meetings but keep serving existing ones (controlled drain). */
  async drain() { this.draining = true; await this.beat(); }

  stop() { clearInterval(this.timer); }
}
