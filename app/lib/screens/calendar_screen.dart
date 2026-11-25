import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'meetings_screen.dart';

/// Month calendar of the user's scheduled meetings (optionally scoped to a team).
class CalendarScreen extends StatefulWidget {
  final String? teamId;
  final bool embedded;
  const CalendarScreen({super.key, this.teamId, this.embedded = false});
  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  DateTime _selected = DateTime.now();
  List<Map<String, dynamic>> _meetings = [];
  List<Map<String, dynamic>> _tasks = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final path = widget.teamId != null ? '/meetings/team/${widget.teamId}' : '/meetings';
      final d = Api.unwrap(await Api.instance.get(path, query: {'limit': 200}));
      var tasks = <Map<String, dynamic>>[];
      try {
        final t = Api.unwrap(await Api.instance.get('/tasks', query: {'scope': widget.teamId != null ? 'team' : 'mine', if (widget.teamId != null) 'teamId': widget.teamId}));
        tasks = asList(t['tasks']).map(asMap).where((x) => x['dueDate'] != null).toList();
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _meetings = asList(d['meetings']).map(asMap).where((m) => m['status'] != 'cancelled').toList();
        _tasks = tasks;
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() { _error = errMsg(e); _loading = false; });
    }
  }

  String _count(int n, String noun) => '$n $noun${n == 1 ? '' : 's'}';

  bool _same(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

  List<Map<String, dynamic>> get _dayMeetings => _meetings.where((m) {
        final d = parseDate(m['scheduledAt'] ?? m['createdAt']);
        return d != null && _same(d, _selected);
      }).toList();

  List<Map<String, dynamic>> get _dayTasks => _tasks.where((t) {
        final d = parseDate(t['dueDate']);
        return d != null && _same(d, _selected);
      }).toList();

  Color _taskColor(Map<String, dynamic> t) {
    if (t['status'] == 'done') return AppTheme.done;
    final d = parseDate(t['dueDate']);
    final today = DateTime.now();
    if (d != null && d.isBefore(DateTime(today.year, today.month, today.day))) return AppTheme.overdue;
    return t['status'] == 'in_progress' ? AppTheme.inProgress : AppTheme.todo;
  }

  Widget _taskTile(Map<String, dynamic> t) {
    final c = _taskColor(t);
    final done = t['status'] == 'done';
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: c.withOpacity(.10),
        border: Border.all(color: c.withOpacity(.35)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(children: [
        Icon(done ? Icons.check_box_outlined : Icons.check_box_outline_blank, size: 18, color: c),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            (t['title'] ?? '').toString(),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: c, decoration: done ? TextDecoration.lineThrough : null),
          ),
        ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: widget.embedded || widget.teamId != null ? null : AppBar(title: const Text('Calendar')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : ListView(padding: const EdgeInsets.only(bottom: 24), children: [
                  if (widget.embedded) const PageHeader('Calendar', subtitle: 'Meetings and task deadlines', padding: EdgeInsets.fromLTRB(16, 16, 16, 0)),
                  CalendarDatePicker(
                    initialDate: _selected,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2100),
                    onDateChanged: (d) => setState(() => _selected = d),
                    selectableDayPredicate: (_) => true,
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(children: [
                      Text(fmtDateTime(_selected.toIso8601String()).split(' · ').first, style: Theme.of(context).textTheme.titleMedium),
                      const Spacer(),
                      Text('${_count(_dayMeetings.length, 'meeting')} · ${_count(_dayTasks.length, 'task')}', style: TextStyle(color: Theme.of(context).colorScheme.outline)),
                    ]),
                  ),
                  const Divider(),
                  if (_dayMeetings.isEmpty && _dayTasks.isEmpty)
                    const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('Nothing scheduled this day')))
                  else
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Column(children: [
                        ..._dayTasks.map(_taskTile),
                        ..._dayMeetings.map((m) => MeetingCard(meeting: m, onChanged: _load)),
                      ]),
                    ),
                ]),
    );
  }
}
