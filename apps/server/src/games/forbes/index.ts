/**
 * 포브스 — docs/context/catalog/games/WHO.md (v0.4) 구현.
 * “○○일 것 같은 사람은?”에 10초 안에 한 명을 지목. 당선자는 “포브스 선정 ‘○○’ 1위”로 발표.
 * 점수는 재미용(나쁜 질문 당선 +1, 좋은 질문 당선 −1). 투표자는 절대 보내지 않는다(득표 수만).
 */
import { rankByScore, type GameMeta } from '@backstage/shared';
import type { GameContext, GameInstance, ServerGame } from '../types.js';
import { FORBES_QUESTIONS, type ForbesQuestion } from './questions.js';

export const FORBES_META: GameMeta = {
  id: 'forbes',
  name: '포브스',
  specVersion: '0.4',
  tagline: '○○일 것 같은 사람은? 10초 안에 지목!',
  mode: 'individual',
  relationship: 'friends',
  length: 'short',
  ai: 'none',
  inputs: ['vote'],
  platforms: ['web', 'roblox'],
  minPlayers: 3,
  recommendedPlayers: [4, 5, 6, 7, 8],
  maxPlayers: 8,
  settings: [
    { key: 'rounds', label: '질문 수', type: 'int', default: 7, min: 1, max: 12 },
    { key: 'spicyVote', label: '시작할 때 매운맛 투표', type: 'bool', default: true },
  ],
};

export const FORBES_TIMING = { spicyVoteMs: 10_000, voteMs: 10_000, revealMs: 5000 };

export interface ForbesView {
  phase: 'spicy_vote' | 'question' | 'reveal' | 'done';
  round: number;
  rounds: number;
  remainingMs?: number;
  spicy: { myChoice?: boolean; answered: number; total: number; result?: boolean };
  question?: { text: string };
  candidates: string[];
  myVote?: string;
  votedCount: number;
  voterCount: number;
  reveal?: { counts: Record<string, number>; winners: string[]; title: string; delta: number };
  scores: Record<string, number>;
  titles: Record<string, string[]>;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 나쁜 질문 약 4/7, 좋은 질문 나머지. 한 판 안에서 같은 질문은 반복하지 않는다. */
export function buildForbesDeck(rounds: number, spicy: boolean, rand: () => number): ForbesQuestion[] {
  const bad = shuffle(FORBES_QUESTIONS.filter((x) => x.kind === 'bad' && (spicy || !x.spicy)), rand);
  const good = shuffle(FORBES_QUESTIONS.filter((x) => x.kind === 'good'), rand);
  const wantBad = Math.min(bad.length, Math.ceil((rounds * 4) / 7));
  const picked = [...bad.slice(0, wantBad), ...good.slice(0, rounds - wantBad)];
  const rest = [...bad.slice(wantBad), ...good.slice(rounds - wantBad)];
  while (picked.length < rounds && rest.length) picked.push(rest.shift()!);
  return shuffle(picked, rand);
}

class ForbesGame implements GameInstance {
  private readonly rounds: number;
  private phase: ForbesView['phase'] = 'spicy_vote';
  private deadline = 0;
  private phaseTimer: number | null = null;
  private spicyChoices = new Map<string, boolean>();
  private spicyVoters: string[] = [];
  private spicyOn = false;
  private deck: ForbesQuestion[] = [];
  private round = 0;
  private candidates: string[] = [];
  private votes = new Map<string, string>();
  private reveal?: ForbesView['reveal'];
  private scores = new Map<string, number>();
  private titles = new Map<string, string[]>();
  private finished = false;

  constructor(private ctx: GameContext) {
    this.rounds = Number(ctx.settings.rounds ?? 7);
    for (const p of ctx.players) {
      this.scores.set(p.id, 0);
      this.titles.set(p.id, []);
    }
  }

  private name(id: string) {
    return this.ctx.players.find((p) => p.id === id)?.nickname ?? '?';
  }

  private setPhase(phase: ForbesView['phase'], ms: number, next: () => void) {
    if (this.phaseTimer !== null) this.ctx.clearTimer(this.phaseTimer);
    this.phase = phase;
    this.deadline = this.ctx.now() + ms;
    this.phaseTimer = this.ctx.setTimer(ms, () => {
      this.phaseTimer = null;
      next();
    });
    this.ctx.update();
  }

  start(): void {
    if (this.ctx.settings.spicyVote === false) {
      this.spicyOn = false;
      this.deck = buildForbesDeck(this.rounds, false, () => this.ctx.random());
      this.nextQuestion();
      return;
    }
    this.spicyVoters = this.ctx.activePlayerIds();
    this.setPhase('spicy_vote', FORBES_TIMING.spicyVoteMs, () => this.closeSpicyVote());
  }

  private closeSpicyVote() {
    if (this.phase !== 'spicy_vote') return;
    // 무응답·이탈은 “허용 안 함” — 전원이 명시적으로 찬성해야 매운맛 (H-1)
    this.spicyOn = this.spicyVoters.every((id) => this.spicyChoices.get(id) === true);
    this.ctx.say(this.spicyOn ? '🌶 만장일치! 매운맛 질문이 섞입니다.' : '🍼 순한맛으로 갑니다.');
    this.deck = buildForbesDeck(this.rounds, this.spicyOn, () => this.ctx.random());
    this.nextQuestion();
  }

  private nextQuestion() {
    const active = this.ctx.activePlayerIds();
    if (this.round >= this.deck.length || active.length < 3) return this.finish();
    this.round += 1;
    this.candidates = active; // 라운드 시작 시 고정 (H-4)
    this.votes.clear();
    this.reveal = undefined;
    this.setPhase('question', FORBES_TIMING.voteMs, () => this.closeVote());
  }

  onAction(pid: string, action: unknown): void {
    const a = (action && typeof action === 'object' ? action : {}) as Record<string, unknown>;
    if (this.phase === 'spicy_vote' && a.type === 'spicy' && typeof a.allow === 'boolean') {
      if (!this.spicyVoters.includes(pid) || this.spicyChoices.has(pid)) return;
      this.spicyChoices.set(pid, a.allow);
      if (this.spicyVoters.every((id) => this.spicyChoices.has(id) || !this.ctx.isActive(id))) this.closeSpicyVote();
      else this.ctx.update();
      return;
    }
    if (this.phase === 'question' && a.type === 'vote' && typeof a.target === 'string') {
      const target = a.target;
      // 첫 표로 확정, 자기 자신 불가, 후보만 (H-4)
      if (!this.candidates.includes(pid) || this.votes.has(pid)) return;
      if (target === pid || !this.candidates.includes(target)) return;
      this.votes.set(pid, target);
      const remaining = this.candidates.filter((id) => this.ctx.isActive(id) && !this.votes.has(id));
      if (remaining.length === 0) this.closeVote();
      else this.ctx.update();
    }
  }

  onPlayerLeft(): void {
    if (this.phase === 'spicy_vote' && this.spicyVoters.every((id) => this.spicyChoices.has(id) || !this.ctx.isActive(id))) {
      this.closeSpicyVote();
      return;
    }
    if (this.phase === 'question' && this.candidates.filter((id) => this.ctx.isActive(id) && !this.votes.has(id)).length === 0) {
      this.closeVote();
      return;
    }
    this.ctx.update();
  }

  private closeVote() {
    if (this.phase !== 'question') return;
    const q = this.deck[this.round - 1]!;
    const counts: Record<string, number> = Object.fromEntries(this.candidates.map((id) => [id, 0]));
    for (const target of this.votes.values()) counts[target] = (counts[target] ?? 0) + 1;
    const max = Math.max(0, ...Object.values(counts));
    // 유효표 0이면 당선자 없음 (H-3)
    const winners = max > 0 ? Object.entries(counts).filter(([, c]) => c === max).map(([id]) => id) : [];
    const delta = q.kind === 'bad' ? 1 : -1;
    for (const id of winners) {
      this.scores.set(id, (this.scores.get(id) ?? 0) + delta);
      this.titles.get(id)?.push(q.title);
    }
    this.reveal = { counts, winners, title: q.title, delta };
    if (winners.length) {
      const joint = winners.length > 1 ? ' 공동' : '';
      this.ctx.say(`🏆 포브스 선정 ‘${q.title}’${joint} 1위 — ${winners.map((id) => this.name(id)).join(', ')}`);
    } else {
      this.ctx.say(`🤐 ‘${q.title}’… 아무도 지목하지 않았다`);
    }
    this.setPhase('reveal', FORBES_TIMING.revealMs, () => this.nextQuestion());
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    if (this.phaseTimer !== null) this.ctx.clearTimer(this.phaseTimer);
    this.phase = 'done';
    const scores = Object.fromEntries(this.scores);
    const holders = [...this.titles.entries()].filter(([, t]) => t.length > 0).sort((a, b) => b[1].length - a[1].length);
    const headlines = holders.slice(0, 5).map(([id, t]) =>
      t.length > 1 ? `${this.name(id)}: 포브스 선정 ${t.length}관왕 (${t.join(', ')})` : `${this.name(id)}: 포브스 선정 ‘${t[0]}’`,
    );
    if (headlines.length === 0) headlines.push('이번 포브스는 조용히 넘어갔다…');
    this.ctx.update();
    this.ctx.end({ ranking: rankByScore(scores), gameScores: scores, headlines, aborted: this.round === 0 });
  }

  view(pid: string): ForbesView {
    const now = this.ctx.now();
    const q = this.round > 0 ? this.deck[this.round - 1] : undefined;
    return {
      phase: this.phase,
      round: this.round,
      rounds: this.deck.length || this.rounds,
      remainingMs: this.phase === 'done' ? undefined : Math.max(0, this.deadline - now),
      spicy: {
        myChoice: this.spicyChoices.get(pid),
        answered: this.spicyChoices.size,
        total: this.spicyVoters.length,
        result: this.phase === 'spicy_vote' ? undefined : this.spicyOn,
      },
      question: q && (this.phase === 'question' || this.phase === 'reveal') ? { text: q.text } : undefined,
      candidates: this.candidates,
      myVote: this.votes.get(pid),
      votedCount: this.votes.size,
      voterCount: this.candidates.length,
      reveal: this.phase === 'reveal' ? this.reveal : undefined,
      scores: Object.fromEntries(this.scores),
      titles: Object.fromEntries(this.titles),
    };
  }
}

export const forbes: ServerGame = {
  meta: FORBES_META,
  create: (ctx) => new ForbesGame(ctx),
};
