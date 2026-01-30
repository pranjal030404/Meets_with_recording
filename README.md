# MeetClone - Video Meeting Platform

A Google Meet + Microsoft Teams inspired video conferencing application built with the MERN stack, featuring real-time video/audio calls, screen sharing with recording, live chat, team workspaces, meeting scheduling, and automated reminders.

## ✨ Features

### Core Meeting Features
- **Video & Audio Calls** - Real-time peer-to-peer communication using WebRTC
- **Screen Sharing** - Share your screen with participants
- **Screen Recording** - Record meetings directly in the browser
- **Live Chat** - Real-time messaging during meetings
- **Participant Management** - Host controls to mute/remove participants
- **Meeting History** - Track past meetings

### 🆕 New Team Collaboration Features
- **Team Workspaces** - Create teams and organize members
- **Team Chat Channels** - Real-time messaging in team channels (general, meetings, announcements)
- **Meeting Scheduling** - Schedule meetings with date/time and automatic notifications
- **Calendar View** - Visual calendar displaying all scheduled meetings
- **Smart Reminders** - Automated reminders (1 day, 1 hour, 15 minutes before meetings)
- **Meeting Invitations** - Invite team members with accept/decline functionality
- **Notification System** - Real-time notifications for meetings, team activities, and mentions
- **Meeting Link Sharing** - Generate and share shareable meeting links
- **Role-Based Access** - Team roles (owner, admin, member, guest) with permissions

### UI/UX
- **Responsive Design** - Works on desktop and mobile browsers
- **Dark Theme** - Modern dark UI with Tailwind CSS
- **Real-time Updates** - Socket.IO for instant notifications and chat

## Tech Stack

### Frontend
- React 18 (Vite)
- Tailwind CSS
- Socket.IO Client
- Simple-Peer (WebRTC)
- Zustand (State Management)
- React Router DOM
- Lucide React (Icons)

### Backend
- Node.js + Express
- MongoDB + Mongoose
- Socket.IO
- JWT Authentication
- bcryptjs
- node-cron (for scheduled reminders)

## Prerequisites

- Node.js 18+ 
- MongoDB (local or Atlas)
- Modern browser with WebRTC support

## Project Structure

```
Meet_copy/
├── frontend/               # React frontend (Vite)
│   ├── public/
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── lib/            # API and socket utilities
│   │   │   ├── Home.jsx
│   │   │   ├── Meeting.jsx
│   │   │   ├── Teams.jsx           # 🆕 Teams management
│   │   │   ├── TeamDetail.jsx      # 🆕 Team workspace with chat
│   │   │   ├── Calendar.jsx        # 🆕 Meeting calendar
│   │   │   └── ...
│   │   ├── store/          # Zustand state stores
│   │   │   ├── authStore.js
│   │   │   ├── meetingStore.js
│   │   │   ├── teamStore.js         # 🆕 Team state
│   │   │   ├── notificationStore.js # 🆕 Notifications
│   │   │   └── ...
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
│
└── backend/                # Node.js backend (Express)
    ├── src/
    │   ├── middleware/     # Auth middleware
    │   ├── models/         # Mongoose models
    │   │   ├── User.js
    │   │   ├── Meeting.js
    │   │   ├── Message.js
    │   │   ├── Team.js              # 🆕 Team model
    │   │   └── Notification.js      # 🆕 Notification model
    │   ├── routes/         # Express routes
    │   │   ├── auth.js
    │   │   ├── meeting.js
    │   │   ├── chat.js
    │   │   ├── team.js              # 🆕 Team routes
    │   │   └── notification.js      # 🆕 Notification routes
    │   ├── services/       # 🆕 Business logic services
    │   │   └── reminderService.js   # 🆕 Automated reminderls
    │   ├── routes/         # Express routes
    │   ├── sockets/        # Socket.IO handlers
    │   ├── scripts/        # Utility scripts
    │   └── index.js        # Entry point
    ├── .env.example
    └── package.json
```

## Quick Start

### 1. Clone and Setup

```bash
cd Meet_copy
```

### 2. Setup Backend

```bash
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env with your MongoDB URI and JWT secret
# MONGODB_URI=mongodb://localhost:27017/meetclone
# JWT_SECRET=your-secret-key
# PORT=5000
# CLIENT_URL=http://localhost:5173

# Start server
npm run dev
```

### 3. Setup Frontend

```bash
cd frontend

# Install dependencies

---

## 📚 Additional Documentation

For detailed information about the new features:

- **[NEW_FEATURES.md](./NEW_FEATURES.md)** - Complete feature documentation and API reference
- **[QUICK_START.md](./QUICK_START.md)** - Step-by-step guide for using teams, scheduling, and notifications
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - Technical implementation details

---
npm install

# Create environment file (optional - defaults work for local dev)
cp .env.example .env

# Start development server
npm run dev
```

### 4. Create SuperAdmin Account

```bash
cd backend
npm run create-admin
```
Backend
**SuperAdmin Credentials:**
- Email: `admin@meetclone.com`
- Password: `SuperAdmin@2026`

### 5. Access the App

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Environment Variables

### Server (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localh
- `GET /api/chat/team/:teamId/messages` - 🆕 Get team channel messages
- `POST /api/chat/team/:teamId/messages` - 🆕 Send team message

### 🆕 Teams
- `POST /api/teams` - Create team
- `GET /api/teams` - Get user's teams
- `GET /api/teams/:teamId` - Get team details
- `PUT /api/teams/:teamId` - Update team
- `DELETE /api/teams/:teamId` - Delete team
- `POST /api/teams/:teamId/invite` - Invite member by email
- `POST /api/teams/join/:inviteCode` - Join team with code
- `PUT /api/teams/:teamId/members/:userId/role` - Update member role
- `DELETE /api/teams/:teamId/members/:userId` - Remove member

### 🆕 Meeting Scheduling
- `GET /api/meetings/team/:teamId` - Get team meetings
- `POST /api/meetings/:roomId/invite` - Add invitees to meeting
- `PUT /api/meetings/:roomId/respond` - Accept/decline invitation
- `PUT /api/meetings/:roomId/cancel` - Cancel scheduled meeting

### 🆕 Notifications
- `GET /api/notifications` - Get user notifications
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/read-all` - Mark all as read
- `DELETE /api/notifications/:id` - Delete notificationost:27017/meetclone` |
| `JWT_SECRET` | Secret for JWT tokens | Required |
| `PORT` | Server port | `5000` |
| `CLIENT_URL` | Frontend URL for CORS | `http://localhost:5173` |
| `NODE_ENV` | Environment | `development` |

### Frontend (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:5000` |
| `VITE_SOCKET_URL` | Socket.IO server URL | `http://localhost:5000` |

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile
- `POST /api/auth/logout` - Logout

### Meetings
- `POST /api/meetings` - Create meeting
- `GET /api/meetings` - Get user's meetings
- `GET /api/meetings/:roomId` - Get meeting by room ID
- `POST /api/meetings/:roomId/join` - Join meeting
- `POST /api/meetings/:roomId/leav

### 🆕 Team Events
- `team:join` - Join team room
- `team:leave` - Leave team room
- `team:message` - Receive team message
- `team:typing` - Team typing indicator

### 🆕 Notification Events
- `notification:new` - New notification receivede` - Leave meeting
- `PUT /api/meetings/:roomId/settings` - Update settings (host only)
- `POST /api/meetings/:roomId/end` - End meeting (host only)

### Chat
- `GET /api/chat/:roomId/messages` - Get meeting messages
- `POST /api/chat/:roomId/messages` - Send message
- `DELETE /api/chat/messages/:messageId` - Delete message
- `POST /api/chat/messages/:messageId/react` - React to message

## Socket Events

### Room Events
- `room:join` - Join meeting room
- `room:leave` - Leave meeting room
- `room:participants` - Receive participant list
- `room:user-joined` - User joined notification
- `room:user-left` - User left notification

### WebRTC Signaling
- `webrtc:offer` - Send/receive SDP offer
- `webrtc:answer` - Send/receive SDP answer
- `webrtc:ice-candidate` - Exchange ICE candidates

### Media Controls
- `media:toggle-mute` - Toggle microphone
- `media:toggle-video` - Toggle camera
- `media:screen-share` - Screen share status

### Host Controls
- `host:mute-user` - Force mute participant
- `host:remove-user` - Remove participant
- `host:end-meeting` - End meeting for all

### Chat
- `chat:send` - Send message
- `chat:message` - Receive message
- `chat:typing` - Typing indicator

## How It Works

### WebRTC Flow

1. User joins meeting → Backend creates socket room
2. Socket.IO exchanges signaling data (SDP offers/answers, ICE candidates)
3. WebRTC establishes peer-to-peer connections
4. Media streams flow directly between peers (not through server)

### Screen Recording

Uses the browser's MediaRecorder API to capture the screen/audio stream locally. Recordings are saved as WebM files.

## Production Deployment

### TURN Server (Required for Production)

For users behind strict NATs/firewalls, you need a TURN server:

```javascript
// In Meeting.jsx, update ICE servers:
config: {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'username',
      credential: 'password'
    }
  ]
}
```

Options:
- Self-hosted: [Coturn](https://github.com/coturn/coturn)
- Managed: [Twilio TURN](https://www.twilio.com/docs/stun-turn), [Metered.ca](https://www.metered.ca/)

### Scaling Beyond 5-6 Users

For larger meetings, implement an SFU (Selective Forwarding Unit):
- [mediasoup](https://mediasoup.org/)
- [Janus](https://janus.conf.meetecho.com/)

## Browser Support

Works on all modern browsers with WebRTC support:
- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes
4. Push to the branch
5. Open a Pull Request
