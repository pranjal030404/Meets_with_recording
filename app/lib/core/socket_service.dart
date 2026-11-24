import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'config.dart';

/// Wraps the Socket.IO connection. One "main" socket serves chat / presence /
/// notifications; the meeting room may open a second one bound to the media node.
class SocketService {
  SocketService._();
  static final SocketService instance = SocketService._();

  io.Socket? _socket;
  io.Socket? get socket => _socket;
  bool get connected => _socket?.connected ?? false;

  io.Socket create(String url, String token) {
    return io.io(
      url,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .setAuth({'token': token})
          // socket_io_client caches one Manager per URL, which would keep sending the FIRST token after a
          // logout/login ("Invalid token"). Always open a fresh connection.
          .enableForceNew()
          .enableReconnection()
          .setReconnectionAttempts(20)
          .setReconnectionDelay(500)
          .setReconnectionDelayMax(5000)
          .disableAutoConnect()
          .build(),
    );
  }

  void connect() {
    final token = Config.token;
    if (token == null) return;
    if (_socket != null && (_socket!.connected || _socket!.active)) return;
    _socket?.dispose();
    _socket = create(Config.serverUrl, token)..connect();
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }

  void emit(String event, [dynamic data]) => _socket?.emit(event, data);

  void on(String event, Function(dynamic) handler) => _socket?.on(event, handler);
  void off(String event, [Function(dynamic)? handler]) => _socket?.off(event, handler);
}

/// Request/response helper for ack-style socket events (`{success, ...}`).
Future<Map<String, dynamic>> socketRequest(io.Socket s, String event, [Map<String, dynamic>? data]) {
  final c = Completer<Map<String, dynamic>>();
  s.emitWithAck(event, data ?? {}, ack: (resp) {
    if (c.isCompleted) return;
    if (resp is Map && resp['success'] == true) {
      c.complete(Map<String, dynamic>.from(resp));
    } else {
      final m = resp is Map ? resp : {};
      c.completeError(SocketRequestError(
        (m['error'] ?? (m['redirect'] != null ? 'Meeting is on another node' : 'Request failed')).toString(),
        code: m['code']?.toString(),
      ));
    }
  });
  return c.future.timeout(const Duration(seconds: 20), onTimeout: () => throw SocketRequestError('Request timed out: $event'));
}

class SocketRequestError implements Exception {
  final String message;
  final String? code;
  SocketRequestError(this.message, {this.code});
  @override
  String toString() => message;
}
