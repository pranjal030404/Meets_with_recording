import 'package:dio/dio.dart';
import 'config.dart';

class ApiException implements Exception {
  final String message;
  final int? status;
  final String? code;
  ApiException(this.message, {this.status, this.code});
  @override
  String toString() => message;
}

/// Thin REST client for the Minutes backend. Every method returns the decoded
/// JSON body and throws [ApiException] with a human readable message on failure.
class Api {
  Api._();
  static final Api instance = Api._();

  /// Called when the server says the session is no longer valid.
  void Function()? onUnauthorized;

  Dio _dio() => Dio(BaseOptions(
        baseUrl: Config.apiUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
        headers: {
          'Content-Type': 'application/json',
          if (Config.token != null) 'Authorization': 'Bearer ${Config.token}',
        },
      ));

  Future<dynamic> _run(Future<Response> Function(Dio) call, String path) async {
    try {
      final res = await call(_dio());
      return res.data;
    } on DioException catch (e) {
      final data = e.response?.data;
      final status = e.response?.statusCode;
      String msg;
      String? code;
      if (data is Map) {
        msg = (data['message'] ?? data['error'] ?? 'Request failed').toString();
        code = data['code']?.toString();
      } else if (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout) {
        msg = 'Cannot reach the server at ${Config.serverUrl}. Check the server address and your connection.';
      } else {
        msg = e.message ?? 'Request failed';
      }
      // A 401 from these must not trigger a logout (logout itself would loop forever on an expired token).
      final isCredential = RegExp(r'/auth/(login|signup|logout)').hasMatch(path);
      final suspended = status == 403 && msg.toLowerCase().contains('suspended');
      if ((status == 401 || suspended) && !isCredential) onUnauthorized?.call();
      throw ApiException(msg, status: status, code: code);
    }
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _run((d) => d.get(path, queryParameters: query), path);
  Future<dynamic> post(String path, [Object? body]) =>
      _run((d) => d.post(path, data: body ?? {}), path);
  Future<dynamic> put(String path, [Object? body]) =>
      _run((d) => d.put(path, data: body ?? {}), path);
  Future<dynamic> delete(String path) => _run((d) => d.delete(path), path);

  /// Message actions live under `/messages/messages/:id/...` on the server router, while older
  /// clients call `/messages/:id/...`. Try the mounted path first, then fall back on 404.
  Future<dynamic> message(String method, String id, [String suffix = '', Object? body]) async {
    Future<dynamic> call(String path) {
      switch (method) {
        case 'get': return get(path);
        case 'post': return post(path, body);
        case 'put': return put(path, body);
        default: return delete(path);
      }
    }

    try {
      return await call('/messages/messages/$id$suffix');
    } on ApiException catch (e) {
      if (e.status != 404) rethrow;
      return call('/messages/$id$suffix');
    }
  }

  /// Most endpoints wrap payloads as `{success, data: {...}}`; a few (teams) return raw JSON.
  static dynamic unwrap(dynamic body) =>
      (body is Map && body.containsKey('data')) ? body['data'] : body;
}
