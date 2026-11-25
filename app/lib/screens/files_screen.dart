import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/files.dart';
import '../widgets/common.dart';

IconData fileIcon(String? mime, String? name) {
  final n = (name ?? '').toLowerCase();
  if (FileService.isImage(mime, name)) return Icons.image_outlined;
  if ((mime ?? '').startsWith('video/')) return Icons.movie_outlined;
  if ((mime ?? '').startsWith('audio/')) return Icons.audiotrack_outlined;
  if (n.endsWith('.pdf')) return Icons.picture_as_pdf_outlined;
  if (n.endsWith('.zip') || n.endsWith('.rar')) return Icons.folder_zip_outlined;
  return Icons.insert_drive_file_outlined;
}

/// Workspace files: personal or per-team, with upload, download, trash & restore.
class FilesScreen extends StatefulWidget {
  final String? teamId;
  final bool standalone;
  const FilesScreen({super.key, this.teamId, this.standalone = false});
  @override
  State<FilesScreen> createState() => _FilesScreenState();
}

class _FilesScreenState extends State<FilesScreen> {
  final _key = GlobalKey<AsyncListState<Map<String, dynamic>>>();
  bool _trash = false;
  Map<String, dynamic>? _storage;
  String _search = '';
  bool _uploading = false;

  Future<List<Map<String, dynamic>>> _load() async {
    if (_trash) {
      final d = Api.unwrap(await Api.instance.get('/files/trash/list'));
      return asList(d['files']).map(asMap).toList();
    }
    final d = Api.unwrap(await Api.instance.get('/files', query: {
      'scope': widget.teamId != null ? 'team' : 'mine',
      if (widget.teamId != null) 'teamId': widget.teamId,
      if (_search.isNotEmpty) 'search': _search,
    }));
    try {
      _storage = asMap(Api.unwrap(await Api.instance.get('/files/storage/summary')));
      if (mounted) setState(() {});
    } catch (_) {}
    return asList(d['files']).map(asMap).toList();
  }

  Future<void> _upload() async {
    final f = await FileService.pick();
    if (f == null || !mounted) return;
    setState(() => _uploading = true);
    final r = await guard(context, () => FileService.upload(f, teamId: widget.teamId), success: 'Uploaded ${f.name}');
    if (mounted) setState(() => _uploading = false);
    if (r != null) _key.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    final body = Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: _trash ? null : FloatingActionButton.extended(onPressed: _uploading ? null : _upload, icon: _uploading ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.upload_file), label: const Text('Upload')),
      body: AsyncList<Map<String, dynamic>>(
        key: _key,
        load: _load,
        emptyText: _trash ? 'Trash is empty' : 'No files yet',
        emptyIcon: _trash ? Icons.delete_outline : Icons.folder_open,
        header: Column(children: [
          if (widget.teamId == null)
            PageHeader('Files', subtitle: _storage?['personalBytes'] != null ? 'Using ${fmtBytes(_storage!['personalBytes'])} of personal storage' : 'Your personal files'),
          Row(children: [
            Expanded(
              child: TextField(
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search files', isDense: true),
                onSubmitted: (v) { _search = v.trim(); _key.currentState?.reload(); },
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filledTonal(
              tooltip: _trash ? 'Back to files' : 'Trash',
              icon: Icon(_trash ? Icons.folder : Icons.delete_outline),
              onPressed: () { setState(() => _trash = !_trash); WidgetsBinding.instance.addPostFrameCallback((_) => _key.currentState?.reload()); },
            ),
          ]),
          if (_storage != null && !_trash && _storage!['used'] != null)
            Padding(padding: const EdgeInsets.only(top: 8), child: Text('Storage used: ${fmtBytes(_storage!['used'])}${_storage!['limit'] != null && _storage!['limit'] != -1 ? ' of ${fmtBytes(_storage!['limit'])}' : ''}', style: TextStyle(color: Theme.of(context).colorScheme.outline, fontSize: 12))),
          const SizedBox(height: 8),
        ]),
        itemBuilder: (context, f, reload) => ListTile(
          leading: Icon(fileIcon(f['mimeType']?.toString(), f['originalName']?.toString())),
          title: Text((f['originalName'] ?? '').toString(), maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: Text('${fmtBytes(f['size'])} · ${asMap(f['owner'])['name'] ?? ''} · ${fmtRelative(f['createdAt'])}'),
          onTap: _trash ? null : () => guard(context, () => FileService.downloadAndOpen(f['id'].toString(), (f['originalName'] ?? 'file').toString())),
          trailing: _trash
              ? IconButton(icon: const Icon(Icons.restore), onPressed: () async { await guard(context, () => Api.instance.put('/files/${f['id']}/restore'), success: 'Restored'); reload(); })
              : IconButton(
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () async {
                    if (await confirm(context, 'Move to trash?', body: (f['originalName'] ?? '').toString(), ok: 'Delete', danger: true) && context.mounted) {
                      await guard(context, () => Api.instance.delete('/files/${f['id']}'), success: 'Moved to trash');
                      reload();
                    }
                  },
                ),
        ),
      ),
    );
    if (!widget.standalone) return body;
    return Scaffold(appBar: AppBar(title: const Text('Files')), body: body);
  }
}
