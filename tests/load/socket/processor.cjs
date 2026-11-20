// Artillery processor: logs in over REST and passes the JWT in the Socket.IO handshake auth.
const fs = require('fs');
const users = JSON.parse(fs.readFileSync(process.env.USERS_FILE || './users.json', 'utf8'));
let n = 0;
module.exports = {
  async loginAndSetAuth(ctx, events, done) {
    const u = users[n++ % users.length];
    try {
      const r = await fetch(`${process.env.BASE_URL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(u) });
      const j = await r.json();
      ctx.vars.token = j?.data?.token || j?.token;
      ctx.vars.conversationId = process.env.CONVERSATION_ID || 'none';
      ctx.socketio = { auth: { token: ctx.vars.token } };   // Artillery socketio engine reads `ctx.socketio.auth` (verify on your Artillery version)
      events.emit('counter', 'login.ok', 1);
    } catch (e) { events.emit('counter', 'login.failed', 1); }
    done();
  },
};
