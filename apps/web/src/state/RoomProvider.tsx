/**
 * 앱 상태 — 서버가 보내는 방 상태·게임 화면·채팅을 담고, 서버로 요청을 보내는 함수를 제공한다.
 * 화면 컴포넌트는 useRoom()으로만 상태를 읽고 요청을 보낸다.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Ack, ChatMessage, Profile, RoomSettings, RoomView, SessionInfo } from '@backstage/shared';
import { newRequestId, savedSession, socket } from '../net/socket';

export interface Timed<T> {
  data: T;
  /** 받은 시각 (performance.now) — 남은 시간 계산용 */
  at: number;
}

interface Toast {
  id: number;
  text: string;
}

interface RoomCtx {
  connected: boolean;
  resuming: boolean;
  room: Timed<RoomView> | null;
  game: Timed<{ gameId: string; view: unknown }> | null;
  chat: ChatMessage[];
  toasts: Toast[];
  toast(text: string): void;
  create(profile: Profile, settings?: Partial<RoomSettings>): Promise<string | null>;
  join(code: string, profile: Profile): Promise<string | null>;
  leave(): void;
  setReady(ready: boolean): void;
  updateSettings(settings: Partial<RoomSettings>): Promise<string | null>;
  updateProfile(p: Partial<Profile>): Promise<string | null>;
  start(): Promise<string | null>;
  again(): void;
  sendChat(text: string): void;
  sendAction(action: unknown): void;
}

const Ctx = createContext<RoomCtx | null>(null);

const errOf = (r: Ack<unknown>) => (r.ok ? null : r.error);

export function RoomProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(socket.connected);
  const [resuming, setResuming] = useState(() => !!savedSession.get());
  const [room, setRoom] = useState<Timed<RoomView> | null>(null);
  const [game, setGame] = useState<Timed<{ gameId: string; view: unknown }> | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const toast = useCallback((text: string) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const s = savedSession.get();
      if (!s) {
        setResuming(false);
        return;
      }
      setResuming(true);
      socket.emit('room:resume', s, (r) => {
        setResuming(false);
        if (!r.ok) {
          savedSession.set(null);
          setRoom(null);
          setGame(null);
        }
      });
    };
    const onDisconnect = () => setConnected(false);
    const onState = (v: RoomView) => {
      setRoom({ data: v, at: performance.now() });
      if (v.phase !== 'playing') setGame((g) => (v.phase === 'lobby' ? null : g));
    };
    const onView = (p: { gameId: string; view: unknown }) => setGame({ data: p, at: performance.now() });
    const onChat = (m: ChatMessage) => setChat((c) => [...c.slice(-199), m]);
    const onHistory = (m: ChatMessage[]) => setChat(m);
    const onToast = (p: { text: string }) => toast(p.text);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('game:view', onView);
    socket.on('chat:message', onChat);
    socket.on('chat:history', onHistory);
    socket.on('toast', onToast);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('game:view', onView);
      socket.off('chat:message', onChat);
      socket.off('chat:history', onHistory);
      socket.off('toast', onToast);
    };
  }, [toast]);

  const enter = (r: Ack<SessionInfo>) => {
    if (r.ok) savedSession.set({ roomCode: r.roomCode, playerId: r.playerId, token: r.token });
    return errOf(r);
  };

  const value = useMemo<RoomCtx>(
    () => ({
      connected,
      resuming,
      room,
      game,
      chat,
      toasts,
      toast,
      create: (profile, settings) =>
        new Promise((res) => socket.emit('room:create', { profile, settings }, (r) => res(enter(r)))),
      join: (code, profile) => new Promise((res) => socket.emit('room:join', { code, profile }, (r) => res(enter(r)))),
      leave: () => {
        socket.emit('room:leave');
        savedSession.set(null);
        setRoom(null);
        setGame(null);
        setChat([]);
      },
      setReady: (ready) => socket.emit('lobby:ready', { ready }),
      updateSettings: (settings) => new Promise((res) => socket.emit('lobby:settings', { settings }, (r) => res(errOf(r)))),
      updateProfile: (p) => new Promise((res) => socket.emit('profile:update', p, (r) => res(errOf(r)))),
      start: () => new Promise((res) => socket.emit('lobby:start', (r) => res(errOf(r)))),
      again: () => socket.emit('match:again'),
      sendChat: (text) => socket.emit('chat:send', { text }),
      sendAction: (action) => socket.emit('game:action', { requestId: newRequestId(), action }),
    }),
    [connected, resuming, room, game, chat, toasts, toast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRoom(): RoomCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('RoomProvider 밖에서 useRoom을 호출했어요.');
  return v;
}

/** 서버가 알려 준 “남은 ms”를 받은 시각 기준으로 계속 줄여서 보여준다. */
export function useRemaining(remainingMs: number | undefined, receivedAt: number, tickMs = 100): number | undefined {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (remainingMs === undefined) return;
    const id = setInterval(() => setNow(performance.now()), tickMs);
    return () => clearInterval(id);
  }, [remainingMs, receivedAt, tickMs]);
  if (remainingMs === undefined) return undefined;
  return Math.max(0, remainingMs - (now - receivedAt));
}
