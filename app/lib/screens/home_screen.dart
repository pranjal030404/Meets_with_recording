import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../core/api.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'meetings_screen.dart';
import 'prejoin_screen.dart';

/// The live or next meeting first, then starting or joining one.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _code = TextEditingController();
  Map<String, dynamic>? _next;
  bool _loading = true;
  bool _failed = false;
  bool _creating = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = Api.unwrap(await Api.instance.get('/meetings', query: {'limit': 200}));
      final all = asList(d['meetings']).map(asMap).toList();
      final live = all.where((m) => m['status'] == 'active').toList();
      // A scheduled meeting stays "next" for an hour after its start time.
      final cutoff = DateTime.now().subtract(const Duration(hours: 1));
      final upcoming = all.where((m) => m['status'] == 'scheduled' && (parseDate(m['scheduledAt'])?.isAfter(cutoff) ?? false)).toList()
        ..sort((a, b) => parseDate(a['scheduledAt'])!.compareTo(parseDate(b['scheduledAt'])!));
      if (!mounted) return;
      setState(() {
        _next = live.isNotEmpty ? live.first : (upcoming.isNotEmpty ? upcoming.first : null);
        _loading = false;
        _failed = false;
      });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _failed = true; });
    }
  }

  Future<void> _open(String roomId, [String? title, bool viewOnly = false]) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => PreJoinScreen(roomId: roomId, title: title, viewOnly: viewOnly)));
    if (mounted) _load();
  }

  Future<void> _newMeeting() async {
    setState(() => _creating = true);
    final m = await guard(context, () async => asMap(Api.unwrap(await Api.instance.post('/meetings', {'title': 'Instant Meeting'}))['meeting']));
    if (!mounted) return;
    setState(() => _creating = false);
    if (m != null) _open(m['roomId'].toString(), m['title']?.toString());
  }

  Future<void> _schedule() async {
    final ok = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => const ScheduleMeetingScreen()));
    if (ok == true && mounted) _load();
  }

  void _join() {
    final id = parseRoomId(_code.text);
    if (id.isEmpty) {
      toast(context, 'Enter a meeting code or link', error: true);
      return;
    }
    _open(id, null, isViewOnlyLink(_code.text));
  }

  Widget _meetingCard() {
    if (_loading) {
      return const Card(child: SizedBox(height: 160, child: Center(child: CircularProgressIndicator())));
    }
    final m = _next;
    if (m == null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Row(children: [
            Expanded(child: Text(_failed ? 'Could not load your meetings' : 'No upcoming meetings', style: const TextStyle(color: AppTheme.muted))),
            if (_failed) TextButton(onPressed: _load, child: const Text('Retry')),
          ]),
        ),
      );
    }
    final live = m['status'] == 'active';
    final when = parseDate(m['scheduledAt'] ?? m['createdAt']);
    final host = asMap(m['host'])['name'];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            if (live) ...[const TallyDot(), const SizedBox(width: 8)],
            Text(live ? 'Live now' : 'Next meeting', style: const TextStyle(color: AppTheme.muted, fontSize: 14)),
          ]),
          const SizedBox(height: 16),
          if (when != null && !live)
            Text(fmtTime(when), style: const TextStyle(fontSize: 40, height: 1.1, fontWeight: FontWeight.w500, letterSpacing: -.8, color: AppTheme.accent, fontFeatures: [FontFeature.tabularFigures()])),
          if (when != null && !live) const SizedBox(height: 8),
          Text((m['title'] ?? 'Meeting').toString(), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w500)),
          const SizedBox(height: 4),
          Text([if (when != null && !live) DateFormat('EEEE, MMMM d').format(when), if (host != null) 'Hosted by $host'].join(' · '),
              style: const TextStyle(color: AppTheme.faint, fontSize: 14)),
          const SizedBox(height: 20),
          FilledButton(onPressed: () => _open(m['roomId'].toString(), m['title']?.toString()), child: Text(live ? 'Join' : 'Open meeting')),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // One primary action per screen: the meeting card's button when there is one.
    final newIcon = _creating ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.videocam_outlined, size: 20);
    const newLabel = Text('New meeting');
    final onNew = _creating ? null : _newMeeting;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        PageHeader('Home', subtitle: DateFormat('EEEE, MMMM d').format(DateTime.now())),
        _meetingCard(),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(
            child: _next == null
                ? FilledButton.icon(onPressed: onNew, icon: newIcon, label: newLabel)
                : OutlinedButton.icon(onPressed: onNew, icon: newIcon, label: newLabel),
          ),
          const SizedBox(width: 8),
          Expanded(child: OutlinedButton.icon(onPressed: _schedule, icon: const Icon(Icons.event_outlined, size: 20), label: const Text('Schedule'))),
        ]),
        const SizedBox(height: 24),
        Row(children: [
          Expanded(
            child: TextField(
              controller: _code,
              autocorrect: false,
              onSubmitted: (_) => _join(),
              decoration: const InputDecoration(hintText: 'Meeting code or link', prefixIcon: Icon(Icons.link, size: 20)),
            ),
          ),
          const SizedBox(width: 8),
          OutlinedButton(onPressed: _join, child: const Text('Join')),
        ]),
      ]),
    );
  }
}
