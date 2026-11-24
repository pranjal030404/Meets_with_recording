import 'package:shared_preferences/shared_preferences.dart';

/// Persistent app configuration (server address, auth token).
class Config {
  static late SharedPreferences _prefs;

  /// Default points at the host machine from the Android emulator.
  static const defaultServerUrl = 'http://10.0.2.2:5000';

  static Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }

  static String get serverUrl {
    final v = _prefs.getString('serverUrl') ?? defaultServerUrl;
    return v.endsWith('/') ? v.substring(0, v.length - 1) : v;
  }

  static Future<void> setServerUrl(String url) async {
    var u = url.trim();
    if (u.isNotEmpty && !u.startsWith('http')) u = 'https://$u';
    await _prefs.setString('serverUrl', u.isEmpty ? defaultServerUrl : u);
  }

  static String get apiUrl => '$serverUrl/api';

  static String? get token => _prefs.getString('token');
  static Future<void> setToken(String? t) async {
    if (t == null) {
      await _prefs.remove('token');
    } else {
      await _prefs.setString('token', t);
    }
  }

  /// Resolve a (possibly relative) upload / avatar path against the server.
  static String? resolveUrl(String? path) {
    if (path == null || path.isEmpty) return null;
    if (path.startsWith('http')) return path;
    return '$serverUrl${path.startsWith('/') ? '' : '/'}$path';
  }
}
