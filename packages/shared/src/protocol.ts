/**
 * 서버 ↔ 클라이언트 통신 규약 (Socket.IO 이벤트).
 * 서버가 모든 판정을 한다. 클라이언트는 요청만 보내고, 서버가 보내 주는 상태만 그린다.
 * 비밀 정보는 game:view로 **플레이어마다 따로** 보낸다 (09-ENGINE-RULES 5절).
 */
import type { AvatarConfig } from './avatar.js';
import type { GameMeta } from './game.js';
import type { RoomSettings } from './room.js';

export interface Profile {
  nickname: string;
  avatar: AvatarConfig;
}

export interface PlayerPublic extends Profile {
  id: string;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

/**
 * 방 단계
 * - lobby: 대기실 (설정·준비)
 * - intro: 전광판 — 다음 게임 이름·한 줄 규칙
 * - playing: 게임 진행 (게임별 화면은 game:view)
 * - game_result: 방금 끝난 게임의 순위와 방 점수
 * - final: 모든 게임 종료 — 최종 순위
 */
export type RoomPhase = 'lobby' | 'intro' | 'playing' | 'game_result' | 'final';

export interface GameResultView {
  gameId: string;
  gameName: string;
  /** 공동 순위 포함, 앞이 높은 순위 */
  ranking: string[][];
  /** 이번 게임으로 받은 방 점수 */
  pointsGained: Record<string, number>;
  /** 게임 안 점수 (재미용 등, 게임마다 의미가 다름) */
  gameScores?: Record<string, number>;
  /** 전광판에 띄울 발표 문구 */
  headlines: string[];
  aborted?: boolean;
}

export interface MatchView {
  index: number; // 0부터, 현재(또는 방금 끝난) 게임 순서
  total: number;
  playlist: { gameId: string; name: string }[];
  scores: Record<string, number>;
  lastResult?: GameResultView;
  finalRanking?: string[][];
}

export interface RoomView {
  code: string;
  phase: RoomPhase;
  /** 현재 단계가 자동으로 넘어가기까지 남은 시간(ms). 없으면 사람이 넘겨야 함 */
  phaseRemainingMs?: number;
  meId: string;
  players: PlayerPublic[];
  settings: RoomSettings;
  catalog: GameMeta[];
  currentGame?: { gameId: string; name: string; tagline: string };
  match?: MatchView;
  /** 로비에서 시작 버튼을 막는 이유 (없으면 시작 가능) */
  startBlockers: string[];
}

export interface ChatMessage {
  id: string;
  /** 시스템 메시지는 from 없음 */
  from?: string;
  text: string;
  at: number;
  kind: 'user' | 'system' | 'game';
}

export type Ack<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

export interface SessionInfo {
  roomCode: string;
  playerId: string;
  token: string;
}

export interface ClientToServer {
  'room:create': (p: { profile: Profile; settings?: Partial<RoomSettings> }, ack: (r: Ack<SessionInfo>) => void) => void;
  'room:join': (p: { code: string; profile: Profile }, ack: (r: Ack<SessionInfo>) => void) => void;
  'room:resume': (p: SessionInfo, ack: (r: Ack) => void) => void;
  'room:leave': () => void;
  'profile:update': (p: Partial<Profile>, ack: (r: Ack) => void) => void;
  'lobby:ready': (p: { ready: boolean }) => void;
  'lobby:settings': (p: { settings: Partial<RoomSettings> }, ack: (r: Ack) => void) => void;
  'lobby:start': (ack: (r: Ack) => void) => void;
  'match:again': () => void;
  'chat:send': (p: { text: string }) => void;
  'game:action': (p: { requestId: string; action: unknown }) => void;
}

export interface ServerToClient {
  'room:state': (v: RoomView) => void;
  'game:view': (p: { gameId: string; view: unknown }) => void;
  'chat:message': (m: ChatMessage) => void;
  'chat:history': (m: ChatMessage[]) => void;
  'room:closed': (p: { reason: string }) => void;
  toast: (p: { text: string }) => void;
}

export const CHAT_MAX_LENGTH = 200;
