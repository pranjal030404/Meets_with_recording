import 'dart:async';
import 'package:flutter/material.dart';
import '../core/theme.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import '../core/config.dart';
import '../core/meeting_controller.dart';
import '../core/session.dart';
import '../widgets/common.dart';
import 'meeting_panels.dart';
import 'meeting_tools.dart';

class MeetingScreen extends StatefulWidget {
  final String roomId;
  final bool startMic;
  final bool startCam;
  final bool viewOnly;
  const MeetingScreen({super.key, required this.roomId, this.startMic = false, this.startCam = false, this.viewOnly = false});
  @override
  State<MeetingScreen> createState() => _MeetingScreenState();
}

class _MeetingScreenState extends State<MeetingScreen> {
  late final MeetingController c;
  static const _pipChannel = MethodChannel('minutes/pip');
  bool _pip = false; // showing as a floating window
  String? _callState; // last state sent to Android
  bool _hideSelf = false;
  bool _mirrorSelf = true;
  bool _speaker = true;
  bool _showControls = true;
  String? _lastInfo;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    c = MeetingController(widget.roomId, startMic: widget.startMic, startCam: widget.startCam, viewOnly: widget.viewOnly);
    c.addListener(_onChange);
    _pipChannel.setMethodCallHandler((call) async {
      if (!mounted) return;
      // buttons on the floating window
      if (call.method == 'pipAction') {
        if (call.arguments == 'mic') c.toggleMic();
        if (call.arguments == 'leave') _leaveFromPip();
        return;
      }
      if (call.method != 'pipChanged') return;
      final inPip = call.arguments == true;
      // sheets and dialogs would fill the tiny window
      if (inPip) Navigator.of(context).popUntil((r) => r.settings.name == 'meeting' || r.isFirst);
      setState(() => _pip = inPip);
    });
    c.join().then((_) => c.toggleSpeaker(true));
    WakelockPlus.enable();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && c.timer != null) setState(() {});
    });
  }

  /// Tell Android about the call: whether to keep it alive in the background, and whether to pop out
  /// when the person leaves the app (not while presenting, since the window would be in the shared
  /// picture, nor while Android's capture permission dialog is opening).
  void _syncCall() {
    if (_finished) return;
    final inCall = c.phase == RoomPhase.connected;
    final pop = inCall && !c.screenSharing && !c.screenShareBusy && !c.recordingBusy;
    final state = '$inCall $pop ${c.micOn} ${c.camOn}';
    if (state == _callState) return;
    _callState = state;
    _android('update', {'inCall': inCall, 'pop': pop, 'micOn': c.micOn});
  }

  /// Not left to dispose(): Flutter draws no frames in the background, so the screen stays mounted
  /// (and the call service running) until the app is opened again.
  void _endAndroidCall() {
    _android('update', {'inCall': false, 'pop': false, 'micOn': false});
    _android('close');
  }

  /// No-op on platforms without the Android side.
  void _android(String method, [Object? args]) {
    _pipChannel.invokeMethod(method, args).catchError((_) {});
  }

  Future<void> _leaveFromPip() async {
    _finished = true;
    _endAndroidCall();
    await c.leave();
    if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
  }

  void _onChange() {
    if (!mounted) return;
    _syncCall();
    final info = c.infoMessage;
    if (info != null && info != _lastInfo) {
      _lastInfo = info;
      toast(context, info);
      c.infoMessage = null;
      _lastInfo = null;
    }
    if (c.switchTo != null && !_switching) {
      _switchRoom(c.switchTo!);
      return;
    }
    if (c.phase == RoomPhase.ended) {
      _finish(c.error ?? 'The meeting has ended.');
    }
    setState(() {});
  }

  bool _switching = false;
  Future<void> _switchRoom(String roomId) async {
    _switching = true;
    _finished = true;
    final nav = Navigator.of(context);
    final mic = c.micOn, cam = c.camOn;
    // no REST leave: moving to a breakout room must not mark you as having left the meeting
    await c.leave(notifyServer: false);
    if (!mounted) return;
    nav.popUntil((r) => r.settings.name == 'meeting' || r.isFirst);
    nav.pushReplacement(MaterialPageRoute(
      settings: const RouteSettings(name: 'meeting'),
      builder: (_) => MeetingScreen(roomId: roomId, startMic: mic, startCam: cam, viewOnly: widget.viewOnly),
    ));
  }

  bool _finished = false;
  Future<void> _finish(String msg) async {
    if (_finished) return;
    _finished = true;
    _endAndroidCall();
    await c.leave(notifyServer: false);
    if (!mounted) return;
    Navigator.of(context).popUntil((r) => r.isFirst);
    toast(context, msg);
  }

  Future<void> _leave() async {
    if (!await confirm(context, 'Leave meeting?', ok: 'Leave', danger: true)) return;
    _finished = true;
    await c.leave();
    if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  void dispose() {
    _ticker?.cancel();
    // the next room's screen is already keeping the display on
    if (!_switching) WakelockPlus.disable();
    c.removeListener(_onChange);
    // when moving between rooms the next screen takes the channel over
    if (!_switching) {
      _pipChannel.setMethodCallHandler(null);
      _android('update', {'inCall': false, 'pop': false, 'micOn': false});
    }
    c.dispose();
    super.dispose();
  }

  // ------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _leave();
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF121110),
        body: SafeArea(child: _body()),
      ),
    );
  }

  Widget _body() {
    if (_pip && c.phase == RoomPhase.connected) return _pipView();
    switch (c.phase) {
      case RoomPhase.connecting:
        return _center(const CircularProgressIndicator(), 'Joining meeting…');
      case RoomPhase.waiting:
        return _center(const Icon(Icons.hourglass_top, size: 48, color: Colors.white70), 'Waiting for the host to let you in…', action: TextButton(onPressed: _leave, child: const Text('Cancel')));
      case RoomPhase.failed:
        return _center(const Icon(Icons.error_outline, size: 48, color: AppTheme.overdue), c.error ?? 'Could not join the meeting',
            action: FilledButton(onPressed: () { c.leave(notifyServer: false); Navigator.pop(context); }, child: const Text('Back')));
      case RoomPhase.ended:
        return _center(const Icon(Icons.call_end, size: 48, color: Colors.white70), 'Meeting ended');
      case RoomPhase.connected:
        return _room();
    }
  }

  /// The floating window: just whoever matters most right now.
  Widget _pipView() {
    final peers = c.peers.values.toList();
    final sharer = peers.cast<Peer?>().firstWhere((p) => p!.screen != null, orElse: () => null);
    final focus = sharer ??
        c.peers[c.spotlightUserId ?? c.pinnedUserId] ??
        peers.cast<Peer?>().firstWhere((p) => p!.speaking, orElse: () => null) ??
        (peers.isEmpty ? null : peers.first);
    return focus == null ? _selfTile() : _peerTile(focus, forceScreen: focus == sharer);
  }

  Widget _center(Widget icon, String text, {Widget? action}) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            icon,
            const SizedBox(height: 16),
            Text(text, style: const TextStyle(color: Colors.white, fontSize: 16), textAlign: TextAlign.center),
            if (action != null) ...[const SizedBox(height: 16), action],
          ]),
        ),
      );

  // ------------------------------------------------------------------
  Widget _room() {
    final peers = c.peers.values.toList();
    // Screen share takes over the stage.
    final sharer = peers.cast<Peer?>().firstWhere((p) => p!.screen != null, orElse: () => null);
    final spot = c.spotlightUserId ?? c.pinnedUserId;
    final featured = sharer ?? (spot != null ? c.peers[spot] : null);

    return GestureDetector(
      onTap: () => setState(() => _showControls = !_showControls),
      child: Stack(children: [
        Positioned.fill(child: featured != null ? _featuredLayout(featured, peers, isShare: sharer != null) : _gridLayout(peers)),
        // top bar
        if (_showControls) Positioned(top: 0, left: 0, right: 0, child: _topBar()),
        // reactions
        Positioned(left: 12, bottom: 120, child: _reactions()),
        // captions
        if (c.caption != null)
          Positioned(left: 16, right: 16, bottom: 110, child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Colors.black87, borderRadius: BorderRadius.circular(8)),
            child: Text('${c.captionBy ?? ''}: ${c.caption}', style: const TextStyle(color: Colors.white), textAlign: TextAlign.center),
          )),
        // waiting room banner for hosts
        if (c.isManager && c.waiting.isNotEmpty) Positioned(top: 60, left: 12, right: 12, child: _waitingBanner()),
        // stays visible even with the controls hidden: nobody should share without knowing
        if (c.screenSharing) Positioned(left: 12, right: 12, bottom: 96, child: _sharingBanner()),
        if (c.inBreakout) Positioned(top: 60, left: 12, right: 12, child: _breakoutBanner(
              'You are in a breakout room', 'Return', c.returnToMainRoom)),
        if (c.assignedRoom != null) Positioned(top: 60, left: 12, right: 12, child: _breakoutBanner(
              'You are assigned to ${c.assignedRoom!['name']}', 'Join', () => c.joinBreakout(c.assignedRoom!), onClose: c.dismissAssignment)),
        if (_showControls) Positioned(left: 0, right: 0, bottom: 0, child: _controls()),
      ]),
    );
  }

  Widget _topBar() {
    final m = c.meeting;
    final t = c.timer;
    String? timerText;
    if (t != null) {
      final endsAt = (t['endsAt'] ?? t['endAt']);
      if (endsAt != null) {
        final end = DateTime.fromMillisecondsSinceEpoch(endsAt is num ? endsAt.toInt() : int.tryParse('$endsAt') ?? 0);
        final left = end.difference(DateTime.now());
        final s = left.isNegative ? 0 : left.inSeconds;
        timerText = '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
      }
    }
    final link = c.linkState;
    final linkColor = link == 'connected' ? AppTheme.done : (link == 'failed' || link == 'disconnected') ? AppTheme.overdue : AppTheme.inProgress;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
      decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.black87, Colors.transparent])),
      child: Row(children: [
        Icon(Icons.circle, size: 10, color: linkColor),
        const SizedBox(width: 8),
        Expanded(child: Text(m?['title']?.toString() ?? 'Meeting', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis)),
        if (c.stream != null) const Padding(padding: EdgeInsets.only(right: 8), child: Chip(label: Text('LIVE'), avatar: Icon(Icons.sensors, color: AppTheme.overdue, size: 14), visualDensity: VisualDensity.compact)),
        if (c.recording || c.recordingLocally) const Padding(padding: EdgeInsets.only(right: 8), child: Chip(label: Text('REC'), avatar: Icon(Icons.fiber_manual_record, color: AppTheme.overdue, size: 14), visualDensity: VisualDensity.compact)),
        if (timerText != null) Padding(padding: const EdgeInsets.only(right: 8), child: Chip(label: Text(timerText), avatar: const Icon(Icons.timer, size: 14), visualDensity: VisualDensity.compact)),
        if (c.locked) const Padding(padding: EdgeInsets.only(right: 8), child: Icon(Icons.lock, color: Colors.white70, size: 18)),
        IconButton(
          tooltip: 'Copy invite link',
          icon: const Icon(Icons.link, color: Colors.white),
          onPressed: () { Clipboard.setData(ClipboardData(text: '${Config.serverUrl}/meeting/${linkRoomId(c.meeting, widget.roomId)}')); toast(context, 'Invite link copied'); },
        ),
        if (c.camOn)
          IconButton(tooltip: 'Switch camera', icon: const Icon(Icons.cameraswitch, color: Colors.white), onPressed: c.switchCamera),
        IconButton(
          tooltip: 'Speaker',
          icon: Icon(_speaker ? Icons.volume_up : Icons.hearing, color: Colors.white),
          onPressed: () { setState(() => _speaker = !_speaker); c.toggleSpeaker(_speaker); },
        ),
      ]),
    );
  }

  Widget _breakoutBanner(String text, String action, VoidCallback onTap, {VoidCallback? onClose}) => Card(
        color: Colors.black87,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 8, 4),
          child: Row(children: [
            Expanded(child: Text(text, style: const TextStyle(color: Colors.white))),
            FilledButton(onPressed: onTap, child: Text(action)),
            if (onClose != null) IconButton(onPressed: onClose, tooltip: 'Dismiss', icon: const Icon(Icons.close, color: Colors.white70)),
          ]),
        ),
      );

  Widget _sharingBanner() => Card(
        color: Colors.black87,
        child: ListTile(
          dense: true,
          leading: const Icon(Icons.screen_share, color: AppTheme.done),
          title: const Text('You are sharing your screen', style: TextStyle(color: Colors.white)),
          trailing: FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppTheme.overdue, foregroundColor: Colors.white),
            onPressed: c.stopScreenShare,
            child: const Text('Stop'),
          ),
        ),
      );

  Widget _waitingBanner() => Card(
        color: Colors.black87,
        child: Column(children: c.waiting
            .map((w) => ListTile(
                  dense: true,
                  title: Text('${w.name} wants to join', style: const TextStyle(color: Colors.white)),
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    TextButton(onPressed: () => c.deny(w), child: const Text('Deny')),
                    FilledButton(onPressed: () => c.admit(w), child: const Text('Admit')),
                  ]),
                ))
            .toList()),
      );

  Widget _reactions() => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: c.reactions.reversed.take(4).map((r) => Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(14)),
              child: Text('${r.emoji} ${r.name}', style: const TextStyle(color: Colors.white)),
            )).toList(),
      );

  // ------------------------------------------------------------------ layouts
  Widget _gridLayout(List<Peer> peers) {
    final tiles = <Widget>[if (!_hideSelf || peers.isEmpty) _selfTile(), ...peers.map(_peerTile)];
    final n = tiles.length;
    if (n == 1) return Padding(padding: const EdgeInsets.fromLTRB(8, 56, 8, 100), child: tiles.first);
    final cols = n <= 4 ? (n == 1 ? 1 : 2) : (n <= 9 ? 3 : 4);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 56, 8, 100),
      child: LayoutBuilder(builder: (context, box) {
        final rows = (n / cols).ceil();
        final w = box.maxWidth / cols;
        final h = box.maxHeight / rows;
        return SingleChildScrollView(
          physics: n > 12 ? null : const NeverScrollableScrollPhysics(),
          child: Wrap(children: tiles.map((t) => SizedBox(width: w, height: n > 12 ? w * 1.1 : h, child: Padding(padding: const EdgeInsets.all(3), child: t))).toList()),
        );
      }),
    );
  }

  Widget _featuredLayout(Peer p, List<Peer> all, {required bool isShare}) {
    final others = all.where((x) => x != p).toList();
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 56, 8, 100),
      child: Column(children: [
        Expanded(child: _peerTile(p, big: true, forceScreen: isShare)),
        const SizedBox(height: 8),
        SizedBox(
          height: 110,
          child: ListView(scrollDirection: Axis.horizontal, children: [
            if (!_hideSelf) SizedBox(width: 90, child: Padding(padding: const EdgeInsets.all(3), child: _selfTile())),
            ...others.map((o) => SizedBox(width: 90, child: Padding(padding: const EdgeInsets.all(3), child: _peerTile(o)))),
          ]),
        ),
      ]),
    );
  }

  Widget _tileFrame({required Widget child, required String label, bool muted = false, bool hand = false, bool speaking = false, VoidCallback? onLongPress, VoidCallback? onTap}) {
    return GestureDetector(
      onLongPress: onLongPress,
      onDoubleTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF211F1D),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: speaking ? AppTheme.done : Colors.transparent, width: 2.5),
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(fit: StackFit.expand, children: [
          child,
          Positioned(
            left: 6,
            bottom: 6,
            right: 6,
            child: Row(children: [
              Flexible(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(8)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    if (muted) const Padding(padding: EdgeInsets.only(right: 4), child: Icon(Icons.mic_off, size: 13, color: AppTheme.overdue)),
                    Flexible(child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 12), overflow: TextOverflow.ellipsis)),
                  ]),
                ),
              ),
              if (hand) const Padding(padding: EdgeInsets.only(left: 4), child: Text('✋', style: TextStyle(fontSize: 18))),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _avatarFill(String name, String? url) => Center(child: UserAvatar(name: name, url: url, radius: _pip ? 20 : 34));

  Widget _selfTile() {
    final show = c.camOn && c.localRenderer != null;
    return _tileFrame(
      label: 'You',
      muted: !c.micOn,
      hand: c.handRaised,
      child: show ? RTCVideoView(c.localRenderer!, mirror: c.frontCamera && _mirrorSelf, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover) : _avatarFill(c.myName, Session.instance.user?['avatar']?.toString()),
    );
  }

  Widget _peerTile(Peer p, {bool big = false, bool forceScreen = false}) {
    final r = forceScreen && p.screen != null ? p.screen : p.video;
    final show = r != null && (!p.videoOff || forceScreen);
    return _tileFrame(
      label: p.name + (forceScreen ? ' (screen)' : ''),
      muted: p.muted,
      hand: p.handRaised,
      speaking: p.speaking,
      onTap: () => c.pin(p.userId),
      onLongPress: () => _peerMenu(p),
      child: show
          ? RTCVideoView(r, objectFit: forceScreen ? RTCVideoViewObjectFit.RTCVideoViewObjectFitContain : RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)
          : _avatarFill(p.name, p.avatar),
    );
  }

  void _peerMenu(Peer p) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(title: Text(p.name, style: const TextStyle(fontWeight: FontWeight.w500)), subtitle: Text(p.role)),
          ListTile(leading: const Icon(Icons.push_pin_outlined), title: Text(c.pinnedUserId == p.userId ? 'Unpin' : 'Pin'), onTap: () { Navigator.pop(ctx); c.pin(p.userId); }),
          if (c.isManager) ...[
            ListTile(leading: const Icon(Icons.center_focus_strong), title: const Text('Spotlight for everyone'), onTap: () { Navigator.pop(ctx); c.spotlight(c.spotlightUserId == p.userId ? null : p); }),
            ListTile(leading: const Icon(Icons.mic_off), title: const Text('Mute'), onTap: () { Navigator.pop(ctx); c.muteUser(p); }),
            ListTile(leading: const Icon(Icons.videocam_off), title: const Text('Turn camera off'), onTap: () { Navigator.pop(ctx); c.videoOffUser(p); }),
            ListTile(leading: const Icon(Icons.record_voice_over), title: const Text('Ask to unmute'), onTap: () { Navigator.pop(ctx); c.requestUnmute(p); }),
            if (c.isHost && p.role != 'co-host') ListTile(leading: const Icon(Icons.shield_outlined), title: const Text('Make co-host'), onTap: () { Navigator.pop(ctx); c.makeCohost(p); }),
            if (c.isHost && p.role == 'co-host') ListTile(leading: const Icon(Icons.remove_moderator_outlined), title: const Text('Remove co-host'), onTap: () { Navigator.pop(ctx); c.removeCohost(p); }),
            ListTile(leading: const Icon(Icons.person_remove, color: AppTheme.overdue), title: const Text('Remove from meeting', style: TextStyle(color: AppTheme.overdue)), onTap: () { Navigator.pop(ctx); c.removeUser(p); }),
          ],
        ]),
      ),
    );
  }

  // ------------------------------------------------------------------ controls
  Widget _controls() {
    Widget btn(IconData icon, String tip, VoidCallback? onTap, {bool active = true, Color? bg, int badge = 0}) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: Badge(
          isLabelVisible: badge > 0,
          label: Text('$badge'),
          child: IconButton.filled(
            tooltip: tip,
            style: IconButton.styleFrom(
              backgroundColor: bg ?? (active ? Colors.white12 : Colors.white),
              foregroundColor: active || bg != null ? Colors.white : Colors.black,
              minimumSize: const Size(46, 46),
            ),
            onPressed: onTap,
            icon: Icon(icon),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(8, 24, 8, 12),
      decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [Colors.black87, Colors.transparent])),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          if (!widget.viewOnly) ...[
            btn(c.micOn ? Icons.mic : Icons.mic_off, 'Mic', c.toggleMic, active: c.micOn),
            btn(c.camOn ? Icons.videocam : Icons.videocam_off, 'Camera', c.toggleCam, active: c.camOn),
            if (c.canShareScreen)
              btn(c.screenSharing ? Icons.stop_screen_share : Icons.screen_share, c.screenSharing ? 'Stop sharing' : 'Share screen',
                  c.screenShareBusy ? null : c.toggleScreenShare, bg: c.screenSharing ? AppTheme.overdue : null),
            btn(Icons.back_hand, 'Raise hand', c.toggleHand, bg: c.handRaised ? Colors.amber.shade800 : null),
          ],
          btn(Icons.chat_bubble_outline, 'Chat', () => _openPanel(MeetingPanel.chat), badge: c.unreadChat),
          btn(Icons.more_horiz, 'More', _moreMenu, badge: c.waiting.length),
          btn(Icons.call_end, 'Leave', _leave, bg: AppTheme.overdue),
        ]),
      ),
    );
  }

  void _reactMenu() {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Wrap(
            spacing: 12,
            runSpacing: 12,
            alignment: WrapAlignment.center,
            children: ['👍', '👏', '❤️', '😂', '😮', '🎉', '🙏', '🔥'].map((e) => InkWell(
                  onTap: () { Navigator.pop(ctx); c.sendReaction(e); },
                  child: Padding(padding: const EdgeInsets.all(8), child: Text(e, style: const TextStyle(fontSize: 34))),
                )).toList(),
          ),
        ),
      ),
    );
  }

  void _moreMenu() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ListTile(leading: const Icon(Icons.people_outline), title: Text(c.waiting.isEmpty ? 'People' : 'People (${c.waiting.length} waiting)'), onTap: () { Navigator.pop(ctx); _openPanel(MeetingPanel.people); }),
            if (!widget.viewOnly)
              ListTile(leading: const Icon(Icons.emoji_emotions_outlined), title: const Text('React'), onTap: () { Navigator.pop(ctx); _reactMenu(); }),
            ListTile(leading: const Icon(Icons.poll_outlined), title: const Text('Polls'), onTap: () { Navigator.pop(ctx); _openPanel(MeetingPanel.polls); }),
            ListTile(leading: const Icon(Icons.question_answer_outlined), title: const Text('Q&A'), onTap: () { Navigator.pop(ctx); _openPanel(MeetingPanel.qa); }),
            ListTile(leading: const Icon(Icons.sticky_note_2_outlined), title: const Text('Shared notes'), onTap: () { Navigator.pop(ctx); _openPanel(MeetingPanel.notes); }),
            ListTile(leading: const Icon(Icons.timer_outlined), title: const Text('Timer'), onTap: () { Navigator.pop(ctx); _timerDialog(); }),
            ListTile(leading: const Icon(Icons.draw_outlined), title: const Text('Whiteboard'), onTap: () { Navigator.pop(ctx); Navigator.push(context, MaterialPageRoute(builder: (_) => WhiteboardScreen(c: c))); }),
            ListTile(leading: const Icon(Icons.meeting_room_outlined), title: const Text('Breakout rooms'), onTap: () { Navigator.pop(ctx); _breakoutSheet(); }),
            ListTile(leading: const Icon(Icons.translate), title: const Text('Translate captions'), subtitle: c.translateTo.isEmpty ? null : Text(c.translateTo), onTap: () { Navigator.pop(ctx); showTranslationPicker(context, c); }),
            ListTile(leading: const Icon(Icons.sensors), title: const Text('Live stream'), onTap: () { Navigator.pop(ctx); showLiveStreamSheet(context, c); }),
            if (c.canRecordLocally && c.recordingLocally)
              ListTile(leading: const Icon(Icons.stop_circle, color: AppTheme.overdue), title: const Text('Stop recording'), onTap: () { Navigator.pop(ctx); c.stopRecording(); }),
            if (c.canRecordLocally && !c.recordingLocally) ...[
              ListTile(leading: const Icon(Icons.video_camera_back_outlined), title: const Text('Record video'), subtitle: const Text('Screen and sound'), onTap: () { Navigator.pop(ctx); c.startRecording(video: true); }),
              ListTile(leading: const Icon(Icons.mic_none), title: const Text('Record audio only'), onTap: () { Navigator.pop(ctx); c.startRecording(); }),
            ],
            ListTile(
              leading: Icon(_hideSelf ? Icons.person_outline : Icons.person_off_outlined),
              title: Text(_hideSelf ? 'Show my video tile' : 'Hide my video tile'),
              onTap: () { Navigator.pop(ctx); setState(() => _hideSelf = !_hideSelf); },
            ),
            if (c.canUseBackgrounds)
              ListTile(leading: const Icon(Icons.blur_on), title: const Text('Background effects'), onTap: () { Navigator.pop(ctx); showBackgroundPicker(context, c.setBackground); }),
            if (c.camOn)
              ListTile(leading: const Icon(Icons.flip), title: Text(_mirrorSelf ? 'Unmirror my video' : 'Mirror my video'), onTap: () { Navigator.pop(ctx); setState(() => _mirrorSelf = !_mirrorSelf); }),
            if (c.isManager) ...[
              const Divider(),
              ListTile(leading: const Icon(Icons.admin_panel_settings_outlined), title: const Text('Meeting settings'), onTap: () { Navigator.pop(ctx); showMeetingSettings(context, c); }),
              ListTile(leading: const Icon(Icons.how_to_reg_outlined), title: const Text('Save attendance report'), onTap: () { Navigator.pop(ctx); saveAttendance(context, c); }),
              ListTile(leading: const Icon(Icons.subtitles_outlined), title: Text(c.transcribing ? 'Stop transcription' : 'Start transcription'), subtitle: const Text('Captures speech from people on the web'), onTap: () { Navigator.pop(ctx); c.setTranscription(!c.transcribing); }),
              if (c.peers.values.any((p) => p.handRaised))
                ListTile(leading: const Icon(Icons.pan_tool_outlined), title: const Text('Lower all hands'), onTap: () { Navigator.pop(ctx); c.lowerHand(); }),
              ListTile(leading: const Icon(Icons.mic_off), title: const Text('Mute everyone'), onTap: () { Navigator.pop(ctx); c.muteAll(); }),
              ListTile(leading: const Icon(Icons.videocam_off), title: const Text('Turn off everyone\'s camera'), onTap: () { Navigator.pop(ctx); c.disableAllVideo(); }),
              ListTile(leading: Icon(c.locked ? Icons.lock_open : Icons.lock_outline), title: Text(c.locked ? 'Unlock meeting' : 'Lock meeting'), onTap: () { Navigator.pop(ctx); c.toggleLock(); }),
            ],
            if (c.isHost)
              ListTile(
                leading: const Icon(Icons.stop_circle_outlined, color: AppTheme.overdue),
                title: const Text('End meeting for everyone', style: TextStyle(color: AppTheme.overdue)),
                onTap: () async {
                  Navigator.pop(ctx);
                  if (await confirm(context, 'End meeting for everyone?', ok: 'End', danger: true)) c.endForAll();
                },
              ),
          ]),
        ),
      ),
    );
  }

  void _breakoutSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (ctx) => FractionallySizedBox(heightFactor: 0.85, child: BreakoutSheet(c: c)),
    );
  }

  Future<void> _timerDialog() async {
    if (c.timer != null && c.isManager) {
      if (await confirm(context, 'Stop the running timer?', ok: 'Stop')) c.stopTimer();
      return;
    }
    if (!c.isManager) {
      toast(context, c.timer != null ? 'A timer is running' : 'Only the host or a co-host can start a timer');
      return;
    }
    final v = await promptText(context, 'Timer (minutes)', hint: '5', ok: 'Start');
    final min = int.tryParse(v ?? '');
    if (min != null && min > 0) c.startTimer(min * 60, 'Timer');
  }

  void _openPanel(MeetingPanel panel) {
    if (panel == MeetingPanel.chat) c.openChat(true);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (ctx) => FractionallySizedBox(heightFactor: 0.85, child: MeetingPanelSheet(controller: c, panel: panel)),
    ).whenComplete(() {
      if (panel == MeetingPanel.chat) c.openChat(false);
    });
  }
}
