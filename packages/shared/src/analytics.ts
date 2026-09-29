/**
 * 관찰 데이터(사용자 요청 3번) — 서버가 기록하는 이벤트 형식과 관리자 화면용 통계 형식.
 * 개인정보 최소화: 닉네임·채팅 내용은 기록하지 않는다 (OPEN-11). 플레이어는 익명 ID만.
 */

export type AnalyticsEvent =
  | { type: 'room_created'; roomId: string }
  | { type: 'player_joined'; roomId: string; playerCount: number }
  | { type: 'player_left'; roomId: string; phase: string; playerCount: number }
  | { type: 'match_started'; roomId: string; matchId: string; playerCount: number; gameIds: string[]; gameRounds: number }
  | { type: 'game_started'; roomId: string; matchId: string; gameId: string; playerCount: number }
  | { type: 'game_completed'; roomId: string; matchId: string; gameId: string; playerCount: number; durationMs: number }
  | { type: 'game_aborted'; roomId: string; matchId: string; gameId: string; playerCount: number; reason: string }
  | { type: 'match_completed'; roomId: string; matchId: string; playerCount: number; durationMs: number }
  | { type: 'play_again'; roomId: string; playerCount: number }
  | { type: 'settings_changed'; roomId: string; gameRounds: number; enabledGameIds: string[]; maxPlayers: number };

export type StoredEvent = AnalyticsEvent & { at: number };

export interface CountRow {
  key: string;
  count: number;
}

export interface GameStatsRow {
  gameId: string;
  started: number;
  completed: number;
  aborted: number;
  completionRate: number | null;
  avgDurationSec: number | null;
  byPlayerCount: CountRow[];
}

export interface StatsReport {
  generatedAt: number;
  since: number | null;
  totals: {
    rooms: number;
    playerJoins: number;
    matchesStarted: number;
    matchesCompleted: number;
    gamesCompleted: number;
    playAgain: number;
    /** play_again / match_completed */
    replayRate: number | null;
  };
  /** 매치 시작 시 인원 분포 — “몇 명으로 많이 플레이했나” */
  matchesByPlayerCount: CountRow[];
  /** 방 라운드(게임 수) 설정 분포 */
  matchesByGameRounds: CountRow[];
  games: GameStatsRow[];
  /** 어떤 단계에서 많이 나가는가 */
  leavesByPhase: CountRow[];
  recent: StoredEvent[];
}
