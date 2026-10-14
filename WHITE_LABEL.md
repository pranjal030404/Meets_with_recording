# White-Label Guide

This application is fully white-labelable: you can rebrand it for any deployment **without changing code** — just environment variables. It also ships with rich media/file sharing in every chat surface.

---

## 1. Rebrand via environment variables

1. Copy `frontend/.env.example` → `frontend/.env`
2. Set the branding variables:

```env
VITE_APP_NAME=AcmeMeet
VITE_APP_TAGLINE=Meetings for Acme teams
VITE_APP_LOGO_URL=/acme-logo.png
VITE_APP_ICON_URL=/acme-favicon.png
VITE_APP_COMPANY=Acme Inc
VITE_APP_SUPPORT_EMAIL=support@acme.com
```

3. Drop your logo/favicon files into `frontend/public/` (e.g. `frontend/public/acme-logo.png`), so they're served at `/acme-logo.png`.
4. Rebuild the frontend (`npm run build`). Vite inlines `VITE_*` vars at build time, so **each branded deployment is its own build**.

### What each variable changes

| Variable | Where it appears |
|---|---|
| `VITE_APP_NAME` | Browser tab title, landing navbar/hero/footer, login & signup screens, pricing page, workspace sidebar, mobile top bar |
| `VITE_APP_TAGLINE` | Page title, landing footer |
| `VITE_APP_LOGO_URL` | Replaces the built-in gradient icon everywhere (landing, auth, sidebar, pricing) via the `BrandMark` component |
| `VITE_APP_ICON_URL` | Favicon in the browser tab |
| `VITE_APP_DESCRIPTION` | Meta description / SEO |
| `VITE_APP_COMPANY` | Copyright line (falls back to app name) |
| `VITE_APP_SUPPORT_EMAIL` | Reserved for support links |

### How it works

- `frontend/src/config/branding.js` — single source of truth; reads `import.meta.env` with sensible "MeetClone" defaults.
- `frontend/src/components/BrandMark.jsx` — shared logo component; renders your logo image when `VITE_APP_LOGO_URL` is set, otherwise the built-in icon.
- `frontend/index.html` — runtime script sets the document title & favicon from the same vars.

### Multiple tenants

Because branding is baked at build time, run one build per brand. Typical CI matrix:

```
build --mode acme      # uses .env.acme
build --mode globex    # uses .env.globex
```

Create a `.env.<mode>` file per tenant with its `VITE_APP_*` values. In production the backend serves `frontend/dist` from a single deployment; host each brand's build on its own domain (or path) and point `CLIENT_URL`/`VITE_API_URL` at the shared API.

---

## 2. Media & file sharing in chat

All three chat surfaces now support sending files/media, with inline previews:

| Surface | Entry point | Upload scope |
|---|---|---|
| **In-meeting chat** (`ChatPanel`) | Paperclip button in the composer | Scoped to the meeting (`roomId`) |
| **Team channel chat** (`TeamDetail`) | Paperclip button under the channel header | Scoped to the team (`teamId`) |
| **Workspace DM / group chat** (`Chat`) | Paperclip button in the composer | Scoped to the conversation (`conversationId`) |

Features:

- **Images** (png/jpg/gif/webp/svg) render as inline thumbnails with a download overlay.
- **Video** (mp4/webm/mov) renders an inline player.
- **Audio** (mp3/wav/ogg/m4a) renders an inline player.
- Anything else renders as a styled download card with file size.
- Attachments upload via `POST /api/files/upload` with the chat context (`roomId` / `teamId` / `conversationId`), so they show up in the Files page and respect permission checks.
- Server-side validation: the message routes verify the referenced file was uploaded **by the same user into the same scope** before attaching it — you can't forge someone else's file into a message.
- Size limit: 50 MB by default, configurable with `FILE_SIZE_LIMIT_MB` on the backend.

### Key files

- `frontend/src/components/FileAttachment.jsx` — shared preview bubble
- `frontend/src/hooks/useChatUpload.js` — shared pick/upload hook
- `backend/src/routes/file.js` — upload endpoint (accepts `roomId` / `teamId` / `conversationId` / `meetingId`)
- `backend/src/sockets/index.js` — `chat:send` socket handler with `attachment` support
- `backend/src/routes/chat.js` — REST message endpoints with `attachment` support (meeting + team)
