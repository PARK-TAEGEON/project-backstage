/**
 * 눈치게임 — docs/context/catalog/games/NUNCHI.md (v0.3) 구현.
 * 채팅에 1부터 숫자를 친다. **누군가 걸리는 순간 그 라운드는 끝난다** (보통 탈락자 1명):
 * - 같은 숫자를 0.001초 안에 치면 모두 탈락 (동시)
 * - 같은 숫자를 늦게 친 사람, 순서가 틀린 사람, 카운트다운 중에 친 사람은 혼자 탈락
 * - 아무도 안 걸리면 마지막까지 못 친 1명이 탈락
 * 판정은 전부 서버 접수 시각 기준. 게임 규칙(3라운드, 0.001초)은 방에서 바꿀 수 없다 (DEC-15).
 */
import { rankByScore, type GameMeta } from '@backstage/shared';
import type { GameContext, GameInstance, ServerGame, ChatDecision } from '../types.js';

/** 고정 규칙. ctx.settings로 덮어쓰는 것은 테스트 코드에서만 쓴다 (방 설정에는 노출하지 않음). */
export const NUNCHI_RULES = { rounds: 3, simulWindowMs: 1 };

export const NUNCHI_META: GameMeta = {
  id: 'nunchi',
  name: '눈치게임',
  specVersion: '0.3',
  tagline: '1부터 숫자를 채팅에! 겹치면 탈락!',
  mode: 'individual',
  relationship: 'both',
  length: 'short',
  ai: 'none',
  inputs: ['chat'],
  platforms: ['web', 'roblox'],
  minPlayers: 4,
  recommendedPlayers: [4, 5, 6, 7, 8],
  maxPlayers: 8,
  settings: [],
};

export const NUNCHI_TIMING = { countdownMs: 3000, idleMs: 10_000, roundResultMs: 3500 };

type Status = 'pending' | 'success' | 'out';
interface Submission {
  pid: string;
  n: number;
  t: number;
}
interface Claim {
  number: number;
  ids: string[];
  collision: boolean;
  diffMs?: number;
}

export interface NunchiView {
  phase: 'countdown' | 'live' | 'round_result' | 'done';
  round: number;
  rounds: number;
  /** countdown 단계에서 시작까지 남은 ms */
  startsInMs?: number;
  /** live 단계에서 무응답 탈락까지 남은 ms */
  idleRemainingMs?: number;
  expected: number;
  windowMs: number;
  players: { id: string; status: Status | 'spectator'; reason?: string; outCount: number }[];
  claims: Claim[];
  me: Status | 'spectator';
}

const NUMBER_RE = /^[1-8]$/;

class NunchiGame implements GameInstance {
  private readonly rounds: number;
  private readonly windowMs: number;
  private phase: NunchiView['phase'] = 'countdown';
  private round = 0;
  private startAt = 0;
  private expected = 1;
  private status = new Map<string, Status>();
  private reason = new Map<string, string>();
  private outCount = new Map<string, number>();
  private claims: Claim[] = [];
  private queue: Submission[] = [];
  private win: { number: number; t0: number; subs: Submission[] } | null = null;
  private idleDeadline = 0;
  private idleTimer: number | null = null;
  private closeTimer: number | null = null;
  private finished = false;

  constructor(private ctx: GameContext) {
    this.rounds = Number(ctx.settings.rounds ?? NUNCHI_RULES.rounds);
    this.windowMs = Number(ctx.settings.simulWindowMs ?? NUNCHI_RULES.simulWindowMs);
    for (const p of ctx.players) this.outCount.set(p.id, 0);
  }

  start(): void {
    this.startRound();
  }

  private name(id: string) {
    return this.ctx.players.find((p) => p.id === id)?.nickname ?? '?';
  }

  private startRound(): void {
    const active = this.ctx.activePlayerIds();
    if (active.length < NUNCHI_META.minPlayers) return this.finish(); // 4명 미만이면 남은 라운드 없이 종료
    this.round += 1;
    this.phase = 'countdown';
    this.expected = 1;
    this.status = new Map(active.map((id) => [id, 'pending' as Status]));
    this.reason.clear();
    this.claims = [];
    this.queue = [];
    this.win = null;
    this.startAt = this.ctx.now() + NUNCHI_TIMING.countdownMs;
    this.ctx.setTimer(NUNCHI_TIMING.countdownMs, () => {
      if (this.phase !== 'countdown') return;
      this.phase = 'live';
      this.resetIdle(this.startAt);
      this.ctx.update();
    });
    this.ctx.update();
  }

  onChat(pid: string, text: string, t: number): ChatDecision {
    const trimmed = text.trim();
    if (!NUMBER_RE.test(trimmed)) return { allow: true };
    if (this.phase !== 'countdown' && this.phase !== 'live') return { allow: true };
    if (this.status.get(pid) !== 'pending') return { allow: true }; // 이미 성공·탈락, 또는 관전자 — 무효
    if (t < this.startAt) {
      this.eliminate(pid, '부정출발');
      this.ctx.say(`🚫 ${this.name(pid)} 부정출발!`);
      this.endRound();
      this.ctx.update();
      return { allow: true };
    }
    this.queue.push({ pid, n: Number(trimmed), t });
    this.drain();
    this.ctx.update();
    return { allow: true };
  }

  onAction(): void {
    // 눈치게임은 채팅만 입력으로 쓴다.
  }

  /** 라운드 중 연결이 끊기면 그 라운드 제출 자격을 잃는다 (NUNCHI 재접속 규칙, 09 4절 예외) */
  onPlayerDisconnected(pid: string): void {
    this.onPlayerLeft(pid);
  }

  onPlayerLeft(pid: string): void {
    if (this.status.get(pid) === 'pending' && !this.win?.subs.some((s) => s.pid === pid)) {
      this.eliminate(pid, '연결 끊김');
      this.checkEnd();
      this.ctx.update();
    }
  }

  private eliminate(pid: string, why: string) {
    if (this.status.get(pid) !== 'pending') return;
    this.status.set(pid, 'out');
    this.reason.set(pid, why);
    this.outCount.set(pid, (this.outCount.get(pid) ?? 0) + 1);
  }

  /** 접수 순서대로 처리한다. 판정 창이 열려 있으면 창 안의 같은 숫자만 받고, 다른 입력은 창이 닫힐 때까지 기다린다. */
  private drain(): void {
    while (this.queue.length > 0) {
      if (this.win) {
        const w = this.win;
        const limit = w.t0 + this.windowMs;
        // 창 안에 들어온 같은 숫자는 사이에 다른 숫자가 끼어 있어도 모두 같은 묶음 (N-2)
        this.queue = this.queue.filter((q) => {
          if (q.t > limit || q.n !== w.number) return true;
          if (this.status.get(q.pid) === 'pending' && !w.subs.some((s) => s.pid === q.pid)) w.subs.push(q);
          return false;
        });
        const head = this.queue[0];
        if (!head) break;
        if (head.t <= limit) break; // 창 안의 다른 숫자 — 창이 닫힌 뒤 처리
        this.closeWindow();
        continue;
      }
      const item = this.queue[0]!;
      this.queue.shift();
      if (this.status.get(item.pid) !== 'pending') continue;
      if (item.n === this.expected) {
        this.win = { number: item.n, t0: item.t, subs: [item] };
        this.scheduleClose();
      } else if (item.n < this.expected) {
        this.eliminate(item.pid, `늦은 입력 (${item.n})`);
        this.ctx.say(`🐢 ${this.name(item.pid)} 늦었다! (${item.n})`);
        this.endRound();
        return;
      } else {
        this.eliminate(item.pid, `순서 틀림 (${item.n})`);
        this.ctx.say(`❓ ${this.name(item.pid)} 순서 틀림! (${item.n})`);
        this.endRound();
        return;
      }
    }
    if (!this.win) this.checkEnd();
  }

  private scheduleClose() {
    if (!this.win) return;
    if (this.closeTimer !== null) this.ctx.clearTimer(this.closeTimer);
    const wait = this.win.t0 + this.windowMs - this.ctx.now() + 1;
    this.closeTimer = this.ctx.setTimer(Math.max(1, wait), () => {
      this.closeTimer = null;
      if (!this.win) return;
      // 서버 타이머는 ms 단위라 고해상도 시계보다 아주 조금 일찍 울릴 수 있다 → 아직이면 다시 예약
      if (this.ctx.now() <= this.win.t0 + this.windowMs) {
        this.scheduleClose();
        return;
      }
      this.closeWindow();
      this.drain();
      this.ctx.update();
    });
  }

  private closeWindow() {
    const w = this.win;
    if (!w || (this.phase !== 'live' && this.phase !== 'countdown')) return;
    this.win = null;
    if (this.closeTimer !== null) {
      this.ctx.clearTimer(this.closeTimer);
      this.closeTimer = null;
    }
    const ids = w.subs.map((s) => s.pid);
    if (ids.length === 1) {
      this.status.set(ids[0]!, 'success');
      this.claims.push({ number: w.number, ids, collision: false });
    } else {
      const ts = w.subs.map((s) => s.t);
      const diffMs = Math.max(...ts) - Math.min(...ts);
      for (const id of ids) this.eliminate(id, `동시 입력 (${w.number})`);
      this.claims.push({ number: w.number, ids, collision: true, diffMs });
      this.ctx.say(`💥 ${ids.map((id) => this.name(id)).join(' · ')} 동시! (${(diffMs / 1000).toFixed(3)}초 차)`);
      this.endRound(); // 걸린 순간 라운드 종료
      return;
    }
    this.expected = w.number + 1;
    this.resetIdle(this.ctx.now());
  }

  private resetIdle(from: number) {
    if (this.idleTimer !== null) this.ctx.clearTimer(this.idleTimer);
    this.idleDeadline = from + NUNCHI_TIMING.idleMs;
    this.idleTimer = this.ctx.setTimer(Math.max(0, this.idleDeadline - this.ctx.now()), () => {
      this.idleTimer = null;
      if (this.phase !== 'live') return;
      // 마감 전에 접수된 숫자가 아직 판정 중이면 먼저 처리한다 (09 3절). 확정되면 무응답 시간이 다시 시작된다.
      if (this.win || this.queue.length > 0) {
        this.drain();
        return;
      }
      const pending = [...this.status].filter(([, s]) => s === 'pending').map(([id]) => id);
      for (const id of pending) this.eliminate(id, '시간 초과');
      if (pending.length) this.ctx.say(`⏰ 시간 초과: ${pending.map((id) => this.name(id)).join(', ')}`);
      this.endRound();
    });
  }

  private checkEnd() {
    if (this.phase !== 'live' && this.phase !== 'countdown') return;
    if (this.win || this.queue.length > 0) return;
    const pending = [...this.status].filter(([, s]) => s === 'pending').map(([id]) => id);
    if (pending.length > 1) return;
    // 카운트다운 중 부정출발로 1명 이하가 남은 경우도 여기서 라운드 종료
    for (const id of pending) {
      this.eliminate(id, '마지막까지 못 침');
      this.ctx.say(`😵 ${this.name(id)} 마지막까지 못 쳤다!`);
    }
    this.endRound();
  }

  private endRound() {
    if (this.phase === 'round_result' || this.phase === 'done') return;
    if (this.closeTimer !== null) {
      this.ctx.clearTimer(this.closeTimer);
      this.closeTimer = null;
    }
    this.win = null;
    this.queue = [];
    // 걸리지 않은 사람은 이번 라운드 통과
    for (const [id, st] of this.status) if (st === 'pending') this.status.set(id, 'success');
    if (this.idleTimer !== null) {
      this.ctx.clearTimer(this.idleTimer);
      this.idleTimer = null;
    }
    this.phase = 'round_result';
    const outs = [...this.status].filter(([, st]) => st === 'out').map(([id]) => this.name(id));
    this.ctx.say(`📋 ${this.round}라운드 탈락: ${outs.length ? outs.join(', ') : '없음'}`);
    this.ctx.update();
    this.ctx.setTimer(NUNCHI_TIMING.roundResultMs, () => {
      if (this.round < this.rounds && this.ctx.activePlayerIds().length >= NUNCHI_META.minPlayers) this.startRound();
      else this.finish();
    });
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.phase = 'done';
    const outs = Object.fromEntries(this.ctx.players.map((p) => [p.id, this.outCount.get(p.id) ?? 0]));
    const ranking = rankByScore(outs, false);
    const maxOut = Math.max(...Object.values(outs));
    const worst = Object.entries(outs).filter(([, c]) => c === maxOut && c > 0).map(([id]) => this.name(id));
    const headlines = worst.length
      ? [`오늘의 눈치 없는 사람: ${worst.join(', ')} (${maxOut}회 탈락)`]
      : ['전원 무사 통과… 눈치 만렙들!'];
    this.ctx.update();
    this.ctx.end({ ranking, gameScores: outs, headlines, aborted: this.round === 0 });
  }

  view(pid: string): NunchiView {
    const now = this.ctx.now();
    const players = this.ctx.players.map((p) => ({
      id: p.id,
      status: this.status.get(p.id) ?? ('spectator' as const),
      reason: this.reason.get(p.id),
      outCount: this.outCount.get(p.id) ?? 0,
    }));
    return {
      phase: this.phase,
      round: this.round,
      rounds: this.rounds,
      startsInMs: this.phase === 'countdown' ? Math.max(0, this.startAt - now) : undefined,
      idleRemainingMs: this.phase === 'live' ? Math.max(0, this.idleDeadline - now) : undefined,
      expected: this.expected,
      windowMs: this.windowMs,
      players,
      claims: this.claims,
      me: this.status.get(pid) ?? 'spectator',
    };
  }
}

export const nunchi: ServerGame = {
  meta: NUNCHI_META,
  create: (ctx) => new NunchiGame(ctx),
};
