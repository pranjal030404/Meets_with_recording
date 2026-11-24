import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/session.dart';
import '../core/socket_service.dart';
import 'chats_screen.dart';
import 'meetings_screen.dart';
import 'more_screen.dart';
import 'notifications_screen.dart';
import 'search_screen.dart';
import 'tasks_screen.dart';
import 'teams_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;
  int _unread = 0;
  final _meetingsKey = GlobalKey<MeetingsScreenState>();

  static const _titles = ['Meetings', 'Chats', 'Teams', 'Tasks', 'More'];

  @override
  void initState() {
    super.initState();
    _loadUnread();
    final s = SocketService.instance;
    s.on('notification:new', _onNotif);
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

  @override
  Widget build(BuildContext context) {
    final pages = [
      MeetingsScreen(key: _meetingsKey),
      const ChatsScreen(),
      const TeamsScreen(),
      const TasksScreen(),
      const MoreScreen(),
    ];
    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_tab], style: const TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            tooltip: 'Search',
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SearchScreen())),
          ),
          IconButton(
            tooltip: 'Notifications',
            icon: Badge(isLabelVisible: _unread > 0, label: Text('$_unread'), child: const Icon(Icons.notifications_outlined)),
            onPressed: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificationsScreen()));
              _loadUnread();
            },
          ),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ListenableBuilder(
              listenable: Session.instance,
              builder: (_, __) => InkWell(
                customBorder: const CircleBorder(),
                onTap: () => setState(() => _tab = 4),
                child: CircleAvatar(radius: 16, child: Text(Session.instance.name.isEmpty ? '?' : Session.instance.name[0].toUpperCase())),
              ),
            ),
          ),
        ],
      ),
      body: IndexedStack(index: _tab, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.videocam_outlined), selectedIcon: Icon(Icons.videocam), label: 'Meetings'),
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: 'Chats'),
          NavigationDestination(icon: Icon(Icons.groups_outlined), selectedIcon: Icon(Icons.groups), label: 'Teams'),
          NavigationDestination(icon: Icon(Icons.task_alt_outlined), selectedIcon: Icon(Icons.task_alt), label: 'Tasks'),
          NavigationDestination(icon: Icon(Icons.menu), label: 'More'),
        ],
      ),
    );
  }
}
