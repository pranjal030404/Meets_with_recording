import 'dart:async';
import 'dart:io' show Directory, File, Platform;
import 'package:dio/dio.dart' show FormData, MultipartFile;
import 'package:path_provider/path_provider.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
// ignore: implementation_imports
import 'package:flutter_webrtc/src/native/event_channel.dart' show FlutterWebRTCEventChannel;
// ignore: implementation_imports
import 'package:flutter_webrtc/src/native/utils.dart' show WebRTC;
import 'package:mediasoup_client_flutter/mediasoup_client_flutter.dart' as ms;
// ignore: implementation_imports
import 'package:mediasoup_client_flutter/src/handlers/handler_interface.dart' show RTCIceServer, RTCIceCredentialType;
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'api.dart';
import 'config.dart';
import 'session.dart';
import 'socket_service.dart';

/// One person in the meeting (other than the local user).
class Peer {
  final String userId;
  String name;
  String? avatar;
  String? socketId;
  String role;
  bool muted;
  bool videoOff;
  bool handRaised;
  bool speaking = false;
  RTCVideoRenderer? video; // camera
  RTCVideoRenderer? screen; // screen share
  bool hasAudio = false;
  Peer({
    required this.userId,
    required this.name,
    this.avatar,
    this.socketId,
    this.role = 'participant',
    this.muted = false,
    this.videoOff = false,
    this.handRaised = false,
  });
}

class ChatLine {
  final String id;
  final String senderId;
  final String senderName;
  final String text;
  final DateTime at;
  ChatLine(this.id, this.senderId, this.senderName, this.text, this.at);
}

class WaitingUser {
  final String socketId;
  final String name;
  WaitingUser(this.socketId, this.name);
}

enum RoomPhase { connecting, waiting, connected, ended, failed }

/// Breakout rooms live at `<parent roomId>--br-<id>` (mirrors backend/src/lib/breakoutRoomId.js).
const breakoutSeparator = '--br-';

/// One line segment on the shared whiteboard, in board coordinates (1600 x 900, same as the web).
class BoardStroke {
  final double x0, y0, x1, y1, width;
  final String color; // #RRGGBB
  final String tool; // pen | eraser | line | rect | ellipse | text
  final String text;
  const BoardStroke(this.x0, this.y0, this.x1, this.y1, this.color, this.width, this.tool, [this.text = '']);
  static BoardStroke from(Map d) {
    double n(Object? v) => v is num ? v.toDouble() : 0;
    return BoardStroke(n(d['x0']), n(d['y0']), n(d['x1']), n(d['y1']), (d['color'] ?? '#000000').toString(), n(d['width']), (d['tool'] ?? 'pen').toString(), (d['text'] ?? '').toString());
  }
}

/// Owns the whole lifetime of one meeting: REST join, Socket.IO signalling, the
/// mediasoup device/transports and every local + remote track.
class MeetingController extends ChangeNotifier {
  final String roomId;
  final bool startMic;
  final bool startCam;
  final bool viewOnly;
  MeetingController(this.roomId, {this.startMic = false, this.startCam = false, this.viewOnly = false});

  // ---- observable state ----
  RoomPhase phase = RoomPhase.connecting;
  String? error;
  String? infoMessage;
  Map<String, dynamic>? meeting;
  String myRole = 'participant';
  bool get isHost => myRole == 'host';
  bool get isManager => myRole == 'host' || myRole == 'co-host';
  Map get settings => meeting?['settings'] is Map ? meeting!['settings'] as Map : const {};

  /// Contributor limits apply only while host management is on, never to hosts (same rule as the server).
  bool allowed(String key) => isManager || settings['hostManagement'] != true || settings[key] != false;

  bool _refuse(String key, String what) {
    if (allowed(key)) return false;
    infoMessage = 'The host has turned off $what for participants';
    _notify();
    return true;
  }

  bool transcribing = false;
  bool micOn = false;
  bool camOn = false;
  bool handRaised = false;
  bool screenSharing = false;
  bool screenShareBusy = false; // permission dialog open / publishing
  // breakout rooms
  bool get inBreakout => roomId.contains(breakoutSeparator);
  String get parentRoomId => roomId.split(breakoutSeparator).first;
  Map<String, dynamic>? assignedRoom; // a room the host just put us in, not joined yet
  String? switchTo; // set when the screen should move to another room
  // whiteboard: its own notifier so drawing doesn't rebuild the whole meeting
  final List<BoardStroke> board = [];
  final ValueNotifier<int> boardVersion = ValueNotifier(0);
  // captions translation ('' = off)
  String translateTo = '';
  // live stream
  Map<String, dynamic>? stream;
  // recording on this phone
  bool recordingLocally = false;
  bool recordingBusy = false;
  String? _recordingPath;
  DateTime? _recordingStarted;
  bool get canRecordLocally => !viewOnly && Platform.isAndroid;

  /// iOS needs a separate Broadcast Upload Extension, which this app does not ship yet.
  bool get canShareScreen => !viewOnly && Platform.isAndroid;
  bool frontCamera = true;
  bool locked = false;
  bool recording = false;
  String? recordingBy;
  RTCVideoRenderer? localRenderer;
  final Map<String, Peer> peers = {}; // by userId
  final List<ChatLine> chat = [];
  final List<WaitingUser> waiting = [];
  final List<({String name, String emoji, DateTime at})> reactions = [];
  String? caption;
  String? captionBy;
  String notes = '';
  Map<String, dynamic>? timer;
  int unreadChat = 0;
  bool chatOpen = false;
  String? pinnedUserId;
  String? spotlightUserId;
  String linkState = 'new';

  // ---- internals ----
  io.Socket? _socket;
  bool _ownsSocket = false;
  ms.Device? _device;
  ms.Transport? _sendT;
  ms.Transport? _recvT;
  Future<ms.Transport>? _sendPending;
  Future<ms.Transport>? _recvPending;
  List<RTCIceServer> _iceServers = const [];
  MediaStream? _localStream;
  ms.Producer? _audioProducer;
  ms.Producer? _videoProducer;
  ms.Producer? _screenProducer;
  MediaStream? _screenStream;
  StreamSubscription<Map<String, dynamic>>? _captureEvents;
  final Map<String, ms.Consumer> _consumers = {}; // consumerId -> consumer
  final Map<String, ({String userId, String mediaType, String consumerId})> _producerMap = {};
  bool _disposed = false;
  Timer? _captionTimer;

  String get myId => Session.instance.userId;
  String get myName => Session.instance.name;

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  // ===================================================================
  // Join
  // ===================================================================
  Future<void> join() async {
    try {
      phase = RoomPhase.connecting;
      _notify();

      // Multi-node deployments: the meeting lives on one node.
      var nodeUrl = Config.serverUrl;
      try {
        final p = await Api.instance.get('/meetings/${Uri.encodeComponent(roomId)}/placement');
        final u = (p is Map ? p['url'] : null)?.toString() ?? '';
        if (u.startsWith('http')) {
          nodeUrl = u;
        } else if (u.startsWith('/')) {
          nodeUrl = Config.serverUrl + u;
        }
      } catch (_) {/* single node: use default */}

      final token = Config.token!;
      if (nodeUrl == Config.serverUrl && SocketService.instance.socket != null) {
        _socket = SocketService.instance.socket;
        _ownsSocket = false;
      } else {
        _socket = SocketService.instance.create(nodeUrl, token)..connect();
        _ownsSocket = true;
      }
      _registerListeners();
      await _waitConnected();

      // REST join (registers attendance, enforces permissions)
      final joined = Api.unwrap(await Api.instance.post('/meetings/${Uri.encodeComponent(roomId)}/join'));
      meeting = Map<String, dynamic>.from(joined['meeting']);
      final hostId = (meeting!['hostId'] ?? meeting!['host']?['id'])?.toString();
      final me = ((meeting!['participants'] as List?) ?? []).cast<dynamic>().firstWhere(
            (p) => p['userId'] == myId || p['user']?['id'] == myId,
            orElse: () => null,
          );
      myRole = hostId == myId ? 'host' : (me?['role']?.toString() ?? 'participant');
      locked = meeting!['settings']?['locked'] == true;

      transcribing = false;
      // Local preview + media
      localRenderer = RTCVideoRenderer();
      await localRenderer!.initialize();
      if (!viewOnly) {
        await _acquireInitialMedia();
      }

      // SFU
      await _initMediasoup();
      if (micOn && _audioProducer == null && _localStream != null) {
        final t = _localStream!.getAudioTracks();
        if (t.isNotEmpty) await _produce(t.first, 'audio');
      }
      if (camOn && _videoProducer == null && _localStream != null) {
        final t = _localStream!.getVideoTracks();
        if (t.isNotEmpty) await _produce(t.first, 'video');
      }

      _loadChat();
      _socket!.emit('room:join', {'roomId': roomId});
      _socket!.emit('notes:request', {'roomId': roomId});
      _socket!.emit('tools:request', {'roomId': roomId});
      // Stay in 'connecting' until the server confirms (room:participants / waiting).
    } on ApiException catch (e) {
      _fail(e.message);
    } catch (e) {
      _fail(e.toString());
    }
  }

  void _fail(String msg) {
    error = msg;
    phase = RoomPhase.failed;
    _notify();
  }

  Future<void> _waitConnected() async {
    if (_socket!.connected) return;
    final c = Completer<void>();
    void onConnect(dynamic _) {
      if (!c.isCompleted) c.complete();
    }

    _socket!.on('connect', onConnect);
    _socket!.on('connect_error', (e) {
      if (!c.isCompleted && _socket!.connected == false && e.toString().toLowerCase().contains('auth')) {
        c.completeError(ApiException('Authentication failed. Please sign in again.'));
      }
    });
    try {
      await c.future.timeout(const Duration(seconds: 15));
    } on TimeoutException {
      throw ApiException('Could not connect to the meeting server.');
    } finally {
      _socket!.off('connect', onConnect);
    }
  }

  Future<void> _acquireInitialMedia() async {
    // "mute on entry" applies to everyone but the host
    final wantMic = startMic && !(settings['muteOnEntry'] == true && !isHost) && allowed('allowMic');
    final wantCam = startCam && allowed('allowVideo');
    if (!wantMic && !wantCam) return;
    try {
      _localStream = await navigator.mediaDevices.getUserMedia({
        'audio': wantMic
            ? {'echoCancellation': true, 'noiseSuppression': true, 'autoGainControl': true}
            : false,
        'video': wantCam
            ? {
                'facingMode': 'user',
                'width': {'ideal': 1280},
                'height': {'ideal': 720},
                'frameRate': {'ideal': 30},
              }
            : false,
      });
      micOn = wantMic && _localStream!.getAudioTracks().isNotEmpty;
      camOn = wantCam && _localStream!.getVideoTracks().isNotEmpty && await _protectBackground(_localStream!);
      if (camOn) localRenderer!.srcObject = _localStream;
    } catch (e) {
      infoMessage = 'Could not access the microphone/camera: $e';
      micOn = false;
      camOn = false;
    }
  }

  // ===================================================================
  // mediasoup
  // ===================================================================
  Future<void> _initMediasoup() async {
    try {
      final r = Api.unwrap(await Api.instance.get('/webrtc/ice-servers'));
      final list = (r is Map ? r['iceServers'] : null) as List? ?? const [];
      _iceServers = list.map<RTCIceServer>((s) {
        final urls = s['urls'];
        return RTCIceServer(
          urls: urls is List ? urls.cast<String>() : [urls.toString()],
          username: s['username']?.toString() ?? '',
          credential: s['credential'],
          credentialType: RTCIceCredentialType.password,
        );
      }).toList();
    } catch (_) {/* optional */}

    final caps = await socketRequest(_socket!, 'mediasoup:getRouterRtpCapabilities', {'roomId': roomId});
    _device = ms.Device();
    await _device!.load(routerRtpCapabilities: ms.RtpCapabilities.fromMap(Map<String, dynamic>.from(caps['rtpCapabilities'])));
  }

  Future<ms.Transport> _ensureSend() {
    if (_sendT != null) return Future.value(_sendT!);
    return _sendPending ??= _createSend().whenComplete(() => _sendPending = null);
  }

  Future<ms.Transport> _ensureRecv() {
    if (_recvT != null) return Future.value(_recvT!);
    return _recvPending ??= _createRecv().whenComplete(() => _recvPending = null);
  }

  Future<ms.Transport> _createSend() async {
    final r = await socketRequest(_socket!, 'mediasoup:createWebRtcTransport', {'roomId': roomId, 'direction': 'send'});
    final p = Map<String, dynamic>.from(r['transportParams']);
    final t = _device!.createSendTransport(
      id: p['id'],
      iceParameters: ms.IceParameters.fromMap(p['iceParameters']),
      iceCandidates: List<ms.IceCandidate>.from((p['iceCandidates'] as List).map((c) => ms.IceCandidate.fromMap(c))),
      dtlsParameters: ms.DtlsParameters.fromMap(p['dtlsParameters']),
      iceServers: _iceServers,
      producerCallback: _onProducerCreated,
    );
    t.on('connect', (Map data) async {
      try {
        await socketRequest(_socket!, 'mediasoup:connectTransport', {
          'transportId': t.id,
          'dtlsParameters': data['dtlsParameters'].toMap(),
        });
        data['callback']();
      } catch (e) {
        data['errback'](e);
      }
    });
    t.on('produce', (Map data) async {
      try {
        final resp = await socketRequest(_socket!, 'mediasoup:produce', {
          'transportId': t.id,
          'kind': data['kind'],
          'rtpParameters': data['rtpParameters'].toMap(),
          'appData': data['appData'] != null ? Map<String, dynamic>.from(data['appData']) : {},
        });
        data['callback'](resp['producerId']);
      } catch (e) {
        // The library swallows this error, so fail whoever is waiting for the producer right away
        final key = (data['appData'] as Map?)?['mediaType']?.toString();
        _produceWaiters.remove(key)?.completeError(e);
        data['errback'](e);
      }
    });
    _watchTransport(t, 'send');
    _sendT = t;
    return t;
  }

  Future<ms.Transport> _createRecv() async {
    final r = await socketRequest(_socket!, 'mediasoup:createWebRtcTransport', {'roomId': roomId, 'direction': 'recv'});
    final p = Map<String, dynamic>.from(r['transportParams']);
    final t = _device!.createRecvTransport(
      id: p['id'],
      iceParameters: ms.IceParameters.fromMap(p['iceParameters']),
      iceCandidates: List<ms.IceCandidate>.from((p['iceCandidates'] as List).map((c) => ms.IceCandidate.fromMap(c))),
      dtlsParameters: ms.DtlsParameters.fromMap(p['dtlsParameters']),
      iceServers: _iceServers,
      consumerCallback: _onConsumerCreated,
    );
    t.on('connect', (Map data) async {
      try {
        await socketRequest(_socket!, 'mediasoup:connectTransport', {
          'transportId': t.id,
          'dtlsParameters': data['dtlsParameters'].toMap(),
        });
        data['callback']();
      } catch (e) {
        data['errback'](e);
      }
    });
    _watchTransport(t, 'recv');
    _recvT = t;
    return t;
  }

  final Map<String, bool> _restarting = {};
  void _watchTransport(ms.Transport t, String dir) {
    t.on('connectionstatechange', (Map data) {
      final s = data['connectionState']?.toString() ?? '';
      linkState = s;
      _notify();
      if (s == 'failed') _restartIce(t, dir);
      if (s == 'disconnected') {
        Future.delayed(const Duration(seconds: 4), () {
          if (!_disposed && t.connectionState == 'disconnected') _restartIce(t, dir);
        });
      }
    });
  }

  Future<void> _restartIce(ms.Transport t, String dir) async {
    if (t.closed || _restarting[dir] == true) return;
    _restarting[dir] = true;
    try {
      final r = await socketRequest(_socket!, 'mediasoup:restartIce', {'transportId': t.id});
      t.restartIce(ms.IceParameters.fromMap(Map<String, dynamic>.from(r['iceParameters'])));
    } catch (_) {
      infoMessage = 'Lost the media connection. Try leaving and rejoining.';
      _notify();
    } finally {
      _restarting[dir] = false;
    }
  }

  // ---- producing ----
  final Map<String, Completer<ms.Producer>> _produceWaiters = {};

  void _onProducerCreated(ms.Producer p) {
    final key = p.source == 'mic' ? 'audio' : (p.source == 'screen' ? 'screen' : 'video');
    if (key == 'audio') {
      _audioProducer = p;
    } else if (key == 'screen') {
      _screenProducer = p;
    } else {
      _videoProducer = p;
    }
    p.on('trackended', () => key == 'screen' ? stopScreenShare() : _closeProducer(key));
    _produceWaiters.remove(key)?.complete(p);
  }

  Future<void> _produce(MediaStreamTrack track, String key) async {
    final t = await _ensureSend();
    final c = Completer<ms.Producer>();
    _produceWaiters[key] = c;
    t.produce(
      track: track,
      stream: _localStream!,
      source: key == 'audio' ? 'mic' : 'webcam',
      codecOptions: key == 'audio'
          ? ms.ProducerCodecOptions(opusStereo: 0, opusFec: 1, opusDtx: 0, opusMaxPlaybackRate: 48000)
          : null,
      appData: {'mediaType': key == 'audio' ? 'audio' : 'video'},
      // The audio and video tracks share one stream: don't stop the whole thing when one producer closes.
      stopTracks: false,
    );
    await c.future.timeout(const Duration(seconds: 20));
  }

  Future<void> _closeProducer(String key) async {
    final p = key == 'audio' ? _audioProducer : _videoProducer;
    if (p == null) return;
    if (key == 'audio') {
      _audioProducer = null;
    } else {
      _videoProducer = null;
    }
    try {
      p.close();
      _socket?.emitWithAck('mediasoup:closeProducer', {'producerId': p.id}, ack: (_) {});
    } catch (_) {}
  }

  // ---- screen sharing ----
  Future<void> toggleScreenShare() => screenSharing ? stopScreenShare() : startScreenShare();

  Future<void> startScreenShare() async {
    if (!canShareScreen || screenSharing || screenShareBusy) return;
    if (_refuse('allowScreenShare', 'screen sharing')) return;
    screenShareBusy = true;
    _notify();
    MediaStream? stream;
    try {
      final t = await _ensureSend();
      stream = await _acquireCapture();
      if (stream == null) return;
      final track = stream.getVideoTracks().first;

      final c = Completer<ms.Producer>();
      _produceWaiters['screen'] = c;
      // stopTracks: false because a recording may be using the same capture
      t.produce(track: track, stream: stream, source: 'screen', appData: {'mediaType': 'screen'}, stopTracks: false);
      await c.future.timeout(const Duration(seconds: 20));

      screenSharing = true;
      _socket!.emit('media:screen-share', {'isScreenSharing': true});
    } catch (e) {
      _produceWaiters.remove('screen');
      await _releaseCaptureIfUnused();
      final text = e.toString();
      infoMessage = text.contains("didn't give permission")
          ? 'Screen sharing was not allowed'
          : 'Could not share the screen: ${e is SocketRequestError ? e.message : text}';
    } finally {
      screenShareBusy = false;
      _notify();
    }
  }

  Future<void> stopScreenShare() async {
    if (!screenSharing && _screenProducer == null) return;
    final producer = _screenProducer;
    // clear first: the stop button and the system's "stopped" event can both land here
    _screenProducer = null;
    screenSharing = false;
    if (producer != null) {
      try {
        _socket?.emitWithAck('mediasoup:closeProducer', {'producerId': producer.id}, ack: (_) {});
        producer.close();
      } catch (_) {}
    }
    _socket?.emit('media:screen-share', {'isScreenSharing': false});
    await _releaseCaptureIfUnused();
    _notify();
  }

  // ---- screen capture, shared by screen sharing and recording (Android allows only one) ----
  Future<MediaStream?> _acquireCapture() async {
    final existing = _screenStream;
    if (existing != null) return existing;
    // Shows Android's "start recording or casting" dialog and starts the foreground service
    final stream = await navigator.mediaDevices.getDisplayMedia({'video': true, 'audio': false});
    if (_disposed || _socket == null) {
      await _releaseStream(stream);
      return null;
    }
    final trackId = stream.getVideoTracks().first.id;
    // The person can also end the capture from the system, which ends everything built on it
    _captureEvents = FlutterWebRTCEventChannel.instance.handleEvents.stream.listen((event) async {
      if (event['onScreenCaptureEnded']?['trackId'] != trackId) return;
      await stopRecording();
      await stopScreenShare();
      await _releaseCaptureIfUnused();
    });
    return _screenStream = stream;
  }

  Future<void> _releaseCaptureIfUnused() async {
    final stream = _screenStream;
    if (stream == null || screenSharing || recordingLocally) return;
    _screenStream = null;
    await _captureEvents?.cancel();
    _captureEvents = null;
    await _releaseStream(stream);
  }

  /// Stopping the track releases the capturer, which also stops the foreground service.
  Future<void> _releaseStream(MediaStream stream) async {
    try {
      for (final track in stream.getTracks()) {
        await track.stop();
      }
      await stream.dispose();
    } catch (_) {/* already released */}
  }

  // ---- consuming ----
  Future<void> _consume(String producerId, String userId, String userName, String mediaType) async {
    if (userId == myId) return;
    try {
      final t = await _ensureRecv();
      final resp = await socketRequest(_socket!, 'mediasoup:consume', {
        'roomId': roomId,
        'producerId': producerId,
        'priority': pinnedUserId == userId ? 'pinned' : null,
        'rtpCapabilities': _device!.rtpCapabilities.toMap(),
      });
      final cp = Map<String, dynamic>.from(resp['consumerParams']);
      _ensurePeer(userId, userName);
      _producerMap[producerId] = (userId: userId, mediaType: mediaType, consumerId: cp['id']);
      t.consume(
        id: cp['id'],
        producerId: cp['producerId'],
        peerId: userId,
        kind: cp['kind'] == 'audio' ? RTCRtpMediaType.RTCRtpMediaTypeAudio : RTCRtpMediaType.RTCRtpMediaTypeVideo,
        rtpParameters: ms.RtpParameters.fromMap(Map<String, dynamic>.from(cp['rtpParameters'])),
        appData: {'mediaType': mediaType, 'userId': userId},
      );
    } on SocketRequestError catch (e) {
      if (e.code != 'SUBSCRIPTION_LIMIT') debugPrint('consume failed: $e');
    } catch (e) {
      debugPrint('consume failed: $e');
    }
  }

  Future<void> _onConsumerCreated(ms.Consumer c, Function? accept) async {
    _consumers[c.id] = c;
    final mediaType = (c.appData['mediaType'] ?? c.kind).toString();
    final userId = (c.appData['userId'] ?? c.peerId ?? '').toString();
    final peer = peers[userId];
    if (peer != null) {
      if (c.kind == 'audio') {
        peer.hasAudio = true;
      } else {
        final r = RTCVideoRenderer();
        await r.initialize();
        r.srcObject = c.stream;
        if (mediaType == 'screen') {
          peer.screen = r;
        } else {
          peer.video = r;
        }
      }
    }
    try {
      await socketRequest(_socket!, 'mediasoup:resumeConsumer', {'consumerId': c.id});
    } catch (_) {}
    accept?.call();
    _notify();
  }

  void _removeProducer(String producerId) {
    final info = _producerMap.remove(producerId);
    if (info == null) return;
    final c = _consumers.remove(info.consumerId);
    try {
      c?.close();
    } catch (_) {}
    final peer = peers[info.userId];
    if (peer != null) {
      if (info.mediaType == 'screen') {
        peer.screen?.srcObject = null;
        peer.screen?.dispose();
        peer.screen = null;
      } else if (info.mediaType == 'video') {
        peer.video?.srcObject = null;
        peer.video?.dispose();
        peer.video = null;
      } else {
        peer.hasAudio = false;
      }
    }
    _notify();
  }

  Peer _ensurePeer(String userId, String name, {String? socketId, String? role, String? avatar}) {
    final p = peers.putIfAbsent(userId, () => Peer(userId: userId, name: name));
    if (name.isNotEmpty) p.name = name;
    if (socketId != null) p.socketId = socketId;
    if (role != null) p.role = role;
    if (avatar != null) p.avatar = avatar;
    return p;
  }

  // ===================================================================
  // Socket listeners
  // ===================================================================
  final List<(String, Function(dynamic))> _handlers = [];
  void _on(String event, Function(dynamic) fn) {
    _socket!.on(event, fn);
    _handlers.add((event, fn));
  }

  /// Let UI panels (polls, Q&A) subscribe to extra room events. Returns an unsubscribe function.
  VoidCallback listen(String event, Function(dynamic) fn) {
    _socket?.on(event, fn);
    return () => _socket?.off(event, fn);
  }

  String get meetingDbId => (meeting?['id'] ?? '').toString();

  void _registerListeners() {
    final s = _socket!;
    void rejoin(dynamic _) {
      if (phase == RoomPhase.connected) s.emit('room:join', {'roomId': roomId});
    }

    _on('connect', rejoin);

    _on('error', (d) {
      final m = d is Map ? d['message']?.toString() : d?.toString();
      if (m == null) return;
      if (phase == RoomPhase.connecting || phase == RoomPhase.waiting) {
        _fail(m);
      } else {
        infoMessage = m;
        _notify();
      }
    });

    _on('room:waiting-for-host', (_) {
      phase = RoomPhase.waiting;
      _notify();
    });
    _on('room:admitted', (_) {
      phase = RoomPhase.connecting;
      _notify();
    });
    _on('room:denied', (_) => _fail('The host did not admit you to this meeting.'));
    _on('room:waiting', (d) {
      final id = d['socketId']?.toString() ?? '';
      if (id.isEmpty || waiting.any((w) => w.socketId == id)) return;
      waiting.add(WaitingUser(id, (d['user']?['name'] ?? 'Guest').toString()));
      _notify();
    });
    _on('room:waiting-left', (d) {
      waiting.removeWhere((w) => w.socketId == d['socketId']);
      _notify();
    });

    _on('room:participants', (d) {
      phase = RoomPhase.connected;
      s.emit('whiteboard:request', {'roomId': roomId});
      s.emit('tools:request', {'roomId': roomId});
      if (!inBreakout) _checkAssignment();
      for (final p in (d['participants'] as List? ?? [])) {
        final u = p['user'] ?? {};
        final peer = _ensurePeer(u['id'].toString(), (u['name'] ?? '').toString(),
            socketId: p['socketId']?.toString(), role: p['role']?.toString(), avatar: u['avatar']?.toString());
        peer.muted = p['isMuted'] == true;
        peer.videoOff = p['isVideoOff'] == true;
      }
      if (d['role'] != null) myRole = d['role'].toString();
      _notify();
    });

    _on('mediasoup:existingProducers', (d) async {
      for (final p in (d['producers'] as List? ?? [])) {
        await _consume(p['producerId'], p['userId'].toString(), (p['userName'] ?? '').toString(), (p['mediaType'] ?? p['kind']).toString());
      }
    });
    _on('mediasoup:newProducer', (d) async {
      await _consume(d['producerId'], d['userId'].toString(), (d['userName'] ?? '').toString(), (d['mediaType'] ?? d['kind']).toString());
    });
    _on('mediasoup:producerClosed', (d) => _removeProducer(d['producerId'].toString()));
    _on('media:reconnect-required', (_) {
      infoMessage = 'The media server restarted. Rejoin the meeting if audio/video stops.';
      _notify();
    });
    _on('media:active-speakers', (d) {
      final ids = ((d['userIds'] as List?) ?? []).map((e) => e.toString()).toSet();
      for (final p in peers.values) {
        p.speaking = ids.contains(p.userId);
      }
      _notify();
    });

    _on('room:user-joined', (d) {
      final u = d['user'] ?? {};
      _ensurePeer(u['id'].toString(), (u['name'] ?? '').toString(),
          socketId: d['socketId']?.toString(), role: d['role']?.toString(), avatar: u['avatar']?.toString());
      infoMessage = '${u['name']} joined';
      _notify();
    });
    _on('room:user-left', (d) {
      final id = d['userId']?.toString();
      final p = peers.remove(id);
      if (p != null) {
        p.video?.dispose();
        p.screen?.dispose();
        infoMessage = '${p.name} left';
      }
      _producerMap.removeWhere((_, v) => v.userId == id);
      if (pinnedUserId == id) pinnedUserId = null;
      _notify();
    });
    _on('media:user-muted', (d) {
      peers[d['userId']?.toString()]?.muted = d['isMuted'] == true;
      _notify();
    });
    _on('media:user-video', (d) {
      peers[d['userId']?.toString()]?.videoOff = d['isVideoOff'] == true;
      _notify();
    });
    _on('reaction:hand-raise', (d) {
      peers[d['userId']?.toString()]?.handRaised = d['isRaised'] == true;
      _notify();
    });
    _on('reaction:emoji', (d) {
      reactions.add((name: (d['userName'] ?? '').toString(), emoji: (d['emoji'] ?? '').toString(), at: DateTime.now()));
      _notify();
      Future.delayed(const Duration(seconds: 4), () {
        reactions.removeWhere((r) => DateTime.now().difference(r.at).inSeconds >= 4);
        _notify();
      });
    });

    _on('chat:message', (d) {
      if (d is! Map) return;
      final id = (d['id'] ?? d['_id'] ?? '').toString();
      if (chat.any((c) => c.id == id)) return;
      chat.add(_chatFrom(d));
      if (!chatOpen && d['senderId'] != myId) unreadChat++;
      _notify();
    });

    // Host controls aimed at me
    _on('host:force-mute', (_) {
      if (micOn) {
        toggleMic();
        infoMessage = 'The host muted you';
        _notify();
      }
    });
    _on('host:force-video-off', (_) {
      if (camOn) {
        toggleCam();
        infoMessage = 'The host turned your camera off';
        _notify();
      }
    });
    _on('host:request-unmute', (_) {
      infoMessage = 'The host asks you to unmute';
      _notify();
    });
    _on('host:removed', (_) {
      error = 'You were removed from the meeting by the host.';
      phase = RoomPhase.ended;
      _notify();
    });
    _on('meeting:ended', (_) {
      phase = RoomPhase.ended;
      _notify();
    });
    _on('host:meeting-locked', (d) {
      locked = d['isLocked'] == true;
      _notify();
    });
    _on('meeting:settings-updated', (d) {
      final changed = d['settings'];
      if (changed is! Map || meeting == null) return;
      meeting!['settings'] = {...settings, ...changed};
      _notify();
    });
    _on('host:lower-hand', (_) {
      if (!handRaised) return;
      toggleHand();
      infoMessage = 'The host lowered your hand';
      _notify();
    });
    _on('transcribe:state', (d) {
      transcribing = d['enabled'] == true;
      _notify();
    });
    _on('host:spotlight', (d) {
      spotlightUserId = d['userId']?.toString();
      _notify();
    });
    _on('host:promoted', (d) {
      myRole = (d['role'] ?? 'co-host').toString();
      _notify();
    });
    _on('host:demoted', (d) {
      myRole = (d['role'] ?? 'participant').toString();
      _notify();
    });
    _on('room:role-changed', (d) {
      final id = d['userId']?.toString();
      if (id == myId) {
        myRole = d['role'].toString();
      } else {
        peers[id]?.role = d['role'].toString();
      }
      _notify();
    });

    _on('recording:started', (d) {
      recording = true;
      recordingBy = d['userName']?.toString();
      _notify();
    });
    _on('recording:stopped', (_) {
      recording = false;
      _notify();
    });

    _on('caption:text', (d) async {
      var text = d['text']?.toString() ?? '';
      final by = d['userName']?.toString();
      if (translateTo.isNotEmpty) text = await _translate(text);
      if (_disposed) return;
      caption = text;
      captionBy = by;
      _captionTimer?.cancel();
      _captionTimer = Timer(const Duration(seconds: 6), () {
        caption = null;
        _notify();
      });
      _notify();
    });

    _on('whiteboard:draw', (d) {
      board.add(BoardStroke.from(d as Map));
      boardVersion.value++;
    });
    _on('whiteboard:history', (d) {
      board
        ..clear()
        ..addAll((d['strokes'] as List? ?? []).map((e) => BoardStroke.from(e as Map)));
      boardVersion.value++;
    });
    _on('whiteboard:clear', (_) {
      board.clear();
      boardVersion.value++;
    });

    _on('stream:state', (d) {
      stream = d['stream'] is Map ? Map<String, dynamic>.from(d['stream']) : null;
      _notify();
    });

    _on('breakout:changed', (_) {
      if (!inBreakout) _checkAssignment();
    });
    _on('breakout:closed', (d) {
      switchTo = (d['returnRoomId'] ?? parentRoomId).toString();
      infoMessage = 'The host closed the breakout rooms';
      _notify();
    });
    _on('notes:update', (d) {
      notes = (d['text'] ?? '').toString();
      _notify();
    });
    _on('timer:state', (d) {
      timer = d['timer'] is Map ? Map<String, dynamic>.from(d['timer']) : null;
      _notify();
    });
  }

  ChatLine _chatFrom(Map d) {
    final sender = d['sender'] is Map ? d['sender'] : {};
    return ChatLine(
      (d['id'] ?? d['_id'] ?? DateTime.now().microsecondsSinceEpoch).toString(),
      (d['senderId'] ?? sender['id'] ?? '').toString(),
      (sender['name'] ?? 'Someone').toString(),
      (d['content'] ?? '').toString(),
      DateTime.tryParse((d['createdAt'] ?? '').toString())?.toLocal() ?? DateTime.now(),
    );
  }

  Future<void> _loadChat() async {
    try {
      final d = Api.unwrap(await Api.instance.get('/chat/${Uri.encodeComponent(roomId)}/messages'));
      final list = (d['messages'] as List? ?? []);
      chat
        ..clear()
        ..addAll(list.map((m) => _chatFrom(m as Map)));
      _notify();
    } catch (_) {}
  }

  // ===================================================================
  // Actions
  // ===================================================================
  Future<bool> _ensureLocalStream({required bool audio, required bool video}) async {
    try {
      final s = await navigator.mediaDevices.getUserMedia({
        'audio': audio ? {'echoCancellation': true, 'noiseSuppression': true, 'autoGainControl': true} : false,
        'video': video ? {'facingMode': frontCamera ? 'user' : 'environment', 'width': {'ideal': 1280}, 'height': {'ideal': 720}} : false,
      });
      if (video && !await _protectBackground(s)) return false;
      if (_localStream == null) {
        _localStream = s;
      } else {
        for (final t in s.getTracks()) {
          _localStream!.addTrack(t);
        }
      }
      return true;
    } catch (e) {
      infoMessage = 'Permission denied or device unavailable: $e';
      _notify();
      return false;
    }
  }

  // ---- background blur / picture (Android) ----
  bool get canUseBackgrounds => !viewOnly && Platform.isAndroid;

  Future<void> _applyBackground(MediaStreamTrack track, String mode) => WebRTC.invokeMethod(
      'setBackgroundEffect', {'trackId': track.id, 'mode': mode, 'imagePath': Config.backgroundImage});

  /// Applies the saved effect to a newly opened camera, before it is sent. If that fails the camera
  /// is closed again: never show a room the person asked to hide.
  Future<bool> _protectBackground(MediaStream stream) async {
    if (!canUseBackgrounds || Config.backgroundMode == 'off') return true;
    final tracks = stream.getVideoTracks();
    try {
      await _applyBackground(tracks.first, Config.backgroundMode);
      return true;
    } catch (e) {
      for (final t in tracks) {
        await t.stop();
        await stream.removeTrack(t);
      }
      infoMessage = 'Background effect failed, so your camera was left off';
      _notify();
      return false;
    }
  }

  Future<void> setBackground(String mode, [String? imagePath]) async {
    await Config.setBackground(mode, imagePath);
    try {
      for (final t in _localStream?.getVideoTracks() ?? <MediaStreamTrack>[]) {
        await _applyBackground(t, mode);
      }
    } catch (e) {
      // the person asked to hide their room and we could not: stop showing it
      if (mode != 'off' && camOn) await toggleCam();
      infoMessage = 'Background effect failed, so your camera was turned off';
      debugPrint('background effect: $e');
    }
    _notify();
  }

  Future<void> toggleMic() async {
    if (viewOnly) return;
    try {
      if (micOn) {
        _audioProducer?.pause();
        if (_audioProducer != null) {
          await socketRequest(_socket!, 'mediasoup:pauseProducer', {'producerId': _audioProducer!.id});
        }
        micOn = false;
      } else {
        if (_refuse('allowMic', 'microphones')) return;
        if (_audioProducer == null) {
          final hasTrack = _localStream?.getAudioTracks().isNotEmpty ?? false;
          if (!hasTrack && !await _ensureLocalStream(audio: true, video: false)) return;
          await _produce(_localStream!.getAudioTracks().first, 'audio');
        } else {
          _audioProducer!.resume();
          await socketRequest(_socket!, 'mediasoup:resumeProducer', {'producerId': _audioProducer!.id});
        }
        micOn = true;
      }
      _socket!.emit('media:toggle-mute', {'isMuted': !micOn});
      // a muted mic must never end up in the recording
      if (recordingLocally) await WebRTC.invokeMethod('setAudioRecordingMic', {'enabled': micOn});
    } catch (e) {
      infoMessage = 'Microphone error: $e';
    }
    _notify();
  }

  Future<void> toggleCam() async {
    if (viewOnly) return;
    try {
      if (camOn) {
        _videoProducer?.pause();
        if (_videoProducer != null) {
          await socketRequest(_socket!, 'mediasoup:pauseProducer', {'producerId': _videoProducer!.id});
        }
        camOn = false;
      } else {
        if (_refuse('allowVideo', 'cameras')) return;
        if (_videoProducer == null) {
          final hasTrack = _localStream?.getVideoTracks().isNotEmpty ?? false;
          if (!hasTrack && !await _ensureLocalStream(audio: false, video: true)) return;
          localRenderer?.srcObject = _localStream;
          await _produce(_localStream!.getVideoTracks().first, 'video');
        } else {
          _videoProducer!.resume();
          await socketRequest(_socket!, 'mediasoup:resumeProducer', {'producerId': _videoProducer!.id});
        }
        camOn = true;
      }
      _socket!.emit('media:toggle-video', {'isVideoOff': !camOn});
    } catch (e) {
      infoMessage = 'Camera error: $e';
    }
    _notify();
  }

  Future<void> switchCamera() async {
    final tracks = _localStream?.getVideoTracks() ?? [];
    if (tracks.isEmpty) return;
    await Helper.switchCamera(tracks.first);
    frontCamera = !frontCamera;
    _notify();
  }

  Future<void> toggleSpeaker(bool on) async {
    await Helper.setSpeakerphoneOn(on);
  }

  void toggleHand() {
    handRaised = !handRaised;
    _socket?.emit('reaction:hand-raise', {'roomId': roomId, 'isRaised': handRaised});
    _notify();
  }

  void sendReaction(String emoji) {
    if (_refuse('allowReactions', 'reactions')) return;
    _socket?.emit('reaction:emoji', {'roomId': roomId, 'emoji': emoji});
  }

  void sendChat(String text) {
    final t = text.trim();
    if (t.isEmpty) return;
    _socket?.emit('chat:send', {'roomId': roomId, 'content': t});
  }

  void openChat(bool open) {
    chatOpen = open;
    if (open) unreadChat = 0;
    _notify();
  }

  void pin(String? userId) {
    pinnedUserId = pinnedUserId == userId ? null : userId;
    _notify();
  }

  void updateNotes(String text) {
    notes = text;
    _socket?.emit('notes:update', {'roomId': roomId, 'text': text});
  }

  // ---- breakout rooms ----
  Future<List<Map<String, dynamic>>> breakoutRooms() async {
    final data = Api.unwrap(await Api.instance.get('/breakout/meeting/$meetingDbId'));
    return ((data['breakoutRooms'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> _checkAssignment() async {
    try {
      final mine = (await breakoutRooms()).where((r) => r['assignedToMe'] == true).toList();
      assignedRoom = mine.isEmpty ? null : mine.first;
      _notify();
    } catch (_) {/* no rooms, or the request failed: nothing to offer */}
  }

  Future<void> joinBreakout(Map<String, dynamic> room) async {
    try {
      if (room['assignedToMe'] == true) await Api.instance.post('/breakout/${room['id']}/join');
    } catch (_) {/* attendance only */}
    assignedRoom = null;
    switchTo = room['joinRoomId'].toString();
    _notify();
  }

  void dismissAssignment() {
    assignedRoom = null;
    _notify();
  }

  void returnToMainRoom() {
    switchTo = parentRoomId;
    _notify();
  }

  /// [groups] holds the user ids for each room, in order.
  Future<void> openBreakoutRooms(List<List<String>> groups) => Api.instance.post('/breakout', {
        'meetingId': meetingDbId,
        'rooms': [for (var i = 0; i < groups.length; i++) {'name': 'Room ${i + 1}', 'participantIds': groups[i]}],
      });

  Future<void> closeBreakoutRooms() => Api.instance.post('/breakout/close-all', {'meetingId': meetingDbId});

  // ---- whiteboard ----
  void drawStroke(BoardStroke s) {
    if (!allowed('allowAddOns')) {
      infoMessage = 'The host has turned off activities for participants';
      _notify();
      return;
    }
    board.add(s);
    boardVersion.value++;
    _socket?.emit('whiteboard:draw', {
      'roomId': roomId, 'x0': s.x0, 'y0': s.y0, 'x1': s.x1, 'y1': s.y1,
      'color': s.color, 'width': s.width, 'tool': s.tool,
      if (s.tool == 'text') 'text': s.text,
    });
  }

  void clearBoard() {
    if (!allowed('allowAddOns')) return;
    board.clear();
    boardVersion.value++;
    _socket?.emit('whiteboard:clear', {'roomId': roomId});
  }

  // ---- captions translation ----
  void setTranslateTo(String language) {
    translateTo = language;
    _notify();
  }

  Future<String> _translate(String text) async {
    try {
      final data = Api.unwrap(await Api.instance.post('/ai/translate', {'text': text, 'targetLanguage': translateTo}));
      return (data['translation'] ?? text).toString();
    } on ApiException catch (e) {
      // only a missing engine switches translation off; one failed line just shows the original
      if (e.code == 'TRANSLATION_UNAVAILABLE') {
        translateTo = '';
        infoMessage = '${e.message}. Showing original captions.';
      }
      return text;
    }
  }

  // ---- live stream ----
  void setStreaming(bool on) => _socket?.emit('stream:set', {'roomId': roomId, 'enabled': on});

  // ---- recording on this phone ----
  // Sound is always your mic mixed with everyone you hear; with video, the screen picture too.
  Future<void> startRecording({bool video = false}) async {
    if (!canRecordLocally || recordingLocally || recordingBusy) return;
    if (!isManager && settings['allowRecording'] == false) {
      infoMessage = 'The host has turned off recording';
      _notify();
      return;
    }
    recordingBusy = true;
    _notify();
    try {
      String? trackId;
      if (video) {
        final capture = await _acquireCapture();
        if (capture == null) return;
        trackId = capture.getVideoTracks().first.id;
      }
      final Directory dir = await getTemporaryDirectory();
      _recordingPath = '${dir.path}/meeting-${DateTime.now().millisecondsSinceEpoch}.${video ? 'mp4' : 'm4a'}';
      await WebRTC.invokeMethod('startAudioRecording', {'path': _recordingPath, 'micEnabled': micOn, 'videoTrackId': trackId});
      _recordingStarted = DateTime.now();
      recordingLocally = true;
      _socket?.emit('recording:started', {'roomId': roomId});
      infoMessage = video ? 'Recording the screen and sound' : 'Recording audio';
    } catch (e) {
      await _releaseCaptureIfUnused();
      infoMessage = e.toString().contains("didn't give permission") ? 'Screen recording was not allowed' : 'Could not start recording: $e';
    } finally {
      recordingBusy = false;
      _notify();
    }
  }

  Future<void> stopRecording() async {
    if (!recordingLocally) return;
    recordingLocally = false;
    final path = _recordingPath!;
    final seconds = DateTime.now().difference(_recordingStarted!).inMilliseconds / 1000;
    final target = parentRoomId; // breakout recordings belong to the meeting
    _socket?.emit('recording:stopped', {'roomId': roomId});
    try {
      await WebRTC.invokeMethod('stopAudioRecording');
      infoMessage = 'Recording saved. Uploading…';
      _notify();
      // not awaited: leaving the meeting must not wait for (or cancel) the upload
      unawaited(_uploadRecording(target, path, seconds));
    } catch (e) {
      infoMessage = 'Could not save the recording: $e';
    }
    await _releaseCaptureIfUnused();
    _notify();
  }

  Future<void> _uploadRecording(String room, String path, double seconds) async {
    try {
      await Api.instance.post(
        '/meetings/${Uri.encodeComponent(room)}/recordings',
        FormData.fromMap({
          'duration': seconds,
          'recording': await MultipartFile.fromFile(path, filename: 'meeting-recording.${path.split('.').last}'),
        }),
      );
      await File(path).delete();
      infoMessage = 'Recording uploaded. The transcript will appear in meeting details.';
    } catch (e) {
      infoMessage = 'Upload failed, the recording is kept on this phone: $e';
    }
    _notify();
  }

  // ---- host actions ----
  void admit(WaitingUser w) {
    _socket?.emit('host:admit-user', {'roomId': roomId, 'targetSocketId': w.socketId});
    waiting.remove(w);
    _notify();
  }

  void deny(WaitingUser w) {
    _socket?.emit('host:deny-user', {'roomId': roomId, 'targetSocketId': w.socketId});
    waiting.remove(w);
    _notify();
  }

  void muteUser(Peer p) => _socket?.emit('host:mute-user', {'roomId': roomId, 'targetSocketId': p.socketId});
  void videoOffUser(Peer p) => _socket?.emit('host:force-video-off', {'roomId': roomId, 'targetSocketId': p.socketId});
  void requestUnmute(Peer p) => _socket?.emit('host:request-unmute', {'roomId': roomId, 'targetSocketId': p.socketId});
  void removeUser(Peer p) => _socket?.emit('host:remove-user', {'roomId': roomId, 'targetSocketId': p.socketId});
  void makeCohost(Peer p) => _socket?.emit('host:make-cohost', {'roomId': roomId, 'targetSocketId': p.socketId});
  void removeCohost(Peer p) => _socket?.emit('host:remove-cohost', {'roomId': roomId, 'targetSocketId': p.socketId});
  void spotlight(Peer? p) => _socket?.emit('host:spotlight', {'roomId': roomId, 'userId': p?.userId});
  void muteAll() => _socket?.emit('host:mute-all', {'roomId': roomId});
  void disableAllVideo() => _socket?.emit('host:disable-all-video', {'roomId': roomId});
  void toggleLock() => _socket?.emit('host:lock-meeting', {'roomId': roomId, 'isLocked': !locked});
  void endForAll() => _socket?.emit('host:end-meeting', {'roomId': roomId});

  /// Omit [p] to lower everyone's hand.
  void lowerHand([Peer? p]) {
    _socket?.emit('host:lower-hand', {'roomId': roomId, if (p != null) 'targetSocketId': p.socketId});
  }

  void updateSetting(String key, Object value) {
    if (!isManager || meeting == null) return;
    meeting!['settings'] = {...settings, key: value};
    _socket?.emit('host:update-settings', {'roomId': roomId, 'settings': {key: value}});
    _notify();
  }

  void setTranscription(bool on) => _socket?.emit('transcribe:set', {'roomId': roomId, 'enabled': on});

  /// Same columns as the web report (frontend/src/lib/attendance.js).
  Future<String> attendanceCsv() async {
    final data = Api.unwrap(await Api.instance.get('/meetings/${Uri.encodeComponent(parentRoomId)}'));
    final people = ((data['meeting'] ?? data)['participants'] as List?) ?? const [];
    String cell(Object? v) => '"${(v ?? '').toString().replaceAll('"', '""')}"';
    final rows = <List<Object?>>[
      ['Name', 'Email', 'Role', 'Joined', 'Left', 'Duration (min)'],
      for (final p in people.cast<Map>())
        () {
          final joined = DateTime.tryParse('${p['joinedAt'] ?? ''}');
          final left = DateTime.tryParse('${p['leftAt'] ?? ''}');
          return [
            p['user']?['name'] ?? p['name'] ?? p['userId'],
            p['user']?['email'] ?? p['email'],
            p['role'] ?? 'participant',
            joined?.toUtc().toIso8601String(),
            left?.toUtc().toIso8601String() ?? 'Still in meeting',
            joined == null ? '' : (left ?? DateTime.now()).difference(joined).inMinutes,
          ];
        }(),
    ];
    return rows.map((r) => r.map(cell).join(',')).join('\n');
  }

  void startTimer(int seconds, String label) => _socket?.emit('timer:start', {'roomId': roomId, 'seconds': seconds, 'label': label});
  void stopTimer() => _socket?.emit('timer:stop', {'roomId': roomId});

  // ===================================================================
  // Leave / cleanup
  // ===================================================================
  Future<void> leave({bool notifyServer = true}) async {
    if (_disposed) return;
    try {
      if (notifyServer) {
        _socket?.emit('room:leave');
        await Api.instance.post('/meetings/${Uri.encodeComponent(roomId)}/leave');
      }
    } catch (_) {}
    await _cleanup();
  }

  Future<void> _cleanup() async {
    for (final h in _handlers) {
      _socket?.off(h.$1, h.$2);
    }
    _handlers.clear();
    _captionTimer?.cancel();
    await stopRecording();
    await stopScreenShare();
    try {
      _audioProducer?.close();
      _videoProducer?.close();
    } catch (_) {}
    for (final c in _consumers.values) {
      try {
        c.close();
      } catch (_) {}
    }
    _consumers.clear();
    try {
      await _sendT?.close();
      await _recvT?.close();
    } catch (_) {}
    _sendT = null;
    _recvT = null;
    for (final t in _localStream?.getTracks() ?? <MediaStreamTrack>[]) {
      t.stop();
    }
    await _localStream?.dispose();
    _localStream = null;
    for (final p in peers.values) {
      await p.video?.dispose();
      await p.screen?.dispose();
    }
    peers.clear();
    await localRenderer?.dispose();
    localRenderer = null;
    if (_ownsSocket) {
      _socket?.dispose();
    } else {
      // The server only releases a client's streams when it disconnects; without this the shared
      // socket would carry them into the next room (main room <-> breakout, or the next meeting).
      _socket?.disconnect();
      _socket?.connect();
    }
    _socket = null;
  }

  @override
  void dispose() {
    if (!_disposed) {
      _disposed = true;
      _cleanup();
    }
    super.dispose();
  }
}
