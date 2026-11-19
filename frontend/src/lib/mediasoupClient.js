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
    this.onDiagnostic = null; // (message) => void, human-readable reason when media can't flow
    this.onLinkChange = null; // (state) => void, aggregated send+recv link health for the UI
    this._linkStates = { send: 'new', recv: 'new' };
    this._restarting = { send: false, recv: false };
  }

  /** Collapse the two transports into one link state (worst one wins). */
  _reportLink(direction, state) {
    this._linkStates[direction] = state;
    const order = ['failed', 'disconnected', 'reconnecting', 'connecting', 'new', 'connected', 'closed'];
    const states = Object.values(this._linkStates);
    this.onLinkChange?.(order.find((s) => states.includes(s)) || state);
  }

  /** ICE restart: the fix for 'disconnected'/'failed' after a network change; media resumes without rejoining. */
  async _recover(direction) {
    const transport = direction === 'send' ? this.sendTransport : this.recvTransport;
    if (!transport || transport.closed || this._restarting[direction]) return;
    this._restarting[direction] = true;
    this._reportLink(direction, 'reconnecting');
    try {
      const { iceParameters } = await this._socketRequest('mediasoup:restartIce', { transportId: transport.id });
      await transport.restartIce({ iceParameters });
    } catch (error) {
      console.error(`ICE restart failed (${direction}):`, error);
      this._reportLink(direction, 'failed');
      this.onDiagnostic?.('Lost the media connection and could not recover it. Try leaving and rejoining.');
    } finally {
      this._restarting[direction] = false;
    }
  }

  /** The #1 cause of "I see black tiles / hear nothing": the SFU advertises an address browsers can't reach. */
  _inspectCandidates(candidates = [], direction) {
    const ips = candidates.map(c => c.ip || c.address).filter(Boolean);
    console.log(`[media] ${direction} transport ICE candidates:`, ips.join(', '));
    const host = window.location.hostname;
    const pageIsLocal = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    const isPrivate = (ip) => /^(0\.0\.0\.0|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip);
    if (!pageIsLocal && ips.length && ips.every(isPrivate)) {
      this.onDiagnostic?.(`Media server is announcing a private address (${ips[0]}). Set MEDIASOUP_ANNOUNCED_IP to the server's public IP in backend/.env and restart the backend.`);
    }
  }

  _watchTransport(transport, direction) {
    let connectTimer = null;
    transport.on('connectionstatechange', (state) => {
      clearTimeout(connectTimer);
      if (state === 'connecting') {
        connectTimer = setTimeout(() => {
          if (transport.connectionState !== 'connected') {
            this.onDiagnostic?.('Could not establish the media connection. Check that UDP/TCP ports 40000-49999 are open on the server and MEDIASOUP_ANNOUNCED_IP is its public IP.');
          }
        }, 12000);
      }
      console.log(`${direction} transport connection state:`, state);
      this._reportLink(direction, state);
      if (state === 'failed') this._recover(direction);
      if (state === 'disconnected') {
        // Give transient blips a few seconds to heal on their own before forcing a restart
        setTimeout(() => { if (transport.connectionState === 'disconnected') this._recover(direction); }, 4000);
      }
    });
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

    this._inspectCandidates(transportParams.iceCandidates, 'send');
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

    this._watchTransport(this.sendTransport, 'send');

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

    this._inspectCandidates(transportParams.iceCandidates, 'recv');
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

    this._watchTransport(this.recvTransport, 'recv');

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
        // Speech tuned for clarity: mono (stereo only wastes bitrate on a voice), forward error correction so
        // lost packets don't crackle, no DTX (it can clip the first syllable), 48 kHz wideband, 20 ms frames.
        codecOptions: {
          opusStereo: false,
          opusFec: true,
          opusDtx: false,
          opusNack: true,
          opusMaxPlaybackRate: 48000,
          opusMaxAverageBitrate: 64000,
          opusPtime: 20,
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
          { maxBitrate: 200000, scaleResolutionDownBy: 4, maxFramerate: 20 },  // Low: 180p (weak links)
          { maxBitrate: 700000, scaleResolutionDownBy: 2, maxFramerate: 30 },  // Med: 360p
          { maxBitrate: 2500000, scaleResolutionDownBy: 1, maxFramerate: 30 }, // High: 720p
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
      // 'detail' tells the encoder this is text / slides: keep it sharp and trade frame rate if the link is tight
      try { track.contentHint = 'detail'; } catch (e) { /* not supported everywhere */ }
      this.producers.screen = await this.sendTransport.produce({
        track,
        encodings: [{ maxBitrate: 4000000, maxFramerate: 30 }],
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
