// On a real device or emulator, against a disposable server:
//   flutter test integration_test/device_smoke_test.dart -d <device> --dart-define=SERVER_URL=http://10.0.2.2:5000 \
//       --dart-define=QA_EMAIL=... --dart-define=QA_PASSWORD=... --dart-define=QA_ROOM=...
// QA_EMAIL must be an existing account (it is deleted at the end); QA_ROOM a meeting somebody else is already in.
// Grant camera and microphone first, or the system dialogs block the run.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:meetclone/core/config.dart';
import 'package:meetclone/core/session.dart';
import 'package:meetclone/main.dart';

const email = String.fromEnvironment('QA_EMAIL');
const password = String.fromEnvironment('QA_PASSWORD');
const room = String.fromEnvironment('QA_ROOM');
const partner = String.fromEnvironment('QA_PARTNER');

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;

  Future<void> until(WidgetTester tester, Finder finder, [int seconds = 40]) async {
    for (var i = 0; i < seconds * 4 && finder.evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
    expect(finder, findsWidgets, reason: 'waited $seconds s');
  }

  Future<void> wait(WidgetTester tester, int seconds) async {
    for (var i = 0; i < seconds * 4; i++) {
      await tester.pump(const Duration(milliseconds: 250));
    }
  }

  testWidgets('sign in, join a call with someone, leave, delete the account', (tester) async {
    await Config.init();
    await Config.setToken(null);
    await tester.pumpWidget(const MinutesApp());
    Session.instance.boot();

    await until(tester, find.widgetWithText(FilledButton, 'Sign in'));
    expect(find.text('Forgot password?'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).at(0), email);
    await tester.enterText(find.byType(TextFormField).at(1), password);
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await until(tester, find.text('New meeting'));
    debugPrint('DEVICE signed-in');
    expect(Config.deviceToken, isNotNull);

    await tester.enterText(find.byType(TextField).last, room);
    await tester.tap(find.widgetWithText(OutlinedButton, 'Join'));
    await until(tester, find.text('Join now'));
    await wait(tester, 2);
    for (final label in ['Camera off', 'Mic off']) {
      if (find.text(label).evaluate().isNotEmpty) {
        await tester.tap(find.byIcon(label == 'Camera off' ? Icons.videocam_off : Icons.mic_off).first);
        await wait(tester, 2);
      }
    }
    await tester.ensureVisible(find.text('Join now'));
    await tester.tap(find.text('Join now'));
    await until(tester, find.byTooltip('Leave'));
    await until(tester, find.textContaining(partner));
    debugPrint('DEVICE in-call');
    await wait(tester, 25); // the other side checks that it receives this camera
    await binding.convertFlutterSurfaceToImage();
    await tester.pump();

    await tester.tap(find.byTooltip('Leave'));
    await wait(tester, 2);
    for (final label in ['Leave meeting', 'Leave']) {
      if (find.text('New meeting').evaluate().isEmpty && find.text(label).evaluate().isNotEmpty) {
        await tester.tap(find.text(label).last);
        await wait(tester, 2);
      }
    }
    await until(tester, find.byTooltip('Open navigation menu'));
    debugPrint('DEVICE left-call');

    await tester.tap(find.byTooltip('Open navigation menu'));
    await wait(tester, 1);
    await tester.tap(find.text('Set status').last);
    await wait(tester, 1);
    await tester.scrollUntilVisible(find.text('Delete account'), 250, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.text('Delete account'));
    await until(tester, find.text('Delete for good'));
    await tester.enterText(find.byType(TextField).last, password);
    await tester.tap(find.text('Delete for good'));
    await until(tester, find.widgetWithText(FilledButton, 'Sign in'));
    expect(Config.token, isNull);
    debugPrint('DEVICE account-deleted');
  }, timeout: const Timeout(Duration(minutes: 6)));
}
