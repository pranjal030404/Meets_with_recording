import 'dart:async';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/files.dart';
import '../widgets/common.dart';
import 'chats_screen.dart';
import 'meeting_detail_screen.dart';
import 'teams_screen.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});
  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _c = TextEditingController();
  Timer? _debounce;
  Map<String, dynamic> results = {};
  bool loading = false;
  String? error;

  void _onChanged(String v) {
    _debounce?.cancel();
    if (v.trim().length < 2) {
      setState(() { results = {}; error = null; });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 400), () => _search(v.trim()));
  }

  Future<void> _search(String q) async {
    setState(() { loading = true; error = null; });
    try {
      final d = Api.unwrap(await Api.instance.get('/search', query: {'q': q}));
      if (mounted) setState(() => results = asMap(d['results']));
    } catch (e) {
      if (mounted) setState(() => error = errMsg(e));
    }
    if (mounted) setState(() => loading = false);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final sections = <Widget>[];
    void section(String title, String key, Widget Function(Map<String, dynamic>) tile) {
      final items = asList(results[key]).map(asMap).toList();
      if (items.isEmpty) return;
      sections..add(SectionTitle('$title (${items.length})'))..addAll(items.map(tile));
    }

    section('Messages', 'messages', (m) => ListTile(
          leading: const Icon(Icons.chat_bubble_outline),
          title: Text((m['content'] ?? '').toString(), maxLines: 2, overflow: TextOverflow.ellipsis),
          subtitle: Text('${asMap(m['sender'])['name'] ?? ''} · ${fmtRelative(m['createdAt'])}'),
          onTap: () {
            if (m['conversationId'] != null) {
              Navigator.push(context, MaterialPageRoute(builder: (_) => ConversationScreen(conversation: {'id': m['conversationId'], 'title': 'Chat', 'type': 'direct'})));
            } else if (m['teamId'] != null) {
              Navigator.push(context, MaterialPageRoute(builder: (_) => TeamDetailScreen(teamId: m['teamId'].toString())));
            }
          },
        ));
    section('People', 'people', (u) => ListTile(leading: UserAvatar(name: u['name']?.toString(), url: u['avatar']?.toString()), title: Text((u['name'] ?? '').toString()), subtitle: Text((u['email'] ?? '').toString())));
    section('Teams', 'teams', (t) => ListTile(leading: const Icon(Icons.groups_outlined), title: Text((t['name'] ?? '').toString()), subtitle: Text((t['description'] ?? '').toString()), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => TeamDetailScreen(teamId: t['id'].toString())))));
    section('Meetings', 'meetings', (m) => ListTile(leading: const Icon(Icons.videocam_outlined), title: Text((m['title'] ?? '').toString()), subtitle: Text('${m['status']} · ${fmtDateTime(m['scheduledAt'])}'), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => MeetingDetailScreen(roomId: m['roomId'].toString())))));
    section('Files', 'files', (f) => ListTile(leading: const Icon(Icons.insert_drive_file_outlined), title: Text((f['originalName'] ?? '').toString()), subtitle: Text(fmtBytes(f['size'])), onTap: () => guard(context, () => FileService.downloadAndOpen(f['id'].toString(), (f['originalName'] ?? 'file').toString()))));
    section('Tasks', 'tasks', (t) => ListTile(leading: const Icon(Icons.task_alt), title: Text((t['title'] ?? '').toString()), subtitle: Text((t['status'] ?? '').toString())));

    return Scaffold(
      appBar: AppBar(
        title: TextField(controller: _c, autofocus: true, onChanged: _onChanged, decoration: const InputDecoration(hintText: 'Search messages, people, meetings…', border: InputBorder.none, filled: false)),
      ),
      body: loading
          ? const LinearProgressIndicator()
          : error != null
              ? Center(child: Text(error!))
              : sections.isEmpty
                  ? Center(child: Text(_c.text.trim().length < 2 ? 'Type at least 2 characters' : 'No results', style: TextStyle(color: Theme.of(context).colorScheme.outline)))
                  : ListView(padding: const EdgeInsets.all(12), children: sections),
    );
  }
}
