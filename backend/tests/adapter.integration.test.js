// Requires a REAL Redis: REDIS_TEST_URL=redis://localhost:6379 npm test   (skipped otherwise)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { io as connect } from 'socket.io-client';
import Redis from 'ioredis';

const URL = process.env.REDIS_TEST_URL;

const node = async () => {
  const http = createServer();
  const io = new Server(http);
  const pub = new Redis(URL), sub = pub.duplicate();
  io.adapter(createAdapter(pub, sub));
  await new Promise((r) => http.listen(0, r));
  io.on('connection', (s) => { s.on('join', (room) => s.join(room)); s.on('say', (room, m) => s.to(room).emit('msg', m)); });
  return { port: http.address().port, close: async () => { io.close(); pub.disconnect(); sub.disconnect(); } };
};

test('events cross Socket.IO instances through Redis', { skip: !URL }, async () => {
  const n1 = await node(), n2 = await node();
  const a = connect(`http://localhost:${n1.port}`, { transports: ['websocket'] });
  const b = connect(`http://localhost:${n2.port}`, { transports: ['websocket'] });
  await Promise.all([new Promise((r) => a.on('connect', r)), new Promise((r) => b.on('connect', r))]);
  a.emit('join', 'r'); b.emit('join', 'r');
  await new Promise((r) => setTimeout(r, 200));
  const got = new Promise((r) => b.on('msg', r));
  a.emit('say', 'r', 'hello');
  assert.equal(await got, 'hello');
  a.close(); b.close(); await n1.close(); await n2.close();
});
