import 'package:flutter/material.dart';
import '../core/api.dart';
import '../widgets/common.dart';
import 'meetings_screen.dart';

/// Month calendar of the user's scheduled meetings (optionally scoped to a team).
class CalendarScreen extends StatefulWidget {
  final String? teamId;
  const CalendarScreen({super.key, this.teamId});
  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  DateTime _selected = DateTime.now();
  List<Map<String, dynamic>> _meetings = [];
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
      if (!mounted) return;
      setState(() {
        _meetings = asList(d['meetings']).map(asMap).where((m) => m['status'] != 'cancelled').toList();
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() { _error = errMsg(e); _loading = false; });
    }
  }

  bool _same(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

  List<Map<String, dynamic>> get _dayMeetings => _meetings.where((m) {
        final d = parseDate(m['scheduledAt'] ?? m['createdAt']);
        return d != null && _same(d, _selected);
      }).toList();

  @override
  Widget build(BuildContext context) {
    final days = _meetings.map((m) => parseDate(m['scheduledAt'] ?? m['createdAt'])).whereType<DateTime>().toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Calendar')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : Column(children: [
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
                      Text('${days.where((d) => _same(d, _selected)).length} meeting(s)'),
                    ]),
                  ),
                  const Divider(),
                  Expanded(
                    child: _dayMeetings.isEmpty
                        ? const Center(child: Text('No meetings on this day'))
                        : ListView(padding: const EdgeInsets.all(12), children: _dayMeetings.map((m) => MeetingCard(meeting: m, onChanged: _load)).toList()),
                  ),
                ]),
    );
  }
}
