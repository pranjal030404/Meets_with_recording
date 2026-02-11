import * as mediasoupClient from 'mediasoup-client';

/**
 * Mediasoup Client Service
 * Manages Device, transports, producers, and consumers for SFU-based video conferencing
 */

class MediasoupClientService {
  constructor() {
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.producers = {
      audio: null,
      video: null,
      screen: null,
    };
    this.consumers = new Map(); // Map<consumerId, Consumer>
    this.socket = null;
    this.roomId = null;
  }

  /**
   * Initialize mediasoup device
   */
  async init(socket, roomId) {
    this.socket = socket;
    this.roomId = roomId;

    // Create Device
    try {
      this.device = new mediasoupClient.Device();
    } catch (error) {
      if (error.name === 'UnsupportedError') {
        console.error('Browser not supported');
        throw new Error('Your browser does not support WebRTC');
      }
      throw error;
    }

    // Get router RTP capabilities from server
    const { rtpCapabilities } = await this._socketRequest('mediasoup:getRouterRtpCapabilities', { roomId });

    // Load device with router capabilities
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });

    console.log('✅ Mediasoup device loaded', this.device.rtpCapabilities);
  }

  /**
   * Create send transport (for producing media)
   */
  async createSendTransport() {
    const { transportParams } = await this._socketRequest('mediasoup:createWebRtcTransport', {
      roomId: this.roomId,
      direction: 'send',
    });

    this.sendTransport = this.device.createSendTransport(transportParams);

    this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this._socketRequest('mediasoup:connectTransport', {
          transportId: this.sendTransport.id,
          dtlsParameters,
        });
        callback();
      } catch (error) {
        errback(error);
      }
    });

    this.sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        const { producerId } = await this._socketRequest('mediasoup:produce', {
          transportId: this.sendTransport.id,
          kind,
          rtpParameters,
          appData,
        });
        callback({ id: producerId });
      } catch (error) {
        errback(error);
      }
    });

    this.sendTransport.on('connectionstatechange', (state) => {
      console.log('Send transport connection state:', state);
      if (state === 'failed' || state === 'closed') {
        console.error('Send transport connection failed');
      }
    });

    console.log('✅ Send transport created');
    return this.sendTransport;
  }

  /**
   * Create receive transport (for consuming media)
   */
  async createRecvTransport() {
    const { transportParams } = await this._socketRequest('mediasoup:createWebRtcTransport', {
      roomId: this.roomId,
      direction: 'recv',
    });

    this.recvTransport = this.device.createRecvTransport(transportParams);

    this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this._socketRequest('mediasoup:connectTransport', {
          transportId: this.recvTransport.id,
          dtlsParameters,
        });
        callback();
      } catch (error) {
        errback(error);
      }
    });

    this.recvTransport.on('connectionstatechange', (state) => {
      console.log('Receive transport connection state:', state);
      if (state === 'failed' || state === 'closed') {
        console.error('Receive transport connection failed');
      }
    });

    console.log('✅ Receive transport created');
    return this.recvTransport;
  }

  /**
   * Produce audio track
   */
  async produceAudio(track) {
    if (!this.sendTransport) {
      await this.createSendTransport();
    }

    try {
      this.producers.audio = await this.sendTransport.produce({
        track,
        codecOptions: {
          opusStereo: true,
          opusDtx: true,
        },
        appData: { mediaType: 'audio' },
      });

      this.producers.audio.on('transportclose', () => {
        console.log('Audio producer transport closed');
        this.producers.audio = null;
      });

      this.producers.audio.on('trackended', () => {
        console.log('Audio track ended');
        this.closeProducer('audio');
      });

      console.log('✅ Audio producer created');
      return this.producers.audio;
    } catch (error) {
      console.error('Error producing audio:', error);
      throw error;
    }
  }

  /**
   * Produce video track
   */
  async produceVideo(track) {
    if (!this.sendTransport) {
      await this.createSendTransport();
    }

    try {
      this.producers.video = await this.sendTransport.produce({
        track,
        encodings: [
          { maxBitrate: 150000, scaleResolutionDownBy: 4 },  // Low: 180p
          { maxBitrate: 500000, scaleResolutionDownBy: 2 },  // Med: 360p-540p
          { maxBitrate: 2500000, scaleResolutionDownBy: 1 }, // High: 720p-1080p
        ],
        codecOptions: {
          videoGoogleStartBitrate: 1000,
        },
        appData: { mediaType: 'video' },
      });

      this.producers.video.on('transportclose', () => {
        console.log('Video producer transport closed');
        this.producers.video = null;
      });

      this.producers.video.on('trackended', () => {
        console.log('Video track ended');
        this.closeProducer('video');
      });

      console.log('✅ Video producer created');
      return this.producers.video;
    } catch (error) {
      console.error('Error producing video:', error);
      throw error;
    }
  }

  /**
   * Produce screen share track
   */
  async produceScreen(track) {
    if (!this.sendTransport) {
      await this.createSendTransport();
    }

    try {
      this.producers.screen = await this.sendTransport.produce({
        track,
        encodings: [{ maxBitrate: 1500000 }],
        codecOptions: {
          videoGoogleStartBitrate: 1000,
        },
        appData: { mediaType: 'screen' },
      });

      this.producers.screen.on('transportclose', () => {
        console.log('Screen producer transport closed');
        this.producers.screen = null;
      });

      this.producers.screen.on('trackended', () => {
        console.log('Screen track ended');
        this.closeProducer('screen');
      });

      console.log('✅ Screen producer created');
      return this.producers.screen;
    } catch (error) {
      console.error('Error producing screen:', error);
      throw error;
    }
  }

  /**
   * Consume media from another peer
   */
  async consume(producerId) {
    if (!this.recvTransport) {
      await this.createRecvTransport();
    }

    try {
      const { consumerParams } = await this._socketRequest('mediasoup:consume', {
        roomId: this.roomId,
        producerId,
        rtpCapabilities: this.device.rtpCapabilities,
      });

      const consumer = await this.recvTransport.consume({
        id: consumerParams.id,
        producerId: consumerParams.producerId,
        kind: consumerParams.kind,
        rtpParameters: consumerParams.rtpParameters,
      });

      this.consumers.set(consumer.id, consumer);

      consumer.on('transportclose', () => {
        console.log('Consumer transport closed');
        this.consumers.delete(consumer.id);
      });

      // Resume consumer
      await this._socketRequest('mediasoup:resumeConsumer', {
        consumerId: consumer.id,
      });

      console.log('✅ Consumer created', consumer.id);
      return consumer;
    } catch (error) {
      console.error('Error consuming:', error);
      throw error;
    }
  }

  /**
   * Pause/Resume producer
   */
  async pauseProducer(mediaType) {
    const producer = this.producers[mediaType];
    if (producer && !producer.paused) {
      producer.pause();
      await this._socketRequest('mediasoup:pauseProducer', {
        producerId: producer.id,
      });
    }
  }

  async resumeProducer(mediaType) {
    const producer = this.producers[mediaType];
    if (producer && producer.paused) {
      producer.resume();
      await this._socketRequest('mediasoup:resumeProducer', {
        producerId: producer.id,
      });
    }
  }

  /**
   * Close producer
   */
  async closeProducer(mediaType) {
    const producer = this.producers[mediaType];
    if (producer) {
      producer.close();
      
      await this._socketRequest('mediasoup:closeProducer', {
        producerId: producer.id,
      });
      
      this.producers[mediaType] = null;
      console.log(`✅ Producer closed: ${mediaType}`);
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
      console.log(`✅ Consumer closed: ${consumerId}`);
    }
  }

  /**
   * Close all producers and consumers
   */
  closeAll() {
    // Close all producers
    for (const mediaType of ['audio', 'video', 'screen']) {
      if (this.producers[mediaType]) {
        this.producers[mediaType].close();
        this.producers[mediaType] = null;
      }
    }

    // Close all consumers
    for (const consumer of this.consumers.values()) {
      consumer.close();
    }
    this.consumers.clear();

    // Close transports
    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }

    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = null;
    }

    console.log('✅ All mediasoup resources closed');
  }

  /**
   * Get producer stats
   */
  async getProducerStats(mediaType) {
    const producer = this.producers[mediaType];
    if (producer) {
      return await producer.getStats();
    }
    return null;
  }

  /**
   * Get consumer stats
   */
  async getConsumerStats(consumerId) {
    const consumer = this.consumers.get(consumerId);
    if (consumer) {
      return await consumer.getStats();
    }
    return null;
  }

  /**
   * Helper: Socket request with promise
   */
  _socketRequest(event, data = {}) {
    return new Promise((resolve, reject) => {
      this.socket.emit(event, data, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error || 'Request failed'));
        }
      });
    });
  }
}

export default MediasoupClientService;
