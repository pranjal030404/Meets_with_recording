import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';
import '../core/api.dart';
import '../core/config.dart';
import '../core/session.dart';
import '../widgets/common.dart';
import 'meeting_screen.dart';
import 'meeting_tools.dart';

/// Camera/mic preview + toggles shown before entering a meeting.
class PreJoinScreen extends StatefulWidget {
  final String roomId;
  final String? title;
  final bool viewOnly;
  const PreJoinScreen({super.key, required this.roomId, this.title, this.viewOnly = false});
  @override
  State<PreJoinScreen> createState() => _PreJoinScreenState();
}

class _PreJoinScreenState extends State<PreJoinScreen> {
  bool _mic = false;
  bool _cam = false;
  MediaStream? _preview;
  final _renderer = RTCVideoRenderer();
  bool _ready = false;
  late String _roomId = widget.roomId;
  Map<String, dynamic>? _meeting;
  bool _resolving = true; // no joining until we know which date a shared link points to

  Future<void> _resolve() async {
    try {
      var d = Api.unwrap(await Api.instance.get('/meetings/${Uri.encodeComponent(_roomId)}'));
      final next = d['nextRoomId']?.toString();
      if (next != null) {
        d = Api.unwrap(await Api.instance.get('/meetings/${Uri.encodeComponent(next)}'));
        _roomId = next;
      }
      _meeting = asMap(d['meeting']);
    } catch (_) {
      // joining reports what is wrong with the link
    }
    if (mounted) setState(() => _resolving = false);
  }

  Future<void> _setNotes(bool on) async {
    final ok = await guard(context, () => Api.instance.put('/meetings/$_roomId/settings', {'settings': {'takeNotes': on}}));
    if (ok != null && mounted) {
      setState(() => _meeting = {..._meeting!, 'settings': {...asMap(_meeting!['settings']), 'takeNotes': on}});
    }
  }

  @override
  void initState() {
    super.initState();
    _resolve();
    _renderer.initialize().then((_) => setState(() => _ready = true));
  }

  Future<void> _togglePreview(bool cam) async {
    if (cam) {
      final st = await Permission.camera.request();
      if (!st.isGranted) {
        if (mounted) toast(context, 'Camera permission is required', error: true);
        return;
      }
      try {
        _preview = await navigator.mediaDevices.getUserMedia({'audio': false, 'video': {'facingMode': 'user'}});
        if (Platform.isAndroid && Config.backgroundMode != 'off') await _applyBackground(Config.backgroundMode);
        _renderer.srcObject = _preview;
      } catch (e) {
        _stopPreview(); // never show a room the person asked to hide
        if (mounted) toast(context, 'Could not open the camera: $e', error: true);
        return;
      }
    } else {
      _stopPreview();
    }
    setState(() => _cam = cam);
  }

  Future<void> _applyBackground(String mode) async {
    for (final t in _preview?.getVideoTracks() ?? <MediaStreamTrack>[]) {
      await WebRTC.invokeMethod('setBackgroundEffect', {'trackId': t.id, 'mode': mode, 'imagePath': Config.backgroundImage});
    }
  }

  Future<void> _setBackground(String mode, [String? imagePath]) async {
    await Config.setBackground(mode, imagePath);
    try {
      await _applyBackground(mode);
    } catch (e) {
      _stopPreview();
      _cam = false;
      if (mounted) toast(context, 'Background effect failed, so your camera was turned off', error: true);
    }
    if (mounted) setState(() {});
  }

  void _stopPreview() {
    _renderer.srcObject = null;
    for (final t in _preview?.getTracks() ?? <MediaStreamTrack>[]) {
      t.stop();
    }
    _preview?.dispose();
    _preview = null;
  }

  Future<void> _toggleMic() async {
    if (!_mic) {
      final st = await Permission.microphone.request();
      if (!st.isGranted) {
        if (mounted) toast(context, 'Microphone permission is required', error: true);
        return;
      }
    }
    setState(() => _mic = !_mic);
  }

  Future<void> _join() async {
    _stopPreview(); // release the camera so the room can take it
    await Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        settings: const RouteSettings(name: 'meeting'),
        builder: (_) => MeetingScreen(roomId: _roomId, startMic: _mic && !widget.viewOnly, startCam: _cam && !widget.viewOnly, viewOnly: widget.viewOnly),
      ),
    );
  }

  @override
  void dispose() {
    _stopPreview();
    _renderer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(_meeting?['title']?.toString() ?? widget.title ?? 'Join meeting')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  color: Colors.black87,
                  width: double.infinity,
                  child: _cam && _ready
                      ? RTCVideoView(_renderer, mirror: true, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)
                      : Center(
                          child: Column(mainAxisSize: MainAxisSize.min, children: [
                            CircleAvatar(radius: 44, backgroundColor: cs.primaryContainer, child: Text(Session.instance.name.isEmpty ? '?' : Session.instance.name[0].toUpperCase(), style: TextStyle(fontSize: 36, color: cs.onPrimaryContainer))),
                            const SizedBox(height: 12),
                            Text(Session.instance.name, style: const TextStyle(color: Colors.white, fontSize: 18)),
                            const SizedBox(height: 4),
                            const Text('Camera is off', style: TextStyle(color: Colors.white54)),
                          ]),
                        ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            if (!widget.viewOnly)
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                _RoundToggle(on: _mic, onIcon: Icons.mic, offIcon: Icons.mic_off, label: _mic ? 'Mic on' : 'Mic off', onTap: _toggleMic),
                const SizedBox(width: 24),
                _RoundToggle(on: _cam, onIcon: Icons.videocam, offIcon: Icons.videocam_off, label: _cam ? 'Camera on' : 'Camera off', onTap: () => _togglePreview(!_cam)),
                if (Platform.isAndroid) ...[
                  const SizedBox(width: 24),
                  Column(children: [
                    IconButton.filledTonal(
                      style: IconButton.styleFrom(minimumSize: const Size(60, 60)),
                      isSelected: Config.backgroundMode != 'off',
                      onPressed: () => showBackgroundPicker(context, _setBackground),
                      icon: Icon(Config.backgroundMode == 'off' ? Icons.blur_off : Icons.blur_on, size: 28),
                    ),
                    const SizedBox(height: 8),
                    const Text('Background', style: TextStyle(fontSize: 12)),
                  ]),
                ],
              ]),
            if (!widget.viewOnly && !_mic)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text('You will join muted. Turn the mic on so others can hear you.', style: TextStyle(color: cs.outline), textAlign: TextAlign.center),
              ),
            if (_meeting != null && _meeting!['hostId'] == Session.instance.userId)
              SwitchListTile(
                value: asMap(_meeting!['settings'])['takeNotes'] == true,
                onChanged: _setNotes,
                title: const Text('Take notes (live transcript)'),
              )
            else if (asMap(_meeting?['settings'])['takeNotes'] == true)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text('Notes will be taken in this meeting.', style: TextStyle(color: cs.outline), textAlign: TextAlign.center),
              ),
            const SizedBox(height: 16),
            SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: _resolving ? null : _join, icon: const Icon(Icons.login), label: Text(widget.viewOnly ? 'Watch' : 'Join now'))),
          ]),
        ),
      ),
    );
  }
}

class _RoundToggle extends StatelessWidget {
  final bool on;
  final IconData onIcon, offIcon;
  final String label;
  final VoidCallback onTap;
  const _RoundToggle({required this.on, required this.onIcon, required this.offIcon, required this.label, required this.onTap});
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(children: [
      IconButton.filled(
        style: IconButton.styleFrom(backgroundColor: on ? cs.primary : cs.errorContainer, foregroundColor: on ? cs.onPrimary : cs.onErrorContainer, minimumSize: const Size(60, 60)),
        onPressed: onTap,
        icon: Icon(on ? onIcon : offIcon, size: 28),
      ),
      const SizedBox(height: 8),
      Text(label, style: const TextStyle(fontSize: 12)),
    ]);
  }
}
