# MeetClone mobile (Flutter)

Android + iOS client for the MeetClone backend in `../backend`. It talks to the same REST API and
Socket.IO / mediasoup SFU as the web app, so accounts, meetings, chats and files are shared.

## Features

| Area | What the app does |
|---|---|
| Account | Sign up, sign in, email-verification resend, profile, custom status with expiry, sign out |
| Meetings | Instant / scheduled meetings, join by code or invite link, pre-join screen (mic/camera preview), calendar, details, invite by email, accept/decline, cancel, end, history |
| In meeting | Live audio/video through mediasoup, grid / pinned / spotlight / screen-share-viewing layouts, active speaker highlight, mic / camera / camera flip / speaker, hand raise, emoji reactions, meeting chat, participants, polls, Q&A, shared notes, timer, live captions, recording indicator, link-quality dot |
| Host controls | Waiting room admit/deny, mute / camera-off / ask-to-unmute, remove, co-host promote/demote, spotlight, mute all, disable all video, lock meeting, end for everyone |
| After a meeting | Recordings, transcripts (open as files), AI summary, action items -> tasks |
| Chat | Direct + group chats, realtime, typing, unread counts, mute, reactions, edit / delete, threads, pin, save, create task from message, file & image attachments, huddle |
| Teams | Create / join by code, invite by email, roles, channels (built-in + custom), team chat, tasks, meetings, calendar, files, delete / leave |
| Tasks | Board by status, priority, due date, assignee, subtasks, overdue count |
| Files | Upload (personal / team), download & open, search, trash + restore, storage usage |
| Other | Global search, notifications (live + mark read / clear), plans & billing, server-address setting |

Not available on mobile: whiteboard, breakout-room management, speech translation, live-stream
audience links, local recording and screen sharing from the device (the web app covers those).

## Run it

Requirements: Flutter 3.x (Dart >= 3.4), Android SDK for Android, Xcode + CocoaPods for iOS (macOS only).

```bash
cd app
flutter pub get
flutter run            # pick a connected device / emulator
```

### Point the app at your backend

Use **Server address** on the sign-in screen (or More -> Server address). Examples:

| Where the app runs | Server address |
|---|---|
| Android emulator, backend on the same computer | `http://10.0.2.2:5000` (default) |
| iOS simulator | `http://localhost:5000` |
| Real phone on the same Wi-Fi | `http://<your-computer-LAN-IP>:5000` |
| Production | `https://meet.your-domain.com` |

### Media (audio / video) needs the SFU to be reachable

On the backend set `MEDIASOUP_ANNOUNCED_IP` to an address the **phone** can reach (LAN IP for local tests,
public IP in production) and open UDP/TCP 40000-49999. For phones on mobile data configure TURN
(`/api/webrtc/ice-servers` is used automatically). Without this the meeting opens but you will see/hear nothing.

## Build

```bash
flutter build apk --release          # Android APK
flutter build appbundle --release    # Play Store bundle
flutter build ipa --release          # iOS (macOS, needs signing set up in Xcode)
```

Before publishing:

* Android: create a keystore and replace the `debug` signing config in `android/app/build.gradle.kts`;
  change the application id (`com.meetclone.meetclone`) if needed.
* iOS: open `ios/Runner.xcworkspace`, set your team / bundle id, then archive. Run `pod install` once in `ios/`.
* Use **https** in production, then remove `android:usesCleartextTraffic="true"` from
  `android/app/src/main/AndroidManifest.xml` and `NSAllowsArbitraryLoads` from `ios/Runner/Info.plist`.

## Project layout

```
lib/
  main.dart                    app entry + auth gate
  core/
    config.dart                server URL + token storage
    api.dart                   REST client (Dio)
    socket_service.dart        Socket.IO + ack helper
    session.dart               signed-in user state
    meeting_controller.dart    meeting room: signalling + mediasoup + tracks
    files.dart                 authenticated upload / download
  screens/                     one file per feature area
  widgets/                     shared UI (chat view, list loader, helpers)
packages/
  mediasoup_client_flutter/    vendored + patched (see below)
  flutter_webrtc/              vendored + patched (see below)
```

### Why two packages are vendored

* `mediasoup_client_flutter 0.8.5` (the only maintained Dart mediasoup client) no longer compiles on current
  Dart: it overrides `RTCRtpEncoding.priority` with an incompatible type and has null-safety errors around
  `rtcp.cname`. The copy in `packages/` removes the unused priority fields and adds the null checks.
* `flutter_webrtc 0.9.48` (the newest line compatible with it) still references the removed Android
  `Registrar` API. The copy removes that dead `registerWith` method.

`pubspec.yaml` points `flutter_webrtc` at the vendored copy through
`dependency_overrides`. If upstream publishes a fixed mediasoup client you can switch back to pub.dev.

## Tests

```bash
flutter analyze
flutter test
```
