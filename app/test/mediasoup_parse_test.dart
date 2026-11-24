import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:mediasoup_client_flutter/mediasoup_client_flutter.dart' as ms;

/// Parses payloads captured from the real backend (mediasoup router / WebRTC transport).
void main() {
  final caps = jsonDecode(File('test/fixtures_caps.json').readAsStringSync()) as Map<String, dynamic>;
  final tp = jsonDecode(File('test/fixtures_transport.json').readAsStringSync()) as Map<String, dynamic>;

  test('router RTP capabilities parse and round-trip', () {
    final c = ms.RtpCapabilities.fromMap(caps);
    expect(c.codecs, isNotEmpty);
    expect(c.toMap()['codecs'], isA<List>());
  });

  test('transport parameters parse', () {
    final ice = ms.IceParameters.fromMap(tp['iceParameters']);
    expect(ice.usernameFragment, isNotEmpty);
    final cands = (tp['iceCandidates'] as List).map((c) => ms.IceCandidate.fromMap(c)).toList();
    expect(cands, isNotEmpty);
    final dtls = ms.DtlsParameters.fromMap(tp['dtlsParameters']);
    expect(dtls.toMap()['fingerprints'], isNotEmpty);
  });
}
