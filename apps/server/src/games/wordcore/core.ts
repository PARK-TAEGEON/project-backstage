/**
 * 단어 말하기·금지어 공통 부품: 정규화, 글자열 포함 판정, 단어 배정, 침묵 감지 사회자.
 */
import type { GameContext } from '../types.js';
import { HOST_LINES, POOL_1, POOL_2, POOL_3, isValidAssignableWord } from './pools.js';

/** 09-ENGINE-RULES 7절: NFC + 앞뒤 공백 제거. 같은 함수를 배정 단어·채팅·추측에 쓴다 */
export function norm(s: string): string {
  return s.normalize('NFC').trim();
}

/** 인정 규칙: 배정 단어의 글자열이 메시지 안에 그대로 들어 있으면 인정 (한 메시지에 여러 번이어도 1회) */
export function containsWord(message: string, word: string): boolean {
  return norm(message).includes(norm(word));
}

/** 챌린지 일치: 앞뒤 공백을 뺀 뒤 정확히 같을 때 */
export function guessMatches(guess: string, word: string): boolean {
  return norm(guess) === norm(word) && norm(word).length > 0;
}

export interface AssignedWord {
  word: string;
  pool: 1 | 2 | 3;
}

function pick<T>(arr: T[], rand: () => number): T | undefined {
  if (!arr.length) return undefined;
  return arr.splice(Math.floor(rand() * arr.length), 1)[0];
}

/**
 * n명에게 단어를 하나씩 배정한다 (W-4).
 * - 풀 3은 한 번에 0개 또는 1개 (반반 확률)
 * - 같은 배정 안에서 중복 없음, exclude(이번 경기에 이미 쓴 단어)는 되도록 피한다
 * - 형태 규칙(2음절 이상·공백 없음)을 다시 검사한다
 * 부족하면 null (시작 실패 안내).
 */
export function assignWords(n: number, rand: () => number, exclude: ReadonlySet<string> = new Set()): AssignedWord[] | null {
  const fresh = (pool: string[]) => pool.filter((w) => isValidAssignableWord(w) && !exclude.has(w));
  const valid = (pool: string[]) => pool.filter(isValidAssignableWord);
  const p1 = fresh(POOL_1);
  const p2 = fresh(POOL_2);
  const p3 = fresh(POOL_3);
  const easy: AssignedWord[] = [...p1.map((word) => ({ word, pool: 1 as const })), ...p2.map((word) => ({ word, pool: 2 as const }))];
  // 이미 쓴 단어를 빼고 모자라면 전체에서 다시 채운다
  if (easy.length < n) {
    const used = new Set(easy.map((e) => e.word));
    for (const word of valid(POOL_1)) if (!used.has(word)) easy.push({ word, pool: 1 });
    for (const word of valid(POOL_2)) if (!used.has(word)) easy.push({ word, pool: 2 });
  }
  const out: AssignedWord[] = [];
  if (n >= 2 && rand() < 0.5) {
    const w = pick(p3.length ? p3 : valid(POOL_3), rand);
    if (w) out.push({ word: w, pool: 3 });
  }
  while (out.length < n) {
    const w = pick(easy, rand);
    if (!w) return null;
    if (!out.some((o) => o.word === w.word)) out.push(w);
  }
  // 누가 풀 3을 받는지도 무작위
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * 침묵 감지 사회자 (물꼬 트기). 채팅이 silenceMs 동안 없을 때만, 최소 minGapMs 간격으로 한 문장.
 * 사회자는 비밀 단어를 모른다 — 문장을 고른 뒤 서버가 비밀 단어 포함 여부를 검사해 버린다 (W-1, B-1).
 */
export const HOST_TIMING = { silenceMs: 30_000, minGapMs: 120_000 };

export class SilenceHost {
  private lastHuman: number;
  private lastHost = -Infinity;
  private timer: number | null = null;
  private used = new Set<number>();
  private stopped = false;

  constructor(
    private ctx: GameContext,
    private secrets: () => string[],
    private audience?: () => string[],
  ) {
    this.lastHuman = ctx.now();
    this.schedule();
  }

  heard() {
    this.lastHuman = this.ctx.now();
  }

  stop() {
    this.stopped = true;
    if (this.timer !== null) this.ctx.clearTimer(this.timer);
    this.timer = null;
  }

  private schedule() {
    if (this.stopped) return;
    const due = Math.max(this.lastHuman + HOST_TIMING.silenceMs, this.lastHost + HOST_TIMING.minGapMs);
    this.timer = this.ctx.setTimer(Math.max(50, due - this.ctx.now()), () => this.tick());
  }

  private tick() {
    this.timer = null;
    if (this.stopped) return;
    const now = this.ctx.now();
    if (now - this.lastHuman >= HOST_TIMING.silenceMs && now - this.lastHost >= HOST_TIMING.minGapMs) {
      const line = this.pickLine();
      if (line) this.ctx.say(`🎙 사회자: ${line}`, this.audience?.());
      this.lastHost = now; // 문장이 없어도 이번 회차는 넘어간다
    }
    this.schedule();
  }

  pickLine(): string | null {
    const secrets = this.secrets().map(norm).filter(Boolean);
    const ok = HOST_LINES.map((l, i) => [l, i] as const).filter(([l, i]) => !this.used.has(i) && !secrets.some((s) => norm(l).includes(s)));
    if (!ok.length) return null;
    const [line, idx] = ok[Math.floor(this.ctx.random() * ok.length)]!;
    this.used.add(idx);
    return line;
  }
}
