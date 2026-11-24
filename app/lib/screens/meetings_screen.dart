import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../core/api.dart';
import '../core/session.dart';
import '../widgets/common.dart';
import 'calendar_screen.dart';
import 'meeting_detail_screen.dart';
import 'prejoin_screen.dart';

/// Accepts a raw code or a full invite link and returns the room id.
String parseRoomId(String input) {
  var s = input.trim();
  if (s.isEmpty) return '';
  final uri = Uri.tryParse(s);
  if (uri != null && uri.pathSegments.isNotEmpty) {
    final i = uri.pathSegments.indexOf('meeting');
    if (i >= 0 && i + 1 < uri.pathSegments.length) return uri.pathSegments[i + 1];
    return uri.pathSegments.last;
  }
  return s;
}

class MeetingsScreen extends StatefulWidget {
  const MeetingsScreen({super.key});
  @override
  State<MeetingsScreen> createState() => MeetingsScreenState();
}

class MeetingsScreenState extends State<MeetingsScreen> {
  final _listKey = GlobalKey<AsyncListState<Map<String, dynamic>>>();
  String _filter = 'upcoming'; // upcoming | past

  Future<List<Map<String, dynamic>>> _load() async {
    final d = Api.unwrap(await Api.instance.get('/meetings', query: {'limit': 100}));
    final all = asList(d['meetings']).map(asMap).toList();
    final upcoming = all.where((m) => m['status'] == 'scheduled' || m['status'] == 'active').toList()
      ..sort((a, b) => (parseDate(a['scheduledAt'] ?? a['createdAt']) ?? DateTime.now()).compareTo(parseDate(b['scheduledAt'] ?? b['createdAt']) ?? DateTime.now()));
    final past = all.where((m) => m['status'] == 'ended' || m['status'] == 'cancelled').toList();
    return _filter == 'upcoming' ? upcoming : past;
  }

  void _reload() => _listKey.currentState?.reload();

  Future<void> _instant() async {
    final title = await promptText(context, 'Start an instant meeting', hint: 'Meeting title (optional)', ok: 'Start');
    if (title == null || !mounted) return;
    final m = await guard(context, () async {
      final d = Api.unwrap(await Api.instance.post('/meetings', {'title': title.isEmpty ? '${Session.instance.name}\'s meeting' : title}));
      return asMap(d['meeting']);
    });
    if (m != null && mounted) {
      await Navigator.push(context, MaterialPageRoute(builder: (_) => PreJoinScreen(roomId: m['roomId'], title: m['title']?.toString())));
      _reload();
    }
  }

  Future<void> _join() async {
    final c = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Join a meeting'),
        content: TextField(
          controller: c,
          autofocus: true,
          autocorrect: false,
          decoration: InputDecoration(
            hintText: 'Meeting code or link',
            suffixIcon: IconButton(
              icon: const Icon(Icons.paste),
              onPressed: () async => c.text = (await Clipboard.getData('text/plain'))?.text ?? '',
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, parseRoomId(c.text)), child: const Text('Join')),
        ],
      ),
    );
    if (code == null || code.isEmpty || !mounted) return;
    Navigator.push(context, MaterialPageRoute(builder: (_) => PreJoinScreen(roomId: code)));
  }

  Future<void> _schedule() async {
    final ok = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => const ScheduleMeetingScreen()));
    if (ok == true) _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _instant,
        icon: const Icon(Icons.bolt),
        label: const Text('New meeting'),
      ),
      body: AsyncList<Map<String, dynamic>>(
        key: _listKey,
        load: _load,
        emptyText: _filter == 'upcoming' ? 'No upcoming meetings' : 'No past meetings',
        emptyIcon: Icons.event_busy,
        header: Column(children: [
          Row(children: [
            Expanded(child: FilledButton.icon(onPressed: _join, icon: const Icon(Icons.login), label: const Text('Join'))),
            const SizedBox(width: 10),
            Expanded(child: FilledButton.tonalIcon(onPressed: _schedule, icon: const Icon(Icons.event), label: const Text('Schedule'))),
            const SizedBox(width: 10),
            IconButton.filledTonal(
              tooltip: 'Calendar',
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CalendarScreen())),
              icon: const Icon(Icons.calendar_month),
            ),
          ]),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: const [ButtonSegment(value: 'upcoming', label: Text('Upcoming')), ButtonSegment(value: 'past', label: Text('Past'))],
            selected: {_filter},
            onSelectionChanged: (s) {
              setState(() => _filter = s.first);
              WidgetsBinding.instance.addPostFrameCallback((_) => _reload());
            },
          ),
          const SizedBox(height: 8),
        ]),
        itemBuilder: (context, m, reload) => MeetingCard(meeting: m, onChanged: reload),
      ),
    );
  }
}

class MeetingCard extends StatelessWidget {
  final Map<String, dynamic> meeting;
  final VoidCallback onChanged;
  const MeetingCard({super.key, required this.meeting, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final status = meeting['status']?.toString() ?? '';
    final live = status == 'active';
    final when = meeting['scheduledAt'] ?? meeting['createdAt'];
    final host = asMap(meeting['host']);
    final team = asMap(meeting['team']);
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () async {
          await Navigator.push(context, MaterialPageRoute(builder: (_) => MeetingDetailScreen(roomId: meeting['roomId'])));
          onChanged();
        },
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(color: live ? const Color(0xFF34D399).withOpacity(.15) : cs.primaryContainer, borderRadius: BorderRadius.circular(12)),
              child: Icon(live ? Icons.sensors : Icons.videocam, color: live ? Colors.green : cs.onPrimaryContainer),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(meeting['title']?.toString() ?? 'Meeting', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(
                  [fmtDateTime(when), if (host['name'] != null) 'Host: ${host['name']}', if (team['name'] != null) team['name']].where((e) => e.toString().isNotEmpty).join(' · '),
                  style: TextStyle(color: cs.outline, fontSize: 12.5),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ]),
            ),
            if (status == 'scheduled' || live)
              FilledButton.tonal(
                style: FilledButton.styleFrom(minimumSize: const Size(64, 38)),
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PreJoinScreen(roomId: meeting['roomId'], title: meeting['title']?.toString()))),
                child: Text(live ? 'Join' : 'Start'),
              )
            else
              Chip(label: Text(status), visualDensity: VisualDensity.compact),
          ]),
        ),
      ),
    );
  }
}

class ScheduleMeetingScreen extends StatefulWidget {
  final String? teamId;
  const ScheduleMeetingScreen({super.key, this.teamId});
  @override
  State<ScheduleMeetingScreen> createState() => _ScheduleMeetingScreenState();
}

class _ScheduleMeetingScreenState extends State<ScheduleMeetingScreen> {
  final _title = TextEditingController();
  final _desc = TextEditingController();
  final _invites = TextEditingController();
  DateTime _when = DateTime.now().add(const Duration(hours: 1)).copyWith(minute: 0, second: 0, millisecond: 0);
  bool _waitingRoom = false;
  bool _muteOnEntry = false;
  bool _busy = false;

  Future<void> _pickDate() async {
    final d = await showDatePicker(context: context, initialDate: _when, firstDate: DateTime.now().subtract(const Duration(days: 1)), lastDate: DateTime.now().add(const Duration(days: 365 * 2)));
    if (d == null || !mounted) return;
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_when));
    if (t == null) return;
    setState(() => _when = DateTime(d.year, d.month, d.day, t.hour, t.minute));
  }

  Future<void> _save() async {
    if (_title.text.trim().isEmpty) {
      toast(context, 'Please enter a title', error: true);
      return;
    }
    setState(() => _busy = true);
    final emails = _invites.text.split(RegExp(r'[,\s;]+')).where((e) => e.contains('@')).toList();
    final ok = await guard(context, () => Api.instance.post('/meetings', {
          'title': _title.text.trim(),
          if (_desc.text.trim().isNotEmpty) 'description': _desc.text.trim(),
          'scheduledAt': _when.toUtc().toIso8601String(),
          if (widget.teamId != null) 'teamId': widget.teamId,
          'settings': {'waitingRoom': _waitingRoom, 'muteOnEntry': _muteOnEntry},
          if (emails.isNotEmpty) 'invitees': emails.map((e) => {'email': e}).toList(),
        }), success: 'Meeting scheduled');
    if (mounted) {
      setState(() => _busy = false);
      if (ok != null) Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Schedule meeting')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(controller: _title, decoration: const InputDecoration(labelText: 'Title')),
        const SizedBox(height: 12),
        TextField(controller: _desc, maxLines: 3, decoration: const InputDecoration(labelText: 'Description (optional)')),
        const SizedBox(height: 12),
        ListTile(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant)),
          leading: const Icon(Icons.schedule),
          title: Text(fmtDateTime(_when.toIso8601String())),
          subtitle: const Text('Tap to change'),
          onTap: _pickDate,
        ),
        const SizedBox(height: 12),
        TextField(controller: _invites, decoration: const InputDecoration(labelText: 'Invite by email (comma separated)')),
        SwitchListTile(value: _waitingRoom, onChanged: (v) => setState(() => _waitingRoom = v), title: const Text('Waiting room')),
        SwitchListTile(value: _muteOnEntry, onChanged: (v) => setState(() => _muteOnEntry = v), title: const Text('Mute participants on entry')),
        const SizedBox(height: 12),
        FilledButton(onPressed: _busy ? null : _save, child: const Text('Schedule')),
      ]),
    );
  }
}
