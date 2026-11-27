# Browser, device and network checks

Run only against a **disposable server on this machine** (they create accounts and data). `npm install` here first.

| Script | What it checks |
|---|---|
| `ui.qa.mjs` | pages, accessibility, security basics, a two-person call: Chromium, Firefox, WebKit |
| `flows.mjs`, `call.mjs`, `features.mjs`, `journeys.mjs`, `crawl.mjs` | workflows and every control (journeys needs the server's SMTP pointed at port 12526 and `LEGAL_NAME="QA Operator"`) |
| `webkit-call.mjs` | Safari's engine: live messages, receiving a call, desktop and iPhone-sized |
| `nat-guest.mjs` + `device-host.mjs` | a call from another network namespace, and the other end of the on-device app test |
| `proxy.mjs` | the production shape: Apache over https in front of `serve` and the backend, as `https://meet.test:18443` |

**WebKit** needs Ubuntu libraries; on other distributions use the Playwright container:

```bash
podman run --rm --network=host --ipc=host -v "$PWD":/work:ro -w /work mcr.microsoft.com/playwright:v<version> node webkit-call.mjs
```

**Behind NAT** (needs `pasta`; the server must announce its LAN address in `MEDIASOUP_ANNOUNCED_IP`):

```bash
node device-host.mjs /tmp/call.json &           # writes /tmp/call.json.env, records what the host receives
pasta --config-net -a 10.99.0.2 -n 24 -g 10.99.0.1 -t none -u none -U none -T 15000 -- \
  node nat-guest.mjs http://127.0.0.1:15000 /tmp/call.json.env
touch /tmp/call.json.stop
```

Set `NO_UDP=1` on the second command to imitate a firewall that blocks UDP.

**On an Android device or emulator:** see the top of `app/integration_test/device_smoke_test.dart`.
