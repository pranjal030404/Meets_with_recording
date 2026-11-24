import 'package:flutter/material.dart';
import '../core/api.dart';
import '../widgets/common.dart';

IconData _iconFor(String? type) {
  switch (type) {
    case 'mention': return Icons.alternate_email;
    case 'task_assigned': return Icons.task_alt;
    case 'meeting_invite':
    case 'meeting_reminder': return Icons.videocam_outlined;
    case 'team_member_added':
    case 'team_invite': return Icons.groups_outlined;
    case 'message': return Icons.chat_bubble_outline;
    default: return Icons.notifications_none;
  }
}

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final _key = GlobalKey<AsyncListState<Map<String, dynamic>>>();
  bool _unreadOnly = false;

  Future<List<Map<String, dynamic>>> _load() async {
    final d = Api.unwrap(await Api.instance.get('/notifications', query: {'limit': 100, if (_unreadOnly) 'unreadOnly': true}));
    return asList(d['notifications']).map(asMap).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          IconButton(tooltip: 'Unread only', icon: Icon(_unreadOnly ? Icons.mark_email_unread : Icons.mark_email_unread_outlined), onPressed: () { setState(() => _unreadOnly = !_unreadOnly); WidgetsBinding.instance.addPostFrameCallback((_) => _key.currentState?.reload()); }),
          PopupMenuButton<String>(
            onSelected: (v) async {
              if (v == 'read') await guard(context, () => Api.instance.put('/notifications/read-all'));
              if (v == 'clear' && await confirm(context, 'Delete all notifications?', ok: 'Delete', danger: true) && context.mounted) {
                await guard(context, () => Api.instance.delete('/notifications'));
              }
              _key.currentState?.reload();
            },
            itemBuilder: (_) => const [PopupMenuItem(value: 'read', child: Text('Mark all as read')), PopupMenuItem(value: 'clear', child: Text('Clear all'))],
          ),
        ],
      ),
      body: AsyncList<Map<String, dynamic>>(
        key: _key,
        load: _load,
        emptyText: 'You are all caught up',
        emptyIcon: Icons.notifications_none,
        itemBuilder: (context, n, reload) {
          final unread = n['isRead'] != true;
          return Dismissible(
            key: ValueKey(n['id']),
            background: Container(color: Colors.red, alignment: Alignment.centerRight, padding: const EdgeInsets.only(right: 20), child: const Icon(Icons.delete, color: Colors.white)),
            direction: DismissDirection.endToStart,
            onDismissed: (_) => Api.instance.delete('/notifications/${n['id']}').catchError((_) {}),
            child: ListTile(
              tileColor: unread ? Theme.of(context).colorScheme.primaryContainer.withOpacity(.35) : null,
              leading: CircleAvatar(child: Icon(_iconFor(n['type']?.toString()))),
              title: Text((n['title'] ?? '').toString(), style: TextStyle(fontWeight: unread ? FontWeight.w700 : null)),
              subtitle: Text((n['message'] ?? '').toString()),
              trailing: Text(fmtRelative(n['createdAt']), style: const TextStyle(fontSize: 12)),
              onTap: () async {
                if (unread) {
                  await Api.instance.put('/notifications/${n['id']}/read').catchError((_) {});
                  reload();
                }
              },
            ),
          );
        },
      ),
    );
  }
}
