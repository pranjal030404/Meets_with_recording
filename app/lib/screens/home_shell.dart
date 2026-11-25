import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/session.dart';
import '../core/socket_service.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import 'billing_screen.dart';
import 'calendar_screen.dart';
import 'chats_screen.dart';
import 'files_screen.dart';
import 'home_screen.dart';
import 'meetings_screen.dart';
import 'more_screen.dart';
import 'notifications_screen.dart';
import 'search_screen.dart';
import 'tasks_screen.dart';
import 'teams_screen.dart';

/// Same entries, order and names as the web app's sidebar.
final List<(String, IconData, Widget Function())> _nav = [
  ('Home', Icons.dashboard_outlined, () => const HomeScreen()),
  ('Chat', Icons.chat_bubble_outline, () => const ChatsScreen()),
  ('Teams', Icons.group_outlined, () => const TeamsScreen()),
  ('Calendar', Icons.calendar_today_outlined, () => const CalendarScreen(embedded: true)),
  ('Files', Icons.folder_outlined, () => const FilesScreen()),
  ('Tasks', Icons.check_box_outlined, () => const TasksScreen()),
  ('Meetings', Icons.schedule, () => const MeetingsScreen()),
  ('Billing', Icons.credit_card_outlined, () => const BillingScreen(embedded: true)),
];

/// Top bar + slide-out sidebar, as the web app lays out on a phone.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _page = 0;
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _loadUnread();
    SocketService.instance.on('notification:new', _onNotif);
  }

  void _onNotif(dynamic _) => _loadUnread();

  @override
  void dispose() {
    SocketService.instance.off('notification:new', _onNotif);
    super.dispose();
  }

  Future<void> _loadUnread() async {
    try {
      final d = Api.unwrap(await Api.instance.get('/notifications', query: {'limit': 1}));
      if (mounted) setState(() => _unread = (d['unreadCount'] ?? 0) as int);
    } catch (_) {}
  }

  void _push(Widget screen) => Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {
    return PopScope(
      // Back returns to Home before leaving the app.
      canPop: _page == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(() => _page = 0);
      },
      child: Scaffold(
        appBar: AppBar(
          centerTitle: true,
          title: const Row(mainAxisSize: MainAxisSize.min, children: [BrandMark(size: 32), SizedBox(width: 8), Text('Minutes')]),
          actions: [
            IconButton(
              tooltip: 'Notifications',
              icon: Badge(isLabelVisible: _unread > 0, label: Text('$_unread'), child: const Icon(Icons.notifications_outlined)),
              onPressed: () async {
                await Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificationsScreen()));
                _loadUnread();
              },
            ),
          ],
        ),
        drawer: Drawer(child: SafeArea(child: Builder(builder: _sidebar))),
        body: KeyedSubtree(key: ValueKey(_page), child: _nav[_page].$3()),
      ),
    );
  }

  Widget _sidebar(BuildContext drawer) {
    void close() => Scaffold.of(drawer).closeDrawer();
    return Column(children: [
      const Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 16),
        child: Row(children: [
          BrandMark(),
          SizedBox(width: 12),
          Text('Minutes', style: TextStyle(fontFamily: AppTheme.display, fontSize: 18, fontWeight: FontWeight.w500)),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: OutlinedButton(
          style: OutlinedButton.styleFrom(backgroundColor: AppTheme.raised, foregroundColor: AppTheme.muted, minimumSize: const Size(double.infinity, 44), alignment: Alignment.centerLeft),
          onPressed: () {
            close();
            _push(const SearchScreen());
          },
          child: const Row(children: [Icon(Icons.search, size: 18), SizedBox(width: 12), Text('Search')]),
        ),
      ),
      Expanded(
        child: ListView(padding: const EdgeInsets.symmetric(horizontal: 12), children: [
          for (var i = 0; i < _nav.length; i++)
            ListTile(
              dense: true,
              selected: i == _page,
              selectedColor: Colors.white,
              selectedTileColor: const Color(0x14FFFFFF),
              leading: Icon(_nav[i].$2, size: 20),
              title: Text(_nav[i].$1, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
              onTap: () {
                close();
                setState(() => _page = i);
              },
            ),
        ]),
      ),
      const Divider(),
      Padding(
        padding: const EdgeInsets.all(12),
        child: ListenableBuilder(
          listenable: Session.instance,
          builder: (_, _) {
            final u = Session.instance.user ?? {};
            final status = (u['customStatus'] ?? '').toString();
            return Row(children: [
              Expanded(
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 8),
                  leading: UserAvatar(name: Session.instance.name, url: u['avatar']?.toString(), radius: 18),
                  title: Text(Session.instance.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                  subtitle: Text(status.isEmpty ? 'Set status' : '${u['statusEmoji'] ?? ''} $status', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: AppTheme.muted)),
                  onTap: () {
                    close();
                    _push(Scaffold(appBar: AppBar(title: const Text('Account')), body: const MoreScreen()));
                  },
                ),
              ),
              IconButton(
                tooltip: 'Logout',
                icon: const Icon(Icons.logout, size: 20),
                onPressed: () async {
                  if (await confirm(context, 'Sign out?', ok: 'Sign out')) Session.instance.logout();
                },
              ),
            ]);
          },
        ),
      ),
    ]);
  }
}
