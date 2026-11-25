import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../core/api.dart';
import '../core/session.dart';
import '../widgets/common.dart';

const _statusPresets = [
  ('✅', 'Available'),
  ('🎯', 'Focused'),
  ('📅', 'In a meeting'),
  ('☕', 'On a break'),
  ('🏠', 'Working remotely'),
  ('✈️', 'Traveling'),
];

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Session.instance,
      builder: (context, _) {
        final s = Session.instance;
        final u = s.user ?? {};
        final plan = asMap(s.subscription?['plan'])['name'];
        return ListView(padding: const EdgeInsets.all(12), children: [
          Card(
            child: ListTile(
              contentPadding: const EdgeInsets.all(16),
              leading: UserAvatar(name: s.name, url: u['avatar']?.toString(), radius: 28),
              title: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 18)),
              subtitle: Text('${s.email}${plan != null ? '\nPlan: $plan' : ''}${(u['customStatus'] ?? '').toString().isNotEmpty ? '\n${u['statusEmoji'] ?? ''} ${u['customStatus']}' : ''}'),
              isThreeLine: true,
              trailing: const Icon(Icons.edit_outlined),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen())),
            ),
          ),
          const SectionTitle('Status'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final p in _statusPresets)
              ChoiceChip(
                label: Text('${p.$1} ${p.$2}'),
                selected: u['customStatus'] == p.$2,
                onSelected: (_) => guard(context, () async {
                  await Api.instance.put('/auth/status', {'customStatus': p.$2, 'statusEmoji': p.$1});
                  await Session.instance.refresh();
                }),
              ),
            if ((u['customStatus'] ?? '').toString().isNotEmpty)
              ActionChip(
                label: const Text('Clear'),
                onPressed: () => guard(context, () async {
                  await Api.instance.put('/auth/status', {'customStatus': '', 'statusEmoji': ''});
                  await Session.instance.refresh();
                }),
              ),
          ]),
          const SectionTitle('Messages'),
          _tile(context, Icons.bookmark_border, 'Saved messages', const _SavedScreen()),
          const SectionTitle('App'),
          ListTile(
            leading: const Icon(Icons.logout, color: AppTheme.overdue),
            title: const Text('Sign out', style: TextStyle(color: AppTheme.overdue)),
            onTap: () async {
              if (await confirm(context, 'Sign out?', ok: 'Sign out') && context.mounted) {
                Navigator.of(context).popUntil((r) => r.isFirst);
                Session.instance.logout();
              }
            },
          ),
          const SizedBox(height: 24),
          Center(child: Text('Minutes mobile 1.0.0', style: TextStyle(color: Theme.of(context).colorScheme.outline, fontSize: 12))),
        ]);
      },
    );
  }

  Widget _tile(BuildContext context, IconData icon, String title, Widget page) => ListTile(
        leading: Icon(icon),
        title: Text(title),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => page)),
      );
}

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late final _name = TextEditingController(text: Session.instance.name);
  late final _title = TextEditingController(text: Session.instance.user?['title']?.toString() ?? '');
  late final _dept = TextEditingController(text: Session.instance.user?['department']?.toString() ?? '');
  late final _status = TextEditingController(text: Session.instance.user?['customStatus']?.toString() ?? '');
  late final _emoji = TextEditingController(text: Session.instance.user?['statusEmoji']?.toString() ?? '');
  int? _expiryHours;
  bool _busy = false;

  Future<void> _save() async {
    setState(() => _busy = true);
    final ok = await guard(context, () async {
      await Session.instance.updateProfile({'name': _name.text.trim(), 'title': _title.text.trim(), 'department': _dept.text.trim()});
      final d = Api.unwrap(await Api.instance.put('/auth/status', {
        'customStatus': _status.text.trim(),
        'statusEmoji': _emoji.text.trim(),
        if (_expiryHours != null) 'statusExpiresAt': DateTime.now().add(Duration(hours: _expiryHours!)).toUtc().toIso8601String(),
      }));
      await Session.instance.refresh();
      return d;
    }, success: 'Profile saved');
    if (mounted) {
      setState(() => _busy = false);
      if (ok != null) Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Center(child: UserAvatar(name: Session.instance.name, url: Session.instance.user?['avatar']?.toString(), radius: 44)),
        const SizedBox(height: 20),
        TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name')),
        const SizedBox(height: 12),
        TextField(controller: _title, decoration: const InputDecoration(labelText: 'Job title')),
        const SizedBox(height: 12),
        TextField(controller: _dept, decoration: const InputDecoration(labelText: 'Department')),
        const SectionTitle('Status'),
        Row(children: [
          SizedBox(width: 72, child: TextField(controller: _emoji, textAlign: TextAlign.center, decoration: const InputDecoration(hintText: '🙂'))),
          const SizedBox(width: 8),
          Expanded(child: TextField(controller: _status, decoration: const InputDecoration(hintText: "What's your status?"))),
        ]),
        const SizedBox(height: 8),
        DropdownButtonFormField<int?>(
          value: _expiryHours,
          decoration: const InputDecoration(labelText: 'Clear after'),
          items: const [
            DropdownMenuItem(value: null, child: Text("Don't clear")),
            DropdownMenuItem(value: 1, child: Text('1 hour')),
            DropdownMenuItem(value: 4, child: Text('4 hours')),
            DropdownMenuItem(value: 24, child: Text('Today')),
            DropdownMenuItem(value: 168, child: Text('This week')),
          ],
          onChanged: (v) => setState(() => _expiryHours = v),
        ),
        const SizedBox(height: 20),
        FilledButton(onPressed: _busy ? null : _save, child: const Text('Save')),
      ]),
    );
  }
}

class _SavedScreen extends StatelessWidget {
  const _SavedScreen();
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Saved messages')),
        body: AsyncList<Map<String, dynamic>>(
          load: () async {
            final d = Api.unwrap(await Api.instance.get('/messages/saved'));
            return asList(d['messages'] ?? d['saved']).map(asMap).toList();
          },
          emptyText: 'Long-press a message and choose Save to keep it here',
          emptyIcon: Icons.bookmark_border,
          itemBuilder: (_, m, reload) {
            final msg = m['message'] is Map ? asMap(m['message']) : m;
            return Card(child: ListTile(title: Text((msg['content'] ?? '').toString()), subtitle: Text('${asMap(msg['sender'])['name'] ?? ''} · ${fmtRelative(msg['createdAt'])}')));
          },
        ),
      );
}
