import { describe, expect, it } from 'vitest';
import { FakeClock } from '../src/clock.js';
import type { GameContext, GameOutcome, GameInstance, ServerGame } from '../src/games/types.js';
import { word, WORD_RULES, WORD_TIMING, type WordView } from '../src/games/word/index.js';
import { ban, BAN_RULES, BAN_TIMING, groupSizes, makeGroups, type BanView } from '../src/games/ban/index.js';
import { assignWords, containsWord, guessMatches, HOST_TIMING, SilenceHost } from '../src/games/wordcore/core.js';
import { HOST_LINES, POOL_1, POOL_2, POOL_3, isValidAssignableWord } from '../src/games/wordcore/pools.js';

function lcg(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function harness(game: ServerGame, ids: string[], settings: Record<string, unknown> = {}) {
  const clock = new FakeClock();
  const left = new Set<string>();
  const said: { text: string; audience?: string[] }[] = [];
  let outcome: GameOutcome | null = null;
  const rand = lcg();
  const ctx: GameContext = {
    players: ids.map((id) => ({ id, nickname: id })),
    settings: settings as never,
    now: () => clock.now(),
    setTimer: (ms, fn) => clock.setTimeout(() => !outcome && fn(), ms),
    clearTimer: (id) => clock.clearTimeout(id),
    isActive: (id) => !left.has(id),
    activePlayerIds: () => ids.filter((id) => !left.has(id)),
    update: () => {},
    say: (text, audience) => said.push({ text, audience }),
    end: (o) => {
      if (!outcome) outcome = o;
    },
    random: rand,
  };
  const inst: GameInstance = game.create(ctx);
  return {
    clock,
    inst,
    said,
    left,
    chat(id: string, text: string, dt = 0) {
      clock.advance(dt);
      return inst.onChat!(id, text, clock.now());
    },
    act(id: string, action: unknown, dt = 0) {
      clock.advance(dt);
      inst.onAction(id, action, clock.now());
    },
    get outcome() {
      return outcome;
    },
  };
}

describe('단어 풀·공통 부품', () => {
  it('모든 풀 단어가 2음절 이상·공백 없음, 풀 안 중복 없음, 목록이 충분히 크다', () => {
    for (const pool of [POOL_1, POOL_2, POOL_3]) {
      expect(pool.every(isValidAssignableWord)).toBe(true);
      expect(new Set(pool).size).toBe(pool.length);
    }
    expect(POOL_1.length).toBeGreaterThanOrEqual(200);
    expect(POOL_2.length).toBeGreaterThanOrEqual(340);
    expect(POOL_3.length).toBeGreaterThanOrEqual(250);
    expect(HOST_LINES.length).toBeGreaterThanOrEqual(120);
    const all = [...POOL_1, ...POOL_2, ...POOL_3];
    expect(new Set(all).size).toBe(all.length); // 풀 사이 중복 없음
  });
  it('배정: 정확히 N개, 중복 없음, 풀 3은 0~1개, 이미 쓴 단어는 피한다', () => {
    const rand = lcg(3);
    for (let i = 0; i < 200; i++) {
      const n = 3 + (i % 6);
      const got = assignWords(n, rand, new Set(['근데', '회사']))!;
      expect(got).toHaveLength(n);
      expect(new Set(got.map((g) => g.word)).size).toBe(n);
      expect(got.filter((g) => g.pool === 3).length).toBeLessThanOrEqual(1);
      expect(got.some((g) => g.word === '근데' || g.word === '회사')).toBe(false);
    }
  });
  it('인정 규칙: 글자열 그대로 포함만, 정규화 NFC', () => {
    expect(containsWord('우리회사에서', '회사')).toBe(true);
    expect(containsWord('근디', '근데')).toBe(false);
    expect(containsWord('근 데', '근데')).toBe(false);
    expect(containsWord('ㄱㄷ', '근데')).toBe(false);
    expect(containsWord('회사'.normalize('NFD'), '회사')).toBe(true);
    expect(guessMatches(' 회사 ', '회사')).toBe(true);
    expect(guessMatches('회사원', '회사')).toBe(false);
  });
  it('사회자: 30초 침묵 뒤에만, 비밀 단어가 든 문장은 버린다', () => {
    const h = harness(word, ['a', 'b', 'c']);
    const host = new SilenceHost(
      {
        ...({} as GameContext),
        now: () => h.clock.now(),
        setTimer: (ms, fn) => h.clock.setTimeout(fn, ms),
        clearTimer: (id) => h.clock.clearTimeout(id),
        say: (t) => h.said.push({ text: t }),
        random: () => 0,
      } as GameContext,
      () => ['요즘', '음식', '가고'],
    );
    h.clock.advance(HOST_TIMING.silenceMs - 1);
    expect(h.said).toHaveLength(0);
    h.clock.advance(1);
    expect(h.said).toHaveLength(1);
    expect(['요즘', '음식', '가고'].some((w) => h.said[0]!.text.includes(w))).toBe(false);
    host.heard();
    h.clock.advance(HOST_TIMING.silenceMs + 1000); // 2분 간격 안이라 추가 발화 없음
    expect(h.said).toHaveLength(1);
    host.stop();
  });
});

describe('단어 말하기 (WORD 0.4, AI 없음)', () => {
  const start = (ids = ['a', 'b', 'c'], s: Record<string, unknown> = { rounds: 2 }) => {
    const h = harness(word, ids, s);
    h.inst.start();
    h.clock.advance(WORD_TIMING.introMs);
    return h;
  };
  const v = (h: ReturnType<typeof start>, id: string) => h.inst.view(id) as WordView;

  it('기본 규칙 (DEC-20): AI 없음, 90초×3라운드, 득점 간격 10초, 방 설정 없음', () => {
    expect(word.meta.ai).toBe('none');
    expect(word.meta.settings).toEqual([]);
    expect(WORD_RULES.rounds).toBe(3);
    expect(WORD_RULES.roundMs).toBe(90_000);
    expect(WORD_RULES.scoreGapMs).toBe(10_000);
    expect(BAN_RULES.rounds).toBe(2);
    expect(BAN_RULES.roundMs).toBe(120_000);
  });

  it('비밀: 내 단어는 나에게만, 남의 view에는 없다', () => {
    const h = start();
    const aw = v(h, 'a').myWord!.word;
    expect(aw).toBeTruthy();
    expect(JSON.stringify(v(h, 'b'))).not.toContain(`"${aw}"`);
    expect(JSON.stringify(v(h, 'c'))).not.toContain(`"${aw}"`);
  });

  it('득점: 단어가 든 메시지 +1, 15초 간격, 득점은 본인에게만 (공개 합계는 라운드 끝까지 그대로)', () => {
    const h = start();
    const w = v(h, 'a').myWord!.word;
    h.chat('a', `아 ${w} 얘기 나와서 말인데`);
    expect(v(h, 'a').myUses).toBe(1);
    expect(v(h, 'a').myScoreSeq).toBe(1);
    expect(v(h, 'b').totals.a).toBe(0);
    expect(JSON.stringify(v(h, 'b'))).not.toContain('"myUses":1');
    h.chat('a', `${w}${w}`, WORD_RULES.scoreGapMs - 1);
    expect(v(h, 'a').myUses).toBe(1);
    h.chat('a', `또 ${w}`, 1);
    expect(v(h, 'a').myUses).toBe(2);
  });

  it('챌린지 성공: +3, 대상 잠금(단어 득점 불가), 잠긴 대상 재챌린지 무효', () => {
    const h = start();
    const bw = v(h, 'b').myWord!.word;
    h.act('a', { type: 'challenge', target: 'b', guess: ` ${bw} ` });
    expect(v(h, 'c').players.find((p) => p.id === 'b')!.locked).toBe(true);
    expect(v(h, 'c').challenges[0]).toMatchObject({ by: 'a', target: 'b', success: true, text: bw });
    h.chat('b', `${bw}!!`, 1);
    expect(v(h, 'b').myUses).toBe(0);
    h.act('c', { type: 'challenge', target: 'b', guess: '아무거나' }, WORD_RULES.challengeGapMs);
    expect(v(h, 'c').challenges).toHaveLength(1);
    expect(v(h, 'a').myRoundScore).toBe(3);
  });

  it('챌린지 실패 −3, 자기 자신 불가, 간격 3초·같은 대상 10초', () => {
    const h = start();
    h.act('a', { type: 'challenge', target: 'a', guess: 'x' });
    expect(v(h, 'a').challenges).toHaveLength(0);
    h.act('a', { type: 'challenge', target: 'b', guess: '틀린말' });
    expect(v(h, 'a').myRoundScore).toBe(-3);
    h.act('a', { type: 'challenge', target: 'c', guess: '틀린말' }, WORD_RULES.challengeGapMs - 1);
    expect(v(h, 'a').challenges).toHaveLength(1);
    h.act('a', { type: 'challenge', target: 'b', guess: '틀린말2' }, 1);
    expect(v(h, 'a').challenges).toHaveLength(1); // 같은 대상 10초
    h.act('a', { type: 'challenge', target: 'c', guess: '틀린말' });
    expect(v(h, 'a').challenges).toHaveLength(2);
    expect(v(h, 'a').myRoundScore).toBe(-6);
  });

  it('라운드 끝: 공개(모든 단어·점수·가장 긴 득점 문장) → 다음 라운드 새 단어 → 최종 순위', () => {
    const h = start();
    const w1 = v(h, 'a').myWord!.word;
    h.chat('a', `짧게 ${w1}`);
    h.chat('a', `이건 좀 더 길게 ${w1} 넣어 본 문장`, WORD_RULES.scoreGapMs);
    h.clock.advance(WORD_RULES.roundMs - WORD_RULES.scoreGapMs);
    const r = v(h, 'b');
    expect(r.phase).toBe('reveal');
    expect(r.reveal!.find((x) => x.id === 'a')).toMatchObject({ word: w1, uses: 2, roundScore: 2, bestLine: `이건 좀 더 길게 ${w1} 넣어 본 문장` });
    expect(r.totals.a).toBe(2);
    expect(r.myWord).toBeUndefined();
    h.clock.advance(WORD_TIMING.revealMs + WORD_TIMING.introMs);
    expect(v(h, 'a').round).toBe(2);
    expect(v(h, 'a').myWord!.word).not.toBe(w1);
    h.clock.advance(WORD_RULES.roundMs + WORD_TIMING.revealMs);
    expect(h.outcome!.ranking[0]).toEqual(['a']);
  });

  it('동률은 챌린지 성공 수로 가른다', () => {
    const h = start(['a', 'b', 'c'], { rounds: 1 });
    const cw = v(h, 'c').myWord!.word;
    h.act('a', { type: 'challenge', target: 'c', guess: cw }); // a +3
    const bw = v(h, 'b').myWord!.word;
    for (let i = 0; i < 3; i++) h.chat('b', bw, WORD_RULES.scoreGapMs); // b +3 (챌린지 0)
    h.clock.advance(WORD_RULES.roundMs + WORD_TIMING.revealMs);
    expect(h.outcome!.ranking[0]).toEqual(['a']);
    expect(h.outcome!.ranking[1]).toEqual(['b']);
  });

  it('이탈해도 이번 라운드 챌린지 대상, 3명 미만이면 라운드 즉시 종료 후 경기 종료', () => {
    const h = start(['a', 'b', 'c', 'd']);
    const dw = v(h, 'd').myWord!.word;
    h.left.add('d');
    h.inst.onPlayerLeft!('d');
    h.act('a', { type: 'challenge', target: 'd', guess: dw });
    expect(v(h, 'a').myRoundScore).toBe(3);
    h.left.add('c');
    h.inst.onPlayerLeft!('c');
    expect(v(h, 'a').phase).toBe('reveal');
    h.clock.advance(WORD_TIMING.revealMs);
    expect(h.outcome).not.toBeNull();
  });

  it('마감 시각의 메시지·챌린지는 무효 (시작 ≤ 접수 < 마감)', () => {
    const h = start(['a', 'b', 'c'], { rounds: 1, roundMs: 1000 });
    const w = v(h, 'a').myWord!.word;
    h.inst.onChat!('a', w, h.clock.now() + 1000);
    expect(v(h, 'a').myUses).toBe(0);
  });
});

describe('금지어 (BAN 0.4, AI 없음)', () => {
  const start = (ids = ['a', 'b', 'c', 'd'], s: Record<string, unknown> = {}) => {
    const h = harness(ban, ids, s);
    h.inst.start();
    h.clock.advance(BAN_TIMING.introMs);
    return h;
  };
  const v = (h: ReturnType<typeof start>, id: string) => h.inst.view(id) as BanView;
  /** pid의 금지어 (다른 사람 view에서 읽는다) */
  const wordOf = (h: ReturnType<typeof start>, pid: string) => {
    const other = v(h, pid).group.find((g) => g.id !== pid)!.id;
    return v(h, other).group.find((g) => g.id === pid)!.word!;
  };

  it('그룹 편성: 3~6명 한 그룹, 7명 3/4, 8명 4/4, 재편성은 가능하면 다른 조합', () => {
    expect(groupSizes(3)).toEqual([3]);
    expect(groupSizes(6)).toEqual([6]);
    expect(groupSizes(7)).toEqual([3, 4]);
    expect(groupSizes(8)).toEqual([4, 4]);
    const ids = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const r1 = makeGroups(ids, lcg(1));
    const r2 = makeGroups(ids, lcg(2), r1);
    const same = (g: string[]) => r1.some((p) => g.every((x) => p.includes(x)));
    expect(r2.some(same)).toBe(false);
  });

  it('비밀: 자기 금지어는 절대 본인에게 가지 않고, 같은 그룹 남의 금지어는 보인다', () => {
    const h = start();
    for (const id of ['a', 'b', 'c', 'd']) {
      const me = v(h, id);
      expect(me.group.find((g) => g.id === id)!.word).toBeUndefined();
      expect(me.group.filter((g) => g.id !== id).every((g) => !!g.word)).toBe(true);
      expect(JSON.stringify(me)).not.toContain(`"${wordOf(h, id)}"`);
    }
  });

  it('적발: 나머지 전원 +1, 챌린지 대기 중 채팅 거부, 안 하면 입막힘 10초', () => {
    const h = start();
    const w = wordOf(h, 'a');
    expect(h.chat('a', `아 ${w} 말하면 안 되나`)).toMatchObject({ allow: true });
    expect(v(h, 'b').scores).toMatchObject({ a: 0, b: 1, c: 1, d: 1 });
    expect(v(h, 'a').me.status).toBe('pending');
    expect(h.chat('a', '뭐야', 100).allow).toBe(false);
    h.clock.advance(BAN_RULES.challengeMs); // 기한 지나면 “안 함” → 입막힘
    expect(v(h, 'a').me.status).toBe('muted');
    expect(h.chat('a', '억울해', 100).allow).toBe(false);
    h.clock.advance(BAN_RULES.muteMs);
    expect(v(h, 'a').me.status).toBe('normal');
    expect(h.chat('a', '다시 말할 수 있다').allow).toBe(true);
  });

  it('챌린지 성공 +3·입막힘 면제·판정 해제 / 실패 −3·입막힘', () => {
    const h = start();
    const wa = wordOf(h, 'a');
    h.chat('a', wa);
    h.act('a', { type: 'challenge', guess: wa }, 100);
    expect(v(h, 'a').me.status).toBe('cleared');
    expect(v(h, 'a').scores.a).toBe(3);
    h.chat('a', `${wa} ${wa}`, 100); // 판정 해제라 다시 걸리지 않음
    expect(v(h, 'b').scores.b).toBe(1);
    const wb = wordOf(h, 'b');
    h.chat('b', wb);
    h.act('b', { type: 'challenge', guess: '틀렸지롱' }, 100);
    expect(v(h, 'b').me.status).toBe('muted');
    expect(v(h, 'b').scores.b).toBe(1 - 3);
  });

  it('라운드 공개에 라운드 획득 점수가 들어가고, 누적은 scores', () => {
    const h = start(['a', 'b', 'c']);
    h.chat('a', wordOf(h, 'a')); // b,c +1
    h.clock.advance(BAN_RULES.roundMs);
    const r = v(h, 'b').reveal!;
    expect(r.find((x) => x.id === 'b')!.roundScore).toBe(1);
    expect(r.find((x) => x.id === 'a')!.roundScore).toBe(0);
    h.clock.advance(BAN_TIMING.revealMs + BAN_TIMING.introMs);
    h.chat('b', wordOf(h, 'b')); // a,c +1
    h.clock.advance(BAN_RULES.roundMs);
    const r2 = v(h, 'c').reveal!;
    expect(r2.find((x) => x.id === 'c')!.roundScore).toBe(1);
    expect(v(h, 'c').scores.c).toBe(2);
  });

  it('챌린지 결과는 적발 한 번에 한 번만, 기한 뒤 응답 무효', () => {
    const h = start();
    const wa = wordOf(h, 'a');
    h.chat('a', wa);
    h.act('a', { type: 'challenge', guess: '틀림' }, 100);
    h.act('a', { type: 'challenge', guess: wa }, 100);
    expect(v(h, 'a').scores.a).toBe(-3);
    const wc = wordOf(h, 'c');
    h.chat('c', wc);
    h.act('c', { type: 'challenge', guess: wc }, BAN_RULES.challengeMs);
    expect(v(h, 'c').scores.c).toBe(1); // a 적발로 받은 +1만, 기한 뒤 챌린지 +3은 무효
  });

  it('7명: 두 그룹, 그룹 채팅은 자기 그룹에게만, 다른 그룹 금지어는 안 보임', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const h = start(ids);
    const va = v(h, 'a');
    expect(va.groupCount).toBe(2);
    const mine = va.group.map((g) => g.id);
    const d = h.chat('a', '안녕');
    expect(d).toMatchObject({ allow: true, audience: mine });
    const others = ids.filter((id) => !mine.includes(id));
    for (const o of others) expect(JSON.stringify(va)).not.toContain(`"${wordOf(h, o)}"`);
  });

  it('그룹이 3명 미만이 되면 그 그룹만 먼저 끝나고 대기, 전부 끝나면 공개 → 재편성', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const h = start(ids);
    const small = v(h, 'a').groupCount === 2 ? [v(h, 'a'), ...ids.map((id) => v(h, id))].find((x) => x.group.length === 3)! : null;
    expect(small).not.toBeNull();
    const [x] = small!.group.map((g) => g.id);
    h.left.add(x!);
    h.inst.onPlayerLeft!(x!);
    const rest = small!.group.map((g) => g.id).filter((id) => id !== x);
    expect(v(h, rest[0]!).waiting).toBe(true);
    h.clock.advance(BAN_RULES.roundMs);
    expect(v(h, rest[0]!).phase).toBe('reveal');
    h.clock.advance(BAN_TIMING.revealMs + BAN_TIMING.introMs);
    expect(v(h, rest[0]!).round).toBe(2);
    expect(v(h, rest[0]!).groupCount).toBe(1); // 6명 → 한 그룹
  });

  it('2라운드 뒤 최종 순위: 점수 → 동률이면 적발이 적은 사람', () => {
    const h = start(['a', 'b', 'c']);
    const wa = wordOf(h, 'a');
    h.chat('a', wa); // b,c +1
    h.clock.advance(BAN_RULES.roundMs + BAN_TIMING.revealMs + BAN_TIMING.introMs);
    const wb = wordOf(h, 'b');
    h.chat('b', wb); // a,c +1
    h.clock.advance(BAN_RULES.roundMs + BAN_TIMING.revealMs);
    // c 2점, a 1점(적발 1), b 1점(적발 1) → a·b 공동
    expect(h.outcome!.ranking[0]).toEqual(['c']);
    expect(h.outcome!.ranking[1]!.sort()).toEqual(['a', 'b']);
  });
});

describe('금지어 소개 단계 이탈 (ASTRA C-1 회귀)', () => {
  it('소개 중에 이탈이 확정돼도 예외 없이 누적 결과로 끝난다', () => {
    const h = harness(ban, ['a', 'b', 'c']);
    h.inst.start();
    h.left.add('c');
    expect(() => h.inst.onPlayerLeft!('c')).not.toThrow();
    h.clock.advance(BAN_TIMING.introMs + BAN_TIMING.revealMs);
    expect(h.outcome).not.toBeNull();
    expect(h.outcome!.aborted).toBeFalsy();
  });
  it('7명: 소개 중 3명 조가 먼저 끝나도 다른 조는 계속하고, 끝난 조에는 사회자가 없다', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const h = harness(ban, ids);
    h.inst.start();
    const small = ids.map((id) => h.inst.view(id) as BanView).find((x) => x.group.length === 3)!;
    const x = small.group[0]!.id;
    h.left.add(x);
    expect(() => h.inst.onPlayerLeft!(x)).not.toThrow();
    h.clock.advance(BAN_TIMING.introMs);
    const rest = small.group.map((g) => g.id).filter((id) => id !== x);
    expect((h.inst.view(rest[0]!) as BanView).waiting).toBe(true);
    h.clock.advance(HOST_TIMING.silenceMs + 10);
    const hostLines = h.said.filter((m) => m.text.startsWith('🎙'));
    expect(hostLines.length).toBe(1); // 진행 중인 4명 조에서만
    expect(hostLines[0]!.audience!.some((id) => rest.includes(id))).toBe(false);
  });
});

describe('단어 말하기 득점 갱신은 본인에게만', () => {
  it('득점하면 updatePlayer(본인)만 부르고 전체 update는 부르지 않는다', () => {
    const h = harness(word, ['a', 'b', 'c'], { rounds: 1 });
    const calls: string[] = [];
    const inst = word.create({
      ...(h as unknown as { inst: GameInstance }),
      players: ['a', 'b', 'c'].map((id) => ({ id, nickname: id })),
      settings: { rounds: 1 },
      now: () => h.clock.now(),
      setTimer: (ms, fn) => h.clock.setTimeout(fn, ms),
      clearTimer: (id) => h.clock.clearTimeout(id),
      isActive: () => true,
      activePlayerIds: () => ['a', 'b', 'c'],
      update: () => calls.push('all'),
      updatePlayer: (id) => calls.push(id),
      say: () => {},
      end: () => {},
      random: lcg(5),
    } as GameContext);
    inst.start();
    h.clock.advance(WORD_TIMING.introMs);
    const w = (inst.view('a') as WordView).myWord!.word;
    calls.length = 0;
    inst.onChat!('a', `${w}`, h.clock.now());
    expect(calls).toEqual(['a']);
  });
});
