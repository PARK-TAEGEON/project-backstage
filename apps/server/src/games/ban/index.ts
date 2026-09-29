/**
 * 금지어 — docs/context/catalog/games/BAN.md (v0.4) 구현, AI 없이 미리 고른 단어 풀 사용 (DEC-18).
 * 자기 금지어만 모르고 남의 금지어는 보인다. 누가 자기 금지어를 말하면 같은 그룹 나머지 전원 +1,
 * 말한 사람은 10초 안에 자기 금지어를 맞히는 챌린지(성공 +3·면제 / 실패 −3·입막힘) 또는 입막힘 10초.
 * 7명은 3/4, 8명은 4/4로 나눠 그룹별 채팅방에서 동시에 한다. 라운드마다 다시 섞는다.
 * **자기 금지어는 본인에게 절대 보내지 않는다** (B-6). 게임 규칙은 방에서 바꿀 수 없다 (DEC-15).
 */
import { rankByScore, type GameMeta } from '@backstage/shared';
import type { ChatDecision, GameContext, GameInstance, ServerGame } from '../types.js';
import { testRoundMs } from '../testTiming.js';
import { assignWords, containsWord, guessMatches, norm, SilenceHost, type AssignedWord } from '../wordcore/core.js';
import { WORD_POOLS_VERSION } from '../wordcore/pools.js';
import { formatDuration } from '../word/index.js';

export const BAN_META: GameMeta = {
  id: 'ban',
  name: '금지어',
  specVersion: '0.4',
  tagline: '내 금지어만 모른다! 남이 말하게 만들어라',
  mode: 'individual',
  relationship: 'both',
  length: 'short',
  ai: 'none',
  inputs: ['chat', 'text'],
  platforms: ['web', 'roblox'],
  minPlayers: 3,
  recommendedPlayers: [3, 4, 5, 6],
  maxPlayers: 8,
  settings: [],
};

/** 고정 규칙 (BAN 0.4 기본값, DEC-15). ctx.settings로 덮어쓰는 것은 테스트에서만 */
export const BAN_RULES = { rounds: 2, roundMs: 5 * 60_000, challengeMs: 10_000, muteMs: 10_000, challengePoints: 3 };
export const BAN_TIMING = { introMs: 5000, revealMs: 10_000 };

type Status = 'normal' | 'pending' | 'muted' | 'cleared';

/** 3~6명 한 그룹, 7명 3/4, 8명 4/4 (BAN 그룹 편성 [확정]) */
export function groupSizes(n: number): number[] {
  if (n <= 6) return [n];
  if (n === 7) return [3, 4];
  return [4, 4];
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 무작위로 나누되, 가능하면 지난 라운드와 같은 조합(같은 그룹이었던 쌍)이 적게 */
export function makeGroups(ids: string[], rand: () => number, prev: string[][] = []): string[][] {
  const sizes = groupSizes(ids.length);
  const together = (a: string, b: string) => prev.some((g) => g.includes(a) && g.includes(b));
  let best: string[][] = [];
  let bestCost = Infinity;
  for (let tries = 0; tries < (sizes.length > 1 && prev.length ? 30 : 1); tries++) {
    const s = shuffle(ids, rand);
    const groups: string[][] = [];
    let i = 0;
    for (const size of sizes) {
      groups.push(s.slice(i, i + size));
      i += size;
    }
    let cost = 0;
    for (const g of groups) for (let x = 0; x < g.length; x++) for (let y = x + 1; y < g.length; y++) if (together(g[x]!, g[y]!)) cost++;
    if (cost < bestCost) {
      best = groups;
      bestCost = cost;
    }
  }
  return best;
}

export interface BanEvent {
  kind: 'caught' | 'success' | 'fail' | 'skip';
  id: string;
  guess?: string;
}

export interface BanView {
  phase: 'intro' | 'play' | 'reveal' | 'done';
  round: number;
  rounds: number;
  remainingMs?: number;
  roundMs: number;
  groupCount: number;
  /** 내 그룹 번호 (1부터) */
  myGroupNo: number;
  /** 내 그룹이 먼저 끝나서 다른 그룹을 기다리는 중 */
  waiting: boolean;
  /** 같은 그룹 사람들. word는 **다른 사람 것만** 들어 있다 */
  group: { id: string; word?: string; pool?: 1 | 2 | 3; status: Status; caught: number; left: boolean }[];
  me: { status: Status; pendingRemainingMs?: number; mutedRemainingMs?: number; caughtLine?: string };
  challengeMs: number;
  /** 개인 점수 (공개) */
  scores: Record<string, number>;
  /** 이번 라운드 내 그룹 사건 */
  events: BanEvent[];
  /** 라운드 공개: 모든 사람의 금지어와 적발 횟수 */
  reveal?: { id: string; word: string; caught: number; groupNo: number; lines: string[] }[];
  poolsVersion: string;
}

interface PState {
  groupNo: number;
  word: AssignedWord;
  status: Status;
  pendingUntil: number;
  mutedUntil: number;
  caught: number;
  lines: string[];
  timer: number | null;
}

interface Group {
  no: number;
  members: string[];
  ended: boolean;
  events: BanEvent[];
  /** 진행 단계에서만 있다 (소개 중 이탈로 먼저 끝난 그룹은 없음) */
  host: SilenceHost | null;
}

class BanGame implements GameInstance {
  private readonly rounds: number;
  private readonly roundMs: number;
  private phase: BanView['phase'] = 'intro';
  private round = 0;
  private phaseEnd = 0;
  private roundEnd = 0;
  private phaseTimer: number | null = null;
  private groups: Group[] = [];
  private prevGroups: string[][] = [];
  private state = new Map<string, PState>();
  private scores = new Map<string, number>();
  private caughtTotal = new Map<string, number>();
  private usedWords = new Set<string>();
  private reveal?: BanView['reveal'];
  private finished = false;

  constructor(private ctx: GameContext) {
    this.rounds = Number(ctx.settings.rounds ?? BAN_RULES.rounds);
    this.roundMs = Number(ctx.settings.roundMs ?? testRoundMs(BAN_RULES.roundMs));
    for (const p of ctx.players) {
      this.scores.set(p.id, 0);
      this.caughtTotal.set(p.id, 0);
    }
  }

  private name(id: string) {
    return this.ctx.players.find((p) => p.id === id)?.nickname ?? '?';
  }

  private setPhase(phase: BanView['phase'], ms: number, next: () => void) {
    if (this.phaseTimer !== null) this.ctx.clearTimer(this.phaseTimer);
    this.phase = phase;
    this.phaseEnd = this.ctx.now() + ms;
    this.phaseTimer = this.ctx.setTimer(ms, () => {
      this.phaseTimer = null;
      next();
    });
    this.ctx.update();
  }

  start(): void {
    this.startRound();
  }

  // ───────── 라운드 ─────────

  private startRound() {
    const active = this.ctx.activePlayerIds();
    if (active.length < 3) return this.finish();
    const groups = makeGroups(active, () => this.ctx.random(), this.prevGroups);
    // 그룹별 배정 (그룹 안 중복 없음, 풀 3은 그룹당 0~1개). 모두 끝난 뒤 함께 시작한다 (B-6)
    const assigned: AssignedWord[][] = [];
    for (const g of groups) {
      const words = assignWords(g.length, () => this.ctx.random(), this.usedWords);
      if (!words) {
        this.ctx.say('단어가 모자라 게임을 시작하지 못했어요.');
        return this.finish(true);
      }
      words.forEach((w) => this.usedWords.add(w.word));
      assigned.push(words);
    }
    this.round += 1;
    this.prevGroups = groups;
    for (const s of this.state.values()) if (s.timer !== null) this.ctx.clearTimer(s.timer);
    this.state.clear();
    this.reveal = undefined;
    this.groups.forEach((g) => g.host?.stop());
    this.groups = groups.map((members, gi) => {
      members.forEach((id, i) =>
        this.state.set(id, { groupNo: gi + 1, word: assigned[gi]![i]!, status: 'normal', pendingUntil: 0, mutedUntil: 0, caught: 0, lines: [], timer: null }),
      );
      const group: Group = {
        no: gi + 1,
        members,
        ended: false,
        events: [],
        host: null,
      };
      return group;
    });
    const intro =
      this.groups.length > 1
        ? `🔀 ${this.round}라운드 그룹: ${this.groups.map((g) => `${g.no}조 ${g.members.map((id) => this.name(id)).join('·')}`).join(' / ')}`
        : `🤐 ${this.round}라운드 — 남의 금지어는 보이고, 내 것만 안 보여요`;
    this.ctx.say(intro);
    this.setPhase('intro', BAN_TIMING.introMs, () => this.beginPlay());
  }

  private beginPlay() {
    this.roundEnd = this.ctx.now() + this.roundMs;
    for (const g of this.groups) {
      if (g.ended) continue; // 소개 중에 먼저 끝난 그룹은 사회자 없음
      g.host = new SilenceHost(
        this.ctx,
        () => g.members.map((id) => this.state.get(id)!.word.word),
        () => g.members,
      );
    }
    this.setPhase('play', this.roundMs, () => this.endAllGroups());
    for (const g of this.groups) if (!g.ended) this.ctx.say(`💬 ${this.groups.length > 1 ? `${g.no}조 ` : ''}시작! (${formatDuration(this.roundMs)})`, g.members);
  }

  private groupOf(pid: string): Group | undefined {
    const st = this.state.get(pid);
    return st ? this.groups[st.groupNo - 1] : undefined;
  }

  // ───────── 입력 ─────────

  onChat(pid: string, text: string, t: number): ChatDecision {
    const g = this.groupOf(pid);
    const st = this.state.get(pid);
    // 게임 중(소개·진행)에는 그룹 채팅방: 같은 그룹에게만 보인다
    if (!g || !st || (this.phase !== 'play' && this.phase !== 'intro')) return { allow: true };
    const audience = g.members;
    if (this.phase !== 'play' || g.ended || t >= this.roundEnd) return { allow: true, audience };
    // 챌린지 대기·입막힘 중 본인 채팅은 거부 (저장·판정 안 함, B-3)
    if (st.status === 'pending') return { allow: false, reason: '🚨 금지어를 말했어요! 먼저 챌린지를 할지 정해 주세요' };
    if (st.status === 'muted') {
      if (t < st.mutedUntil) return { allow: false, reason: `🤐 입막힘 중 (${Math.ceil((st.mutedUntil - t) / 1000)}초)` };
      st.status = 'normal';
    }
    g.host?.heard();
    if (st.status === 'normal' && containsWord(text, st.word.word)) {
      this.caught(pid, g, norm(text), t);
    }
    return { allow: true, audience };
  }

  /** 적발: 나머지 전원 +1과 챌린지 대기 진입을 한 번에 확정 (B-3) */
  private caught(pid: string, g: Group, line: string, t: number) {
    const st = this.state.get(pid)!;
    st.caught += 1;
    this.caughtTotal.set(pid, (this.caughtTotal.get(pid) ?? 0) + 1);
    st.lines.push(line);
    for (const id of g.members) if (id !== pid && this.ctx.isActive(id)) this.scores.set(id, (this.scores.get(id) ?? 0) + 1);
    st.status = 'pending';
    st.pendingUntil = Math.min(t + BAN_RULES.challengeMs, this.roundEnd);
    g.events.push({ kind: 'caught', id: pid });
    // 걸린 메시지가 먼저 채팅에 올라간 뒤 알림이 나오게 한 박자 늦춘다
    this.ctx.setTimer(1, () => {
      this.ctx.say(`🚨 ${this.name(pid)} 님 금지어 적발! 나머지 전원 +1 — 챌린지할까요?`, g.members);
      this.ctx.update();
    });
    this.setPlayerTimer(pid, st.pendingUntil - this.ctx.now(), () => this.resolve(pid, 'skip'));
  }

  private setPlayerTimer(pid: string, ms: number, fn: () => void) {
    const st = this.state.get(pid)!;
    if (st.timer !== null) this.ctx.clearTimer(st.timer);
    st.timer = this.ctx.setTimer(Math.max(1, ms), () => {
      st.timer = null;
      fn();
    });
  }

  onAction(pid: string, action: unknown, t: number): void {
    const a = (action && typeof action === 'object' ? action : {}) as Record<string, unknown>;
    const st = this.state.get(pid);
    if (!st || st.status !== 'pending' || this.phase !== 'play') return;
    if (t >= st.pendingUntil) return; // 기한 뒤 응답은 무효 — “안 함”으로 이미 처리됨 (B-2)
    if (a.type === 'skip') return this.resolve(pid, 'skip');
    if (a.type === 'challenge' && typeof a.guess === 'string') {
      const guess = norm(a.guess).slice(0, 30);
      if (!guess) return;
      this.resolve(pid, guessMatches(guess, st.word.word) ? 'success' : 'fail', guess);
    }
  }

  /** 적발 한 번에 챌린지 결과는 한 번만 적용 (B-3) */
  private resolve(pid: string, result: 'success' | 'fail' | 'skip', guess?: string) {
    const st = this.state.get(pid);
    const g = this.groupOf(pid);
    if (!st || !g || st.status !== 'pending') return;
    if (st.timer !== null) {
      this.ctx.clearTimer(st.timer);
      st.timer = null;
    }
    const pts = BAN_RULES.challengePoints;
    if (result === 'success') {
      this.scores.set(pid, (this.scores.get(pid) ?? 0) + pts);
      st.status = 'cleared'; // 입막힘 면제, 이번 라운드 금지어 판정 해제
      this.ctx.say(`🎯 ${this.name(pid)} 님 챌린지 성공! 「${st.word.word}」 (+${pts}, 이번 라운드 판정 해제)`, g.members);
    } else {
      if (result === 'fail') this.scores.set(pid, (this.scores.get(pid) ?? 0) - pts);
      this.ctx.say(
        result === 'fail' ? `💀 ${this.name(pid)} 님 나락 (추측: ${guess}) −${pts} · 🤐 입막힘` : `🤐 ${this.name(pid)} 님 입막힘 ${BAN_RULES.muteMs / 1000}초 — 마음껏 놀리세요`,
        g.members,
      );
      if (this.phase === 'play' && !g.ended) {
        st.status = 'muted';
        st.mutedUntil = this.ctx.now() + BAN_RULES.muteMs;
        this.setPlayerTimer(pid, BAN_RULES.muteMs, () => {
          if (st.status === 'muted') st.status = 'normal';
          this.ctx.update();
        });
      } else st.status = 'normal';
    }
    g.events.push({ kind: result, id: pid, guess: result === 'fail' ? guess : undefined });
    this.ctx.update();
  }

  /** 이탈: 점수 유지. 그룹 인원이 3명 미만이 되면 그 그룹 라운드만 먼저 끝낸다 */
  onPlayerLeft(pid: string): void {
    if (this.phase !== 'play' && this.phase !== 'intro') return;
    const g = this.groupOf(pid);
    if (!g || g.ended) return;
    if (g.members.filter((id) => this.ctx.isActive(id)).length < 3) {
      this.endGroup(g);
      if (this.groups.every((x) => x.ended)) this.endAllGroups();
      else this.ctx.update();
    }
  }

  private endGroup(g: Group) {
    if (g.ended) return;
    g.ended = true;
    g.host?.stop();
    g.host = null;
    // 미완료 챌린지는 “안 함”으로 확정 (09 3절). 라운드가 끝났으므로 입막힘은 주지 않는다
    for (const id of g.members) {
      const st = this.state.get(id)!;
      if (st.timer !== null) {
        this.ctx.clearTimer(st.timer);
        st.timer = null;
      }
      if (st.status === 'pending') g.events.push({ kind: 'skip', id });
      if (st.status !== 'cleared') st.status = 'normal';
    }
    if (this.phase === 'play' && this.groups.length > 1) this.ctx.say(`⏸ ${g.no}조 라운드 종료 — 다른 조를 기다려요`, g.members);
  }

  private endAllGroups() {
    if (this.phase === 'reveal' || this.phase === 'done') return;
    for (const g of this.groups) this.endGroup(g);
    this.reveal = [...this.state].map(([id, st]) => ({ id, word: st.word.word, caught: st.caught, groupNo: st.groupNo, lines: st.lines.slice(-2) }));
    const summary = this.reveal.map((r) => `${this.name(r.id)} 「${r.word}」${r.caught ? ` ${r.caught}회 적발` : ''}`).join(' · ');
    this.ctx.say(`📋 ${this.round}라운드 금지어 공개: ${summary}`);
    const last = this.round >= this.rounds || this.ctx.activePlayerIds().length < 3;
    // 재편성은 모든 그룹이 끝난 뒤 한 번만 (B-5)
    this.setPhase('reveal', BAN_TIMING.revealMs, () => (last ? this.finish() : this.startRound()));
  }

  private finish(aborted = false) {
    if (this.finished) return;
    this.finished = true;
    this.groups.forEach((g) => g.host?.stop());
    for (const s of this.state.values()) if (s.timer !== null) this.ctx.clearTimer(s.timer);
    if (this.phaseTimer !== null) this.ctx.clearTimer(this.phaseTimer);
    this.phase = 'done';
    // 점수 → 동률이면 적발 횟수가 적은 사람 (BAN 동률 규칙)
    const key = Object.fromEntries(this.ctx.players.map((p) => [p.id, (this.scores.get(p.id) ?? 0) * 1000 - (this.caughtTotal.get(p.id) ?? 0)]));
    const ranking = rankByScore(key);
    const most = [...this.caughtTotal].sort((a, b) => b[1] - a[1])[0];
    const headlines = [`🤐 입이 제일 무거운 사람: ${(ranking[0] ?? []).map((id) => this.name(id)).join(', ')}`];
    if (most && most[1] > 0) headlines.push(`🚨 오늘의 지뢰 밟기 장인: ${this.name(most[0])} (${most[1]}회 적발)`);
    this.ctx.update();
    this.ctx.end({ ranking, gameScores: Object.fromEntries(this.scores), headlines, aborted: aborted || this.round === 0 });
  }

  view(pid: string): BanView {
    const now = this.ctx.now();
    const st = this.state.get(pid);
    const g = this.groupOf(pid);
    const inRound = this.phase === 'intro' || this.phase === 'play';
    return {
      phase: this.phase,
      round: this.round,
      rounds: this.rounds,
      remainingMs: this.phase === 'done' ? undefined : Math.max(0, this.phaseEnd - now),
      roundMs: this.roundMs,
      groupCount: this.groups.length,
      myGroupNo: st?.groupNo ?? 0,
      waiting: !!g?.ended && this.phase === 'play',
      group: (g?.members ?? []).map((id) => {
        const s = this.state.get(id)!;
        const secretOk = id !== pid && inRound; // 자기 금지어는 절대 보내지 않는다 (B-6)
        return {
          id,
          word: secretOk ? s.word.word : undefined,
          pool: secretOk ? s.word.pool : undefined,
          status: s.status,
          caught: s.caught,
          left: !this.ctx.isActive(id),
        };
      }),
      me: {
        status: st?.status ?? 'normal',
        pendingRemainingMs: st?.status === 'pending' ? Math.max(0, st.pendingUntil - now) : undefined,
        mutedRemainingMs: st?.status === 'muted' ? Math.max(0, st.mutedUntil - now) : undefined,
        caughtLine: st?.lines[st.lines.length - 1],
      },
      challengeMs: BAN_RULES.challengeMs,
      scores: Object.fromEntries(this.scores),
      events: g?.events ?? [],
      reveal: this.phase === 'reveal' || this.phase === 'done' ? this.reveal : undefined,
      poolsVersion: WORD_POOLS_VERSION,
    };
  }

  dispose(): void {
    this.groups.forEach((g) => g.host?.stop());
  }
}

export const ban: ServerGame = { meta: BAN_META, create: (ctx) => new BanGame(ctx) };
