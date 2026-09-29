/**
 * 관찰 데이터 저장소. 프로토타입에서는 JSON Lines 파일(data/events.jsonl)에 한 줄씩 쌓는다.
 * 나중에 DB로 옮길 때는 EventSink 구현만 바꾸면 된다.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AnalyticsEvent, CountRow, GameStatsRow, StatsReport, StoredEvent } from '@backstage/shared';

export interface EventSink {
  record(ev: AnalyticsEvent): void;
  all(): StoredEvent[];
}

export class MemoryEventSink implements EventSink {
  protected events: StoredEvent[] = [];
  constructor(private wallClock: () => number = Date.now) {}
  record(ev: AnalyticsEvent): void {
    this.events.push({ ...ev, at: this.wallClock() });
  }
  all(): StoredEvent[] {
    return this.events;
  }
}

export class FileEventSink extends MemoryEventSink {
  constructor(private path: string) {
    super();
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          this.events.push(JSON.parse(line) as StoredEvent);
        } catch {
          // 깨진 줄은 건너뛴다
        }
      }
    }
  }
  override record(ev: AnalyticsEvent): void {
    const stored: StoredEvent = { ...ev, at: Date.now() };
    this.events.push(stored);
    try {
      appendFileSync(this.path, JSON.stringify(stored) + '\n');
    } catch (err) {
      console.error('[analytics] 기록 실패', err);
    }
  }
}

function countBy<T>(items: T[], key: (x: T) => string | number): CountRow[] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = String(key(it));
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => (Number.isNaN(Number(a.key)) ? a.key.localeCompare(b.key) : Number(a.key) - Number(b.key)));
}

export function computeStats(all: StoredEvent[], since: number | null = null, gameIds: string[] = []): StatsReport {
  const ev = since ? all.filter((e) => e.at >= since) : all;
  const of = <T extends StoredEvent['type']>(t: T) => ev.filter((e): e is Extract<StoredEvent, { type: T }> => e.type === t);
  const matchStarted = of('match_started');
  const matchCompleted = of('match_completed');
  const gameStarted = of('game_started');
  const gameCompleted = of('game_completed');
  const gameAborted = of('game_aborted');
  const playAgain = of('play_again');

  const ids = [...new Set([...gameIds, ...gameStarted.map((e) => e.gameId)])];
  const games: GameStatsRow[] = ids.map((gameId) => {
    const s = gameStarted.filter((e) => e.gameId === gameId);
    const c = gameCompleted.filter((e) => e.gameId === gameId);
    const a = gameAborted.filter((e) => e.gameId === gameId);
    const avg = c.length ? c.reduce((acc, e) => acc + e.durationMs, 0) / c.length / 1000 : null;
    return {
      gameId,
      started: s.length,
      completed: c.length,
      aborted: a.length,
      completionRate: s.length ? c.length / s.length : null,
      avgDurationSec: avg === null ? null : Math.round(avg),
      byPlayerCount: countBy(s, (e) => e.playerCount),
    };
  });

  return {
    generatedAt: Date.now(),
    since,
    totals: {
      rooms: of('room_created').length,
      playerJoins: of('player_joined').length,
      matchesStarted: matchStarted.length,
      matchesCompleted: matchCompleted.length,
      gamesCompleted: gameCompleted.length,
      playAgain: playAgain.length,
      replayRate: matchCompleted.length ? playAgain.length / matchCompleted.length : null,
    },
    matchesByPlayerCount: countBy(matchStarted, (e) => e.playerCount),
    matchesByGameRounds: countBy(matchStarted, (e) => e.gameRounds),
    games,
    leavesByPhase: countBy(of('player_left'), (e) => e.phase),
    recent: ev.slice(-50).reverse(),
  };
}
