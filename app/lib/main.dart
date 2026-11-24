import 'package:flutter/material.dart';
import 'core/config.dart';
import 'core/session.dart';
import 'core/theme.dart';
import 'screens/auth_screens.dart';
import 'screens/home_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Config.init();
  runApp(const MeetCloneApp());
  Session.instance.boot();
}

class MeetCloneApp extends StatelessWidget {
  const MeetCloneApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MeetClone',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.build(Brightness.light),
      darkTheme: AppTheme.build(Brightness.dark),
      themeMode: ThemeMode.system,
      home: ListenableBuilder(
        listenable: Session.instance,
        builder: (context, _) {
          final s = Session.instance;
          if (s.booting) return const Scaffold(body: Center(child: CircularProgressIndicator()));
          return s.isLoggedIn ? const HomeShell() : const LoginScreen();
        },
      ),
    );
  }
}
