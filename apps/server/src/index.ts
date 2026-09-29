/**
 * 서버 진입점: HTTP(관리자 통계 API, 게임 목록, 빌드된 웹 화면) + Socket.IO(실시간).
 *
 * 환경 변수
 * - PORT (기본 3001)
 * - ADMIN_TOKEN: 관리자 통계 접근 토큰. 비워 두면 개발 모드로 누구나 볼 수 있다.
 * - DATA_DIR: 관찰 데이터 저장 폴더 (기본 ./data)
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { isRobloxCandidate, type ClientToServer, type ServerToClient } from '@backstage/shared';
import { RealClock } from './clock.js';
import { FileEventSink, computeStats } from './analytics.js';
import { GAMES, GAME_METAS } from './games/registry.js';
import { RoomManager } from './roomManager.js';
import type { RoomTransport } from './room.js';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
const DATA_DIR = resolve(process.env.DATA_DIR ?? join(here, '../../../data'));
const WEB_DIST = resolve(here, '../../web/dist');

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(httpServer, { cors: { origin: true } });

const sink = new FileEventSink(join(DATA_DIR, 'events.jsonl'));
const clock = new RealClock();

/** 플레이어 ID → 연결된 소켓 ID들 */
const sockets = new Map<string, Set<string>>();
const emitTo = (playerId: string) => {
  const ids = sockets.get(playerId);
  return ids && ids.size ? io.to([...ids]) : null;
};

const transport: RoomTransport = {
  state: (pid, view) => emitTo(pid)?.emit('room:state', view),
  gameView: (pid, gameId, view) => emitTo(pid)?.emit('game:view', { gameId, view }),
  chat: (pids, msg) => {
    for (const pid of pids) emitTo(pid)?.emit('chat:message', msg);
  },
  chatHistory: (pid, msgs) => emitTo(pid)?.emit('chat:history', msgs),
  toast: (pid, text) => emitTo(pid)?.emit('toast', { text }),
};

const rooms = new RoomManager(GAMES, clock, sink, transport);

io.on('connection', (socket) => {
  let session: { roomCode: string; playerId: string } | null = null;

  const bind = (roomCode: string, playerId: string) => {
    session = { roomCode, playerId };
    let set = sockets.get(playerId);
    if (!set) sockets.set(playerId, (set = new Set()));
    set.add(socket.id);
  };
  const room = () => (session ? rooms.get(session.roomCode) : undefined);
  /** 이 소켓이 다른 방에 묶여 있었다면 먼저 나간다 */
  const unbind = () => {
    if (!session) return;
    const pid = session.playerId;
    room()?.leave(pid);
    sockets.get(pid)?.delete(socket.id);
    session = null;
  };

  // 새 방에 들어가는 데 성공한 뒤에만 이전 방에서 나간다 (실패하면 지금 방에 그대로 남는다)
  socket.on('room:create', (p, ack) => {
    if (typeof ack !== 'function') return;
    const r = rooms.create();
    if (p?.settings) r.applyInitialSettings(p.settings);
    const res = r.join(p?.profile);
    if (!res.ok) {
      r.close();
      return ack(res);
    }
    unbind();
    bind(r.code, res.playerId);
    r.resume(res.playerId, res.token); // 방금 묶은 소켓으로 상태·채팅 기록 전송
    ack({ ok: true, roomCode: r.code, playerId: res.playerId, token: res.token });
  });

  socket.on('room:join', (p, ack) => {
    if (typeof ack !== 'function') return;
    const r = rooms.get(p?.code);
    if (!r) return ack({ ok: false, error: '그런 방 코드가 없어요.' });
    if (session?.roomCode === r.code) return ack({ ok: false, error: '이미 이 방에 있어요.' });
    const res = r.join(p?.profile);
    if (!res.ok) return ack(res);
    unbind();
    bind(r.code, res.playerId);
    r.resume(res.playerId, res.token);
    ack({ ok: true, roomCode: r.code, playerId: res.playerId, token: res.token });
  });

  socket.on('room:resume', (p, ack) => {
    if (typeof ack !== 'function') return;
    const r = rooms.get(p?.roomCode);
    if (!r || typeof p?.playerId !== 'string' || typeof p?.token !== 'string' || !r.canResume(p.playerId, p.token)) {
      return ack({ ok: false, error: '이전 방에 다시 들어갈 수 없어요.' });
    }
    if (session && (session.roomCode !== r.code || session.playerId !== p.playerId)) unbind();
    bind(r.code, p.playerId);
    r.resume(p.playerId, p.token);
    ack({ ok: true });
  });

  socket.on('room:leave', () => unbind());

  socket.on('profile:update', (p, ack) => {
    const err = session ? room()?.updateProfile(session.playerId, p ?? {}) : '방에 없어요.';
    if (typeof ack === 'function') ack(err ? { ok: false, error: err } : { ok: true });
  });
  socket.on('lobby:ready', (p) => session && room()?.setReady(session.playerId, !!p?.ready));
  socket.on('lobby:settings', (p, ack) => {
    const err = session ? room()?.updateSettings(session.playerId, p?.settings) : '방에 없어요.';
    if (typeof ack === 'function') ack(err ? { ok: false, error: err } : { ok: true });
  });
  socket.on('lobby:start', (ack) => {
    const err = session ? room()?.start(session.playerId) : '방에 없어요.';
    if (typeof ack === 'function') ack(err ? { ok: false, error: err } : { ok: true });
  });
  socket.on('match:again', () => session && room()?.playAgain(session.playerId));
  socket.on('chat:send', (p) => {
    const receivedAt = clock.now(); // 판정용 서버 접수 시각은 가장 먼저 찍는다
    if (session) room()?.chat(session.playerId, p?.text, receivedAt);
  });
  socket.on('game:action', (p) => {
    const receivedAt = clock.now();
    if (session) room()?.action(session.playerId, p?.requestId, p?.action, receivedAt);
  });

  socket.on('disconnect', () => {
    if (!session) return;
    const { playerId } = session;
    const set = sockets.get(playerId);
    set?.delete(socket.id);
    if (!set || set.size === 0) {
      sockets.delete(playerId);
      room()?.disconnect(playerId);
    }
  });
});

// ───────── HTTP ─────────

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.count() });
});

/** 게임 목록 — AI 사용 여부와 Roblox 이식 후보 여부 포함 */
app.get('/api/catalog', (_req, res) => {
  res.json(GAME_METAS.map((m) => ({ ...m, robloxCandidate: isRobloxCandidate(m) })));
});

app.get('/api/admin/stats', (req, res) => {
  const token = String(req.query.token ?? req.header('x-admin-token') ?? '');
  if (ADMIN_TOKEN && token !== ADMIN_TOKEN) {
    res.status(401).json({ error: '관리자 토큰이 필요해요.' });
    return;
  }
  const days = Number(req.query.days ?? 0);
  const since = days > 0 ? Date.now() - days * 86_400_000 : null;
  res.json({
    ...computeStats(sink.all(), since, GAME_METAS.map((m) => m.id)),
    catalog: GAME_METAS.map((m) => ({ id: m.id, name: m.name, ai: m.ai, robloxCandidate: isRobloxCandidate(m) })),
    liveRooms: rooms.count(),
  });
});

if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(join(WEB_DIST, 'index.html')));
}

httpServer.listen(PORT, () => {
  console.log(`[backstage] 서버 실행: http://localhost:${PORT}`);
  if (!ADMIN_TOKEN) console.log('[backstage] ADMIN_TOKEN이 없어 관리자 통계가 누구에게나 열려 있어요 (개발 모드).');
});
