import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/files.dart';
import '../core/session.dart';
import '../core/socket_service.dart';
import '../widgets/chat_view.dart';
import '../widgets/common.dart';
import 'prejoin_screen.dart';

class ChatsScreen extends StatefulWidget {
  const ChatsScreen({super.key});
  @override
  State<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends State<ChatsScreen> {
  final _key = GlobalKey<AsyncListState<Map<String, dynamic>>>();

  @override
  void initState() {
    super.initState();
    final s = SocketService.instance;
    s.on('conversation:new', _refresh);
    s.on('conversation:activity', _refresh);
  }

  void _refresh(dynamic _) => _key.currentState?.reload();

  @override
  void dispose() {
    final s = SocketService.instance;
    s.off('conversation:new', _refresh);
    s.off('conversation:activity', _refresh);
    super.dispose();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final d = Api.unwrap(await Api.instance.get('/conversations'));
    return asList(d['conversations']).map(asMap).toList();
  }

  Future<void> _new() async {
    final r = await Navigator.push<Map<String, dynamic>>(context, MaterialPageRoute(builder: (_) => const NewChatScreen()));
    if (r != null && mounted) {
      await Navigator.push(context, MaterialPageRoute(builder: (_) => ConversationScreen(conversation: r)));
      _key.currentState?.reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton(onPressed: _new, child: const Icon(Icons.edit_outlined)),
      body: AsyncList<Map<String, dynamic>>(
        key: _key,
        load: _load,
        emptyText: 'No conversations yet',
        emptyIcon: Icons.chat_bubble_outline,
        itemBuilder: (context, c, reload) {
          final unread = (c['unreadCount'] ?? 0) as int;
          final partner = asMap(c['partner']);
          return ListTile(
            leading: c['type'] == 'group' ? const CircleAvatar(child: Icon(Icons.group)) : UserAvatar(name: c['title']?.toString(), url: partner['avatar']?.toString()),
            title: Text((c['title'] ?? '').toString(), style: TextStyle(fontWeight: unread > 0 ? FontWeight.w700 : null)),
            subtitle: Text((c['lastMessagePreview'] ?? 'No messages yet').toString(), maxLines: 1, overflow: TextOverflow.ellipsis),
            trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(fmtRelative(c['lastMessageAt']), style: const TextStyle(fontSize: 12)),
              if (unread > 0) Badge(label: Text('$unread')),
              if (c['isMuted'] == true) const Icon(Icons.notifications_off, size: 14),
            ]),
            onTap: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => ConversationScreen(conversation: c)));
              reload();
            },
          );
        },
      ),
    );
  }
}

class NewChatScreen extends StatefulWidget {
  /// When true the chosen contact is returned as-is instead of opening a conversation.
  final bool pickOnly;
  const NewChatScreen({super.key, this.pickOnly = false});
  @override
  State<NewChatScreen> createState() => _NewChatScreenState();
}

class _NewChatScreenState extends State<NewChatScreen> {
  List<Map<String, dynamic>> contacts = [];
  final selected = <String>{};
  bool group = false;
  bool loading = true;
  String q = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load([String query = '']) async {
    try {
      final d = Api.unwrap(await Api.instance.get('/conversations/people/contacts', query: {if (query.isNotEmpty) 'q': query, if (query.isNotEmpty) 'search': query}));
      if (mounted) setState(() { contacts = asList(d['contacts']).map(asMap).toList(); loading = false; });
    } catch (e) {
      if (mounted) { toast(context, errMsg(e), error: true); setState(() => loading = false); }
    }
  }

  Future<void> _start(String userId) async {
    if (widget.pickOnly) {
      Navigator.pop(context, contacts.firstWhere((c) => c['id'].toString() == userId));
      return;
    }
    final c = await guard(context, () async => asMap(Api.unwrap(await Api.instance.post('/conversations', {'type': 'direct', 'userId': userId}))['conversation']));
    if (c != null && mounted) Navigator.pop(context, c);
  }

  Future<void> _createGroup() async {
    final name = await promptText(context, 'Group name', ok: 'Create');
    if (name == null || name.isEmpty) return;
    if (!mounted) return;
    final c = await guard(context, () async => asMap(Api.unwrap(await Api.instance.post('/conversations', {'type': 'group', 'name': name, 'userIds': selected.toList()}))['conversation']));
    if (c != null && mounted) Navigator.pop(context, c);
  }

  @override
  Widget build(BuildContext context) {
    final list = contacts.where((c) => q.isEmpty || (c['name'] ?? '').toString().toLowerCase().contains(q.toLowerCase()) || (c['email'] ?? '').toString().toLowerCase().contains(q.toLowerCase())).toList();
    return Scaffold(
      appBar: AppBar(
        title: Text(group ? 'New group' : 'New chat'),
        actions: [if (!widget.pickOnly) TextButton(onPressed: () => setState(() { group = !group; selected.clear(); }), child: Text(group ? 'Direct' : 'Group'))],
      ),
      floatingActionButton: group && selected.isNotEmpty ? FloatingActionButton.extended(onPressed: _createGroup, label: Text('Create (${selected.length})'), icon: const Icon(Icons.check)) : null,
      body: Column(children: [
        Padding(padding: const EdgeInsets.all(12), child: TextField(decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search people'), onChanged: (v) => setState(() => q = v))),
        Expanded(
          child: loading
              ? const Center(child: CircularProgressIndicator())
              : list.isEmpty
                  ? const Center(child: Text('No people found. Join a team to find colleagues.'))
                  : ListView(
                      children: list.map((u) {
                        final id = u['id'].toString();
                        return ListTile(
                          leading: UserAvatar(name: u['name']?.toString(), url: u['avatar']?.toString()),
                          title: Text((u['name'] ?? '').toString()),
                          subtitle: Text((u['email'] ?? '').toString()),
                          trailing: group ? Checkbox(value: selected.contains(id), onChanged: (v) => setState(() => v == true ? selected.add(id) : selected.remove(id))) : null,
                          onTap: () => group ? setState(() => selected.contains(id) ? selected.remove(id) : selected.add(id)) : _start(id),
                        );
                      }).toList(),
                    ),
        ),
      ]),
    );
  }
}

class _ConvBackend extends ChatBackend {
  final String id;
  _ConvBackend(this.id);
  final _s = SocketService.instance;

  @override
  Future<List<Map<String, dynamic>>> load() async {
    _s.socket?.emitWithAck('conversation:join', {'conversationId': id}, ack: (_) {});
    final d = Api.unwrap(await Api.instance.get('/conversations/$id/messages', query: {'limit': 100}));
    Api.instance.put('/conversations/$id/read').catchError((_) {});
    return asList(d['messages']).map(asMap).toList();
  }

  @override
  Future<void> send(String text, {PlatformFile? file}) async {
    final body = <String, dynamic>{'content': text};
    if (file != null) {
      final f = await FileService.upload(file, conversationId: id);
      body
        ..['type'] = 'file'
        ..['fileUrl'] = f['url']
        ..['fileName'] = f['originalName']
        ..['fileType'] = f['mimeType']
        ..['fileSize'] = f['size'];
    }
    await Api.instance.post('/conversations/$id/messages', body);
  }

  @override
  VoidCallback subscribe(void Function(Map<String, dynamic>) onNew, void Function(Map<String, dynamic>) onChanged, void Function(String) onDeleted) {
    void a(dynamic d) { if (d is Map && d['conversationId'] == id) onNew(asMap(d)); }
    void b(dynamic d) { if (d is Map && d['conversationId'] == id) onChanged(asMap(d)); }
    void c(dynamic d) { if (d is Map && d['messageId'] != null) onDeleted(d['messageId'].toString()); }
    _s.on('conversation:message', a);
    _s.on('message:updated', b);
    _s.on('message:deleted', c);
    return () {
      _s.off('conversation:message', a);
      _s.off('message:updated', b);
      _s.off('message:deleted', c);
      _s.socket?.emit('conversation:leave', {'conversationId': id});
    };
  }

  @override
  void typing(bool t) => _s.emit('conversation:typing', {'conversationId': id, 'isTyping': t});
}

class ConversationScreen extends StatefulWidget {
  final Map<String, dynamic> conversation;
  const ConversationScreen({super.key, required this.conversation});
  @override
  State<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends State<ConversationScreen> {
  late final _backend = _ConvBackend(widget.conversation['id'].toString());
  String? _typing;
  bool _muted = false;

  @override
  void initState() {
    super.initState();
    _muted = widget.conversation['isMuted'] == true;
    SocketService.instance.on('conversation:user-typing', _onTyping);
  }

  void _onTyping(dynamic d) {
    if (d is! Map || d['userId'] == Session.instance.userId) return;
    setState(() => _typing = d['isTyping'] == true ? '${d['userName'] ?? 'Someone'} is typing…' : null);
  }

  @override
  void dispose() {
    SocketService.instance.off('conversation:user-typing', _onTyping);
    super.dispose();
  }

  Future<void> _huddle() async {
    // Start an instant meeting and drop the link in the chat.
    final m = await guard(context, () async {
      final d = Api.unwrap(await Api.instance.post('/meetings', {'title': '${widget.conversation['title']} huddle'}));
      return asMap(d['meeting']);
    });
    if (m == null || !mounted) return;
    await Api.instance.post('/conversations/${widget.conversation['id']}/messages', {'content': 'Join my huddle: /meeting/${m['roomId']}', 'type': 'meeting_link'}).catchError((_) {});
    if (!mounted) return;
    Navigator.push(context, MaterialPageRoute(builder: (_) => PreJoinScreen(roomId: m['roomId'], title: m['title']?.toString())));
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.conversation;
    final isGroup = c['type'] == 'group';
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text((c['title'] ?? '').toString(), style: const TextStyle(fontSize: 17)),
          if (_typing != null) Text(_typing!, style: const TextStyle(fontSize: 12)) else if (isGroup) Text('${asList(c['members']).length} members', style: const TextStyle(fontSize: 12)),
        ]),
        actions: [
          IconButton(icon: const Icon(Icons.videocam_outlined), tooltip: 'Start huddle', onPressed: _huddle),
          PopupMenuButton<String>(
            onSelected: (v) async {
              if (v == 'mute') {
                final r = await guard(context, () => Api.instance.put('/conversations/${c['id']}/mute', {'isMuted': !_muted}));
                if (r != null) setState(() => _muted = !_muted);
              } else if (v == 'add') {
                final r = await Navigator.push<Map<String, dynamic>>(context, MaterialPageRoute(builder: (_) => const NewChatScreen(pickOnly: true)));
                final uid = r?['id'];
                if (uid != null && mounted) guard(context, () => Api.instance.post('/conversations/${c['id']}/members', {'userIds': [uid]}), success: 'Member added');
              } else if (v == 'leave') {
                if (await confirm(context, 'Leave this group?', ok: 'Leave', danger: true) && mounted) {
                  final ok = await guard(context, () => Api.instance.delete('/conversations/${c['id']}/members/${Session.instance.userId}'));
                  if (ok != null && mounted) Navigator.pop(context);
                }
              } else if (v == 'pinned') {
                _pinned();
              }
            },
            itemBuilder: (_) => [
              PopupMenuItem(value: 'mute', child: Text(_muted ? 'Unmute' : 'Mute')),
              const PopupMenuItem(value: 'pinned', child: Text('Pinned messages')),
              if (isGroup) const PopupMenuItem(value: 'add', child: Text('Add member')),
              if (isGroup) const PopupMenuItem(value: 'leave', child: Text('Leave group')),
            ],
          ),
        ],
      ),
      body: ChatView(backend: _backend, hint: 'Message ${c['title'] ?? ''}'),
    );
  }

  Future<void> _pinned() async {
    final d = await guard(context, () async => Api.unwrap(await Api.instance.get('/messages/pinned', query: {'conversationId': widget.conversation['id']})));
    if (d == null || !mounted) return;
    final list = asList(d['messages']).map(asMap).toList();
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(child: list.isEmpty ? const Padding(padding: EdgeInsets.all(32), child: Text('No pinned messages')) : ListView(shrinkWrap: true, children: list.map((m) => ListTile(title: Text((m['content'] ?? '').toString()), subtitle: Text(asMap(m['sender'])['name']?.toString() ?? ''))).toList())),
    );
  }
}
