/**
 * 방 규칙 — 방장이 방을 만들 때, 그리고 로비 안에서 바꿀 수 있다 (사용자 요청 5번).
 *
 * 용어:
 * - 방 라운드(gameRounds): 방에서 진행할 **게임의 개수**. 3이면 게임1 → 게임2 → 게임3.
 * - 게임 내부 라운드: 각 게임 설정(gameOptions)에 들어 있는 값 (예: 눈치게임 3라운드).
 * 모든 게임이 끝나면 게임별 순위를 점수로 바꿔 합산하고 최종 순위를 낸다 (DEC-14).
 */
import type { GameMeta, GameSettings } from './game.js';
import { sanitizeGameSettings } from './game.js';

export const ROOM_MIN_PLAYERS = 3;
export const ROOM_MAX_PLAYERS = 8;
export const GAME_ROUNDS_MIN = 1;
export const GAME_ROUNDS_MAX = 10;

export type PlaylistOrder = 'random' | 'listed';

export interface RoomSettings {
  /** 방 최대 인원 (3~8) */
  maxPlayers: number;
  /** 방 라운드 = 이번 매치에서 할 게임 수 */
  gameRounds: number;
  /** 등장할 수 있는 게임 목록 (방장이 켜고 끔) */
  enabledGameIds: string[];
  /** random: 켜진 게임 중 무작위(가능하면 중복 없이) / listed: 켜진 순서대로 반복 */
  order: PlaylistOrder;
  /** 게임별 내부 설정 */
  gameOptions: Record<string, GameSettings>;
}

export function defaultRoomSettings(games: GameMeta[]): RoomSettings {
  return {
    maxPlayers: ROOM_MAX_PLAYERS,
    gameRounds: Math.min(3, Math.max(1, games.length)),
    enabledGameIds: games.map((g) => g.id),
    order: 'random',
    gameOptions: Object.fromEntries(games.map((g) => [g.id, sanitizeGameSettings(g, {})])),
  };
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

/** 클라이언트가 보낸 설정을 서버가 검증·정리한다. 현재 인원보다 작은 최대 인원은 허용하지 않는다. */
export function sanitizeRoomSettings(
  games: GameMeta[],
  input: unknown,
  prev: RoomSettings,
  currentPlayerCount = 0,
): RoomSettings {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const known = new Set(games.map((g) => g.id));
  const minMax = Math.max(ROOM_MIN_PLAYERS, currentPlayerCount);
  const enabled = Array.isArray(src.enabledGameIds)
    ? [...new Set(src.enabledGameIds.filter((id): id is string => typeof id === 'string' && known.has(id)))]
    : prev.enabledGameIds;
  const optsIn = (src.gameOptions && typeof src.gameOptions === 'object' ? src.gameOptions : {}) as Record<string, unknown>;
  const gameOptions: Record<string, GameSettings> = {};
  for (const g of games) {
    gameOptions[g.id] = sanitizeGameSettings(g, optsIn[g.id] ?? prev.gameOptions[g.id] ?? {});
  }
  return {
    maxPlayers: clampInt(src.maxPlayers, minMax, ROOM_MAX_PLAYERS, Math.max(prev.maxPlayers, minMax)),
    gameRounds: clampInt(src.gameRounds, GAME_ROUNDS_MIN, GAME_ROUNDS_MAX, prev.gameRounds),
    enabledGameIds: enabled.length > 0 ? enabled : prev.enabledGameIds,
    order: src.order === 'listed' || src.order === 'random' ? src.order : prev.order,
    gameOptions,
  };
}

/**
 * 매치에서 진행할 게임 순서를 만든다. 현재 인원으로 할 수 없는 게임은 뺀다.
 * random: 가능한 게임을 섞어 한 바퀴 돌고, 게임 수가 더 많으면 다시 섞어 이어 붙인다(연속 중복 최소화).
 */
export function buildPlaylist(
  games: GameMeta[],
  settings: RoomSettings,
  playerCount: number,
  rand: () => number = Math.random,
): string[] {
  const playable = settings.enabledGameIds.filter((id) => {
    const g = games.find((x) => x.id === id);
    return g && playerCount >= g.minPlayers && playerCount <= g.maxPlayers;
  });
  if (playable.length === 0) return [];
  const out: string[] = [];
  if (settings.order === 'listed') {
    for (let i = 0; i < settings.gameRounds; i++) out.push(playable[i % playable.length]!);
    return out;
  }
  while (out.length < settings.gameRounds) {
    const bag = [...playable];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
    if (bag.length > 1 && out.length > 0 && bag[0] === out[out.length - 1]) {
      [bag[0], bag[1]] = [bag[1]!, bag[0]!];
    }
    out.push(...bag);
  }
  return out.slice(0, settings.gameRounds);
}

/**
 * 게임 순위 → 방 점수 (DEC-14). 참가자 N명일 때 1위 N점, 꼴찌 1점.
 * 공동 순위는 그 순위의 높은 점수를 함께 받는다. 예: 4명 [A], [B, C], [D] → A 4, B 3, C 3, D 1.
 */
export function placementPoints(ranking: string[][]): Record<string, number> {
  const n = ranking.reduce((acc, g) => acc + g.length, 0);
  const out: Record<string, number> = {};
  let ahead = 0;
  for (const group of ranking) {
    for (const id of group) out[id] = n - ahead;
    ahead += group.length;
  }
  return out;
}

/** 점수표 → 공동 순위를 포함한 순위 그룹 (높은 점수가 먼저). */
export function rankByScore(scores: Record<string, number>, higherIsBetter = true): string[][] {
  const byScore = new Map<number, string[]>();
  for (const [id, s] of Object.entries(scores)) {
    const list = byScore.get(s) ?? [];
    list.push(id);
    byScore.set(s, list);
  }
  return [...byScore.entries()]
    .sort((a, b) => (higherIsBetter ? b[0] - a[0] : a[0] - b[0]))
    .map(([, ids]) => ids);
}
