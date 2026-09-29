/**
 * 게임 모듈 규약 — 새 미니게임은 이 인터페이스만 구현해서 registry에 등록하면 된다.
 * 방·매치·채팅·재접속·점수 합산은 플랫폼이 처리하고, 게임은 자기 규칙만 책임진다.
 * 새 게임 추가 절차는 docs/ARCHITECTURE.md 참고.
 */
import type { GameMeta, GameSettings } from '@backstage/shared';

export interface GamePlayer {
  id: string;
  nickname: string;
}

export interface GameOutcome {
  /** 게임 참가자 전원의 순위. 공동 순위는 같은 배열에. 앞이 높은 순위. */
  ranking: string[][];
  /** 게임 안 점수 (표시용) */
  gameScores?: Record<string, number>;
  /** 결과 화면·전광판에 띄울 문구 */
  headlines: string[];
  /** 정상 종료가 아니면 true (인원 부족 등) */
  aborted?: boolean;
}

export type ChatDecision = { allow: true } | { allow: false; reason: string };

export interface GameContext {
  /** 게임 시작 시점 참가자 (고정) */
  readonly players: readonly GamePlayer[];
  readonly settings: GameSettings;
  /** 서버 단조 시계 (ms) */
  now(): number;
  /** 게임이 끝나거나 폐기되면 자동으로 모두 취소된다 */
  setTimer(ms: number, fn: () => void): number;
  clearTimer(id: number): void;
  /** 아직 방을 떠나지 않은(이탈 확정 전 포함) 참가자인가 */
  isActive(playerId: string): boolean;
  activePlayerIds(): string[];
  /** 상태가 바뀌었으니 모두에게 각자의 view를 다시 보낸다 */
  update(): void;
  /** 채팅창에 게임 알림 한 줄 */
  say(text: string): void;
  /** 게임 종료. 한 번만 유효하다. */
  end(outcome: GameOutcome): void;
  random(): number;
}

export interface GameInstance {
  start(): void;
  /** 게임 전용 입력 (투표, 제출 등). receivedAt = 서버 접수 시각 */
  onAction(playerId: string, action: unknown, receivedAt: number): void;
  /**
   * 채팅이 게임 입력이기도 한 게임(눈치게임 등)은 여기서 판정한다.
   * allow: false면 채팅이 방에 올라가지 않는다 (예: 금지어 입막힘).
   */
  onChat?(playerId: string, text: string, receivedAt: number): ChatDecision;
  /** 연결이 끊긴 순간 (아직 이탈 확정 전). 재접속해도 복귀시키지 않는 게임만 쓴다. */
  onPlayerDisconnected?(playerId: string): void;
  /** 이탈 확정 (재접속 유예 시간이 지난 뒤) */
  onPlayerLeft?(playerId: string): void;
  /**
   * 플레이어별 화면 상태. **비밀 정보는 볼 권한이 있는 사람의 view에만 넣는다.**
   * 이 함수가 반환한 값만 그 플레이어에게 전송된다.
   */
  view(playerId: string): unknown;
  dispose?(): void;
}

export interface ServerGame {
  meta: GameMeta;
  create(ctx: GameContext): GameInstance;
}
