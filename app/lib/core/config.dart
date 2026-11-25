import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// App configuration (server address) and the persisted auth token.
class Config {
  static late SharedPreferences _prefs;

  static Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }

  /// The live deployment, fixed at build time: users never choose a server.
  /// Developers can build against a local backend with
  /// `--dart-define=SERVER_URL=http://10.0.2.2:5000`.
  static const _buildServerUrl =
      String.fromEnvironment('SERVER_URL', defaultValue: 'https://meet.arthvex.co.in');

  /// Lets the live backend test point at another server.
  @visibleForTesting
  static String? testServerUrl;

  static String get serverUrl => testServerUrl ?? _buildServerUrl;

  static String get apiUrl => '$serverUrl/api';

  static String? get token => _prefs.getString('token');
  static Future<void> setToken(String? t) async {
    if (t == null) {
      await _prefs.remove('token');
    } else {
      await _prefs.setString('token', t);
    }
  }

  /// Camera background: off | blur | image (with a picture kept on this phone).
  static String get backgroundMode => _prefs.getString('bg_mode') ?? 'off';
  static String? get backgroundImage => _prefs.getString('bg_image');
  static Future<void> setBackground(String mode, [String? image]) async {
    await _prefs.setString('bg_mode', mode);
    if (image != null) await _prefs.setString('bg_image', image);
  }

  /// Resolve a (possibly relative) upload / avatar path against the server.
  static String? resolveUrl(String? path) {
    if (path == null || path.isEmpty) return null;
    if (path.startsWith('http')) return path;
    return '$serverUrl${path.startsWith('/') ? '' : '/'}$path';
  }
}
