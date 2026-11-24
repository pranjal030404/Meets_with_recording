import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import '../core/api.dart';
import '../core/config.dart';
import '../core/files.dart';
import '../core/session.dart';
import 'common.dart';

/// What a chat surface (DM, group, team channel) must provide.
abstract class ChatBackend {
  Future<List<Map<String, dynamic>>> load();
  Future<void> send(String text, {PlatformFile? file});
  /// Returns an unsubscribe function. [onNew] receives a message json, [onChanged] an updated one.
  VoidCallback subscribe(void Function(Map<String, dynamic>) onNew, void Function(Map<String, dynamic>) onChanged, void Function(String id) onDeleted);
  void typing(bool isTyping) {}
}

/// Scrollable message list + composer shared by every text chat in the app.
class ChatView extends StatefulWidget {
  final ChatBackend backend;
  final String hint;
  const ChatView({super.key, required this.backend, this.hint = 'Message'});
  @override
  State<ChatView> createState() => _ChatViewState();
}

class _ChatViewState extends State<ChatView> {
  List<Map<String, dynamic>> msgs = [];
  bool loading = true;
  String? error;
  final _text = TextEditingController();
  final _scroll = ScrollController();
  VoidCallback? _unsub;
  PlatformFile? _file;
  bool _sending = false;
  Timer? _typingTimer;

  @override
  void initState() {
    super.initState();
    _load();
    _unsub = widget.backend.subscribe(
      (m) {
        if (!mounted || msgs.any((x) => x['id'] == m['id'])) return;
        if (m['threadRootId'] != null) return;
        setState(() => msgs.add(m));
        _toEnd();
      },
      (m) {
        if (!mounted) return;
        final i = msgs.indexWhere((x) => x['id'] == m['id']);
        if (i >= 0) setState(() => msgs[i] = m);
      },
      (id) {
        if (mounted) setState(() => msgs.removeWhere((x) => x['id'] == id));
      },
    );
  }

  Future<void> _load() async {
    try {
      final r = await widget.backend.load();
      if (!mounted) return;
      setState(() { msgs = r; loading = false; error = null; });
      _toEnd();
    } catch (e) {
      if (mounted) setState(() { error = errMsg(e); loading = false; });
    }
  }

  void _toEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      });

  @override
  void dispose() {
    _unsub?.call();
    _typingTimer?.cancel();
    super.dispose();
  }

  Future<void> _send() async {
    final t = _text.text.trim();
    if ((t.isEmpty && _file == null) || _sending) return;
    setState(() => _sending = true);
    try {
      await widget.backend.send(t, file: _file);
      _text.clear();
      _file = null;
    } catch (e) {
      if (mounted) toast(context, errMsg(e), error: true);
    }
    if (mounted) setState(() => _sending = false);
  }

  Future<void> _attach() async {
    final f = await FileService.pick();
    if (f != null) setState(() => _file = f);
  }

  Future<void> _messageMenu(Map<String, dynamic> m) async {
    final mine = m['senderId'] == Session.instance.userId;
    final id = m['id'];
    await showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Wrap(
            alignment: WrapAlignment.center,
            children: ['👍', '❤️', '😂', '🎉', '😮', '🙏'].map((e) => IconButton(
                  onPressed: () {
                    Navigator.pop(ctx);
                    guard(context, () => Api.instance.message('post', id, '/react', {'emoji': e}));
                  },
                  icon: Text(e, style: const TextStyle(fontSize: 26)),
                )).toList(),
          ),
          ListTile(leading: const Icon(Icons.copy), title: const Text('Copy'), onTap: () { Navigator.pop(ctx); Clipboard.setData(ClipboardData(text: (m['content'] ?? '').toString())); }),
          ListTile(leading: const Icon(Icons.reply), title: const Text('Reply in thread'), onTap: () { Navigator.pop(ctx); _openThread(m); }),
          ListTile(
            leading: Icon(m['isPinned'] == true ? Icons.push_pin : Icons.push_pin_outlined),
            title: Text(m['isPinned'] == true ? 'Unpin' : 'Pin'),
            onTap: () { Navigator.pop(ctx); guard(context, () => Api.instance.message('put', id, '/pin')); },
          ),
          ListTile(leading: const Icon(Icons.bookmark_border), title: const Text('Save'), onTap: () { Navigator.pop(ctx); guard(context, () => Api.instance.message('post', id, '/save'), success: 'Saved'); }),
          ListTile(leading: const Icon(Icons.task_alt), title: const Text('Create task'), onTap: () { Navigator.pop(ctx); guard(context, () => Api.instance.post('/tasks', {'title': (m['content'] ?? '').toString().split('\n').first, 'messageId': id}), success: 'Task created'); }),
          if (mine) ...[
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Edit'),
              onTap: () async {
                Navigator.pop(ctx);
                final t = await promptText(context, 'Edit message', initial: (m['content'] ?? '').toString(), multiline: true, ok: 'Save');
                if (t != null && t.isNotEmpty) guard(context, () => Api.instance.message('put', id, '', {'content': t}));
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: Colors.red),
              title: const Text('Delete', style: TextStyle(color: Colors.red)),
              onTap: () async {
                Navigator.pop(ctx);
                if (await confirm(context, 'Delete this message?', ok: 'Delete', danger: true)) guard(context, () => Api.instance.message('delete', id));
              },
            ),
          ],
        ]),
      ),
    );
  }

  void _openThread(Map<String, dynamic> root) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => FractionallySizedBox(heightFactor: .85, child: ThreadSheet(root: root)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(children: [
      Expanded(
        child: loading
            ? const Center(child: CircularProgressIndicator())
            : error != null
                ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [Text(error!), TextButton(onPressed: _load, child: const Text('Retry'))]))
                : msgs.isEmpty
                    ? Center(child: Text('No messages yet. Say hello 👋', style: TextStyle(color: cs.outline)))
                    : ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                        itemCount: msgs.length,
                        itemBuilder: (_, i) => _bubble(msgs[i], i > 0 ? msgs[i - 1] : null),
                      ),
      ),
      if (_file != null)
        ListTile(
          dense: true,
          leading: const Icon(Icons.attach_file),
          title: Text(_file!.name, maxLines: 1, overflow: TextOverflow.ellipsis),
          trailing: IconButton(icon: const Icon(Icons.close), onPressed: () => setState(() => _file = null)),
        ),
      SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            IconButton(onPressed: _attach, icon: const Icon(Icons.attach_file)),
            Expanded(
              child: TextField(
                controller: _text,
                minLines: 1,
                maxLines: 5,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(hintText: widget.hint, isDense: true),
                onChanged: (_) {
                  widget.backend.typing(true);
                  _typingTimer?.cancel();
                  _typingTimer = Timer(const Duration(seconds: 2), () => widget.backend.typing(false));
                },
              ),
            ),
            const SizedBox(width: 6),
            IconButton.filled(onPressed: _sending ? null : _send, icon: _sending ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send)),
          ]),
        ),
      ),
    ]);
  }

  Widget _bubble(Map<String, dynamic> m, Map<String, dynamic>? prev) {
    final cs = Theme.of(context).colorScheme;
    final mine = m['senderId'] == Session.instance.userId;
    final sender = asMap(m['sender']);
    final system = m['type'] == 'system';
    final showName = !mine && (prev == null || prev['senderId'] != m['senderId']);
    final reactions = asList(m['reactions']).map(asMap).toList();
    final grouped = <String, int>{};
    for (final r in reactions) {
      grouped[r['emoji'].toString()] = (grouped[r['emoji'].toString()] ?? 0) + 1;
    }
    if (system) return Center(child: Padding(padding: const EdgeInsets.all(8), child: Text((m['content'] ?? '').toString(), style: TextStyle(color: cs.outline, fontSize: 12))));

    final hasFile = (m['fileUrl'] ?? '').toString().isNotEmpty;
    final isImg = hasFile && FileService.isImage(m['fileType']?.toString(), m['fileName']?.toString());

    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: () => _messageMenu(m),
        child: Container(
          margin: EdgeInsets.only(top: showName ? 8 : 2, bottom: 2),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * .78),
          decoration: BoxDecoration(color: mine ? cs.primaryContainer : cs.surfaceContainerHighest, borderRadius: BorderRadius.circular(16)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (showName) Text((sender['name'] ?? '').toString(), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: cs.primary)),
            if (isImg)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.network(Config.resolveUrl(m['fileUrl'])!, headers: FileService.authHeaders, height: 180, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const Icon(Icons.broken_image)),
                ),
              )
            else if (hasFile)
              InkWell(
                onTap: () => guard(context, () => FileService.openUrl(m['fileUrl'], (m['fileName'] ?? 'file').toString())),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.insert_drive_file_outlined),
                  const SizedBox(width: 6),
                  Flexible(child: Text((m['fileName'] ?? 'Attachment').toString(), style: const TextStyle(decoration: TextDecoration.underline))),
                ]),
              ),
            if ((m['content'] ?? '').toString().isNotEmpty && !(hasFile && m['content'] == m['fileName'])) SelectableText(m['content'].toString()),
            if (grouped.isNotEmpty)
              Wrap(spacing: 4, children: grouped.entries.map((e) => Chip(label: Text('${e.key} ${e.value}', style: const TextStyle(fontSize: 12)), visualDensity: VisualDensity.compact, padding: EdgeInsets.zero)).toList()),
            Row(mainAxisSize: MainAxisSize.min, children: [
              Text(fmtTime(parseDate(m['createdAt']) ?? DateTime.now()), style: TextStyle(fontSize: 10, color: cs.outline)),
              if (m['isEdited'] == true) Text(' · edited', style: TextStyle(fontSize: 10, color: cs.outline)),
              if (m['isPinned'] == true) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(Icons.push_pin, size: 11)),
              if ((m['replyCount'] ?? 0) is num && (m['replyCount'] ?? 0) > 0)
                InkWell(onTap: () => _openThread(m), child: Padding(padding: const EdgeInsets.only(left: 8), child: Text('${m['replyCount']} replies', style: TextStyle(fontSize: 11, color: cs.primary)))),
            ]),
          ]),
        ),
      ),
    );
  }
}

class ThreadSheet extends StatefulWidget {
  final Map<String, dynamic> root;
  const ThreadSheet({super.key, required this.root});
  @override
  State<ThreadSheet> createState() => _ThreadSheetState();
}

class _ThreadSheetState extends State<ThreadSheet> {
  List<Map<String, dynamic>> replies = [];
  final _t = TextEditingController();
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = Api.unwrap(await Api.instance.message('get', widget.root['id'].toString(), '/thread'));
      final list = asList(d is Map ? (d['replies'] ?? d['messages']) : null).map(asMap).toList();
      if (mounted) setState(() { replies = list; loading = false; });
    } catch (_) {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _send() async {
    final t = _t.text.trim();
    if (t.isEmpty) return;
    _t.clear();
    await guard(context, () => Api.instance.message('post', widget.root['id'].toString(), '/replies', {'content': t}));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      ListTile(title: Text((widget.root['content'] ?? '').toString()), subtitle: Text(asMap(widget.root['sender'])['name']?.toString() ?? ''), tileColor: Theme.of(context).colorScheme.surfaceContainerHighest),
      Expanded(
        child: loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(children: replies.map((r) => ListTile(dense: true, leading: UserAvatar(name: asMap(r['sender'])['name']?.toString(), radius: 14), title: Text(asMap(r['sender'])['name']?.toString() ?? ''), subtitle: Text((r['content'] ?? '').toString()))).toList()),
      ),
      Padding(
        padding: EdgeInsets.fromLTRB(12, 4, 12, 8 + MediaQuery.of(context).viewInsets.bottom),
        child: Row(children: [
          Expanded(child: TextField(controller: _t, decoration: const InputDecoration(hintText: 'Reply…', isDense: true), onSubmitted: (_) => _send())),
          IconButton(onPressed: _send, icon: const Icon(Icons.send)),
        ]),
      ),
    ]);
  }
}
