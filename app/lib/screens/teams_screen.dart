import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import '../core/theme.dart';
import 'package:flutter/services.dart';
import '../core/api.dart';
import '../core/files.dart';
import '../core/session.dart';
import '../core/socket_service.dart';
import '../widgets/chat_view.dart';
import '../widgets/common.dart';
import 'calendar_screen.dart';
import 'files_screen.dart';
import 'meetings_screen.dart';
import 'tasks_screen.dart';

class TeamsScreen extends StatefulWidget {
  const TeamsScreen({super.key});
  @override
  State<TeamsScreen> createState() => _TeamsScreenState();
}

class _TeamsScreenState extends State<TeamsScreen> {
  final _key = GlobalKey<AsyncListState<Map<String, dynamic>>>();

  Future<List<Map<String, dynamic>>> _load() async {
    final d = await Api.instance.get('/teams');
    return asList(Api.unwrap(d) is Map ? Api.unwrap(d)['teams'] : d).map(asMap).toList();
  }

  Future<void> _create() async {
    final name = TextEditingController();
    final desc = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Create team'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: name, autofocus: true, decoration: const InputDecoration(labelText: 'Team name')),
          const SizedBox(height: 12),
          TextField(controller: desc, decoration: const InputDecoration(labelText: 'Description (optional)')),
        ]),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Create'))],
      ),
    );
    if (ok != true || name.text.trim().length < 2 || !mounted) return;
    final r = await guard(context, () => Api.instance.post('/teams', {'name': name.text.trim(), 'description': desc.text.trim()}), success: 'Team created');
    if (r != null) _key.currentState?.reload();
  }

  Future<void> _join() async {
    final code = await promptText(context, 'Join a team', hint: 'Invite code', ok: 'Join');
    if (code == null || code.isEmpty || !mounted) return;
    final r = await guard(context, () => Api.instance.post('/teams/join/${code.trim()}'), success: 'Joined team');
    if (r != null) _key.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(onPressed: _create, icon: const Icon(Icons.add), label: const Text('New team')),
      body: AsyncList<Map<String, dynamic>>(
        key: _key,
        load: _load,
        emptyText: 'You are not in any team yet',
        emptyIcon: Icons.groups_outlined,
        header: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const PageHeader('Teams', subtitle: 'Manage your team workspaces'),
          OutlinedButton.icon(onPressed: _join, icon: const Icon(Icons.vpn_key_outlined), label: const Text('Join with invite code')),
          const SizedBox(height: 8),
        ]),
        itemBuilder: (context, t, reload) => Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: CircleAvatar(child: Text((t['name'] ?? '?').toString()[0].toUpperCase())),
            title: Text((t['name'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('${asList(t['members']).length} members${(t['description'] ?? '').toString().isNotEmpty ? ' · ${t['description']}' : ''}', maxLines: 1, overflow: TextOverflow.ellipsis),
            trailing: const Icon(Icons.chevron_right),
            onTap: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => TeamDetailScreen(teamId: t['id'].toString())));
              reload();
            },
          ),
        ),
      ),
    );
  }
}

class _TeamChatBackend extends ChatBackend {
  final String teamId;
  final String channelKey;
  _TeamChatBackend(this.teamId, this.channelKey);
  final _s = SocketService.instance;

  @override
  Future<List<Map<String, dynamic>>> load() async {
    _s.emit('team:join', {'teamId': teamId});
    final d = Api.unwrap(await Api.instance.get('/chat/team/$teamId/messages', query: {'channelType': channelKey, 'limit': 100}));
    return asList(d['messages']).map(asMap).toList();
  }

  @override
  Future<void> send(String text, {PlatformFile? file}) async {
    Map<String, dynamic>? attachment;
    if (file != null) {
      final f = await FileService.upload(file, teamId: teamId);
      attachment = {'fileId': f['id']};
    }
    await Api.instance.post('/chat/team/$teamId/messages', {
      'content': text,
      'channelType': channelKey,
      if (attachment != null) 'attachment': attachment,
      if (attachment != null) 'type': 'file',
    });
  }

  @override
  VoidCallback subscribe(void Function(Map<String, dynamic>) onNew, void Function(Map<String, dynamic>) onChanged, void Function(String) onDeleted) {
    void a(dynamic d) {
      if (d is Map && d['channelType']?.toString() == channelKey && d['message'] is Map) onNew(asMap(d['message']));
    }
    void b(dynamic d) { if (d is Map && d['teamId']?.toString() == teamId) onChanged(asMap(d)); }
    void c(dynamic d) { if (d is Map && d['messageId'] != null) onDeleted(d['messageId'].toString()); }
    _s.on('team:message', a);
    _s.on('message:updated', b);
    _s.on('message:deleted', c);
    return () {
      _s.off('team:message', a);
      _s.off('message:updated', b);
      _s.off('message:deleted', c);
    };
  }

  @override
  void typing(bool t) => _s.emit('team:typing', {'teamId': teamId, 'channelType': channelKey, 'isTyping': t});
}

class TeamDetailScreen extends StatefulWidget {
  final String teamId;
  const TeamDetailScreen({super.key, required this.teamId});
  @override
  State<TeamDetailScreen> createState() => _TeamDetailScreenState();
}

class _TeamDetailScreenState extends State<TeamDetailScreen> with SingleTickerProviderStateMixin {
  Map<String, dynamic>? team;
  String? error;
  late final TabController _tabs = TabController(length: 6, vsync: this);
  String _channel = 'general';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    SocketService.instance.emit('team:leave', {'teamId': widget.teamId});
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await Api.instance.get('/teams/${widget.teamId}');
      if (mounted) setState(() => team = asMap(Api.unwrap(d) is Map && (Api.unwrap(d) as Map).containsKey('id') ? Api.unwrap(d) : d));
    } catch (e) {
      if (mounted) setState(() => error = errMsg(e));
    }
  }

  String get myRole => asList(team?['members']).map(asMap).firstWhere((m) => m['userId'] == Session.instance.userId, orElse: () => {})['role']?.toString() ?? 'member';
  bool get canAdmin => myRole == 'owner' || myRole == 'admin';

  List<Map<String, dynamic>> get channels => asList(team?['channels']).map(asMap).toList();
  String keyOf(Map<String, dynamic> c) => (c['type'] == 'custom') ? 'custom:${c['id']}' : (c['type'] ?? c['name']).toString();

  @override
  Widget build(BuildContext context) {
    if (error != null) return Scaffold(appBar: AppBar(), body: Center(child: Text(error!)));
    if (team == null) return Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator()));
    final members = asList(team!['members']).map(asMap).toList();
    return Scaffold(
      appBar: AppBar(
        title: Text(team!['name'].toString()),
        bottom: TabBar(controller: _tabs, isScrollable: true, tabAlignment: TabAlignment.start, tabs: const [
          Tab(text: 'Chat'), Tab(text: 'Tasks'), Tab(text: 'Meetings'), Tab(text: 'Calendar'), Tab(text: 'Files'), Tab(text: 'Members'),
        ]),
      ),
      body: TabBarView(controller: _tabs, physics: const NeverScrollableScrollPhysics(), children: [
        _chatTab(),
        TaskBoard(teamId: widget.teamId, teamMembers: members),
        _meetingsTab(),
        CalendarScreen(teamId: widget.teamId),
        FilesScreen(teamId: widget.teamId),
        _membersTab(members),
      ]),
    );
  }

  Widget _chatTab() {
    final chs = channels;
    return Column(children: [
      SizedBox(
        height: 52,
        child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8), children: [
          ...chs.map((c) {
            final k = keyOf(c);
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: GestureDetector(
                onLongPress: (c['type'] == 'custom' && canAdmin)
                    ? () async {
                        if (await confirm(context, 'Delete #${c['name']}?', ok: 'Delete', danger: true) && mounted) {
                          await guard(context, () => Api.instance.delete('/teams/${widget.teamId}/channels/${c['id']}'));
                          setState(() => _channel = 'general');
                          _load();
                        }
                      }
                    : null,
                child: ChoiceChip(label: Text('# ${c['name']}'), selected: _channel == k, onSelected: (_) => setState(() => _channel = k)),
              ),
            );
          }),
          if (canAdmin)
            ActionChip(
              avatar: const Icon(Icons.add, size: 16),
              label: const Text('Channel'),
              onPressed: () async {
                final n = await promptText(context, 'New channel', hint: 'name', ok: 'Create');
                if (n == null || n.isEmpty || !mounted) return;
                final r = await guard(context, () => Api.instance.post('/teams/${widget.teamId}/channels', {'name': n}));
                if (r != null) _load();
              },
            ),
        ]),
      ),
      const Divider(height: 1),
      Expanded(child: ChatView(key: ValueKey(_channel), backend: _TeamChatBackend(widget.teamId, _channel), hint: 'Message #$_channel')),
    ]);
  }

  Widget _meetingsTab() {
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ScheduleMeetingScreen(teamId: widget.teamId))),
        icon: const Icon(Icons.event),
        label: const Text('Schedule'),
      ),
      body: AsyncList<Map<String, dynamic>>(
        load: () async => asList(Api.unwrap(await Api.instance.get('/meetings/team/${widget.teamId}'))['meetings']).map(asMap).toList(),
        emptyText: 'No team meetings',
        emptyIcon: Icons.videocam_off_outlined,
        itemBuilder: (_, m, reload) => MeetingCard(meeting: m, onChanged: reload),
      ),
    );
  }

  Widget _membersTab(List<Map<String, dynamic>> members) {
    return ListView(padding: const EdgeInsets.all(12), children: [
      Card(
        child: ListTile(
          leading: const Icon(Icons.vpn_key_outlined),
          title: Text('Invite code: ${team!['inviteCode']}'),
          subtitle: const Text('Share this code so people can join'),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            IconButton(icon: const Icon(Icons.copy), onPressed: () { Clipboard.setData(ClipboardData(text: team!['inviteCode'].toString())); toast(context, 'Code copied'); }),
            if (canAdmin)
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: () async {
                  final r = await guard(context, () => Api.instance.post('/teams/${widget.teamId}/regenerate-code'), success: 'New code generated');
                  if (r != null) _load();
                },
              ),
          ]),
        ),
      ),
      const SizedBox(height: 8),
      FilledButton.tonalIcon(
        icon: const Icon(Icons.person_add_alt),
        label: const Text('Invite by email'),
        onPressed: () async {
          final e = await promptText(context, 'Invite by email', hint: 'name@company.com', ok: 'Invite');
          if (e == null || e.isEmpty || !mounted) return;
          final r = await guard(context, () => Api.instance.post('/teams/${widget.teamId}/invite', {'email': e}), success: 'Invitation sent');
          if (r != null) _load();
        },
      ),
      SectionTitle('Members (${members.length})'),
      ...members.map((m) {
        final u = asMap(m['user']);
        final isMe = m['userId'] == Session.instance.userId;
        return ListTile(
          leading: UserAvatar(name: u['name']?.toString(), url: u['avatar']?.toString()),
          title: Text('${u['name'] ?? ''}${isMe ? ' (you)' : ''}'),
          subtitle: Text('${m['role']} · ${u['email'] ?? ''}'),
          trailing: (canAdmin && !isMe && m['role'] != 'owner')
              ? PopupMenuButton<String>(
                  onSelected: (v) async {
                    if (v == 'remove') {
                      if (!await confirm(context, 'Remove ${u['name']}?', ok: 'Remove', danger: true) || !mounted) return;
                      await guard(context, () => Api.instance.delete('/teams/${widget.teamId}/members/${m['userId']}'));
                    } else {
                      await guard(context, () => Api.instance.put('/teams/${widget.teamId}/members/${m['userId']}/role', {'role': v}));
                    }
                    _load();
                  },
                  itemBuilder: (_) => [
                    for (final r in ['admin', 'member', 'guest']) if (r != m['role']) PopupMenuItem(value: r, child: Text('Make $r')),
                    const PopupMenuItem(value: 'remove', child: Text('Remove')),
                  ],
                )
              : null,
        );
      }),
      const SizedBox(height: 16),
      if (!isOwner)
        OutlinedButton.icon(
          icon: const Icon(Icons.exit_to_app),
          label: const Text('Leave team'),
          onPressed: () async {
            if (!await confirm(context, 'Leave this team?', ok: 'Leave', danger: true) || !mounted) return;
            final r = await guard(context, () => Api.instance.delete('/teams/${widget.teamId}/members/${Session.instance.userId}'));
            if (r != null && mounted) Navigator.pop(context);
          },
        ),
      if (isOwner)
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(foregroundColor: AppTheme.overdue),
          icon: const Icon(Icons.delete_forever),
          label: const Text('Delete team'),
          onPressed: () async {
            final n = await promptText(context, 'Type "${team!['name']}" to delete', ok: 'Delete');
            if (n != team!['name'] || !mounted) return;
            final r = await guard(context, () => Api.instance.delete('/teams/${widget.teamId}'), success: 'Team deleted');
            if (r != null && mounted) Navigator.pop(context);
          },
        ),
    ]);
  }

  bool get isOwner => team?['ownerId'] == Session.instance.userId;
}
