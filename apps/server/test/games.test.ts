import { describe, expect, it } from 'vitest';
import { FakeClock } from '../src/clock.js';
import type { GameContext, GameOutcome, GameInstance, ServerGame } from '../src/games/types.js';
import { nunchi, NUNCHI_TIMING, type NunchiView } from '../src/games/nunchi/index.js';
import { forbes, buildForbesDeck, FORBES_TIMING, type ForbesView } from '../src/games/forbes/index.js';
import { defaultGameSettings } from '@backstage/shared';

function harness(game: ServerGame, ids: string[], settings: Record<string, unknown> = {}) {
  const clock = new FakeClock();
  const left = new Set<string>();
  const said: string[] = [];
  let outcome: GameOutcome | null = null;
  const ctx: GameContext = {
    players: ids.map((id) => ({ id, nickname: id })),
    settings: { ...defaultGameSettings(game.meta), ...settings } as never,
    now: () => clock.now(),
    setTimer: (ms, fn) => clock.setTimeout(() => !outcome && fn(), ms),
    clearTimer: (id) => clock.clearTimeout(id),
    isActive: (id) => !left.has(id),
    activePlayerIds: () => ids.filter((id) => !left.has(id)),
    update: () => {},
    say: (t) => said.push(t),
    end: (o) => {
      if (!outcome) outcome = o;
    },
    random: () => 0.42,
  };
  const inst: GameInstance = game.create(ctx);
  return {
    clock,
    inst,
    said,
    left,
    get outcome() {
      return outcome;
    },
  };
}

describe('눈치게임 (v0.3: 4인 이상, 0.001초, 걸리면 라운드 종료)', () => {
  const live = (rounds = 1) => {
    const h = harness(nunchi, ['a', 'b', 'c', 'd'], { rounds });
    h.inst.start();
    h.clock.advance(NUNCHI_TIMING.countdownMs);
    return h;
  };
  type H = ReturnType<typeof live>;
  const view = (h: H, id = 'a') => h.inst.view(id) as NunchiView;
  const st = (h: H, id: string) => view(h).players.find((p) => p.id === id)!.status;
  const say = (h: H, id: string, n: string, dt = 0) => {
    h.clock.advance(dt);
    h.inst.onChat!(id, n, h.clock.now());
  };

  it('기본 규칙: 최소 4명, 0.001초, 3라운드, 방 설정 없음', () => {
    expect(nunchi.meta.minPlayers).toBe(4);
    expect(nunchi.meta.settings).toEqual([]);
    const h = harness(nunchi, ['a', 'b', 'c', 'd'], {});
    h.inst.start();
    expect((h.inst.view('a') as NunchiView).windowMs).toBe(1);
    expect((h.inst.view('a') as NunchiView).rounds).toBe(3);
  });

  it('카운트다운 중 숫자는 부정출발 → 그 사람만 탈락하고 라운드 종료', () => {
    const h = harness(nunchi, ['a', 'b', 'c', 'd'], { rounds: 1 });
    h.inst.start();
    h.inst.onChat!('a', '1', h.clock.now() + 100);
    const v = h.inst.view('b') as NunchiView;
    expect(v.players.find((p) => p.id === 'a')!.status).toBe('out');
    expect(v.phase).toBe('round_result');
    expect(v.players.filter((p) => p.status === 'out')).toHaveLength(1);
  });

  it('0.001초 이내 같은 숫자는 둘 다 탈락, 라운드 종료', () => {
    const h = live();
    say(h, 'a', '1');
    say(h, 'b', '1', 0.6);
    h.clock.advance(5);
    expect(st(h, 'a')).toBe('out');
    expect(st(h, 'b')).toBe('out');
    expect(view(h).phase).toBe('round_result');
    expect(st(h, 'c')).toBe('success');
  });

  it('정확히 0.001초 차이는 동시로 본다', () => {
    const h = live();
    say(h, 'a', '1');
    say(h, 'b', '1', 1);
    h.clock.advance(5);
    expect(st(h, 'a')).toBe('out');
    expect(st(h, 'b')).toBe('out');
  });

  it('같은 숫자를 늦게 친 사람만 탈락하고 라운드 종료 (탈락자 1명)', () => {
    const h = live();
    say(h, 'a', '1');
    say(h, 'b', '1', 2); // 0.002초 늦음
    h.clock.advance(5);
    expect(st(h, 'a')).toBe('success');
    expect(st(h, 'b')).toBe('out');
    expect(view(h).phase).toBe('round_result');
    expect(view(h).players.filter((p) => p.status === 'out')).toHaveLength(1);
  });

  it('순서 틀린 숫자는 그 사람만 탈락, 라운드 종료', () => {
    const h = live();
    say(h, 'b', '5');
    expect(st(h, 'b')).toBe('out');
    expect(view(h).phase).toBe('round_result');
  });

  it('아무도 안 걸리면 마지막까지 못 친 1명이 탈락', () => {
    const h = live();
    say(h, 'a', '1');
    say(h, 'b', '2', 20);
    say(h, 'c', '3', 20);
    h.clock.advance(20);
    expect(st(h, 'd')).toBe('out');
    expect(view(h).players.filter((p) => p.status === 'out').map((p) => p.id)).toEqual(['d']);
  });

  it('창이 열린 동안 온 다음 숫자는 창이 닫힌 뒤 처리한다 (N-1)', () => {
    const h = live();
    say(h, 'a', '1');
    say(h, 'b', '2', 0.5);
    h.clock.advance(10);
    expect(st(h, 'a')).toBe('success');
    expect(st(h, 'b')).toBe('success');
    expect(view(h).phase).toBe('live');
  });

  it('창 안의 같은 숫자는 사이에 다른 숫자가 끼어도 동시로 묶는다 (리뷰 #1)', () => {
    const h = live();
    say(h, 'a', '1');
    say(h, 'b', '2', 0.3);
    say(h, 'c', '1', 0.3);
    h.clock.advance(10);
    expect(st(h, 'a')).toBe('out');
    expect(st(h, 'c')).toBe('out');
    expect(view(h).claims[0]).toMatchObject({ number: 1, collision: true });
  });

  it('무응답 마감 직전에 접수된 숫자는 먼저 판정하고 탈락시키지 않는다 (리뷰 #2)', () => {
    const h = live(); // live 시작 = 3000, 무응답 마감 = 13000
    h.clock.advance(9995);
    say(h, 'a', '1');
    say(h, 'b', '2', 3);
    h.clock.advance(30);
    expect(st(h, 'a')).toBe('success');
    expect(st(h, 'b')).toBe('success');
    expect(view(h).phase).toBe('live');
  });

  it('판정 창 타이머가 일찍 울려도 창은 결국 닫힌다 (실서버 타이머 오차)', () => {
    const h = live();
    h.inst.onChat!('a', '1', h.clock.now() + 0.9);
    h.clock.advance(30);
    expect(st(h, 'a')).toBe('success');
  });

  it('일반 채팅은 무응답 타이머를 늘리지 않는다 (N-4)', () => {
    const h = live();
    for (let i = 0; i < 3; i++) say(h, 'a', 'ㅋㅋ', 3000);
    h.clock.advance(1100);
    expect(view(h).phase).toBe('round_result');
    expect(view(h).players.every((p) => p.status === 'out')).toBe(true);
  });

  it('숫자 문법: 1!, 01, 전각 숫자는 제출이 아니다 (N-5)', () => {
    const h = live();
    say(h, 'a', '1!');
    say(h, 'a', '01');
    say(h, 'a', '１');
    expect(st(h, 'a')).toBe('pending');
  });

  it('이미 성공한 사람의 추가 숫자는 무효', () => {
    const h = live();
    say(h, 'a', '1');
    h.clock.advance(10);
    say(h, 'a', '2');
    h.clock.advance(10);
    expect(st(h, 'a')).toBe('success');
    expect(view(h).expected).toBe(2);
  });

  it('3라운드 뒤 탈락 횟수가 적은 순, 최다 탈락자는 눈치 없는 사람', () => {
    const h = live(3);
    for (let r = 0; r < 3; r++) {
      if (r > 0) h.clock.advance(NUNCHI_TIMING.roundResultMs + NUNCHI_TIMING.countdownMs);
      say(h, 'a', '1');
      say(h, 'b', '2', 20);
      say(h, 'c', '3', 20);
      h.clock.advance(20);
    }
    h.clock.advance(NUNCHI_TIMING.roundResultMs + 10);
    expect(h.outcome).not.toBeNull();
    expect(h.outcome!.ranking).toEqual([['a', 'b', 'c'], ['d']]);
    expect(h.outcome!.headlines[0]).toContain('d');
    expect(h.outcome!.gameScores!.d).toBe(3);
  });
});

describe('포브스', () => {
  it('기본 규칙: 질문 7개, 매운맛 투표 항상, 방 설정 없음', () => {
    expect(forbes.meta.settings).toEqual([]);
    const h = harness(forbes, ['a', 'b', 'c'], {});
    h.inst.start();
    expect((h.inst.view('a') as ForbesView).phase).toBe('spicy_vote');
    expect((h.inst.view('a') as ForbesView).rounds).toBe(7);
  });

  it('매운맛은 전원 찬성일 때만, 무응답은 반대로 센다 (H-1)', () => {
    const h = harness(forbes, ['a', 'b', 'c'], { rounds: 2 });
    h.inst.start();
    h.inst.onAction('a', { type: 'spicy', allow: true }, 0);
    h.inst.onAction('b', { type: 'spicy', allow: true }, 0);
    h.clock.advance(FORBES_TIMING.spicyVoteMs);
    const v = h.inst.view('a') as ForbesView;
    expect(v.spicy.result).toBe(false);
    expect(v.phase).toBe('question');
  });

  it('첫 표 확정·자기 지목 불가·전원 투표 시 즉시 공개, 나쁜 질문 당선 +1', () => {
    const h = harness(forbes, ['a', 'b', 'c'], { rounds: 1, spicyVote: false });
    h.inst.start();
    h.inst.onAction('a', { type: 'vote', target: 'a' }, 0); // 자기 자신 — 무효
    h.inst.onAction('a', { type: 'vote', target: 'b' }, 0);
    h.inst.onAction('a', { type: 'vote', target: 'c' }, 0); // 변경 불가
    h.inst.onAction('c', { type: 'vote', target: 'b' }, 0);
    h.inst.onAction('b', { type: 'vote', target: 'a' }, 0);
    const v = h.inst.view('a') as ForbesView;
    expect(v.phase).toBe('reveal');
    expect(v.reveal!.counts).toEqual({ a: 1, b: 2, c: 0 });
    expect(v.reveal!.winners).toEqual(['b']);
    expect(v.scores.b).toBe(v.reveal!.delta);
    expect(h.said.some((s) => s.includes('포브스 선정'))).toBe(true);
  });

  it('view에는 누가 누구를 찍었는지가 없다 (투표자 비공개)', () => {
    const h = harness(forbes, ['a', 'b', 'c'], { rounds: 1, spicyVote: false });
    h.inst.start();
    h.inst.onAction('a', { type: 'vote', target: 'b' }, 0);
    const other = JSON.stringify(h.inst.view('c'));
    expect(other).not.toContain('"myVote":"b"');
    expect((h.inst.view('c') as ForbesView).myVote).toBeUndefined();
    expect((h.inst.view('c') as ForbesView).votedCount).toBe(1);
  });

  it('유효표 0이면 당선자 없음 (H-3)', () => {
    const h = harness(forbes, ['a', 'b', 'c'], { rounds: 1, spicyVote: false });
    h.inst.start();
    h.clock.advance(FORBES_TIMING.voteMs);
    const v = h.inst.view('a') as ForbesView;
    expect(v.reveal!.winners).toEqual([]);
    expect(Object.values(v.scores).every((s) => s === 0)).toBe(true);
  });

  it('덱: 같은 질문 반복 없음, 매운맛 꺼지면 매운 질문 없음', () => {
    const deck = buildForbesDeck(12, false, Math.random);
    expect(new Set(deck.map((q) => q.id)).size).toBe(deck.length);
    expect(deck.some((q) => q.spicy)).toBe(false);
    expect(deck).toHaveLength(12);
  });

  it('질문이 모두 끝나면 게임 종료, 3명 미만이 되면 조기 종료', () => {
    const h = harness(forbes, ['a', 'b', 'c'], { rounds: 3, spicyVote: false });
    h.inst.start();
    h.clock.advance(FORBES_TIMING.voteMs + FORBES_TIMING.revealMs);
    h.left.add('c');
    h.inst.onPlayerLeft?.('c');
    h.clock.advance(FORBES_TIMING.voteMs + FORBES_TIMING.revealMs);
    expect(h.outcome).not.toBeNull();
  });
});
