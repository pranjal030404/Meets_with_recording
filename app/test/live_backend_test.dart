// Runs the app's own Api/Session code against a live backend.
// Skipped unless MEET_SERVER is set:  MEET_SERVER=http://localhost:5000 flutter test test/live_backend_test.dart
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:meetclone/core/api.dart';
import 'package:meetclone/core/config.dart';
import 'package:meetclone/core/session.dart';
import 'package:meetclone/core/socket_service.dart';

void main() {
  final server = Platform.environment['MEET_SERVER'];
  final skip = server == null ? 'set MEET_SERVER to run' : null;
  final api = Api.instance;
  final email = 'dart_${DateTime.now().millisecondsSinceEpoch}@example.com';
  String? roomId, meetingId, teamId, convId;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    HttpOverrides.global = null;
    SharedPreferences.setMockInitialValues({});
    await Config.init();
    if (server != null) await Config.setServerUrl(server);
    Session.instance;
    Api.instance.onUnauthorized = () => print('UNAUTHORIZED callback fired');
  });

  test('signup + login + me', () async {
    final msg = await Session.instance.signup('Dart Tester', email, 'secret12');
    expect(msg, isNull);
    await Session.instance.logout();
    await Future.delayed(const Duration(milliseconds: 1500)); // identical JWT within one second would be the revoked one
    await Session.instance.login(email, 'secret12');
    expect(Session.instance.isLoggedIn, true);
    await Session.instance.refresh();
    expect(Session.instance.name, 'Dart Tester');
  }, skip: skip);

  test('wrong password gives a readable error', () async {
    await expectLater(api.post('/auth/login', {'email': email, 'password': 'nope'}), throwsA(isA<ApiException>()));
  }, skip: skip);

  test('meetings: create, placement, join, detail, list', () async {
    final d = Api.unwrap(await api.post('/meetings', {'title': 'Dart meeting'}));
    roomId = d['meeting']['roomId'];
    meetingId = d['meeting']['id'];
    final p = await api.get('/meetings/$roomId/placement');
    expect(p['success'], true);
    final j = Api.unwrap(await api.post('/meetings/$roomId/join'));
    expect(j['meeting']['status'], isNotNull);
    final det = Api.unwrap(await api.get('/meetings/$roomId'));
    expect(det['meeting']['hostId'], Session.instance.userId);
    final list = Api.unwrap(await api.get('/meetings', query: {'limit': 100}));
    expect((list['meetings'] as List).any((m) => m['roomId'] == roomId), true);
  }, skip: skip);

  test('meeting extras: polls, qa, chat history, ice', () async {
    final poll = Api.unwrap(await api.post('/polls', {'meetingId': meetingId, 'question': 'Q?', 'options': ['a', 'b'], 'allowMultiple': false, 'isAnonymous': false}));
    final pid = poll['poll']['id'];
    await api.post('/polls/$pid/vote', {'optionIds': [poll['poll']['options'][0]['id']]});
    final polls = Api.unwrap(await api.get('/polls/meeting/$meetingId'));
    expect((polls['polls'] as List).first['options'][0]['votes'], 1);
    await api.post('/qa', {'meetingId': meetingId, 'question': 'Why?'});
    final qa = Api.unwrap(await api.get('/qa/meeting/$meetingId'));
    expect((qa['questions'] as List).length, 1);
    final chat = Api.unwrap(await api.get('/chat/$roomId/messages'));
    expect(chat['messages'], isA<List>());
    final ice = Api.unwrap(await api.get('/webrtc/ice-servers'));
    expect(ice['iceServers'], isNotEmpty);
  }, skip: skip);

  test('teams: create, detail, channel, message, tasks', () async {
    final t = Api.unwrap(await api.post('/teams', {'name': 'Dart Team', 'description': 'x'}));
    teamId = t['id'];
    final list = Api.unwrap(await api.get('/teams'));
    expect(list is List && list.any((x) => x['id'] == teamId), true);
    final det = Api.unwrap(await api.get('/teams/$teamId'));
    expect(det['members'][0]['user']['name'], 'Dart Tester');
    await api.post('/teams/$teamId/channels', {'name': 'dev'});
    final after = Api.unwrap(await api.get('/teams/$teamId'));
    final ch = (after['channels'] as List).firstWhere((c) => c['name'] == 'dev');
    final key = ch['type'] == 'custom' ? 'custom:${ch['id']}' : ch['type'];
    await api.post('/chat/team/$teamId/messages', {'content': 'hello team', 'channelType': key});
    final msgs = Api.unwrap(await api.get('/chat/team/$teamId/messages', query: {'channelType': key}));
    expect((msgs['messages'] as List).first['content'], 'hello team');
    final task = Api.unwrap(await api.post('/tasks', {'title': 'T1', 'teamId': teamId, 'priority': 'high'}));
    await api.put('/tasks/${task['task']['id']}', {'status': 'in_progress'});
    final tasks = Api.unwrap(await api.get('/tasks', query: {'scope': 'team', 'teamId': teamId}));
    expect((tasks['tasks'] as List).first['status'], 'in_progress');
    final mt = Api.unwrap(await api.get('/meetings/team/$teamId'));
    expect(mt['meetings'], isA<List>());
  }, skip: skip);

  test('conversations + message actions', () async {
    final other = 'dart2_${DateTime.now().millisecondsSinceEpoch}@example.com';
    await api.post('/auth/signup', {'name': 'Second', 'email': other, 'password': 'secret12'});
    final otherId = Api.unwrap(await api.post('/auth/login', {'email': other, 'password': 'secret12'}))['user']['id'];
    final g = Api.unwrap(await api.post('/conversations', {'type': 'group', 'name': 'Dart group', 'userIds': [otherId]}));
    convId = g['conversation']['id'];
    await api.post('/conversations/$convId/messages', {'content': 'hi group'});
    final msgs = Api.unwrap(await api.get('/conversations/$convId/messages', query: {'limit': 100}));
    final m = (msgs['messages'] as List).firstWhere((x) => x['content'] == 'hi group');
    expect(m['content'], 'hi group');
    expect(m['sender']['name'], 'Dart Tester');
    await api.message('post', m['id'], '/react', {'emoji': '👍'});
    await api.message('put', m['id'], '', {'content': 'edited'});
    await api.message('put', m['id'], '/pin');
    await api.message('post', m['id'], '/save');
    await api.message('post', m['id'], '/replies', {'content': 'reply'});
    final th = Api.unwrap(await api.message('get', m['id'], '/thread'));
    expect((th['replies'] as List).length, 1);
    final saved = Api.unwrap(await api.get('/messages/saved'));
    expect((saved['saved'] ?? saved['messages']), isNotEmpty);
    final pinned = Api.unwrap(await api.get('/messages/pinned', query: {'conversationId': convId}));
    expect(pinned['messages'], isNotEmpty);
    final convs = Api.unwrap(await api.get('/conversations'));
    expect((convs['conversations'] as List).first['title'], 'Dart group');
    await api.put('/conversations/$convId/mute');
    await api.message('delete', m['id']);
  }, skip: skip);

  test('misc: notifications, files, search, plans, profile, status', () async {
    final n = Api.unwrap(await api.get('/notifications', query: {'limit': 1}));
    expect(n['unreadCount'], isA<int>());
    final f = Api.unwrap(await api.get('/files', query: {'scope': 'mine'}));
    expect(f['files'], isA<List>());
    await api.get('/files/storage/summary');
    final s = Api.unwrap(await api.get('/search', query: {'q': 'Dart'}));
    expect(s['results'], isA<Map>());
    final pl = Api.unwrap(await api.get('/subscriptions/plans'));
    expect(pl['plans'], isNotEmpty);
    await Session.instance.updateProfile({'name': 'Dart Tester', 'title': 'QA', 'department': 'Eng'});
    await api.put('/auth/status', {'customStatus': 'testing', 'statusEmoji': '🧪'});
    final st = Api.unwrap(await api.get('/tasks/stats/summary'));
    expect(st['inProgress'], 1);
    await api.get('/meetings', query: {'status': 'ended', 'limit': 100});
  }, skip: skip);

  test('socket: connects, joins room, receives participants + chat', () async {
    final ss = SocketService.instance..disconnect()..connect();
    final s = ss.socket!;
    s.on('connect_error', (e) => print('connect_error: $e'));
    s.on('disconnect', (r) => print('disconnect: $r'));
    await Future.any([
      Future.doWhile(() async { await Future.delayed(const Duration(milliseconds: 100)); return !s.connected; }),
      Future.delayed(const Duration(seconds: 8)),
    ]);
    expect(s.connected, true);
    final caps = await socketRequest(s, 'mediasoup:getRouterRtpCapabilities', {'roomId': roomId});
    expect(caps['rtpCapabilities'], isNotNull);
    var gotParticipants = false, gotChat = false;
    s.on('room:participants', (_) => gotParticipants = true);
    s.on('chat:message', (_) => gotChat = true);
    s.on('error', (d) => print('socket error event: $d'));
    s.emit('room:join', {'roomId': roomId});
    await Future.delayed(const Duration(seconds: 2));
    expect(gotParticipants, true);
    s.emit('chat:send', {'roomId': roomId, 'content': 'from dart'});
    await Future.delayed(const Duration(seconds: 1));
    expect(gotChat, true);
    final tr = await socketRequest(s, 'mediasoup:createWebRtcTransport', {'roomId': roomId, 'direction': 'recv'});
    expect(tr['transportParams']['id'], isNotNull);
    ss.disconnect();
  }, skip: skip);
}
