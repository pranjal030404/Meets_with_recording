import * as mediasoup from 'mediasoup';
import { sfuWorkerDeaths as workerDeaths } from '../observability/metrics.js';
import { mediasoupConfig } from '../config/mediasoup.js';

/**
 * Mediasoup SFU Worker Management
 * Handles worker pool, routers, transports, producers, and consumers
 */

class MediasoupService {
  constructor() {
    this.workers = [];
    this.nextWorkerIdx = 0;
    this._pendingRouters = new Map();
    this.routers = new Map(); // Map<roomId, Router>  (the PRIMARY router of the room)
    this.shards = new Map();  // Map<roomId, Router[]>  primary first; extra routers sit on OTHER workers (one worker = one core)
    this.producerRouter = new Map(); // producerId -> Router it was produced on
    this._piped = new Map();  // `${producerId}:${routerId}` -> Promise (dedupe pipeToRouter)
    this._shardLocks = new Map();
    // Open another router on another worker when every router of a room already has >= this many transports.
    // 0/unset = never shard (a meeting stays on one worker). Derive the value from load tests; there is no safe default.
    this.shardTransportThreshold = parseInt(process.env.MEDIASOUP_SHARD_TRANSPORTS) || 0;
    this.transports = new Map(); // Map<transportId, Transport>
    this.producers = new Map(); // Map<producerId, Producer>
    this.consumers = new Map(); // Map<consumerId, Consumer>
    this.onActiveSpeakers = null; // (roomId, [{producerId,socketId,userId}]) => void
    this.subStats = { allowed: 0, denied: {} }; // observable subscription decisions
    this.onRoomsLost = null; // (roomIds[], reason) => void ; set by the signaling layer
  }

  /**
   * Initialize mediasoup workers
   */
  async init() {
    const { numWorkers } = mediasoupConfig;
    console.log(`🚀 Initializing ${numWorkers} mediasoup workers...`);
    for (let i = 0; i < numWorkers; i++) await this._spawnWorker();
    console.log('✅ All mediasoup workers initialized');
  }

  async _spawnWorker() {
    const worker = await mediasoup.createWorker({
      logLevel: mediasoupConfig.worker.logLevel,
      logTags: mediasoupConfig.worker.logTags,
      rtcMinPort: mediasoupConfig.worker.rtcMinPort,
      rtcMaxPort: mediasoupConfig.worker.rtcMaxPort,
    });
    worker.appData.rooms = 0; // routers (= live meetings) currently hosted on this worker
    worker.appData.consumers = 0;
    worker.appData.producers = 0;

    worker.on('died', () => {
      // One crashed worker used to take the whole server (every meeting) down with it. Now only the
      // meetings on that worker are lost: drop it from the pool and start a replacement.
      workerDeaths.inc();
      console.error(`❌ mediasoup worker died [pid:${worker.pid}] - replacing it`);
      this.workers = this.workers.filter((w) => w !== worker);
      const lost = [];
      for (const [roomId, shards] of this.shards) {
        if (!shards.some((r) => r.appData?.worker === worker)) continue;
        // A room spread over workers loses the transports/pipes on the dead one; rebuilding the whole room is the only consistent answer
        this.shards.delete(roomId); this.routers.delete(roomId); lost.push(roomId);
        for (const r of shards) { try { r.close(); } catch { /* already closed with its worker */ } }
      }
      // Transports/producers/consumers on that worker are gone and CANNOT migrate: tell the clients to rebuild media.
      if (lost.length) { try { this.onRoomsLost?.(lost, 'worker-died'); } catch (e) { console.error('onRoomsLost failed:', e.message); } }
      this._spawnWorker().catch((e) => {
        console.error('Could not replace mediasoup worker:', e);
        if (this.workers.length === 0) setTimeout(() => process.exit(1), 2000);
      });
    });

    this.workers.push(worker);
    console.log(`✅ mediasoup worker created [pid:${worker.pid}]`);
    return worker;
  }

  /**
   * Load balancing across CPU cores: a new meeting goes to the worker hosting the fewest meetings
   * (ties are broken round-robin), instead of blindly rotating regardless of how busy each core is.
   */
  _getNextWorker(exclude = null) {
    if (this.workers.length === 0) throw new Error('No mediasoup workers available');
    let best = null;
    for (let i = 0; i < this.workers.length; i++) {
      const w = this.workers[(this.nextWorkerIdx + i) % this.workers.length];
      if (exclude?.has(w)) continue;
      // Consumers dominate SFU CPU; meeting count alone (the old metric) ignores a 200-person room vs an empty one.
      if (!best || w.appData.consumers + w.appData.producers < best.appData.consumers + best.appData.producers
          || (w.appData.consumers + w.appData.producers === best.appData.consumers + best.appData.producers && w.appData.rooms < best.appData.rooms)) best = w;
    }
    if (!best) return null;
    this.nextWorkerIdx = (this.workers.indexOf(best) + 1) % this.workers.length;
    return best;
  }

  /**
   * Create a router for a meeting room
   */
  async createRouter(roomId) {
    const router = await this._createRouterOn(this._getNextWorker(), roomId);
    this.routers.set(roomId, router);
    this.shards.set(roomId, [router]);
    console.log(`✅ Router created for room: ${roomId}`);
    return router;
  }

  async _createRouterOn(worker, roomId) {
    const router = await worker.createRouter({
      mediaCodecs: mediasoupConfig.router.mediaCodecs,
      appData: { worker, roomId, transports: 0 },
    });
    worker.appData.rooms++;
    router.observer.once('close', () => { worker.appData.rooms = Math.max(0, worker.appData.rooms - 1); });
    await this._attachAudioLevelObserver(roomId, router);
    return router;
  }

  /**
   * Choose the router (shard) that should host a new transport. With sharding off this is always the primary.
   * Participants' transports spread over shards; media crosses shards only when a consumer asks for a producer on another
   * shard (see consume -> pipeToRouter), so each producer is forwarded at most once per shard that has a viewer.
   */
  async _pickShard(roomId) {
    const primary = await this.getRouter(roomId);
    if (!this.shardTransportThreshold) return primary;
    // serialise per room so concurrent joins don't each open a new shard
    const prev = this._shardLocks.get(roomId) || Promise.resolve();
    const run = prev.catch(() => {}).then(async () => {
      const shards = this.shards.get(roomId) || [primary];
      let best = shards.reduce((a, r) => (r.appData.transports < a.appData.transports ? r : a), shards[0]);
      if (best.appData.transports >= this.shardTransportThreshold) {
        const used = new Set(shards.map((r) => r.appData.worker));
        const worker = this._getNextWorker(used);
        if (worker) {
          best = await this._createRouterOn(worker, roomId);
          shards.push(best);
          this.shards.set(roomId, shards);
          console.log(`🔀 Room ${roomId}: opened shard #${shards.length} on worker ${worker.pid}`);
        } // else: every worker already hosts a shard of this room; keep filling the least loaded one
      }
      best.appData.transports++;   // reserve inside the lock so the next joiner sees it
      return best;
    });
    this._shardLocks.set(roomId, run.catch(() => {}));
    return run;
  }

  /** Active-speaker detection feeds selective subscription (who deserves a video tile / audio slot). */
  async _attachAudioLevelObserver(roomId, router) {
    try {
      const obs = await router.createAudioLevelObserver({ maxEntries: 3, threshold: -70, interval: 800 });
      router.appData.activeSpeakers = new Set();
      obs.on('volumes', (volumes) => {
        const ids = volumes.map((v) => v.producer.id);
        const prev = [...router.appData.activeSpeakers];
        router.appData.activeSpeakers = new Set(ids);
        if (ids.length !== prev.length || ids.some((i) => !prev.includes(i))) {
          router.appData.speakerDetails = volumes.map((v) => ({ producerId: v.producer.id, socketId: v.producer.appData?.socketId, userId: v.producer.appData?.userId }));
          this.onActiveSpeakers?.(roomId, (this.shards.get(roomId) || [router]).flatMap((r) => r.appData.speakerDetails || []));
        }
      });
      obs.on('silence', () => { router.appData.activeSpeakers = new Set(); router.appData.speakerDetails = []; this.onActiveSpeakers?.(roomId, (this.shards.get(roomId) || [router]).flatMap((r) => r.appData.speakerDetails || [])); });
      router.appData.audioLevelObserver = obs;
    } catch (e) { console.warn(`audio level observer unavailable for ${roomId}:`, e.message); }
  }

  isActiveSpeaker(roomId, producerId) { return (this.shards.get(roomId) || []).some((r) => r.appData?.activeSpeakers?.has(producerId)); }

  /** Per-consumer layer preference (thumbnails ask for the low simulcast layer). Clamped to valid values. */
  async setConsumerLayers(consumerId, spatialLayer, temporalLayer) {
    const c = this.consumers.get(consumerId);
    if (!c || c.kind !== 'video') throw new Error('Consumer not found');
    const clamp = (v, max) => Math.max(0, Math.min(max, Number.isInteger(v) ? v : max));
    await c.setPreferredLayers({ spatialLayer: clamp(spatialLayer, 2), temporalLayer: clamp(temporalLayer, 2) });
  }

  /**
   * Get router for a room (create if doesn't exist)
   */
  async getRouter(roomId) {
    let router = this.routers.get(roomId);
    if (router) return router;
    // Two people joining at once must share ONE router, or they end up on different workers and can't hear each other
    if (!this._pendingRouters) this._pendingRouters = new Map();
    if (!this._pendingRouters.has(roomId)) {
      this._pendingRouters.set(roomId, this.createRouter(roomId).finally(() => this._pendingRouters.delete(roomId)));
    }
    return this._pendingRouters.get(roomId);
  }

  /**
   * Get router RTP capabilities
   */
  async getRouterRtpCapabilities(roomId) {
    const router = await this.getRouter(roomId);
    return router.rtpCapabilities;
  }

  /** Restart ICE on a transport (client lost connectivity, e.g. wifi switch). Returns fresh iceParameters. */
  async restartIce(transportId) {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');
    return transport.restartIce();
  }

  /**
   * Create WebRTC transport (for sending or receiving)
   */
  async createWebRtcTransport(roomId, direction = 'send') {
    const router = await this._pickShard(roomId);
    if (!this.shardTransportThreshold) router.appData.transports++; // keep the per-router count accurate even when not sharding

    let transport;
    try {
      transport = await router.createWebRtcTransport({
        ...mediasoupConfig.webRtcTransport,
        enableSctp: true,
        numSctpStreams: { OS: 1024, MIS: 1024 },
        appData: { roomId, direction, router },
      });
    } catch (e) { router.appData.transports = Math.max(0, router.appData.transports - 1); throw e; }
    transport.observer.once('close', () => { router.appData.transports = Math.max(0, router.appData.transports - 1); });

    this.transports.set(transport.id, transport);

    // Clean up on close
    transport.on('routerclose', () => {
      console.log(`Transport closed due to router close [transportId:${transport.id}]`);
      this.transports.delete(transport.id);
    });

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed' || dtlsState === 'failed') {
        console.log(`Transport DTLS state changed to ${dtlsState} [transportId:${transport.id}]`);
        transport.close();
        this.transports.delete(transport.id);
      }
    });

    console.log(`✅ WebRTC transport created [transportId:${transport.id}, direction:${direction}, announced:${transport.iceCandidates.map(c => `${c.protocol}://${c.ip}:${c.port}`).join(' ')}]`);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
    };
  }

  /**
   * Connect transport with DTLS parameters
   */
  async connectTransport(transportId, dtlsParameters) {
    const transport = this.transports.get(transportId);
    
    if (!transport) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    await transport.connect({ dtlsParameters });
    console.log(`✅ Transport connected [transportId:${transportId}]`);
  }

  /**
   * Create producer (user starts sending media)
   */
  async produce(transportId, kind, rtpParameters, appData = {}) {
    const transport = this.transports.get(transportId);
    
    if (!transport) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData: { ...appData, transportId },
    });

    this.producers.set(producer.id, producer);
    const prouter = transport.appData?.router || this.routers.get(transport.appData?.roomId);
    this.producerRouter.set(producer.id, prouter);
    producer.observer.once('close', () => { this.producerRouter.delete(producer.id); for (const k of [...this._piped.keys()]) if (k.startsWith(`${producer.id}:`)) this._piped.delete(k); });
    if (kind === 'audio' && prouter?.appData?.audioLevelObserver) prouter.appData.audioLevelObserver.addProducer({ producerId: producer.id }).catch(() => {});
    const pw = prouter?.appData?.worker;
    if (pw) { pw.appData.producers++; producer.observer.once('close', () => { pw.appData.producers = Math.max(0, pw.appData.producers - 1); }); }

    producer.on('transportclose', () => {
      console.log(`Producer closed due to transport close [producerId:${producer.id}]`);
      this.producers.delete(producer.id);
    });

    console.log(`✅ Producer created [producerId:${producer.id}, kind:${kind}]`);

    return {
      id: producer.id,
      kind: producer.kind,
    };
  }

  /**
   * Create consumer (user starts receiving media from another user)
   */
  async consume(roomId, transportId, producerId, rtpCapabilities) {
    const router = this.routers.get(roomId);
    const transport = this.transports.get(transportId);

    if (!router) {
      throw new Error(`Router not found for room: ${roomId}`);
    }

    if (!transport) {
      throw new Error(`Transport not found: ${transportId}`);
    }

    const producer = this.producers.get(producerId);
    
    if (!producer) {
      throw new Error(`Producer not found: ${producerId}`);
    }

    // The consumer's transport lives on one shard; the producer may live on another: pipe it across (once per pair)
    const target = transport.appData?.router || router;
    const source = this.producerRouter.get(producerId) || router;
    if (source !== target) {
      const key = `${producerId}:${target.id}`;
      if (!this._piped.has(key)) this._piped.set(key, source.pipeToRouter({ producerId, router: target }).catch((e) => { this._piped.delete(key); throw e; }));
      await this._piped.get(key);
    }

    // Check if router can consume
    if (!target.canConsume({ producerId, rtpCapabilities })) {
      throw new Error(`Router cannot consume producer: ${producerId}`);
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true, // Start paused, resume after client is ready
      appData: { transportId, producerId },
    });

    this.consumers.set(consumer.id, consumer);
    const cw = target.appData?.worker;
    if (cw) { cw.appData.consumers++; consumer.observer.once('close', () => { cw.appData.consumers = Math.max(0, cw.appData.consumers - 1); }); }

    consumer.on('transportclose', () => {
      console.log(`Consumer closed due to transport close [consumerId:${consumer.id}]`);
      this.consumers.delete(consumer.id);
    });

    consumer.on('producerclose', () => {
      console.log(`Consumer closed due to producer close [consumerId:${consumer.id}]`);
      this.consumers.delete(consumer.id);
    });

    console.log(`✅ Consumer created [consumerId:${consumer.id}]`);

    return {
      id: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused,
    };
  }

  /**
   * Resume consumer (start receiving media)
   */
  async resumeConsumer(consumerId) {
    const consumer = this.consumers.get(consumerId);
    
    if (!consumer) {
      throw new Error(`Consumer not found: ${consumerId}`);
    }

    await consumer.resume();
    console.log(`✅ Consumer resumed [consumerId:${consumerId}]`);
  }

  /**
   * Pause/resume producer
   */
  async pauseProducer(producerId) {
    const producer = this.producers.get(producerId);
    if (producer && !producer.paused) {
      await producer.pause();
      console.log(`Producer paused [producerId:${producerId}]`);
    }
  }

  async resumeProducer(producerId) {
    const producer = this.producers.get(producerId);
    if (producer && producer.paused) {
      await producer.resume();
      console.log(`Producer resumed [producerId:${producerId}]`);
    }
  }

  /**
   * Close producer
   */
  closeProducer(producerId) {
    const producer = this.producers.get(producerId);
    
    if (producer) {
      producer.close();
      this.producers.delete(producerId);
      console.log(`Producer closed [producerId:${producerId}]`);
    }
  }

  /**
   * Close consumer
   */
  closeConsumer(consumerId) {
    const consumer = this.consumers.get(consumerId);
    
    if (consumer) {
      consumer.close();
      this.consumers.delete(consumerId);
      console.log(`Consumer closed [consumerId:${consumerId}]`);
    }
  }

  /**
   * Close transport and all associated producers/consumers
   */
  closeTransport(transportId) {
    const transport = this.transports.get(transportId);
    
    if (transport) {
      transport.close();
      this.transports.delete(transportId);
      console.log(`Transport closed [transportId:${transportId}]`);
    }
  }

  /**
   * Close router and clean up all associated resources
   */
  closeRouter(roomId) {
    const shards = this.shards.get(roomId) || (this.routers.get(roomId) ? [this.routers.get(roomId)] : []);
    for (const r of shards) { try { r.close(); } catch { /* already closed */ } }
    if (shards.length) console.log(`Router closed for room: ${roomId} (${shards.length} shard(s))`);
    this.routers.delete(roomId);
    this.shards.delete(roomId);
    this._shardLocks.delete(roomId);
  }

  /**
   * Get producer by ID
   */
  getProducer(producerId) {
    return this.producers.get(producerId);
  }

  /**
   * Get all producers in a room
   */
  getProducersInRoom(roomId) {
    const router = this.routers.get(roomId);
    if (!router) return [];

    const producers = [];
    for (const [producerId, producer] of this.producers) {
      if (producer.appData?.roomId === roomId) {
        producers.push({
          id: producerId,
          kind: producer.kind,
          paused: producer.paused,
          appData: producer.appData,
        });
      }
    }

    return producers;
  }

  /**
   * Get statistics
   */
  /** Graceful stop: close workers (closes all routers/transports). */
  async close() {
    const ws = this.workers; this.workers = [];
    ws.forEach((w) => { try { w.removeAllListeners('died'); w.close(); } catch { /* already closed */ } });
  }

  getStats() {
    return {
      workers: this.workers.length,
      routers: this.routers.size,
      shardedRooms: [...this.shards.values()].filter((x) => x.length > 1).length,
      shards: [...this.shards.values()].reduce((n, x) => n + x.length, 0),
      transports: this.transports.size,
      producers: this.producers.size,
      consumers: this.consumers.size,
      subscriptions: this.subStats,
      perWorker: this.workers.map((w) => ({ pid: w.pid, rooms: w.appData.rooms, producers: w.appData.producers, consumers: w.appData.consumers })),
    };
  }
}

// Singleton instance
const mediasoupService = new MediasoupService();

export default mediasoupService;
