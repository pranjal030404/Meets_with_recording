import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import '../core/config.dart';
import '../core/meeting_controller.dart';
import '../widgets/common.dart';
import 'meeting_panels.dart';

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
  bool _speaker = true;
  bool _showControls = true;
  String? _lastInfo;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    c = MeetingController(widget.roomId, startMic: widget.startMic, startCam: widget.startCam, viewOnly: widget.viewOnly);
    c.addListener(_onChange);
    c.join().then((_) => c.toggleSpeaker(true));
    WakelockPlus.enable();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && c.timer != null) setState(() {});
    });
  }

  void _onChange() {
    if (!mounted) return;
    final info = c.infoMessage;
    if (info != null && info != _lastInfo) {
      _lastInfo = info;
      toast(context, info);
      c.infoMessage = null;
      _lastInfo = null;
    }
    if (c.phase == RoomPhase.ended) {
      _finish(c.error ?? 'The meeting has ended.');
    }
    setState(() {});
  }

  bool _finished = false;
  Future<void> _finish(String msg) async {
    if (_finished) return;
    _finished = true;
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
    WakelockPlus.disable();
    c.removeListener(_onChange);
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
        backgroundColor: const Color(0xFF0B0D14),
        body: SafeArea(child: _body()),
      ),
    );
  }

  Widget _body() {
    switch (c.phase) {
      case RoomPhase.connecting:
        return _center(const CircularProgressIndicator(), 'Joining meeting…');
      case RoomPhase.waiting:
        return _center(const Icon(Icons.hourglass_top, size: 48, color: Colors.white70), 'Waiting for the host to let you in…', action: TextButton(onPressed: _leave, child: const Text('Cancel')));
      case RoomPhase.failed:
        return _center(const Icon(Icons.error_outline, size: 48, color: Colors.redAccent), c.error ?? 'Could not join the meeting',
            action: FilledButton(onPressed: () { c.leave(notifyServer: false); Navigator.pop(context); }, child: const Text('Back')));
      case RoomPhase.ended:
        return _center(const Icon(Icons.call_end, size: 48, color: Colors.white70), 'Meeting ended');
      case RoomPhase.connected:
        return _room();
    }
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
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.black87, borderRadius: BorderRadius.circular(10)),
            child: Text('${c.captionBy ?? ''}: ${c.caption}', style: const TextStyle(color: Colors.white), textAlign: TextAlign.center),
          )),
        // waiting room banner for hosts
        if (c.isManager && c.waiting.isNotEmpty) Positioned(top: 60, left: 12, right: 12, child: _waitingBanner()),
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
    final linkColor = link == 'connected' ? Colors.greenAccent : (link == 'failed' || link == 'disconnected') ? Colors.redAccent : Colors.amber;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
      decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.black87, Colors.transparent])),
      child: Row(children: [
        Icon(Icons.circle, size: 10, color: linkColor),
        const SizedBox(width: 8),
        Expanded(child: Text(m?['title']?.toString() ?? 'Meeting', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis)),
        if (c.recording) const Padding(padding: EdgeInsets.only(right: 8), child: Chip(label: Text('REC'), avatar: Icon(Icons.fiber_manual_record, color: Colors.red, size: 14), visualDensity: VisualDensity.compact)),
        if (timerText != null) Padding(padding: const EdgeInsets.only(right: 8), child: Chip(label: Text(timerText), avatar: const Icon(Icons.timer, size: 14), visualDensity: VisualDensity.compact)),
        if (c.locked) const Padding(padding: EdgeInsets.only(right: 8), child: Icon(Icons.lock, color: Colors.white70, size: 18)),
        IconButton(
          tooltip: 'Copy invite link',
          icon: const Icon(Icons.link, color: Colors.white),
          onPressed: () { Clipboard.setData(ClipboardData(text: '${Config.serverUrl}/meeting/${widget.roomId}')); toast(context, 'Invite link copied'); },
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
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: Colors.black54, borderRadius: BorderRadius.circular(20)),
              child: Text('${r.emoji} ${r.name}', style: const TextStyle(color: Colors.white)),
            )).toList(),
      );

  // ------------------------------------------------------------------ layouts
  Widget _gridLayout(List<Peer> peers) {
    final tiles = <Widget>[_selfTile(), ...peers.map(_peerTile)];
    final n = tiles.length;
    if (n == 1) return Padding(padding: const EdgeInsets.fromLTRB(8, 56, 8, 100), child: tiles.first);
    final cols = n <= 4 ? (n == 1 ? 1 : 2) : (n <= 9 ? 3 : 4);
    return Padding(
      padding: const EdgeInsets.fromLTRB(6, 56, 6, 100),
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
      padding: const EdgeInsets.fromLTRB(6, 56, 6, 100),
      child: Column(children: [
        Expanded(child: _peerTile(p, big: true, forceScreen: isShare)),
        const SizedBox(height: 6),
        SizedBox(
          height: 110,
          child: ListView(scrollDirection: Axis.horizontal, children: [
            SizedBox(width: 90, child: Padding(padding: const EdgeInsets.all(3), child: _selfTile())),
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
          color: const Color(0xFF1A1D29),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: speaking ? Colors.greenAccent : Colors.transparent, width: 2.5),
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
                    if (muted) const Padding(padding: EdgeInsets.only(right: 4), child: Icon(Icons.mic_off, size: 13, color: Colors.redAccent)),
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

  Widget _avatarFill(String name) => Center(
        child: CircleAvatar(
          radius: 34,
          backgroundColor: Theme.of(context).colorScheme.primaryContainer,
          child: Text(name.isEmpty ? '?' : name[0].toUpperCase(), style: TextStyle(fontSize: 28, color: Theme.of(context).colorScheme.onPrimaryContainer)),
        ),
      );

  Widget _selfTile() {
    final show = c.camOn && c.localRenderer != null;
    return _tileFrame(
      label: 'You',
      muted: !c.micOn,
      hand: c.handRaised,
      child: show ? RTCVideoView(c.localRenderer!, mirror: c.frontCamera, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover) : _avatarFill(c.myName),
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
          : _avatarFill(p.name),
    );
  }

  void _peerMenu(Peer p) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(title: Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700)), subtitle: Text(p.role)),
          ListTile(leading: const Icon(Icons.push_pin_outlined), title: Text(c.pinnedUserId == p.userId ? 'Unpin' : 'Pin'), onTap: () { Navigator.pop(ctx); c.pin(p.userId); }),
          if (c.isManager) ...[
            ListTile(leading: const Icon(Icons.center_focus_strong), title: const Text('Spotlight for everyone'), onTap: () { Navigator.pop(ctx); c.spotlight(c.spotlightUserId == p.userId ? null : p); }),
            ListTile(leading: const Icon(Icons.mic_off), title: const Text('Mute'), onTap: () { Navigator.pop(ctx); c.muteUser(p); }),
            ListTile(leading: const Icon(Icons.videocam_off), title: const Text('Turn camera off'), onTap: () { Navigator.pop(ctx); c.videoOffUser(p); }),
            ListTile(leading: const Icon(Icons.record_voice_over), title: const Text('Ask to unmute'), onTap: () { Navigator.pop(ctx); c.requestUnmute(p); }),
            if (c.isHost && p.role != 'co-host') ListTile(leading: const Icon(Icons.shield_outlined), title: const Text('Make co-host'), onTap: () { Navigator.pop(ctx); c.makeCohost(p); }),
            if (c.isHost && p.role == 'co-host') ListTile(leading: const Icon(Icons.remove_moderator_outlined), title: const Text('Remove co-host'), onTap: () { Navigator.pop(ctx); c.removeCohost(p); }),
            ListTile(leading: const Icon(Icons.person_remove, color: Colors.red), title: const Text('Remove from meeting', style: TextStyle(color: Colors.red)), onTap: () { Navigator.pop(ctx); c.removeUser(p); }),
          ],
        ]),
      ),
    );
  }

  // ------------------------------------------------------------------ controls
  Widget _controls() {
    Widget btn(IconData icon, String tip, VoidCallback? onTap, {bool active = true, Color? bg, int badge = 0}) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Badge(
          isLabelVisible: badge > 0,
          label: Text('$badge'),
          child: IconButton.filled(
            tooltip: tip,
            style: IconButton.styleFrom(
              backgroundColor: bg ?? (active ? Colors.white12 : Colors.white),
              foregroundColor: active || bg != null ? Colors.white : Colors.black,
              minimumSize: const Size(50, 50),
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
            btn(Icons.back_hand, 'Raise hand', c.toggleHand, bg: c.handRaised ? Colors.amber.shade800 : null),
            btn(Icons.emoji_emotions_outlined, 'React', _reactMenu),
          ],
          btn(Icons.chat_bubble_outline, 'Chat', () => _openPanel(MeetingPanel.chat), badge: c.unreadChat),
          btn(Icons.people_outline, 'People', () => _openPanel(MeetingPanel.people), badge: c.waiting.length),
          btn(Icons.more_horiz, 'More', _moreMenu),
          btn(Icons.call_end, 'Leave', _leave, bg: Colors.red),
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
            ListTile(leading: const Icon(Icons.poll_outlined), title: const Text('Polls'), onTap: () { Navigator.pop(ctx); _openPanel(MeetingPanel.polls); }),
            ListTile(leading: const Icon(Icons.question_answer_outlined), title: const Text('Q&A'), onTap: () { Navigator.pop(ctx); _openPanel(MeetingPanel.qa); }),
            ListTile(leading: const Icon(Icons.sticky_note_2_outlined), title: const Text('Shared notes'), onTap: () { Navigator.pop(ctx); _openPanel(MeetingPanel.notes); }),
            ListTile(leading: const Icon(Icons.timer_outlined), title: const Text('Timer'), onTap: () { Navigator.pop(ctx); _timerDialog(); }),
            if (c.isManager) ...[
              const Divider(),
              ListTile(leading: const Icon(Icons.mic_off), title: const Text('Mute everyone'), onTap: () { Navigator.pop(ctx); c.muteAll(); }),
              ListTile(leading: const Icon(Icons.videocam_off), title: const Text('Turn off everyone\'s camera'), onTap: () { Navigator.pop(ctx); c.disableAllVideo(); }),
              ListTile(leading: Icon(c.locked ? Icons.lock_open : Icons.lock_outline), title: Text(c.locked ? 'Unlock meeting' : 'Lock meeting'), onTap: () { Navigator.pop(ctx); c.toggleLock(); }),
            ],
            if (c.isHost)
              ListTile(
                leading: const Icon(Icons.stop_circle_outlined, color: Colors.red),
                title: const Text('End meeting for everyone', style: TextStyle(color: Colors.red)),
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
