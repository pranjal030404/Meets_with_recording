import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../core/api.dart';
import '../core/config.dart';
import '../core/files.dart';
import '../core/session.dart';
import '../widgets/common.dart';
import 'prejoin_screen.dart';

class MeetingDetailScreen extends StatefulWidget {
  final String roomId;
  const MeetingDetailScreen({super.key, required this.roomId});
  @override
  State<MeetingDetailScreen> createState() => _MeetingDetailScreenState();
}

class _MeetingDetailScreenState extends State<MeetingDetailScreen> {
  Map<String, dynamic>? m;
  String? error;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = Api.unwrap(await Api.instance.get('/meetings/${Uri.encodeComponent(widget.roomId)}'));
      if (mounted) setState(() => m = asMap(d['meeting']));
    } catch (e) {
      if (mounted) setState(() => error = errMsg(e));
    }
  }

  String get link => '${Config.serverUrl}/meeting/${widget.roomId}';
  bool get isHost => (m?['hostId'] ?? asMap(m?['host'])['id']) == Session.instance.userId;
  String get status => m?['status']?.toString() ?? '';

  Future<void> _act(Future<dynamic> Function() f, String ok, {bool pop = false}) async {
    setState(() => busy = true);
    final r = await guard(context, f, success: ok);
    if (!mounted) return;
    setState(() => busy = false);
    if (r != null) {
      if (pop) {
        Navigator.pop(context);
      } else {
        _load();
      }
    }
  }

  Future<void> _invite() async {
    final t = await promptText(context, 'Invite by email', hint: 'a@x.com, b@y.com', ok: 'Send invites');
    if (t == null) return;
    final emails = t.split(RegExp(r'[,\s;]+')).where((e) => e.contains('@')).toList();
    if (emails.isEmpty) return;
    _act(() => Api.instance.post('/meetings/${widget.roomId}/invite', {'invitees': emails.map((e) => {'email': e}).toList()}), 'Invitations sent');
  }

  @override
  Widget build(BuildContext context) {
    if (error != null) return Scaffold(appBar: AppBar(), body: Center(child: Text(error!)));
    if (m == null) return Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator()));
    final cs = Theme.of(context).colorScheme;
    final invitees = asList(m!['invitees']).map(asMap).toList();
    final myInvite = invitees.cast<Map<String, dynamic>?>().firstWhere((i) => i?['userId'] == Session.instance.userId, orElse: () => null);
    final recordings = asList(m!['recordings']).map(asMap).toList();
    final canJoin = status == 'scheduled' || status == 'active';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Meeting details'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text(m!['title']?.toString() ?? 'Meeting', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Wrap(spacing: 8, children: [
          Chip(label: Text(status), avatar: Icon(status == 'active' ? Icons.sensors : Icons.info_outline, size: 16)),
          if (asMap(m!['team'])['name'] != null) Chip(label: Text(asMap(m!['team'])['name']), avatar: const Icon(Icons.groups, size: 16)),
        ]),
        if ((m!['description'] ?? '').toString().isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(m!['description'])),
        const SizedBox(height: 8),
        ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.schedule), title: Text(fmtDateTime(m!['scheduledAt'] ?? m!['createdAt'])), subtitle: const Text('Time')),
        ListTile(contentPadding: EdgeInsets.zero, leading: UserAvatar(name: asMap(m!['host'])['name'], url: asMap(m!['host'])['avatar'], radius: 16), title: Text(asMap(m!['host'])['name']?.toString() ?? ''), subtitle: const Text('Host')),
        Card(
          child: ListTile(
            leading: const Icon(Icons.link),
            title: Text(link, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text('Code: ${widget.roomId}'),
            trailing: IconButton(icon: const Icon(Icons.copy), onPressed: () { Clipboard.setData(ClipboardData(text: link)); toast(context, 'Invite link copied'); }),
          ),
        ),
        const SizedBox(height: 12),
        if (canJoin)
          FilledButton.icon(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PreJoinScreen(roomId: widget.roomId, title: m!['title']?.toString()))),
            icon: const Icon(Icons.videocam),
            label: Text(status == 'active' ? 'Join meeting' : 'Start / join meeting'),
          ),
        if (myInvite != null && myInvite['status'] == 'pending' && canJoin)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(children: [
              Expanded(child: OutlinedButton(onPressed: () => _act(() => Api.instance.put('/meetings/${widget.roomId}/respond', {'status': 'declined'}), 'Declined'), child: const Text('Decline'))),
              const SizedBox(width: 8),
              Expanded(child: FilledButton.tonal(onPressed: () => _act(() => Api.instance.put('/meetings/${widget.roomId}/respond', {'status': 'accepted'}), 'Accepted'), child: const Text('Accept'))),
            ]),
          ),
        if (isHost && canJoin) ...[
          const SectionTitle('Host actions'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            OutlinedButton.icon(onPressed: busy ? null : _invite, icon: const Icon(Icons.person_add_alt), label: const Text('Invite')),
            if (status == 'scheduled')
              OutlinedButton.icon(
                onPressed: busy ? null : () async {
                  if (await confirm(context, 'Cancel this meeting?', ok: 'Cancel meeting', danger: true)) {
                    _act(() => Api.instance.put('/meetings/${widget.roomId}/cancel'), 'Meeting cancelled');
                  }
                },
                icon: const Icon(Icons.event_busy),
                label: const Text('Cancel'),
              ),
            if (status == 'active')
              OutlinedButton.icon(
                onPressed: busy ? null : () async {
                  if (await confirm(context, 'End meeting for everyone?', ok: 'End', danger: true)) {
                    _act(() => Api.instance.post('/meetings/${widget.roomId}/end'), 'Meeting ended');
                  }
                },
                icon: const Icon(Icons.stop_circle_outlined),
                label: const Text('End'),
              ),
          ]),
        ],
        if (invitees.isNotEmpty) ...[
          const SectionTitle('Invitees'),
          ...invitees.map((i) => ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.person_outline),
                title: Text((i['email'] ?? asMap(i['user'])['name'] ?? i['userId'] ?? '').toString()),
                trailing: Text((i['status'] ?? '').toString(), style: TextStyle(color: cs.outline)),
              )),
        ],
        if (status == 'ended') _History(roomId: widget.roomId, meeting: m!, recordings: recordings, onChanged: _load),
      ]),
    );
  }
}

/// Recordings, transcripts and AI summary for a finished meeting.
class _History extends StatefulWidget {
  final String roomId;
  final Map<String, dynamic> meeting;
  final List<Map<String, dynamic>> recordings;
  final VoidCallback onChanged;
  const _History({required this.roomId, required this.meeting, required this.recordings, required this.onChanged});
  @override
  State<_History> createState() => _HistoryState();
}

class _HistoryState extends State<_History> {
  Map<String, dynamic>? summary;
  bool loading = false;

  @override
  void initState() {
    super.initState();
    summary = widget.meeting['aiSummary'] is Map ? asMap(widget.meeting['aiSummary']) : null;
  }

  Future<void> _generate({bool regenerate = false}) async {
    setState(() => loading = true);
    final d = await guard(context, () async => Api.unwrap(await Api.instance.post('/ai/meetings/${widget.roomId}/summary', {'regenerate': regenerate})));
    if (!mounted) return;
    setState(() {
      loading = false;
      if (d != null) summary = asMap(d['summary']);
    });
  }

  Future<void> _createTask(Map<String, dynamic> item) async {
    await guard(context, () => Api.instance.post('/tasks', {'title': item['title'], 'meetingId': widget.meeting['id']}), success: 'Task created');
  }

  @override
  Widget build(BuildContext context) {
    final s = summary;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SectionTitle('Recordings & transcripts'),
      if (widget.recordings.isEmpty) const Padding(padding: EdgeInsets.all(8), child: Text('No recordings for this meeting.')),
      ...widget.recordings.map((r) {
        final tr = asMap(r['transcription']);
        final txt = asMap(asMap(tr['files'])['txt'])['url'] ?? '';
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Icon(Icons.fiber_manual_record, color: Colors.red, size: 16),
                const SizedBox(width: 6),
                Expanded(child: Text(fmtDateTime(r['createdAt'] ?? r['uploadedAt']), style: const TextStyle(fontWeight: FontWeight.w600))),
                Chip(label: Text('Transcript: ${tr['status'] ?? 'none'}'), visualDensity: VisualDensity.compact),
              ]),
              Wrap(spacing: 8, children: [
                if (r['url'] != null)
                  TextButton.icon(onPressed: () => guard(context, () => FileService.openUrl(r['url'], 'recording-${widget.roomId}.webm')), icon: const Icon(Icons.play_circle_outline), label: const Text('Recording')),
                if (txt.toString().isNotEmpty)
                  TextButton.icon(onPressed: () => guard(context, () => FileService.openUrl(txt, 'transcript-${widget.roomId}.txt')), icon: const Icon(Icons.description_outlined), label: const Text('Transcript')),
                if (tr['status'] == 'failed' && r['id'] != null)
                  TextButton.icon(onPressed: () => guard(context, () => Api.instance.post('/meetings/${widget.roomId}/recordings/${r['id']}/retry-transcription'), success: 'Retrying…').then((_) => widget.onChanged()), icon: const Icon(Icons.refresh), label: const Text('Retry')),
              ]),
              if ((tr['text'] ?? '').toString().isNotEmpty)
                ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  title: const Text('Read transcript'),
                  children: [SelectableText(tr['text'].toString())],
                ),
            ]),
          ),
        );
      }),
      const SectionTitle('AI summary'),
      if (s == null)
        FilledButton.tonalIcon(onPressed: loading ? null : _generate, icon: loading ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome), label: const Text('Generate summary'))
      else
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if ((s['summary'] ?? s['overview'] ?? '').toString().isNotEmpty) Text((s['summary'] ?? s['overview']).toString()),
              if (asList(s['keyPoints']).isNotEmpty) ...[const SectionTitle('Key points'), ...asList(s['keyPoints']).map((e) => Text('• $e'))],
              if (asList(s['decisions']).isNotEmpty) ...[const SectionTitle('Decisions'), ...asList(s['decisions']).map((e) => Text('• $e'))],
              if (asList(s['actionItems']).isNotEmpty) ...[
                const SectionTitle('Action items'),
                ...asList(s['actionItems']).map(asMap).map((a) => ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text((a['title'] ?? '').toString()),
                      subtitle: Text([if (a['assigneeHint'] != null) a['assigneeHint'], if (a['dueHint'] != null) a['dueHint']].join(' · ')),
                      trailing: TextButton(onPressed: () => _createTask(a), child: const Text('Add task')),
                    )),
              ],
              Align(alignment: Alignment.centerRight, child: TextButton.icon(onPressed: loading ? null : () => _generate(regenerate: true), icon: const Icon(Icons.refresh), label: const Text('Regenerate'))),
            ]),
          ),
        ),
    ]);
  }
}
