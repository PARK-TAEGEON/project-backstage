/**
 * 게임 메타데이터 — 로비 분류 체계(docs/context/03-LOBBY-TAXONOMY.md)를 코드로 옮긴 것.
 * 모든 게임은 서버 정의(apps/server/src/games/*)에서 이 형식의 meta를 가진다.
 */

export type GameMode = 'individual' | 'team' | 'asymmetric_team';
export type Relationship = 'stranger' | 'friends' | 'both';
export type GameLength = 'short' | 'medium' | 'long';
/** 게임 진행 중 AI 호출 여부. 제작 시점에 AI로 만든 고정 콘텐츠는 none (DEC-01). */
export type AiLevel = 'none' | 'low' | 'high';
/**
 * 플레이어가 게임에 참여하는 입력 방식.
 * - chat: 채팅 메시지가 곧 플레이 (눈치게임, 단어 말하기)
 * - vote: 투표·지목 (포브스)
 * - text: 전용 입력칸 제출 (쿵쿵따)
 * - avatar: 아바타 이동·행동 (추후 도입 — 아직 구현된 게임 없음)
 */
export type InputKind = 'chat' | 'vote' | 'text' | 'avatar';
/** 실행 가능한 플랫폼. roblox는 AI가 필요 없는(ai: none) 게임만 후보가 된다. */
export type Platform = 'web' | 'roblox';

export type GameSettingDef =
  | { key: string; label: string; type: 'int'; default: number; min: number; max: number }
  | { key: string; label: string; type: 'bool'; default: boolean }
  | { key: string; label: string; type: 'select'; default: string; options: { value: string; label: string }[] };

export type GameSettingValue = number | boolean | string;
export type GameSettings = Record<string, GameSettingValue>;

export interface GameMeta {
  id: string;
  name: string;
  /** 스펙 문서 버전 (docs/context/catalog/games/*.md) */
  specVersion: string;
  /** 전광판에 크게 띄우는 한 줄 규칙 */
  tagline: string;
  mode: GameMode;
  relationship: Relationship;
  length: GameLength;
  ai: AiLevel;
  inputs: InputKind[];
  platforms: Platform[];
  minPlayers: number;
  recommendedPlayers: number[];
  maxPlayers: number;
  /** 방장이 로비에서 바꿀 수 있는 게임 내부 설정 (예: 게임 안 라운드 수) */
  settings: GameSettingDef[];
}

/** AI 없는 게임만 Roblox 이식 후보 (사용자 요청 1번). */
export function isRobloxCandidate(meta: GameMeta): boolean {
  return meta.ai === 'none';
}

export function isPlayableWith(meta: GameMeta, playerCount: number): boolean {
  return playerCount >= meta.minPlayers && playerCount <= meta.maxPlayers;
}

export function defaultGameSettings(meta: GameMeta): GameSettings {
  const out: GameSettings = {};
  for (const s of meta.settings) out[s.key] = s.default;
  return out;
}

/** 방장이 보낸 값을 게임 설정 정의에 맞춰 정리한다. 알 수 없는 키는 버리고, 범위를 벗어난 값은 잘라낸다. */
export function sanitizeGameSettings(meta: GameMeta, input: unknown): GameSettings {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = defaultGameSettings(meta);
  for (const def of meta.settings) {
    const v = src[def.key];
    if (def.type === 'int' && typeof v === 'number' && Number.isFinite(v)) {
      out[def.key] = Math.min(def.max, Math.max(def.min, Math.round(v)));
    } else if (def.type === 'bool' && typeof v === 'boolean') {
      out[def.key] = v;
    } else if (def.type === 'select' && typeof v === 'string' && def.options.some((o) => o.value === v)) {
      out[def.key] = v;
    }
  }
  return out;
}
