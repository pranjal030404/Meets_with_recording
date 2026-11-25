import 'dart:async';
import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../core/api.dart';
import '../core/meeting_controller.dart';
import '../widgets/common.dart';

enum MeetingPanel { chat, people, polls, qa, notes }

class MeetingPanelSheet extends StatelessWidget {
  final MeetingController controller;
  final MeetingPanel panel;
  const MeetingPanelSheet({super.key, required this.controller, required this.panel});

  @override
  Widget build(BuildContext context) {
    switch (panel) {
      case MeetingPanel.chat:
        return _ChatPanel(c: controller);
      case MeetingPanel.people:
        return _PeoplePanel(c: controller);
      case MeetingPanel.polls:
        return _PollsPanel(c: controller);
      case MeetingPanel.qa:
        return _QAPanel(c: controller);
      case MeetingPanel.notes:
        return _NotesPanel(c: controller);
    }
  }
}

class _ChatPanel extends StatefulWidget {
  final MeetingController c;
  const _ChatPanel({required this.c});
  @override
  State<_ChatPanel> createState() => _ChatPanelState();
}

class _ChatPanelState extends State<_ChatPanel> {
  final _text = TextEditingController();
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    widget.c.addListener(_onUpdate);
    WidgetsBinding.instance.addPostFrameCallback((_) => _toEnd());
  }

  void _onUpdate() {
    if (!mounted) return;
    setState(() {});
    widget.c.unreadChat = 0;
    WidgetsBinding.instance.addPostFrameCallback((_) => _toEnd());
  }

  void _toEnd() {
    if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
  }

  @override
  void dispose() {
    widget.c.removeListener(_onUpdate);
    super.dispose();
  }

  void _send() {
    widget.c.sendChat(_text.text);
    _text.clear();
  }

  @override
  Widget build(BuildContext context) {
    final msgs = widget.c.chat;
    final cs = Theme.of(context).colorScheme;
    return Column(children: [
      Padding(padding: const EdgeInsets.only(bottom: 4), child: Text('Meeting chat', style: Theme.of(context).textTheme.titleMedium)),
      Expanded(
        child: msgs.isEmpty
            ? Center(child: Text('No messages yet', style: TextStyle(color: cs.outline)))
            : ListView.builder(
                controller: _scroll,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                itemCount: msgs.length,
                itemBuilder: (_, i) {
                  final m = msgs[i];
                  final mine = m.senderId == widget.c.myId;
                  return Align(
                    alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.symmetric(vertical: 3),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * .75),
                      decoration: BoxDecoration(color: mine ? cs.primaryContainer : cs.surfaceContainerHighest, borderRadius: BorderRadius.circular(14)),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        if (!mine) Text(m.senderName, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: cs.primary)),
                        SelectableText(m.text),
                        Text(fmtTime(m.at), style: TextStyle(fontSize: 10, color: cs.outline)),
                      ]),
                    ),
                  );
                },
              ),
      ),
      Padding(
        padding: EdgeInsets.fromLTRB(12, 6, 12, 8 + MediaQuery.of(context).viewInsets.bottom),
        child: Row(children: [
          Expanded(child: TextField(controller: _text, enabled: widget.c.settings['allowChat'] != false, textInputAction: TextInputAction.send, onSubmitted: (_) => _send(), decoration: InputDecoration(hintText: widget.c.settings['allowChat'] != false ? 'Message everyone' : 'The host turned chat off', isDense: true))),
          const SizedBox(width: 8),
          IconButton.filled(onPressed: widget.c.settings['allowChat'] != false ? _send : null, icon: const Icon(Icons.send)),
        ]),
      ),
    ]);
  }
}

class _PeoplePanel extends StatelessWidget {
  final MeetingController c;
  const _PeoplePanel({required this.c});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: c,
      builder: (context, _) {
        final peers = c.peers.values.toList();
        return ListView(padding: const EdgeInsets.all(12), children: [
          Text('Participants (${peers.length + 1})', style: Theme.of(context).textTheme.titleMedium),
          if (c.isManager && c.waiting.isNotEmpty) ...[
            const SectionTitle('Waiting room'),
            ...c.waiting.map((w) => ListTile(
                  leading: const Icon(Icons.hourglass_top),
                  title: Text(w.name),
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    TextButton(onPressed: () => c.deny(w), child: const Text('Deny')),
                    FilledButton(onPressed: () => c.admit(w), child: const Text('Admit')),
                  ]),
                )),
          ],
          const SectionTitle('In the meeting'),
          ListTile(
            leading: UserAvatar(name: c.myName),
            title: Text('${c.myName} (you)'),
            subtitle: Text(c.myRole),
            trailing: Icon(c.micOn ? Icons.mic : Icons.mic_off, color: c.micOn ? null : AppTheme.overdue),
          ),
          ...peers.map((p) => ListTile(
                leading: UserAvatar(name: p.name, url: p.avatar),
                title: Text(p.name),
                subtitle: Text(p.role),
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  if (p.handRaised) const Text('✋ '),
                  Icon(p.muted ? Icons.mic_off : Icons.mic, size: 20, color: p.muted ? AppTheme.overdue : null),
                  Icon(p.videoOff ? Icons.videocam_off : Icons.videocam, size: 20, color: p.videoOff ? AppTheme.overdue : null),
                  if (c.isManager)
                    PopupMenuButton<String>(
                      onSelected: (v) {
                        switch (v) {
                          case 'mute': c.muteUser(p);
                          case 'video': c.videoOffUser(p);
                          case 'unmute': c.requestUnmute(p);
                          case 'cohost': c.makeCohost(p);
                          case 'uncohost': c.removeCohost(p);
                          case 'spot': c.spotlight(p);
                          case 'hand': c.lowerHand(p);
                          case 'remove': c.removeUser(p);
                        }
                      },
                      itemBuilder: (_) => [
                        const PopupMenuItem(value: 'mute', child: Text('Mute')),
                        const PopupMenuItem(value: 'video', child: Text('Turn camera off')),
                        const PopupMenuItem(value: 'unmute', child: Text('Ask to unmute')),
                        const PopupMenuItem(value: 'spot', child: Text('Spotlight')),
                        if (p.handRaised) const PopupMenuItem(value: 'hand', child: Text('Lower hand')),
                        if (c.isHost) PopupMenuItem(value: p.role == 'co-host' ? 'uncohost' : 'cohost', child: Text(p.role == 'co-host' ? 'Remove co-host' : 'Make co-host')),
                        const PopupMenuItem(value: 'remove', child: Text('Remove')),
                      ],
                    ),
                ]),
              )),
        ]);
      },
    );
  }
}

class _PollsPanel extends StatefulWidget {
  final MeetingController c;
  const _PollsPanel({required this.c});
  @override
  State<_PollsPanel> createState() => _PollsPanelState();
}

class _PollsPanelState extends State<_PollsPanel> {
  List<Map<String, dynamic>> polls = [];
  bool loading = true;
  VoidCallback? _unsub;

  @override
  void initState() {
    super.initState();
    _load();
    _unsub = widget.c.listen('poll:changed', (_) => _load());
  }

  @override
  void dispose() {
    _unsub?.call();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = Api.unwrap(await Api.instance.get('/polls/meeting/${widget.c.meetingDbId}'));
      if (mounted) setState(() { polls = asList(d['polls']).map(asMap).toList(); loading = false; });
    } catch (e) {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _create() async {
    final q = TextEditingController();
    final opts = [TextEditingController(), TextEditingController()];
    bool multiple = false;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: const Text('New poll'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: q, decoration: const InputDecoration(labelText: 'Question')),
              ...opts.asMap().entries.map((e) => Padding(padding: const EdgeInsets.only(top: 8), child: TextField(controller: e.value, decoration: InputDecoration(labelText: 'Option ${e.key + 1}')))),
              TextButton.icon(onPressed: () => set(() => opts.add(TextEditingController())), icon: const Icon(Icons.add), label: const Text('Add option')),
              SwitchListTile(value: multiple, onChanged: (v) => set(() => multiple = v), title: const Text('Allow multiple answers')),
            ]),
          ),
          actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')), FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Launch'))],
        ),
      ),
    );
    if (ok != true) return;
    final options = opts.map((o) => o.text.trim()).where((t) => t.isNotEmpty).toList();
    if (q.text.trim().isEmpty || options.length < 2) {
      if (mounted) toast(context, 'Add a question and at least two options', error: true);
      return;
    }
    await guard(context, () => Api.instance.post('/polls', {'meetingId': widget.c.meetingDbId, 'question': q.text.trim(), 'options': options, 'allowMultiple': multiple, 'isAnonymous': false}));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Row(children: [
        const SizedBox(width: 16),
        Expanded(child: Text('Polls', style: Theme.of(context).textTheme.titleMedium)),
        if (widget.c.isManager) TextButton.icon(onPressed: _create, icon: const Icon(Icons.add), label: const Text('New poll')),
        const SizedBox(width: 8),
      ]),
      Expanded(
        child: loading
            ? const Center(child: CircularProgressIndicator())
            : polls.isEmpty
                ? const Center(child: Text('No polls yet'))
                : ListView(padding: const EdgeInsets.all(12), children: polls.map((p) => _pollCard(p)).toList()),
      ),
    ]);
  }

  Widget _pollCard(Map<String, dynamic> p) {
    final active = p['status'] == 'active';
    final voted = p['hasVoted'] == true;
    final showResults = voted || !active;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(p['question'].toString(), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16))),
            Chip(label: Text(p['status'].toString()), visualDensity: VisualDensity.compact),
          ]),
          const SizedBox(height: 8),
          ...asList(p['options']).map(asMap).map((o) {
            final pct = ((o['percentage'] ?? 0) as num).toDouble() / 100;
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: InkWell(
                onTap: (!active || voted)
                    ? null
                    : () async {
                        await guard(context, () => Api.instance.post('/polls/${p['id']}/vote', {'optionIds': [o['id']]}));
                        _load();
                      },
                child: Stack(children: [
                  if (showResults) Positioned.fill(child: FractionallySizedBox(alignment: Alignment.centerLeft, widthFactor: pct.clamp(0, 1), child: Container(decoration: BoxDecoration(color: Theme.of(context).colorScheme.primary.withOpacity(.2), borderRadius: BorderRadius.circular(8))))),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(border: Border.all(color: Theme.of(context).colorScheme.outlineVariant), borderRadius: BorderRadius.circular(8)),
                    child: Row(children: [
                      if (o['mine'] == true) const Padding(padding: EdgeInsets.only(right: 8), child: Icon(Icons.check_circle, size: 18)),
                      Expanded(child: Text(o['text'].toString())),
                      if (showResults) Text('${o['votes']} · ${o['percentage']}%'),
                    ]),
                  ),
                ]),
              ),
            );
          }),
          Row(children: [
            Text('${p['totalVotes']} vote(s)', style: TextStyle(color: Theme.of(context).colorScheme.outline)),
            const Spacer(),
            if (widget.c.isManager && active)
              TextButton(onPressed: () async { await guard(context, () => Api.instance.put('/polls/${p['id']}/end')); _load(); }, child: const Text('End poll')),
          ]),
        ]),
      ),
    );
  }
}

class _QAPanel extends StatefulWidget {
  final MeetingController c;
  const _QAPanel({required this.c});
  @override
  State<_QAPanel> createState() => _QAPanelState();
}

class _QAPanelState extends State<_QAPanel> {
  List<Map<String, dynamic>> qs = [];
  bool loading = true;
  final _text = TextEditingController();
  VoidCallback? _unsub;

  @override
  void initState() {
    super.initState();
    _load();
    _unsub = widget.c.listen('qa:changed', (_) => _load());
  }

  @override
  void dispose() {
    _unsub?.call();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = Api.unwrap(await Api.instance.get('/qa/meeting/${widget.c.meetingDbId}'));
      if (mounted) setState(() { qs = asList(d['questions']).map(asMap).toList(); loading = false; });
    } catch (_) {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _ask() async {
    final t = _text.text.trim();
    if (t.isEmpty) return;
    _text.clear();
    await guard(context, () => Api.instance.post('/qa', {'meetingId': widget.c.meetingDbId, 'question': t}));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(children: [
      Text('Questions & answers', style: Theme.of(context).textTheme.titleMedium),
      Expanded(
        child: loading
            ? const Center(child: CircularProgressIndicator())
            : qs.isEmpty
                ? const Center(child: Text('No questions yet'))
                : ListView(
                    padding: const EdgeInsets.all(12),
                    children: qs.map((q) {
                      final answered = (q['answer'] ?? '').toString().isNotEmpty;
                      return Card(
                        child: ListTile(
                          title: Text(q['question'].toString()),
                          subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('Asked by ${q['askedByName']}', style: TextStyle(fontSize: 12, color: cs.outline)),
                            if (answered) Container(margin: const EdgeInsets.only(top: 8), padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: cs.primaryContainer, borderRadius: BorderRadius.circular(8)), child: Text(q['answer'].toString())),
                          ]),
                          trailing: Column(mainAxisSize: MainAxisSize.min, children: [
                            IconButton(
                              visualDensity: VisualDensity.compact,
                              icon: Icon(q['hasUpvoted'] == true ? Icons.thumb_up : Icons.thumb_up_outlined, size: 20),
                              onPressed: () async { await guard(context, () => Api.instance.put('/qa/${q['id']}/upvote')); _load(); },
                            ),
                            if (widget.c.isManager && !answered)
                              InkWell(
                                onTap: () async {
                                  final a = await promptText(context, 'Answer', multiline: true, ok: 'Send');
                                  if (a == null || a.isEmpty) return;
                                  await guard(context, () => Api.instance.put('/qa/${q['id']}/answer', {'answer': a}));
                                  _load();
                                },
                                child: const Text('Answer', style: TextStyle(fontSize: 12)),
                              ),
                          ]),
                        ),
                      );
                    }).toList(),
                  ),
      ),
      Padding(
        padding: EdgeInsets.fromLTRB(12, 6, 12, 8 + MediaQuery.of(context).viewInsets.bottom),
        child: Row(children: [
          Expanded(child: TextField(controller: _text, onSubmitted: (_) => _ask(), decoration: const InputDecoration(hintText: 'Ask a question', isDense: true))),
          const SizedBox(width: 8),
          IconButton.filled(onPressed: _ask, icon: const Icon(Icons.send)),
        ]),
      ),
    ]);
  }
}

class _NotesPanel extends StatefulWidget {
  final MeetingController c;
  const _NotesPanel({required this.c});
  @override
  State<_NotesPanel> createState() => _NotesPanelState();
}

class _NotesPanelState extends State<_NotesPanel> {
  late final TextEditingController _t = TextEditingController(text: widget.c.notes);
  Timer? _debounce;
  VoidCallback? _unsub;

  @override
  void initState() {
    super.initState();
    // Remote edits replace the text unless the user is typing.
    _unsub = widget.c.listen('notes:update', (d) {
      final text = (d is Map ? d['text'] : null)?.toString() ?? '';
      if (mounted && text != _t.text && _debounce?.isActive != true) {
        _t.value = TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _unsub?.call();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(children: [
        Text('Shared notes', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Expanded(
          child: TextField(
            controller: _t,
            maxLines: null,
            expands: true,
            textAlignVertical: TextAlignVertical.top,
            decoration: const InputDecoration(hintText: 'Everyone in the meeting can edit these notes'),
            onChanged: (v) {
              _debounce?.cancel();
              _debounce = Timer(const Duration(milliseconds: 500), () => widget.c.updateNotes(v));
            },
          ),
        ),
      ]),
    );
  }
}
