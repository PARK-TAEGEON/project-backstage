/**
 * 단어 말하기 — docs/context/catalog/games/WORD.md (v0.4) 구현, AI 없이 미리 고른 단어 풀 사용 (DEC-18).
 * 각자 몰래 받은 단어를 채팅에 끼워 넣으면 +1 (15초 간격). 남의 단어를 맞히는 챌린지: 성공 +3·대상 잠금, 실패 −3.
 * 라운드 중 단어 득점은 **본인에게만** 알리고(W-6), 다른 사람 점수는 라운드 공개 때 보여 준다.
 * 게임 규칙은 방에서 바꿀 수 없다 (DEC-15).
 */
import { rankByScore, type GameMeta } from '@backstage/shared';
import type { ChatDecision, GameContext, GameInstance, ServerGame } from '../types.js';
import { testRoundMs } from '../testTiming.js';
import { assignWords, containsWord, guessMatches, norm, SilenceHost, type AssignedWord } from '../wordcore/core.js';
import { WORD_POOLS_VERSION } from '../wordcore/pools.js';

export const WORD_META: GameMeta = {
  id: 'word',
  name: '단어 말하기',
  specVersion: '0.4',
  tagline: '몰래 받은 단어를 채팅에 끼워 넣어라! 들키면 역습당한다',
  mode: 'individual',
  relationship: 'both',
  length: 'medium',
  ai: 'none',
  inputs: ['chat', 'text'],
  platforms: ['web', 'roblox'],
  minPlayers: 3,
  recommendedPlayers: [4, 5, 6],
  maxPlayers: 8,
  settings: [],
};

/** 고정 규칙 (WORD 0.4 기본값, DEC-15). ctx.settings로 덮어쓰는 것은 테스트에서만 */
export const WORD_RULES = {
  rounds: 3,
  roundMs: 5 * 60_000,
  scoreGapMs: 15_000,
  challengeGapMs: 3000,
  sameTargetGapMs: 10_000,
  challengePoints: 3,
};
export const WORD_TIMING = { introMs: 4000, revealMs: 10_000 };

export interface WordChallenge {
  by: string;
  target: string;
  success: boolean;
  /** 실패 시 틀린 추측, 성공 시 대상의 단어 (둘 다 공개 정보) */
  text: string;
}

export interface WordRevealRow {
  id: string;
  word: string;
  pool: 1 | 2 | 3;
  uses: number;
  challengePoints: number;
  roundScore: number;
  bestLine?: string;
  locked: boolean;
}

export interface WordView {
  phase: 'intro' | 'play' | 'reveal' | 'done';
  round: number;
  rounds: number;
  remainingMs?: number;
  roundMs: number;
  /** 본인에게만: 내 단어 */
  myWord?: { word: string; pool: 1 | 2 | 3 };
  myLocked: boolean;
  /** 본인에게만: 이번 라운드 내 점수와 단어 득점 횟수 */
  myRoundScore: number;
  myUses: number;
  /** 본인에게만: 다음 단어 득점까지 남은 시간 (0이면 바로 가능) */
  myNextScoreInMs: number;
  /** 본인에게만: 단어 득점할 때마다 1씩 늘어난다 (화면에 “+1” 표시용) */
  myScoreSeq: number;
  /** 이번 라운드 참가자와 잠금 여부 (공개) */
  players: { id: string; locked: boolean; left: boolean }[];
  /** 이번 라운드 챌린지 기록 (공개) */
  challenges: WordChallenge[];
  /** 지난 라운드까지 공개된 합계 (라운드 중 단어 득점은 숨김) */
  totals: Record<string, number>;
  reveal?: WordRevealRow[];
  poolsVersion: string;
}

interface PState {
  word: AssignedWord;
  locked: boolean;
  uses: number;
  challengePoints: number;
  lastScoreAt: number;
  bestLine?: string;
  lastChallengeAt: number;
  lastChallengeOn: Map<string, number>;
  scoreSeq: number;
}

export function formatDuration(ms: number): string {
  return ms >= 60_000 && ms % 60_000 === 0 ? `${ms / 60_000}분` : `${Math.round(ms / 1000)}초`;
}

class WordGame implements GameInstance {
  private readonly rounds: number;
  private readonly roundMs: number;
  private phase: WordView['phase'] = 'intro';
  private round = 0;
  private phaseEnd = 0;
  private phaseTimer: number | null = null;
  private roundPlayers: string[] = [];
  private state = new Map<string, PState>();
  private challenges: WordChallenge[] = [];
  private totals = new Map<string, number>();
  private successes = new Map<string, number>();
  private usedWords = new Set<string>();
  private reveal?: WordRevealRow[];
  private host: SilenceHost | null = null;
  private stopAfterRound = false;
  private finished = false;

  constructor(private ctx: GameContext) {
    this.rounds = Number(ctx.settings.rounds ?? WORD_RULES.rounds);
    this.roundMs = Number(ctx.settings.roundMs ?? testRoundMs(WORD_RULES.roundMs));
    for (const p of ctx.players) {
      this.totals.set(p.id, 0);
      this.successes.set(p.id, 0);
    }
  }

  private name(id: string) {
    return this.ctx.players.find((p) => p.id === id)?.nickname ?? '?';
  }

  private setPhase(phase: WordView['phase'], ms: number, next: () => void) {
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

  private startRound() {
    const active = this.ctx.activePlayerIds();
    if (active.length < 3) return this.finish();
    const words = assignWords(active.length, () => this.ctx.random(), this.usedWords);
    if (!words) {
      this.ctx.say('단어가 모자라 게임을 시작하지 못했어요.');
      return this.finish(true);
    }
    this.round += 1;
    this.roundPlayers = active;
    this.state.clear();
    this.challenges = [];
    this.reveal = undefined;
    active.forEach((id, i) => {
      const w = words[i]!;
      this.usedWords.add(w.word);
      this.state.set(id, {
        word: w,
        locked: false,
        uses: 0,
        challengePoints: 0,
        lastScoreAt: -Infinity,
        lastChallengeAt: -Infinity,
        lastChallengeOn: new Map(),
        scoreSeq: 0,
      });
    });
    this.setPhase('intro', WORD_TIMING.introMs, () => this.beginPlay());
  }

  private beginPlay() {
    this.host?.stop();
    this.host = new SilenceHost(this.ctx, () => [...this.state.values()].map((s) => s.word.word));
    this.setPhase('play', this.roundMs, () => this.endRound());
    this.ctx.say(`💬 ${this.round}라운드 시작! 내 단어를 몰래 끼워 넣으세요 (${formatDuration(this.roundMs)})`);
  }

  // ───────── 입력 ─────────

  onChat(pid: string, text: string, t: number): ChatDecision {
    if (this.phase !== 'play' || t >= this.phaseEnd) return { allow: true };
    this.host?.heard();
    const st = this.state.get(pid);
    if (!st) return { allow: true };
    // 처리 순서 (W-2): 마감 전 → 잠금 아님 → 마지막 실제 득점 후 15초 → 단어 포함
    if (st.locked) return { allow: true };
    if (t - st.lastScoreAt < WORD_RULES.scoreGapMs) return { allow: true };
    if (!containsWord(text, st.word.word)) return { allow: true };
    st.uses += 1;
    st.lastScoreAt = t;
    st.scoreSeq += 1;
    const line = norm(text);
    if (!st.bestLine || line.length > st.bestLine.length) st.bestLine = line;
    // 본인에게만 다시 보낸다 — 모두에게 보내면 갱신 시점으로 득점 메시지가 드러난다 (W-6)
    if (this.ctx.updatePlayer) this.ctx.updatePlayer(pid);
    else this.ctx.update();
    return { allow: true };
  }

  onAction(pid: string, action: unknown, t: number): void {
    const a = (action && typeof action === 'object' ? action : {}) as Record<string, unknown>;
    if (a.type !== 'challenge' || typeof a.target !== 'string' || typeof a.guess !== 'string') return;
    if (this.phase !== 'play' || t >= this.phaseEnd) return;
    const me = this.state.get(pid);
    const target = this.state.get(a.target);
    if (!me || !target || a.target === pid) return;
    if (target.locked) return; // 이미 잠긴 대상 — 무효, 감점 없음
    if (t - me.lastChallengeAt < WORD_RULES.challengeGapMs) return;
    if (t - (me.lastChallengeOn.get(a.target) ?? -Infinity) < WORD_RULES.sameTargetGapMs) return;
    const guess = norm(a.guess).slice(0, 30);
    if (!guess) return;
    me.lastChallengeAt = t;
    me.lastChallengeOn.set(a.target, t);
    // 성공 판정·점수·잠금을 한 번에 확정 (09 2절)
    if (guessMatches(guess, target.word.word)) {
      me.challengePoints += WORD_RULES.challengePoints;
      target.locked = true;
      this.successes.set(pid, (this.successes.get(pid) ?? 0) + 1);
      this.challenges.push({ by: pid, target: a.target, success: true, text: target.word.word });
      this.ctx.say(`🎯 ${this.name(pid)} → ${this.name(a.target)} 챌린지 성공! 단어는 「${target.word.word}」 (+${WORD_RULES.challengePoints}, ${this.name(a.target)} 잠금)`);
    } else {
      me.challengePoints -= WORD_RULES.challengePoints;
      this.challenges.push({ by: pid, target: a.target, success: false, text: guess });
      this.ctx.say(`💀 ${this.name(pid)} 챌린지 실패 — ${this.name(a.target)}에게 「${guess}」 (−${WORD_RULES.challengePoints})`);
    }
    this.ctx.update();
  }

  /** 이탈해도 이번 라운드 끝까지 챌린지 대상으로 남는다 (W-3). 3명 미만이 되면 라운드를 바로 끝내고 경기 종료 */
  onPlayerLeft(): void {
    if (this.phase === 'done') return;
    if (this.ctx.activePlayerIds().length < 3) {
      this.stopAfterRound = true;
      if (this.phase === 'play' || this.phase === 'intro') this.endRound();
    }
  }

  // ───────── 라운드 종료 ─────────

  private endRound() {
    if (this.phase === 'reveal' || this.phase === 'done') return;
    this.host?.stop();
    this.host = null;
    // 마감 → 결과 잠금 → 집계 → 공개 (09 3절)
    this.reveal = this.roundPlayers.map((id) => {
      const st = this.state.get(id)!;
      const roundScore = st.uses + st.challengePoints;
      this.totals.set(id, (this.totals.get(id) ?? 0) + roundScore);
      return {
        id,
        word: st.word.word,
        pool: st.word.pool,
        uses: st.uses,
        challengePoints: st.challengePoints,
        roundScore,
        bestLine: st.bestLine,
        locked: st.locked,
      };
    });
    const summary = [...this.reveal]
      .sort((x, y) => y.roundScore - x.roundScore)
      .map((r) => `${this.name(r.id)} 「${r.word}」 ${r.roundScore >= 0 ? '+' : ''}${r.roundScore}`)
      .join(' · ');
    this.ctx.say(`📋 ${this.round}라운드 공개: ${summary}`);
    const last = this.round >= this.rounds || this.stopAfterRound || this.ctx.activePlayerIds().length < 3;
    this.setPhase('reveal', WORD_TIMING.revealMs, () => (last ? this.finish() : this.startRound()));
  }

  private finish(aborted = false) {
    if (this.finished) return;
    this.finished = true;
    this.host?.stop();
    if (this.phaseTimer !== null) this.ctx.clearTimer(this.phaseTimer);
    this.phase = 'done';
    // 합계 → 동률이면 챌린지 성공 수 (WORD 동률 규칙)
    const key = Object.fromEntries(this.ctx.players.map((p) => [p.id, (this.totals.get(p.id) ?? 0) * 1000 + (this.successes.get(p.id) ?? 0)]));
    const ranking = rankByScore(key);
    const top = ranking[0] ?? [];
    const headlines = top.length ? [`🗣 오늘의 말빨왕: ${top.map((id) => this.name(id)).join(', ')} (${this.totals.get(top[0]!) ?? 0}점)`] : [];
    const bestSniper = [...this.successes].sort((a, b) => b[1] - a[1])[0];
    if (bestSniper && bestSniper[1] > 0) headlines.push(`🎯 저격수: ${this.name(bestSniper[0])} (챌린지 성공 ${bestSniper[1]}회)`);
    this.ctx.update();
    this.ctx.end({ ranking, gameScores: Object.fromEntries(this.totals), headlines, aborted: aborted || this.round === 0 });
  }

  view(pid: string): WordView {
    const now = this.ctx.now();
    const st = this.state.get(pid);
    const inRound = this.phase === 'intro' || this.phase === 'play';
    return {
      phase: this.phase,
      round: this.round,
      rounds: this.rounds,
      remainingMs: this.phase === 'done' ? undefined : Math.max(0, this.phaseEnd - now),
      roundMs: this.roundMs,
      // 비밀 정보는 본인 view에만 (09 5절). 라운드 공개 뒤에는 reveal로 모두에게.
      myWord: st && inRound ? { word: st.word.word, pool: st.word.pool } : undefined,
      myLocked: !!st?.locked,
      myRoundScore: st ? st.uses + st.challengePoints : 0,
      myUses: st?.uses ?? 0,
      myNextScoreInMs: st && this.phase === 'play' ? Math.max(0, st.lastScoreAt + WORD_RULES.scoreGapMs - now) : 0,
      myScoreSeq: st?.scoreSeq ?? 0,
      players: this.roundPlayers.map((id) => ({ id, locked: !!this.state.get(id)?.locked, left: !this.ctx.isActive(id) })),
      challenges: this.challenges,
      totals: this.publicTotals(),
      reveal: this.phase === 'reveal' || this.phase === 'done' ? this.reveal : undefined,
      poolsVersion: WORD_POOLS_VERSION,
    };
  }

  /** 라운드 중에는 지난 라운드까지의 합계만 공개 (이번 라운드 단어 득점은 숨김) */
  private publicTotals(): Record<string, number> {
    return Object.fromEntries(this.totals);
  }

  dispose(): void {
    this.host?.stop();
  }
}

export const word: ServerGame = { meta: WORD_META, create: (ctx) => new WordGame(ctx) };
