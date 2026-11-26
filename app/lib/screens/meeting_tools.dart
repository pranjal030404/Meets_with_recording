import 'dart:convert';
import 'dart:io' show File;
import 'dart:ui' as ui;
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import '../core/config.dart';
import '../core/meeting_controller.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// Same list the web app offers (frontend/src/lib/languages.js).
const captionLanguages = [
  'English', 'Hindi', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Japanese',
  'Korean', 'Chinese (Simplified)', 'Arabic', 'Russian', 'Bengali', 'Tamil', 'Telugu', 'Marathi',
];

// ---------------------------------------------------------------------------
// Whiteboard
// ---------------------------------------------------------------------------
const _boardSize = Size(1600, 900);
const _penColors = ['#000000', '#E5484D', '#2563EB', '#16A34A', '#F59E0B'];

Color _hex(String value) => Color(0xFF000000 | (int.tryParse(value.replaceFirst('#', ''), radix: 16) ?? 0));

class WhiteboardScreen extends StatefulWidget {
  final MeetingController c;
  const WhiteboardScreen({super.key, required this.c});
  @override
  State<WhiteboardScreen> createState() => _WhiteboardScreenState();
}

const _boardTools = [
  ('pen', Icons.edit, 'Pen'),
  ('line', Icons.horizontal_rule, 'Line'),
  ('rect', Icons.crop_square, 'Rectangle'),
  ('ellipse', Icons.circle_outlined, 'Ellipse'),
  ('text', Icons.text_fields, 'Text'),
  ('eraser', Icons.cleaning_services_outlined, 'Eraser'),
];
const _shapes = {'line', 'rect', 'ellipse'};

class _WhiteboardScreenState extends State<WhiteboardScreen> {
  String _color = _penColors.first;
  String _tool = 'pen';
  Offset? _last;
  final ValueNotifier<BoardStroke?> _preview = ValueNotifier(null); // shape being dragged

  @override
  void dispose() {
    _preview.dispose();
    super.dispose();
  }

  BoardStroke _stroke(Offset from, Offset to) =>
      BoardStroke(from.dx, from.dy, to.dx, to.dy, _color, _tool == 'eraser' ? 36 : 4, _tool);

  void _update(Offset to) {
    final from = _last;
    if (from == null || _tool == 'text') return;
    if (_shapes.contains(_tool)) {
      _preview.value = _stroke(from, to);
    } else {
      widget.c.drawStroke(_stroke(from, to));
      _last = to;
    }
  }

  void _end() {
    final shape = _preview.value;
    if (shape != null) widget.c.drawStroke(shape);
    _preview.value = null;
    _last = null;
  }

  Future<void> _placeText(Offset at) async {
    final text = (await promptText(context, 'Text', hint: 'Type something', ok: 'Add'))?.trim() ?? '';
    if (text.isNotEmpty) widget.c.drawStroke(BoardStroke(at.dx, at.dy, at.dx, at.dy, _color, 4, 'text', text));
  }

  Future<void> _save() async {
    try {
      final recorder = ui.PictureRecorder();
      _BoardPainter(widget.c, _preview).paint(Canvas(recorder), _boardSize);
      final picture = recorder.endRecording();
      final image = await picture.toImage(_boardSize.width.toInt(), _boardSize.height.toInt());
      final png = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      picture.dispose();
      final saved = await FilePicker.saveFile(
          fileName: 'whiteboard-${DateTime.now().millisecondsSinceEpoch}.png', bytes: png!.buffer.asUint8List(), mimeType: 'image/png');
      if (saved != null && mounted) toast(context, 'Whiteboard saved');
    } catch (e) {
      if (mounted) toast(context, 'Could not save the whiteboard: $e', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Whiteboard'), actions: [
        IconButton(tooltip: 'Save as image', icon: const Icon(Icons.download), onPressed: _save),
        IconButton(
          tooltip: 'Clear for everyone',
          icon: const Icon(Icons.delete_outline),
          onPressed: () async {
            if (await confirm(context, 'Clear the whiteboard for everyone?', ok: 'Clear', danger: true)) widget.c.clearBoard();
          },
        ),
      ]),
      body: SafeArea(
        child: Column(children: [
          Expanded(
            child: Center(
              child: AspectRatio(
                aspectRatio: _boardSize.width / _boardSize.height,
                child: LayoutBuilder(builder: (context, box) {
                  Offset toBoard(Offset p) => p * (_boardSize.width / box.maxWidth);
                  return GestureDetector(
                    onTapUp: _tool == 'text' ? (d) => _placeText(toBoard(d.localPosition)) : null,
                    onPanDown: (d) => _last = toBoard(d.localPosition),
                    onPanUpdate: (d) => _update(toBoard(d.localPosition)),
                    onPanEnd: (_) => _end(),
                    onPanCancel: () => _preview.value = null,
                    child: ClipRect(
                      child: CustomPaint(size: Size.infinite, painter: _BoardPainter(widget.c, _preview)),
                    ),
                  );
                }),
              ),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (final (id, icon, label) in _boardTools)
                IconButton(
                  tooltip: label,
                  isSelected: _tool == id,
                  style: IconButton.styleFrom(backgroundColor: _tool == id ? Theme.of(context).colorScheme.primaryContainer : null),
                  onPressed: () => setState(() => _tool = id),
                  icon: Icon(icon),
                ),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (final color in _penColors)
                Semantics(
                  button: true,
                  label: 'Pen colour $color',
                  child: GestureDetector(
                    onTap: () => setState(() {
                      _color = color;
                      if (_tool == 'eraser') _tool = 'pen';
                    }),
                    child: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 6),
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: _hex(color),
                        shape: BoxShape.circle,
                        border: Border.all(color: _tool != 'eraser' && _color == color ? Colors.white : Colors.white24, width: _tool != 'eraser' && _color == color ? 3 : 1),
                      ),
                    ),
                  ),
                ),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _BoardPainter extends CustomPainter {
  final MeetingController c;
  final ValueNotifier<BoardStroke?> preview;
  _BoardPainter(this.c, this.preview) : super(repaint: Listenable.merge([c.boardVersion, preview]));

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = Colors.white);
    canvas.scale(size.width / _boardSize.width);
    for (final s in [...c.board, ?preview.value]) {
      final color = s.tool == 'eraser' ? Colors.white : _hex(s.color);
      final paint = Paint()
        ..color = color
        ..strokeWidth = s.width
        ..strokeCap = StrokeCap.round
        ..style = PaintingStyle.stroke;
      final from = Offset(s.x0, s.y0), to = Offset(s.x1, s.y1);
      switch (s.tool) {
        case 'rect':
          canvas.drawRect(Rect.fromPoints(from, to), paint);
        case 'ellipse':
          canvas.drawOval(Rect.fromPoints(from, to), paint);
        case 'text':
          // same size rule as the web board
          final painter = TextPainter(
            text: TextSpan(text: s.text, style: TextStyle(color: color, fontSize: 16 + s.width * 4)),
            textDirection: TextDirection.ltr,
          )..layout();
          painter.paint(canvas, from);
          painter.dispose();
        default:
          canvas.drawLine(from, to, paint);
      }
    }
  }

  @override
  bool shouldRepaint(_BoardPainter old) => old.c != c;
}

// ---------------------------------------------------------------------------
// Breakout rooms
// ---------------------------------------------------------------------------
class BreakoutSheet extends StatefulWidget {
  final MeetingController c;
  const BreakoutSheet({super.key, required this.c});
  @override
  State<BreakoutSheet> createState() => _BreakoutSheetState();
}

class _BreakoutSheetState extends State<BreakoutSheet> {
  List<Map<String, dynamic>>? _rooms;
  int _count = 2;
  final Map<String, int> _assignment = {}; // userId -> room index
  bool _busy = false;
  VoidCallback? _unsubscribe;

  MeetingController get c => widget.c;

  @override
  void initState() {
    super.initState();
    _unsubscribe = c.listen('breakout:changed', (_) => _load());
    _load();
  }

  @override
  void dispose() {
    _unsubscribe?.call();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final rooms = await c.breakoutRooms();
      if (mounted) setState(() => _rooms = rooms);
    } catch (e) {
      if (mounted) {
        setState(() => _rooms = []);
        toast(context, 'Could not load breakout rooms: $e', error: true);
      }
    }
  }

  Future<void> _run(Future<void> Function() action, String done) async {
    setState(() => _busy = true);
    try {
      await action();
      await _load();
      if (mounted) toast(context, done);
    } catch (e) {
      if (mounted) toast(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  int _roomOf(String userId, int index) => (_assignment[userId] ?? index) % _count;

  String _name(String userId) => userId == c.myId ? c.myName : (c.peers[userId]?.name ?? 'Participant');

  @override
  Widget build(BuildContext context) {
    final rooms = _rooms;
    final people = c.peers.values.toList();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        Text('Breakout rooms', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        if (c.inBreakout)
          FilledButton.icon(
            onPressed: () { Navigator.pop(context); c.returnToMainRoom(); },
            icon: const Icon(Icons.logout),
            label: const Text('Return to main room'),
          ),
        if (rooms == null) const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
        if (rooms != null && rooms.isEmpty && !c.isManager)
          const Padding(padding: EdgeInsets.all(16), child: Text('No breakout rooms are open.')),
        for (final room in rooms ?? const <Map<String, dynamic>>[])
          Card(
            child: ListTile(
              title: Text('${room['name']}${room['assignedToMe'] == true ? ' · your room' : ''}'),
              subtitle: Text(((room['assignedParticipants'] as List?) ?? []).map((p) => _name(p['userId'].toString())).join(', ')),
              trailing: FilledButton.tonal(
                onPressed: () { Navigator.pop(context); c.joinBreakout(room); },
                child: const Text('Join'),
              ),
            ),
          ),
        if (c.isManager && (rooms?.isNotEmpty ?? false))
          TextButton(
            onPressed: _busy ? null : () => _run(c.closeBreakoutRooms, 'Breakout rooms closed'),
            child: const Text('Close all rooms', style: TextStyle(color: AppTheme.overdue)),
          ),
        if (c.isManager && !c.inBreakout) ...[
          const Divider(height: 32),
          Row(children: [
            Expanded(child: Text((rooms?.isNotEmpty ?? false) ? 'Replace with new rooms' : 'Number of rooms')),
            IconButton(onPressed: _count > 1 ? () => setState(() => _count--) : null, icon: const Icon(Icons.remove_circle_outline), tooltip: 'Fewer rooms'),
            Text('$_count', style: const TextStyle(fontSize: 18)),
            IconButton(onPressed: _count < 10 ? () => setState(() => _count++) : null, icon: const Icon(Icons.add_circle_outline), tooltip: 'More rooms'),
          ]),
          if (people.isEmpty) const Text('Nobody else is in the meeting yet. Rooms will be empty.'),
          for (var i = 0; i < people.length; i++)
            Row(children: [
              Expanded(child: Text(people[i].name, overflow: TextOverflow.ellipsis)),
              DropdownButton<int>(
                value: _roomOf(people[i].userId, i),
                items: [for (var r = 0; r < _count; r++) DropdownMenuItem(value: r, child: Text('Room ${r + 1}'))],
                onChanged: (r) => setState(() => _assignment[people[i].userId] = r ?? 0),
              ),
            ]),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy
                ? null
                : () => _run(
                      () => c.openBreakoutRooms([
                        for (var r = 0; r < _count; r++)
                          [for (var i = 0; i < people.length; i++) if (_roomOf(people[i].userId, i) == r) people[i].userId],
                      ]),
                      'Breakout rooms are open',
                    ),
            child: const Text('Open breakout rooms'),
          ),
        ],
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Caption translation and live stream
// ---------------------------------------------------------------------------
void showTranslationPicker(BuildContext context, MeetingController c) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => SafeArea(
      child: SizedBox(
        height: MediaQuery.of(ctx).size.height * 0.7,
        child: ListView(children: [
          const ListTile(
            title: Text('Translate captions to', style: TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('Only you see the translation. Captions appear while live transcription is on.'),
          ),
          for (final language in ['', ...captionLanguages])
            ListTile(
              title: Text(language.isEmpty ? 'Off' : language),
              trailing: c.translateTo == language ? const Icon(Icons.check) : null,
              onTap: () {
                c.setTranslateTo(language);
                Navigator.pop(ctx);
              },
            ),
        ]),
      ),
    ),
  );
}

void showLiveStreamSheet(BuildContext context, MeetingController c) {
  final link = '${Config.serverUrl}/meeting/${c.parentRoomId}?viewOnly=1';
  showModalBottomSheet(
    context: context,
    builder: (ctx) => SafeArea(
      child: ListenableBuilder(
        listenable: c,
        builder: (ctx, _) {
          final stream = c.stream;
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(stream != null ? 'Live, started by ${stream['startedBy']}' : 'Not streaming', style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 8),
              const Text('A view-only link lets an audience watch and listen without turning on a mic or camera.'),
              if (stream != null) ...[
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: link));
                    toast(ctx, 'View-only link copied');
                  },
                  icon: const Icon(Icons.copy),
                  label: const Text('Copy view-only link'),
                ),
              ],
              if (c.isManager) ...[
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => c.setStreaming(stream == null),
                  child: Text(stream == null ? 'Start live stream' : 'Stop live stream'),
                ),
              ],
            ]),
          );
        },
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Host settings and attendance
// ---------------------------------------------------------------------------
void showMeetingSettings(BuildContext context, MeetingController c) {
  // key, label, needs "host management" to have any effect
  const rows = [
    ('hostManagement', 'Host management', false),
    ('allowScreenShare', 'Participants can share their screen', true),
    ('allowReactions', 'Participants can send reactions', true),
    ('allowMic', 'Participants can turn on their microphone', true),
    ('allowVideo', 'Participants can turn on their video', true),
    ('allowAddOns', 'Participants can use whiteboard and notes', true),
    ('allowChat', 'Participants can send messages', false),
    ('allowRecording', 'Participants can record', false),
    ('muteOnEntry', 'Mute people when they join', false),
    ('waitingRoom', 'Waiting room', false),
    ('hostMustJoinFirst', 'Host must join before anyone else', false),
  ];
  // missing "allow" settings mean allowed; every other missing setting means off
  bool value(String key) => key.startsWith('allow') ? c.settings[key] != false : c.settings[key] == true;
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (ctx) => FractionallySizedBox(
      heightFactor: 0.85,
      child: ListenableBuilder(
        listenable: c,
        builder: (ctx, _) => ListView(children: [
          const ListTile(title: Text('Meeting settings', style: TextStyle(fontWeight: FontWeight.w600))),
          for (final (key, label, managed) in rows)
            SwitchListTile(
              title: Text(label),
              value: value(key),
              onChanged: !c.isManager || (managed && c.settings['hostManagement'] != true) ? null : (v) => c.updateSetting(key, v),
            ),
        ]),
      ),
    ),
  );
}

Future<void> saveAttendance(BuildContext context, MeetingController c) async {
  try {
    final csv = await c.attendanceCsv();
    final saved = await FilePicker.saveFile(fileName: 'attendance-${c.parentRoomId}.csv', bytes: utf8.encode(csv), mimeType: 'text/csv');
    if (saved != null && context.mounted) toast(context, 'Attendance report saved');
  } catch (e) {
    if (context.mounted) toast(context, 'Could not save attendance: $e', error: true);
  }
}

// ---------------------------------------------------------------------------
// Camera background
// ---------------------------------------------------------------------------
typedef ApplyBackground = Future<void> Function(String mode, [String? imagePath]);

/// [apply] saves the choice and puts it on whichever camera is open (in the call or on the preview).
void showBackgroundPicker(BuildContext context, ApplyBackground apply) {
  showModalBottomSheet(
    context: context,
    builder: (ctx) {
      Widget option(String mode, IconData icon, String label, Future<void> Function() choose) => ListTile(
            leading: Icon(icon),
            title: Text(label),
            trailing: Config.backgroundMode == mode ? const Icon(Icons.check) : null,
            onTap: () async {
              Navigator.pop(ctx);
              await choose();
            },
          );
      return SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const ListTile(title: Text('Background effects', style: TextStyle(fontWeight: FontWeight.w600)), subtitle: Text('Applies to your camera. Others only see the result.')),
          option('off', Icons.block, 'None', () => apply('off')),
          option('blur', Icons.blur_on, 'Blur', () => apply('blur')),
          option('image', Icons.image_outlined, 'Choose a picture', () => _pickBackground(context, apply)),
        ]),
      );
    },
  );
}

Future<void> _pickBackground(BuildContext context, ApplyBackground apply) async {
  try {
    final picked = await FilePicker.pickFiles(type: FileType.image);
    final path = picked.isEmpty ? null : picked.first.path;
    if (path == null) return;
    // keep our own copy: the picker's file is temporary
    final dir = await getApplicationSupportDirectory();
    final saved = await File(path).copy('${dir.path}/background-${DateTime.now().millisecondsSinceEpoch}');
    await apply('image', saved.path);
  } catch (e) {
    if (context.mounted) toast(context, 'Could not use that picture: $e', error: true);
  }
}
