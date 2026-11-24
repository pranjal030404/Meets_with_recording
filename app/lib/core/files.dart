import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'api.dart';
import 'config.dart';

/// Authenticated file transfer (the backend requires a Bearer token for /uploads and downloads).
class FileService {
  static Map<String, String> get authHeaders => {if (Config.token != null) 'Authorization': 'Bearer ${Config.token}'};

  /// Download a stored file by its FileEntry id and open it with the system viewer.
  static Future<void> downloadAndOpen(String fileId, String name) async {
    final dir = await getTemporaryDirectory();
    final safe = name.replaceAll(RegExp(r'[^\w.\- ]'), '_');
    final path = '${dir.path}/$safe';
    try {
      await Dio().download('${Config.apiUrl}/files/$fileId/download', path, options: Options(headers: authHeaders));
    } on DioException catch (e) {
      throw ApiException(e.response?.statusCode == 404 ? 'File not found' : 'Download failed');
    }
    await OpenFilex.open(path);
  }

  /// Download any /uploads/... URL (recordings, transcripts, chat attachments).
  static Future<void> openUrl(String urlOrPath, String name) async {
    final url = Config.resolveUrl(urlOrPath)!;
    final dir = await getTemporaryDirectory();
    final safe = name.replaceAll(RegExp(r'[^\w.\- ]'), '_');
    final path = '${dir.path}/$safe';
    try {
      await Dio().download(url, path, options: Options(headers: authHeaders));
    } on DioException {
      throw ApiException('Download failed');
    }
    await OpenFilex.open(path);
  }

  static Future<PlatformFile?> pick() async {
    final r = await FilePicker.pickFiles();
    return r.isEmpty ? null : r.first;
  }

  /// Upload a picked file. Optional scope: teamId / conversationId.
  static Future<Map<String, dynamic>> upload(PlatformFile f, {String? teamId, String? conversationId}) async {
    if (f.path == null) throw ApiException('Cannot read the selected file');
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(f.path!, filename: f.name),
      if (teamId != null) 'teamId': teamId,
      if (conversationId != null) 'conversationId': conversationId,
    });
    try {
      final res = await Dio(BaseOptions(baseUrl: Config.apiUrl, headers: authHeaders, connectTimeout: const Duration(seconds: 20), sendTimeout: const Duration(minutes: 10)))
          .post('/files/upload', data: form);
      return Map<String, dynamic>.from(Api.unwrap(res.data)['file']);
    } on DioException catch (e) {
      final d = e.response?.data;
      throw ApiException(d is Map ? (d['message'] ?? 'Upload failed').toString() : 'Upload failed');
    }
  }

  static bool isImage(String? mime, String? name) {
    final n = (name ?? '').toLowerCase();
    return (mime ?? '').startsWith('image/') || n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.gif') || n.endsWith('.webp');
  }
}

