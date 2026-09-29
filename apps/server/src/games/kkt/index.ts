/**
 * 쿵쿵따 — docs/context/catalog/games/KKT.md (v0.3) 구현.
 * 순서대로 **세 글자 단어**를 앞 단어의 끝 글자로 잇는다. 차례당 5초, 실패하면 바로 탈락.
 * 한 명이 탈락할 때마다 한 라운드가 끝나고, 한 명만 남으면 경기 종료 (N명이면 N−1라운드).
 * 단어는 전용 입력칸(game:action)으로 받고, 채팅은 판정하지 않는다 → 기다리는 사람은 채팅으로 방해할 수 있다.
 * 판정은 사전 데이터로 서버가 한다 (AI 없음). 게임 규칙은 방에서 바꿀 수 없다 (DEC-15).
 */
import type { GameMeta } from '@backstage/shared';
import type { GameContext, GameInstance, ServerGame } from '../types.js';
import { DICT_CREDIT, defaultDictionary, type KktDictionary } from './dictionary.js';
import { allowedStarts, isThreeSyllables, normalizeSubmission } from './hangul.js';

export const KKT_META: GameMeta = {
  id: 'kkt',
  name: '쿵쿵따',
  specVersion: '0.3',
  tagline: '세 글자 단어 잇기! 5초 안에 못 대면 탈락!',
  mode: 'individual',
  relationship: 'both',
  length: 'short',
  ai: 'none',
  inputs: ['text'],
  platforms: ['web', 'roblox'],
  minPlayers: 3,
  recommendedPlayers: [3, 4, 5, 6],
  maxPlayers: 8,
  settings: [],
};

/** 고정 규칙 (DEC-05, DEC-15) */
export const KKT_RULES = { turnMs: 5000 };
export const KKT_TIMING = { roundIntroMs: 2500, roundResultMs: 3000 };

export type KktFailReason = 'timeout' | 'length' | 'start' | 'not_in_dict' | 'used' | 'left';

export const KKT_FAIL_TEXT: Record<KktFailReason, string> = {
  timeout: '시간 초과',
  length: '세 글자가 아닙니다',
  start: '첫 글자가 안 맞습니다',
  not_in_dict: '사전에 없는 단어입니다',
  used: '이미 나온 단어입니다',
  left: '나감',
};

export interface KktChainItem {
  word: string;
  by: string;
  def: string;
  /** 이 단어 끝 글자로 이어 갈 수 있는 (안 쓴) 단어가 하나도 없음 */
  hanbang: boolean;
}

export interface KktView {
  phase: 'intro' | 'turn' | 'round_result' | 'done';
  round: number;
  /** 이번 라운드 시작 글자 */
  startSyllable: string;
  /** 지금 차례인 사람 (라운드 소개 중에는 첫 차례가 될 사람) */
  current?: string;
  /** 지금 차례에 허용되는 첫 글자 (두음법칙 포함) */
  required: string[];
  turnMs: number;
  turnRemainingMs?: number;
  phaseRemainingMs?: number;
  /** 살아남은 사람, 차례 순서대로 */
  order: string[];
  /** 탈락 순서대로 */
  eliminated: { id: string; reason: KktFailReason; word?: string }[];
  /** 이번 라운드에 이어진 단어 (최근 12개) */
  chain: KktChainItem[];
  lastFail?: { id: string; reason: KktFailReason; word?: string };
  me: 'alive' | 'out' | 'spectator';
  usedCount: number;
  dict: { version: string; credit: string };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

class KktGame implements GameInstance {
  private phase: KktView['phase'] = 'intro';
  private round = 0;
  private order: string[] = [];
  private turnIdx = 0;
  private startSyllable = '';
  private required: string[] = [];
  private turnStart = 0;
  private phaseEnd = 0;
  private turnTimer: number | null = null;
  private phaseTimer: number | null = null;
  private used = new Set<string>();
  private chain: KktChainItem[] = [];
  private eliminated: KktView['eliminated'] = [];
  private lastFail?: KktView['lastFail'];
  private wordsBy = new Map<string, number>();
  private hanbangs: { id: string; word: string }[] = [];
  private finished = false;
  private dict: KktDictionary | null = null;

  constructor(
    private ctx: GameContext,
    private loadDict: () => KktDictionary,
  ) {
    for (const p of ctx.players) this.wordsBy.set(p.id, 0);
  }

  private name(id: string) {
    return this.ctx.players.find((p) => p.id === id)?.nickname ?? '?';
  }

  start(): void {
    try {
      this.dict = this.loadDict();
      if (this.dict.size === 0) throw new Error('empty dictionary');
    } catch {
      // 사전 장애는 참가자 탈락이 아니라 경기 중단 (K-3)
      this.finished = true;
      this.phase = 'done';
      this.ctx.end({
        ranking: [this.ctx.players.map((p) => p.id)],
        headlines: ['사전을 불러오지 못해 쿵쿵따를 중단했어요.'],
        aborted: true,
      });
      return;
    }
    this.order = shuffle(this.ctx.activePlayerIds(), () => this.ctx.random());
    this.turnIdx = 0;
    this.startRound();
  }

  // ───────── 라운드 ─────────

  /** 아직 안 쓴 답이 있는 시작 글자를 뽑는다 (K-2). 너무 드문 글자는 되도록 피한다. */
  private pickStartSyllable(): string | null {
    const dict = this.dict!;
    const rand = () => this.ctx.random();
    let fallback: string | null = null;
    for (let i = 0; i < 40; i++) {
      const w = dict.randomWord(rand);
      if (!w || this.used.has(w)) continue;
      const syl = w[0]!;
      const answers = this.unusedAnswers(allowedStarts(syl));
      if (answers === 0) continue;
      if (!fallback) fallback = syl;
      if (answers >= 30) return syl;
    }
    if (fallback) return fallback;
    // 무작위 추첨이 모두 빗나가면(사전이 거의 소진) 남은 단어를 순서대로 찾는다
    for (const s of this.dict!.syllables()) if (this.unusedAnswers(allowedStarts(s), 1) > 0) return s;
    return null;
  }

  private unusedAnswers(starts: string[], limit = 30): number {
    let n = 0;
    for (const s of starts) {
      for (const w of this.dict!.startingWith(s)) {
        if (!this.used.has(w) && ++n >= limit) return n;
      }
    }
    return n;
  }

  private startRound() {
    if (this.finished) return;
    if (this.order.length <= 1) return this.finish();
    const syl = this.pickStartSyllable();
    if (!syl) {
      // 뽑을 글자가 없으면 남은 생존자 공동 1위 (사실상 발생하지 않음)
      this.ctx.say('더 이을 글자가 없어 남은 사람 모두 1위!');
      return this.finish();
    }
    this.round += 1;
    this.startSyllable = syl;
    this.required = allowedStarts(syl);
    this.chain = [];
    this.lastFail = undefined;
    this.clearTurnTimer();
    this.setPhase('intro', KKT_TIMING.roundIntroMs, () => this.beginTurn());
    this.ctx.say(`🥁 ${this.round}라운드 — 시작 글자 「${syl}」, ${this.name(this.order[this.turnIdx]!)} 님부터!`);
  }

  private setPhase(phase: KktView['phase'], ms: number, next: () => void) {
    if (this.phaseTimer !== null) this.ctx.clearTimer(this.phaseTimer);
    this.phase = phase;
    this.phaseEnd = this.ctx.now() + ms;
    this.phaseTimer = this.ctx.setTimer(ms, () => {
      this.phaseTimer = null;
      next();
    });
    this.ctx.update();
  }

  private beginTurn() {
    if (this.finished) return;
    if (this.order.length <= 1) return this.finish();
    this.turnIdx %= this.order.length;
    this.phase = 'turn';
    this.turnStart = this.ctx.now();
    this.scheduleTimeout();
    this.ctx.update();
  }

  private scheduleTimeout() {
    this.clearTurnTimer();
    const wait = this.turnStart + KKT_RULES.turnMs - this.ctx.now();
    this.turnTimer = this.ctx.setTimer(Math.max(1, wait), () => {
      this.turnTimer = null;
      if (this.phase !== 'turn') return;
      // 서버 타이머는 ms 단위라 시계보다 조금 일찍 울릴 수 있다 → 아직이면 다시 예약
      if (this.ctx.now() < this.turnStart + KKT_RULES.turnMs) return this.scheduleTimeout();
      this.fail(this.order[this.turnIdx]!, 'timeout');
    });
  }

  private clearTurnTimer() {
    if (this.turnTimer !== null) {
      this.ctx.clearTimer(this.turnTimer);
      this.turnTimer = null;
    }
  }

  // ───────── 입력 ─────────

  onAction(pid: string, action: unknown, receivedAt: number): void {
    const a = (action && typeof action === 'object' ? action : {}) as Record<string, unknown>;
    if (a.type !== 'word' || typeof a.word !== 'string') return;
    if (this.phase !== 'turn' || this.finished) return;
    if (this.order[this.turnIdx] !== pid) return; // 차례가 아닌 사람의 제출은 무효 (K-3)
    // 차례 시작 ≤ 접수 < 차례 시작 + 5초 인 첫 제출만 (K-3)
    if (receivedAt < this.turnStart || receivedAt >= this.turnStart + KKT_RULES.turnMs) return;
    const word = normalizeSubmission(a.word.slice(0, 20));
    if (!word) return;
    this.judge(pid, word);
  }

  private judge(pid: string, word: string) {
    const dict = this.dict!;
    let reason: KktFailReason | null = null;
    if (!isThreeSyllables(word)) reason = 'length';
    else if (!this.required.includes(word[0]!)) reason = 'start';
    else if (!dict.has(word)) reason = 'not_in_dict';
    else if (this.used.has(word)) reason = 'used';
    if (reason) return this.fail(pid, reason, word);

    this.clearTurnTimer();
    this.used.add(word);
    this.wordsBy.set(pid, (this.wordsBy.get(pid) ?? 0) + 1);
    const next = allowedStarts(word[2]!);
    const hanbang = this.unusedAnswers(next, 1) === 0;
    if (hanbang) this.hanbangs.push({ id: pid, word });
    this.chain.push({ word, by: pid, def: dict.definition(word) ?? '', hanbang });
    if (this.chain.length > 12) this.chain.shift();
    this.required = next;
    this.lastFail = undefined;
    if (hanbang) this.ctx.say(`💣 한방단어! ${this.name(pid)} 「${word}」`);
    this.turnIdx = (this.turnIdx + 1) % this.order.length;
    this.beginTurn();
  }

  /** 실패 = 바로 탈락, 라운드 종료 */
  private fail(pid: string, reason: KktFailReason, word?: string) {
    if (this.phase !== 'turn' || this.finished) return;
    this.clearTurnTimer();
    const idx = this.order.indexOf(pid);
    if (idx < 0) return;
    this.order.splice(idx, 1);
    this.eliminated.push({ id: pid, reason, word });
    this.lastFail = { id: pid, reason, word };
    this.ctx.say(`❌ ${this.name(pid)} ${word ? `「${word}」… ` : ''}${KKT_FAIL_TEXT[reason]}`);
    // 새 라운드는 탈락자 다음 사람부터
    this.turnIdx = this.order.length ? idx % this.order.length : 0;
    if (this.order.length <= 1) {
      this.phase = 'round_result';
      this.phaseEnd = this.ctx.now();
      return this.finish();
    }
    this.setPhase('round_result', KKT_TIMING.roundResultMs, () => this.startRound());
  }

  /** 이탈 확정 순서대로 탈락자로 기록. 재접속해도 탈락은 취소되지 않는다 (K-4). */
  onPlayerLeft(pid: string): void {
    if (this.finished) return;
    const idx = this.order.indexOf(pid);
    if (idx < 0) return;
    if (this.phase === 'turn' && idx === this.turnIdx) return this.fail(pid, 'left');
    this.order.splice(idx, 1);
    this.eliminated.push({ id: pid, reason: 'left' });
    this.ctx.say(`🚪 ${this.name(pid)} 님이 나가서 탈락`);
    if (idx < this.turnIdx) this.turnIdx -= 1;
    if (this.order.length) this.turnIdx %= this.order.length;
    if (this.order.length <= 1) return this.finish();
    this.ctx.update();
  }

  /** 아무도 플레이로 탈락하지 않고 나간 사람만 있으면 경기 중단으로 기록 (09 4절 전원 이탈) */
  private onlyLeavers(): boolean {
    return this.eliminated.length > 0 && this.eliminated.every((e) => e.reason === 'left');
  }

  // ───────── 종료 ─────────

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.clearTurnTimer();
    if (this.phaseTimer !== null) this.ctx.clearTimer(this.phaseTimer);
    this.phase = 'done';
    const alive = [...this.order];
    const ranked = new Set([...alive, ...this.eliminated.map((e) => e.id)]);
    const ranking: string[][] = [];
    if (alive.length) ranking.push(alive);
    for (const e of [...this.eliminated].reverse()) ranking.push([e.id]);
    const absent = this.ctx.players.map((p) => p.id).filter((id) => !ranked.has(id));
    if (absent.length) ranking.push(absent);
    const headlines = [
      alive.length === 1 ? `🏆 최후의 1인: ${this.name(alive[0]!)}` : `🏆 공동 1위: ${alive.map((id) => this.name(id)).join(', ')}`,
    ];
    const bomb = this.hanbangs[this.hanbangs.length - 1];
    if (bomb) headlines.push(`💣 한방단어: ${this.name(bomb.id)} 「${bomb.word}」`);
    this.ctx.update();
    const aborted = this.round === 0 || this.onlyLeavers();
    if (aborted && this.round > 0) headlines.unshift('모두 나가서 경기가 중단됐어요.');
    this.ctx.end({ ranking, gameScores: Object.fromEntries(this.wordsBy), headlines, aborted });
  }

  view(pid: string): KktView {
    const now = this.ctx.now();
    const out = this.eliminated.some((e) => e.id === pid);
    return {
      phase: this.phase,
      round: this.round,
      startSyllable: this.startSyllable,
      current: this.phase === 'turn' || this.phase === 'intro' ? this.order[this.turnIdx] : undefined,
      required: this.required,
      turnMs: KKT_RULES.turnMs,
      turnRemainingMs: this.phase === 'turn' ? Math.max(0, this.turnStart + KKT_RULES.turnMs - now) : undefined,
      phaseRemainingMs: this.phase === 'intro' || this.phase === 'round_result' ? Math.max(0, this.phaseEnd - now) : undefined,
      order: this.order,
      eliminated: this.eliminated,
      chain: this.chain,
      lastFail: this.lastFail,
      me: this.order.includes(pid) ? 'alive' : out ? 'out' : 'spectator',
      usedCount: this.used.size,
      dict: { version: this.dict?.version ?? '', credit: DICT_CREDIT },
    };
  }

  dispose(): void {
    this.clearTurnTimer();
  }
}

/** 테스트에서 작은 사전을 넣을 수 있게 사전 공급자를 받는다. */
export function createKkt(loadDict: () => KktDictionary = defaultDictionary): ServerGame {
  return { meta: KKT_META, create: (ctx) => new KktGame(ctx, loadDict) };
}

export const kkt: ServerGame = createKkt();
