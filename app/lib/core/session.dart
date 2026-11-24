import 'package:flutter/foundation.dart';
import 'api.dart';
import 'config.dart';
import 'socket_service.dart';

/// Holds the signed-in user and drives the auth gate.
class Session extends ChangeNotifier {
  Session._() {
    Api.instance.onUnauthorized = () => logout();
  }
  static final Session instance = Session._();

  Map<String, dynamic>? user;
  Map<String, dynamic>? subscription;
  bool booting = true;

  bool get isLoggedIn => user != null;
  String get userId => (user?['id'] ?? '').toString();
  String get name => (user?['name'] ?? '').toString();
  String get email => (user?['email'] ?? '').toString();

  Future<void> boot() async {
    if (Config.token != null) {
      try {
        await refresh();
        SocketService.instance.connect();
      } on ApiException catch (e) {
        if (e.status == 401 || e.status == 403) await Config.setToken(null);
      }
    }
    booting = false;
    notifyListeners();
  }

  Future<void> refresh() async {
    final d = Api.unwrap(await Api.instance.get('/auth/me'));
    user = Map<String, dynamic>.from(d['user']);
    subscription = d['subscription'] is Map ? Map<String, dynamic>.from(d['subscription']) : null;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    final d = Api.unwrap(await Api.instance.post('/auth/login', {'email': email.trim(), 'password': password}));
    await Config.setToken(d['token']);
    user = Map<String, dynamic>.from(d['user']);
    SocketService.instance.connect();
    notifyListeners();
  }

  /// Returns a message to show the user (verification may be required).
  Future<String?> signup(String name, String email, String password) async {
    final body = await Api.instance.post('/auth/signup', {'name': name.trim(), 'email': email.trim(), 'password': password});
    final d = Api.unwrap(body);
    if (d is Map && d['token'] != null) {
      await Config.setToken(d['token']);
      user = Map<String, dynamic>.from(d['user']);
      SocketService.instance.connect();
      notifyListeners();
      return null;
    }
    return (body is Map ? body['message'] : null)?.toString() ?? 'Account created. Please verify your email, then sign in.';
  }

  Future<void> updateProfile(Map<String, dynamic> fields) async {
    final d = Api.unwrap(await Api.instance.put('/auth/profile', fields));
    if (d is Map && d['user'] is Map) user = Map<String, dynamic>.from(d['user']);
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      if (Config.token != null) await Api.instance.post('/auth/logout');
    } catch (_) {}
    await Config.setToken(null);
    SocketService.instance.disconnect();
    user = null;
    subscription = null;
    notifyListeners();
  }
}
