import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:meetclone/core/config.dart';
import 'package:meetclone/widgets/common.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A one-route server standing in for GET /api/config.
Future<HttpServer> serve(Object? legal) async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.listen((request) {
    request.response
      ..headers.contentType = ContentType.json
      ..write(jsonEncode({'success': true, 'data': {'billingEnabled': false, 'legal': legal}}))
      ..close();
  });
  return server;
}

void main() {
  for (final published in [true, false]) {
    testWidgets('privacy and terms links ${published ? 'show when published' : 'stay hidden otherwise'}', (tester) async {
      await tester.runAsync(() async {
        HttpOverrides.global = null; // let the widget reach the local stand-in
        SharedPreferences.setMockInitialValues({});
        await Config.init();
        final server = await serve(published ? {'name': 'Operator', 'contact': 'a@b.test'} : false);
        Config.testServerUrl = 'http://127.0.0.1:${server.port}';
        await tester.pumpWidget(const MaterialApp(home: Scaffold(body: LegalLinks())));
        await Future<void>.delayed(const Duration(milliseconds: 500));
        await tester.pump();
        await server.close(force: true);
      });
      expect(find.text('Privacy notice'), published ? findsOneWidget : findsNothing);
      expect(find.text('Terms of service'), published ? findsOneWidget : findsNothing);
    });
  }
}
