import 'package:flutter/material.dart';
import '../core/api.dart';
import '../widgets/common.dart';

const _statuses = ['todo', 'in_progress', 'done'];
const _statusLabel = {'todo': 'To do', 'in_progress': 'In progress', 'done': 'Done'};
const _priorityColor = {'low': Colors.blueGrey, 'medium': Colors.blue, 'high': Colors.orange, 'urgent': Colors.red};

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
  final _key = GlobalKey<AsyncListState<Map<String, dynamic>>>();
  String _status = 'todo';
  String _scope = 'mine';
  Map<String, dynamic> _stats = {};

  Future<List<Map<String, dynamic>>> _load() async {
    final q = <String, dynamic>{
      'scope': widget.teamId != null ? 'team' : _scope,
      if (widget.teamId != null) 'teamId': widget.teamId,
    };
    final d = Api.unwrap(await Api.instance.get('/tasks', query: q));
    try {
      final s = Api.unwrap(await Api.instance.get('/tasks/stats/summary'));
      _stats = asMap(s);
    } catch (_) {}
    if (mounted) setState(() {});
    return asList(d['tasks']).map(asMap).where((t) => t['status'] == _status).toList();
  }

  Future<void> _create() async {
    final r = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => TaskEditor(teamId: widget.teamId, teamMembers: widget.teamMembers),
    );
    if (r == true) _key.currentState?.reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(onPressed: _create, icon: const Icon(Icons.add), label: const Text('New task')),
      body: AsyncList<Map<String, dynamic>>(
        key: _key,
        load: _load,
        emptyText: 'No tasks in "${_statusLabel[_status]}"',
        emptyIcon: Icons.task_alt,
        header: Column(children: [
          if (widget.teamId == null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SegmentedButton<String>(
                segments: const [ButtonSegment(value: 'mine', label: Text('Created by me')), ButtonSegment(value: 'assigned', label: Text('Assigned to me'))],
                selected: {_scope},
                onSelectionChanged: (s) { setState(() => _scope = s.first); WidgetsBinding.instance.addPostFrameCallback((_) => _key.currentState?.reload()); },
              ),
            ),
          SegmentedButton<String>(
            showSelectedIcon: false,
            segments: _statuses.map((s) => ButtonSegment(value: s, label: Text('${_statusLabel[s]}${_countFor(s)}', style: const TextStyle(fontSize: 12)))).toList(),
            selected: {_status},
            onSelectionChanged: (s) { setState(() => _status = s.first); WidgetsBinding.instance.addPostFrameCallback((_) => _key.currentState?.reload()); },
          ),
          if ((_stats['overdue'] ?? 0) is num && (_stats['overdue'] ?? 0) > 0)
            Padding(padding: const EdgeInsets.only(top: 6), child: Text('${_stats['overdue']} overdue', style: const TextStyle(color: Colors.red))),
          const SizedBox(height: 8),
        ]),
        itemBuilder: (context, t, reload) => _TaskTile(task: t, onChanged: reload, teamMembers: widget.teamMembers),
      ),
    );
  }

  String _countFor(String s) {
    final key = s == 'in_progress' ? 'inProgress' : s;
    final v = _stats[key];
    return v is num ? ' ($v)' : '';
  }
}

class _TaskTile extends StatelessWidget {
  final Map<String, dynamic> task;
  final VoidCallback onChanged;
  final List<Map<String, dynamic>> teamMembers;
  const _TaskTile({required this.task, required this.onChanged, required this.teamMembers});

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
          if (due != null) Text(fmtDateTime(task['dueDate']).split(' · ').first, style: TextStyle(fontSize: 12, color: overdue ? Colors.red : cs.outline)),
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
          const SizedBox(height: 10),
          TextField(controller: _desc, maxLines: 3, decoration: const InputDecoration(labelText: 'Description')),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                value: _priority,
                decoration: const InputDecoration(labelText: 'Priority'),
                items: ['low', 'medium', 'high', 'urgent'].map((p) => DropdownMenuItem(value: p, child: Text(p))).toList(),
                onChanged: (v) => setState(() => _priority = v ?? 'medium'),
              ),
            ),
            const SizedBox(width: 10),
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
            const SizedBox(height: 10),
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
            if (editing) IconButton(onPressed: _delete, icon: const Icon(Icons.delete_outline, color: Colors.red)),
            Expanded(child: FilledButton(onPressed: _busy ? null : _save, child: Text(editing ? 'Save' : 'Create task'))),
          ]),
        ]),
      ),
    );
  }
}
