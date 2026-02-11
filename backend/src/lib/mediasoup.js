import * as mediasoup from 'mediasoup';
import { mediasoupConfig } from '../config/mediasoup.js';

/**
 * Mediasoup SFU Worker Management
 * Handles worker pool, routers, transports, producers, and consumers
 */

class MediasoupService {
  constructor() {
    this.workers = [];
    this.nextWorkerIdx = 0;
    this.routers = new Map(); // Map<roomId, Router>
    this.transports = new Map(); // Map<transportId, Transport>
    this.producers = new Map(); // Map<producerId, Producer>
    this.consumers = new Map(); // Map<consumerId, Consumer>
  }

  /**
   * Initialize mediasoup workers
   */
  async init() {
    const { numWorkers } = mediasoupConfig;
    console.log(`🚀 Initializing ${numWorkers} mediasoup workers...`);

    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: mediasoupConfig.worker.logLevel,
        logTags: mediasoupConfig.worker.logTags,
        rtcMinPort: mediasoupConfig.worker.rtcMinPort,
        rtcMaxPort: mediasoupConfig.worker.rtcMaxPort,
      });

      worker.on('died', () => {
        console.error(`❌ mediasoup worker died [pid:${worker.pid}]`);
        setTimeout(() => process.exit(1), 2000);
      });

      this.workers.push(worker);
      console.log(`✅ mediasoup worker created [pid:${worker.pid}]`);
    }

    console.log('✅ All mediasoup workers initialized');
  }

  /**
   * Get next worker in round-robin fashion
   */
  _getNextWorker() {
    const worker = this.workers[this.nextWorkerIdx];
    this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length;
    return worker;
  }

  /**
   * Create a router for a meeting room
   */
  async createRouter(roomId) {
    const worker = this._getNextWorker();
    const router = await worker.createRouter({
      mediaCodecs: mediasoupConfig.router.mediaCodecs,
    });

    this.routers.set(roomId, router);
    console.log(`✅ Router created for room: ${roomId}`);
    
    return router;
  }

  /**
   * Get router for a room (create if doesn't exist)
   */
  async getRouter(roomId) {
    let router = this.routers.get(roomId);
    
    if (!router) {
      router = await this.createRouter(roomId);
    }

    return router;
  }

  /**
   * Get router RTP capabilities
   */
  async getRouterRtpCapabilities(roomId) {
    const router = await this.getRouter(roomId);
    return router.rtpCapabilities;
  }

  /**
   * Create WebRTC transport (for sending or receiving)
   */
  async createWebRtcTransport(roomId, direction = 'send') {
    const router = await this.getRouter(roomId);
    
    const transport = await router.createWebRtcTransport({
      ...mediasoupConfig.webRtcTransport,
      enableSctp: true,
      numSctpStreams: { OS: 1024, MIS: 1024 },
      appData: { roomId, direction },
    });

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

    console.log(`✅ WebRTC transport created [transportId:${transport.id}, direction:${direction}]`);

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

    // Check if router can consume
    if (!router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error(`Router cannot consume producer: ${producerId}`);
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true, // Start paused, resume after client is ready
      appData: { transportId, producerId },
    });

    this.consumers.set(consumer.id, consumer);

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
    const router = this.routers.get(roomId);
    
    if (router) {
      router.close();
      this.routers.delete(roomId);
      console.log(`Router closed for room: ${roomId}`);
    }
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
  getStats() {
    return {
      workers: this.workers.length,
      routers: this.routers.size,
      transports: this.transports.size,
      producers: this.producers.size,
      consumers: this.consumers.size,
    };
  }
}

// Singleton instance
const mediasoupService = new MediasoupService();

export default mediasoupService;
