import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

const _statuses = ['todo', 'in_progress', 'done'];
const _statusLabel = {'todo': 'To do', 'in_progress': 'In progress', 'done': 'Done'};
const _priorityColor = {'low': AppTheme.faint, 'medium': AppTheme.muted, 'high': AppTheme.accent, 'urgent': AppTheme.overdue};

/// Task board: personal tasks (scope "mine"/"assigned") or a team's shared board.
class TasksScreen extends StatelessWidget {
  final String? teamId;
  const TasksScreen({super.key, this.teamId});
  @override
  Widget build(BuildContext context) => TaskBoard(teamId: teamId);
}

class TaskBoard extends StatefulWidget {
  final String? teamId;
  final List<Map<String, dynamic>> teamMembers;
  const TaskBoard({super.key, this.teamId, this.teamMembers = const []});
  @override
  State<TaskBoard> createState() => _TaskBoardState();
}

class _TaskBoardState extends State<TaskBoard> {
  List<Map<String, dynamic>> _tasks = [];
  List<Map<String, dynamic>> _teams = [];
  Map<String, dynamic> _stats = {};
  String _scope = 'mine'; // mine | team
  String? _teamId;
  bool _loading = true;
  String? _error;

  bool get _embedded => widget.teamId != null;
  String? get _activeTeam => widget.teamId ?? (_scope == 'team' ? _teamId : null);

  @override
  void initState() {
    super.initState();
    _load();
    if (!_embedded) _loadTeams();
  }

  Future<void> _loadTeams() async {
    try {
      final d = await Api.instance.get('/teams');
      final list = asList(Api.unwrap(d) is Map ? Api.unwrap(d)['teams'] : d).map(asMap).toList();
      if (mounted) setState(() => _teams = list);
    } catch (_) {}
  }

  Future<void> _load() async {
    if (!_embedded && _scope == 'team' && _teamId == null) {
      setState(() { _tasks = []; _loading = false; _error = null; });
      return;
    }
    final team = _activeTeam;
    try {
      final d = Api.unwrap(await Api.instance.get('/tasks', query: {'scope': team != null ? 'team' : 'mine', 'teamId': ?team}));
      var stats = _stats;
      if (!_embedded) {
        try {
          stats = asMap(Api.unwrap(await Api.instance.get('/tasks/stats/summary')));
        } catch (_) {}
      }
      // The scope or team may have changed while this request was in flight.
      if (!mounted || team != _activeTeam) return;
      setState(() {
        _tasks = asList(d['tasks']).map(asMap).toList();
        _stats = stats;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() { _error = errMsg(e); _loading = false; });
    }
  }

  void _select({required String scope, String? teamId}) {
    setState(() { _scope = scope; _teamId = teamId; _tasks = []; _loading = true; });
    _load();
  }

  Future<void> _create() async {
    final r = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => TaskEditor(teamId: _activeTeam, teamMembers: widget.teamMembers),
    );
    if (r == true) _load();
  }

  Widget _stat(String label, dynamic value, IconData icon, Color tone) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Icon(icon, color: tone, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${value ?? 0}', style: const TextStyle(fontFamily: AppTheme.display, fontSize: 22, fontWeight: FontWeight.w500)),
                Text(label, style: const TextStyle(color: AppTheme.faint, fontSize: 12)),
              ]),
            ),
          ]),
        ),
      );

  Widget _column(String status, IconData icon, Color tone) {
    final items = _tasks.where((t) => t['status'] == status).toList();
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppTheme.surface, border: Border.all(color: AppTheme.line), borderRadius: BorderRadius.circular(14)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Icon(icon, size: 16, color: tone),
          const SizedBox(width: 8),
          Expanded(child: Text(_statusLabel[status]!, style: const TextStyle(fontWeight: FontWeight.w600))),
          Text('${items.length}', style: const TextStyle(color: AppTheme.faint, fontSize: 12)),
        ]),
        const SizedBox(height: 12),
        if (items.isEmpty)
          const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: Text('Nothing here', style: TextStyle(color: AppTheme.faint, fontSize: 12)))),
        for (final t in items) _TaskTile(key: ValueKey(t['id']), task: t, onChanged: _load, teamMembers: widget.teamMembers),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final newTask = FilledButton.icon(onPressed: _create, icon: const Icon(Icons.add, size: 18), label: const Text('New task'));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 32), children: [
        PageHeader(_embedded ? 'Team tasks' : 'Tasks', subtitle: _embedded ? 'Shared work for everyone in this team' : 'Personal and team work in one board', padding: const EdgeInsets.fromLTRB(4, 12, 4, 12)),
        Align(alignment: Alignment.centerLeft, child: Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, 16), child: newTask)),
        if (!_embedded) ...[
          Row(children: [
            Expanded(child: _stat('To do', _stats['todo'], Icons.checklist, AppTheme.muted)),
            Expanded(child: _stat('In progress', _stats['inProgress'], Icons.schedule, AppTheme.accent)),
          ]),
          Row(children: [
            Expanded(child: _stat('Completed', _stats['done'], Icons.check_circle_outline, AppTheme.done)),
            Expanded(child: _stat('Overdue', _stats['overdue'], Icons.warning_amber_outlined, AppTheme.overdue)),
          ]),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            showSelectedIcon: false,
            segments: const [ButtonSegment(value: 'mine', label: Text('My tasks')), ButtonSegment(value: 'team', label: Text('Team tasks'))],
            selected: {_scope},
            onSelectionChanged: (v) => _select(scope: v.first),
          ),
          if (_scope == 'team') ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _teamId,
              hint: const Text('Select a team'),
              items: [for (final t in _teams) DropdownMenuItem(value: t['id'].toString(), child: Text((t['name'] ?? '').toString()))],
              onChanged: (v) => _select(scope: 'team', teamId: v),
            ),
          ],
          const SizedBox(height: 16),
        ],
        if (!_embedded && _scope == 'team' && _teamId == null)
          const Padding(padding: EdgeInsets.symmetric(vertical: 48), child: Center(child: Text('Pick a team to see its shared tasks.', style: TextStyle(color: AppTheme.faint))))
        else if (_loading)
          const Padding(padding: EdgeInsets.all(48), child: Center(child: CircularProgressIndicator()))
        else if (_error != null && _tasks.isEmpty)
          Column(children: [Text(_error!, textAlign: TextAlign.center), TextButton(onPressed: _load, child: const Text('Retry'))])
        else ...[
          _column('todo', Icons.checklist, AppTheme.muted),
          _column('in_progress', Icons.schedule, AppTheme.accent),
          _column('done', Icons.check_circle_outline, AppTheme.done),
        ],
      ]),
    );
  }
}

class _TaskTile extends StatelessWidget {
  final Map<String, dynamic> task;
  final VoidCallback onChanged;
  final List<Map<String, dynamic>> teamMembers;
  const _TaskTile({super.key, required this.task, required this.onChanged, required this.teamMembers});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final due = parseDate(task['dueDate']);
    final overdue = due != null && due.isBefore(DateTime.now()) && task['status'] != 'done';
    final prio = task['priority']?.toString() ?? 'medium';
    final assignee = asMap(task['assignee']);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: () async {
          final r = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => TaskEditor(task: task, teamId: task['teamId']?.toString(), teamMembers: teamMembers));
          if (r == true) onChanged();
        },
        leading: Checkbox(
          value: task['status'] == 'done',
          onChanged: (v) async {
            await guard(context, () => Api.instance.put('/tasks/${task['id']}', {'status': v == true ? 'done' : 'todo'}));
            onChanged();
          },
        ),
        title: Text((task['title'] ?? '').toString(), style: TextStyle(decoration: task['status'] == 'done' ? TextDecoration.lineThrough : null)),
        subtitle: Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
          Chip(label: Text(prio, style: const TextStyle(fontSize: 11)), visualDensity: VisualDensity.compact, padding: EdgeInsets.zero, side: BorderSide(color: _priorityColor[prio] ?? cs.outline)),
          if (due != null) Text(fmtDateTime(task['dueDate']).split(' · ').first, style: TextStyle(fontSize: 12, color: overdue ? AppTheme.overdue : cs.outline)),
          if (assignee['name'] != null) Text('→ ${assignee['name']}', style: TextStyle(fontSize: 12, color: cs.outline)),
        ]),
        trailing: PopupMenuButton<String>(
          onSelected: (s) async {
            await guard(context, () => Api.instance.put('/tasks/${task['id']}', {'status': s}));
            onChanged();
          },
          itemBuilder: (_) => _statuses.where((s) => s != task['status']).map((s) => PopupMenuItem(value: s, child: Text('Move to ${_statusLabel[s]}'))).toList(),
        ),
      ),
    );
  }
}

class TaskEditor extends StatefulWidget {
  final Map<String, dynamic>? task;
  final String? teamId;
  final List<Map<String, dynamic>> teamMembers;
  const TaskEditor({super.key, this.task, this.teamId, this.teamMembers = const []});
  @override
  State<TaskEditor> createState() => _TaskEditorState();
}

class _TaskEditorState extends State<TaskEditor> {
  late final _title = TextEditingController(text: widget.task?['title']?.toString() ?? '');
  late final _desc = TextEditingController(text: widget.task?['description']?.toString() ?? '');
  late String _priority = widget.task?['priority']?.toString() ?? 'medium';
  late DateTime? _due = parseDate(widget.task?['dueDate']);
  String? _assignee;
  bool _busy = false;
  List<Map<String, dynamic>> _subtasks = [];

  bool get editing => widget.task != null;

  @override
  void initState() {
    super.initState();
    _assignee = widget.task?['assigneeId']?.toString();
    if (editing) _loadSub();
  }

  Future<void> _loadSub() async {
    try {
      final d = Api.unwrap(await Api.instance.get('/tasks/${widget.task!['id']}'));
      if (mounted) setState(() => _subtasks = asList(d['subtasks']).map(asMap).toList());
    } catch (_) {}
  }

  Future<void> _save() async {
    if (_title.text.trim().isEmpty) return;
    setState(() => _busy = true);
    final body = {
      'title': _title.text.trim(),
      'description': _desc.text.trim(),
      'priority': _priority,
      'dueDate': _due?.toUtc().toIso8601String(),
      if (_assignee != null) 'assigneeId': _assignee,
      if (!editing && widget.teamId != null) 'teamId': widget.teamId,
    };
    final r = await guard(context, () => editing ? Api.instance.put('/tasks/${widget.task!['id']}', body) : Api.instance.post('/tasks', body));
    if (!mounted) return;
    setState(() => _busy = false);
    if (r != null) Navigator.pop(context, true);
  }

  Future<void> _delete() async {
    if (!await confirm(context, 'Delete this task?', ok: 'Delete', danger: true)) return;
    if (!mounted) return;
    final r = await guard(context, () => Api.instance.delete('/tasks/${widget.task!['id']}'));
    if (r != null && mounted) Navigator.pop(context, true);
  }

  Future<void> _addSub() async {
    final t = await promptText(context, 'New subtask', ok: 'Add');
    if (t == null || t.isEmpty || !mounted) return;
    await guard(context, () => Api.instance.post('/tasks/${widget.task!['id']}/subtasks', {'title': t}));
    _loadSub();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(editing ? 'Edit task' : 'New task', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          TextField(controller: _title, autofocus: !editing, decoration: const InputDecoration(labelText: 'Title')),
          const SizedBox(height: 12),
          TextField(controller: _desc, maxLines: 3, decoration: const InputDecoration(labelText: 'Description')),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                value: _priority,
                decoration: const InputDecoration(labelText: 'Priority'),
                items: ['low', 'medium', 'high', 'urgent'].map((p) => DropdownMenuItem(value: p, child: Text(p))).toList(),
                onChanged: (v) => setState(() => _priority = v ?? 'medium'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(minimumSize: const Size(0, 56)),
                icon: const Icon(Icons.event),
                label: Text(_due == null ? 'Due date' : fmtDateTime(_due!.toIso8601String()).split(' · ').first),
                onPressed: () async {
                  final d = await showDatePicker(context: context, initialDate: _due ?? DateTime.now(), firstDate: DateTime(2020), lastDate: DateTime(2100));
                  if (d != null) setState(() => _due = d);
                },
              ),
            ),
          ]),
          if (_due != null) Align(alignment: Alignment.centerRight, child: TextButton(onPressed: () => setState(() => _due = null), child: const Text('Clear date'))),
          if (widget.teamMembers.isNotEmpty) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              value: widget.teamMembers.any((m) => m['userId'] == _assignee) ? _assignee : null,
              decoration: const InputDecoration(labelText: 'Assignee'),
              items: [
                const DropdownMenuItem<String?>(value: null, child: Text('Unassigned')),
                ...widget.teamMembers.map((m) => DropdownMenuItem<String?>(value: m['userId']?.toString(), child: Text((asMap(m['user'])['name'] ?? m['userId']).toString()))),
              ],
              onChanged: (v) => setState(() => _assignee = v),
            ),
          ],
          if (editing) ...[
            const SectionTitle('Subtasks'),
            ..._subtasks.map((s) => CheckboxListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  value: s['status'] == 'done',
                  title: Text((s['title'] ?? '').toString()),
                  onChanged: (v) async {
                    await guard(context, () => Api.instance.put('/tasks/${s['id']}', {'status': v == true ? 'done' : 'todo'}));
                    _loadSub();
                  },
                )),
            TextButton.icon(onPressed: _addSub, icon: const Icon(Icons.add), label: const Text('Add subtask')),
          ],
          const SizedBox(height: 12),
          Row(children: [
            if (editing) IconButton(onPressed: _delete, icon: const Icon(Icons.delete_outline, color: AppTheme.overdue)),
            Expanded(child: FilledButton(onPressed: _busy ? null : _save, child: Text(editing ? 'Save' : 'Create task'))),
          ]),
        ]),
      ),
    );
  }
}
