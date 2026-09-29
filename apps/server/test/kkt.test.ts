import { describe, expect, it } from 'vitest';
import { defaultGameSettings } from '@backstage/shared';
import { FakeClock } from '../src/clock.js';
import type { GameContext, GameOutcome, GameInstance } from '../src/games/types.js';
import { createKkt, KKT_RULES, KKT_TIMING, kkt, kktTurnMs, type KktView } from '../src/games/kkt/index.js';
import { buildDictionary, loadDictionaryFile } from '../src/games/kkt/dictionary.js';
import { allowedStarts, dueum, isThreeSyllables } from '../src/games/kkt/hangul.js';

const WORDS = ['가나다', '다람쥐', '쥐구멍', '멍멍이', '이리온', '역사가', '가오리', '리어카', '카메라', '라디오', '나무꾼', '오징어', '어부지', '지우개', '개나리'];
const smallDict = () => buildDictionary(WORDS.map((w) => [w, `${w} 뜻`] as [string, string]), 'test');

function harness(ids: string[], opts: { dict?: () => ReturnType<typeof smallDict>; rand?: number } = {}) {
  const game = createKkt(opts.dict ?? smallDict);
  const clock = new FakeClock();
  const left = new Set<string>();
  const said: string[] = [];
  let outcome: GameOutcome | null = null;
  const ctx: GameContext = {
    players: ids.map((id) => ({ id, nickname: id })),
    settings: defaultGameSettings(game.meta),
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
    random: () => opts.rand ?? 0,
  };
  const inst: GameInstance = game.create(ctx);
  const v = (id = ids[0]!) => inst.view(id) as KktView;
  return {
    clock,
    inst,
    said,
    left,
    v,
    /** 지금 차례인 사람이 dt ms 뒤에 단어 제출 */
    submit(word: string, dt = 100, who?: string) {
      clock.advance(dt);
      const pid = who ?? v().current!;
      inst.onAction(pid, { type: 'word', word }, clock.now());
    },
    get outcome() {
      return outcome;
    },
  };
}

/** 라운드 소개가 끝나 첫 차례가 시작된 상태 */
function started(ids = ['a', 'b', 'c']) {
  const h = harness(ids);
  h.inst.start();
  h.clock.advance(KKT_TIMING.roundIntroMs);
  expect(h.v().phase).toBe('turn');
  return h;
}

describe('쿵쿵따 한글 도구', () => {
  it('두음법칙: 력→역, 녀→여, 라→나, 락→낙, 리→이; 역방향 없음', () => {
    expect(dueum('력')).toBe('역');
    expect(dueum('녀')).toBe('여');
    expect(dueum('라')).toBe('나');
    expect(dueum('락')).toBe('낙');
    expect(dueum('리')).toBe('이');
    expect(dueum('뇨')).toBe('요');
    expect(dueum('역')).toBeNull();
    expect(dueum('나')).toBeNull();
    expect(allowedStarts('력')).toEqual(['력', '역']);
    expect(allowedStarts('역')).toEqual(['역']);
  });
  it('세 글자 판정: 한글 음절 정확히 3개', () => {
    expect(isThreeSyllables('다람쥐')).toBe(true);
    expect(isThreeSyllables('다람')).toBe(false);
    expect(isThreeSyllables('다람쥐다')).toBe(false);
    expect(isThreeSyllables('다ㄹ쥐')).toBe(false);
    expect(isThreeSyllables('ab c')).toBe(false);
  });
});

describe('쿵쿵따 사전 파일', () => {
  it('표준국어대사전 세 글자 단어를 읽는다', () => {
    const d = loadDictionaryFile();
    expect(d.size).toBeGreaterThan(90_000);
    for (const w of ['다람쥐', '선풍기', '노래방', '컴퓨터', '역사가']) expect(d.has(w)).toBe(true);
    expect(d.has('사과쥽')).toBe(false);
    expect(d.definition('선풍기')).toContain('바람');
    expect([...d.startingWith('역')].length).toBeGreaterThan(10);
  });
});

describe('쿵쿵따 게임 (v0.4)', () => {
  it('기본 규칙: 3~8명, 전용 입력칸, 방 설정 없음', () => {
    expect(kkt.meta.minPlayers).toBe(3);
    expect(kkt.meta.inputs).toEqual(['text']);
    expect(kkt.meta.settings).toEqual([]);
    expect(kkt.meta.ai).toBe('none');
  });

  it('정상 연결: 끝 글자로 이어 가고 차례가 넘어간다', () => {
    const h = started();
    const first = h.v().current!;
    const start = h.v().startSyllable;
    const word = WORDS.find((w) => w[0] === start)!;
    h.submit(word);
    expect(h.v().chain.map((c) => c.word)).toEqual([word]);
    expect(h.v().current).not.toBe(first);
    expect(h.v().required).toEqual(allowedStarts(word[2]!));
  });

  it('두음법칙: 앞 단어가 ‘력’으로 끝나면 ‘역’으로 시작해도 된다', () => {
    const dict = () => buildDictionary([['가나력', ''], ['역사가', ''], ['력사가', ''], ['가오리', '']], 't');
    const h = harness(['a', 'b', 'c'], { dict });
    h.inst.start();
    h.clock.advance(KKT_TIMING.roundIntroMs);
    expect(h.v().startSyllable).toBe('가'); // random() = 0 → 사전 첫 단어의 첫 글자
    h.submit('가나력');
    expect(h.v().required).toEqual(['력', '역']);
    h.submit('역사가');
    expect(h.v().eliminated).toHaveLength(0);
    expect(h.v().required).toEqual(['가']);
  });

  it('틀린 단어는 탈락이 아니라 거절 → 시간 안에 다시 시도해서 통과할 수 있다', () => {
    const h = started();
    const start = h.v().startSyllable;
    const who = h.v().current!;
    const cases: [string, string][] = [
      ['다람', 'length'],
      [`${start}쀍쀍쀍`, 'length'],
      [`${start}쀍쀍`, 'not_in_dict'],
    ];
    for (const [w, reason] of cases) {
      h.submit(w, KKT_RULES.retryGapMs);
      expect(h.v().eliminated).toHaveLength(0);
      expect(h.v().phase).toBe('turn');
      expect(h.v().current).toBe(who);
      expect(h.v().rejected).toEqual({ id: who, reason, word: w });
    }
    expect(h.v().rejectCount).toBe(3);
    h.submit(WORDS.find((x) => x[0] === start)!, KKT_RULES.retryGapMs);
    expect(h.v().chain).toHaveLength(1);
    expect(h.v().current).not.toBe(who);
    expect(h.v().rejected).toBeUndefined();
    expect(h.v().rejectCount).toBe(0);
  });

  it('첫 글자 불일치·이미 나온 단어도 거절 후 재시도', () => {
    const dict = () => buildDictionary([['가나가', ''], ['가다가', ''], ['나라말', '']], 't');
    const h = harness(['a', 'b', 'c'], { dict });
    h.inst.start();
    h.clock.advance(KKT_TIMING.roundIntroMs);
    h.submit('가나가');
    const who = h.v().current!;
    h.submit('나라말');
    expect(h.v().rejected).toMatchObject({ id: who, reason: 'start' });
    h.submit('가나가', KKT_RULES.retryGapMs);
    expect(h.v().rejected).toMatchObject({ id: who, reason: 'used' });
    h.submit('가다가', KKT_RULES.retryGapMs);
    expect(h.v().chain.map((c) => c.word)).toEqual(['가나가', '가다가']);
  });

  it('연타 방지: 같은 사람의 제출은 0.3초 안에 다시 받지 않는다', () => {
    const h = started();
    const start = h.v().startSyllable;
    h.submit('다람', 100);
    h.submit(WORDS.find((x) => x[0] === start)!, KKT_RULES.retryGapMs - 1);
    expect(h.v().chain).toHaveLength(0);
    h.submit(WORDS.find((x) => x[0] === start)!, 1);
    expect(h.v().chain).toHaveLength(1);
  });

  it('연타 방지는 한 차례 안에서만: 앞 차례 직후 내 차례가 다시 와도 바로 제출된다', () => {
    const words = ['가나가', '가다가', '가라가', '가마가'];
    const h = harness(['a', 'b', 'c'], { dict: () => buildDictionary(words.map((w) => [w, ''] as [string, string]), 't') });
    h.inst.start();
    h.clock.advance(KKT_TIMING.roundIntroMs);
    const [p0] = h.v().order;
    for (const w of words) h.submit(w, 10); // p0, p1, p2, p0 — p0의 두 제출 간격 30ms
    expect(h.v().chain.map((c) => c.word)).toEqual(words);
    expect(h.v().chain[3]!.by).toBe(p0);
  });

  it('차례 시간: 10초에서 시작해 단어마다 0.25초씩 줄고 최소 3초', () => {
    expect(kktTurnMs(0)).toBe(10_000);
    expect(kktTurnMs(4)).toBe(9000);
    expect(kktTurnMs(28)).toBe(3000);
    expect(kktTurnMs(100)).toBe(3000);
    const h = started();
    expect(h.v().turnMs).toBe(10_000);
    h.submit(WORDS.find((x) => x[0] === h.v().startSyllable)!);
    expect(h.v().turnMs).toBe(9750);
    expect(h.v().turnRemainingMs).toBe(9750);
  });

  it('여러 번 틀려도 시간 초과 타이머는 그대로, 차례 시간은 라운드가 바뀌어도 이어서 줄어든다', () => {
    const words = ['가나가', '가다가', '가라가', '가마가', '가바가'];
    const h = harness(['a', 'b', 'c'], { dict: () => buildDictionary(words.map((w) => [w, ''] as [string, string]), 't') });
    h.inst.start();
    h.clock.advance(KKT_TIMING.roundIntroMs);
    h.submit('가나가', 10);
    h.submit('가다가', 10);
    const who = h.v().current!;
    const t = h.v().turnMs;
    expect(t).toBe(kktTurnMs(2));
    for (let i = 0; i < 5; i++) h.submit('없다요', KKT_RULES.retryGapMs);
    expect(h.v().rejectCount).toBe(5);
    h.clock.advance(t - 5 * KKT_RULES.retryGapMs); // 차례 시작부터 정확히 t
    expect(h.v().eliminated[0]).toMatchObject({ id: who, reason: 'timeout' });
    h.clock.advance(KKT_TIMING.roundResultMs + KKT_TIMING.roundIntroMs);
    expect(h.v().round).toBe(2);
    expect(h.v().turnMs).toBe(kktTurnMs(2)); // 초기화되지 않음
  });

  it('경계: 차례 시간 −1ms 접수는 유효, 차례 시간이 되면 시간 초과 탈락 (마지막 틀린 시도 기록)', () => {
    const ok = started();
    const w = WORDS.find((x) => x[0] === ok.v().startSyllable)!;
    ok.submit(w, KKT_RULES.turnStartMs - 1);
    expect(ok.v().eliminated).toHaveLength(0);
    expect(ok.v().chain).toHaveLength(1);

    const late = started();
    const who = late.v().current!;
    const w2 = WORDS.find((x) => x[0] === late.v().startSyllable)!;
    late.submit('다람', 100);
    late.clock.advance(KKT_RULES.turnStartMs - 100); // 타이머가 먼저 울려 탈락
    late.inst.onAction(who, { type: 'word', word: w2 }, late.clock.now());
    expect(late.v().eliminated).toEqual([{ id: who, reason: 'timeout', word: '다람' }]);
    expect(late.v().chain).toHaveLength(0);
  });

  it('차례가 아닌 사람의 제출과 차례 사이 제출은 무효', () => {
    const h = started();
    const cur = h.v().current!;
    const other = h.v().order.find((id) => id !== cur)!;
    h.submit('아무말', 10, other);
    expect(h.v().eliminated).toHaveLength(0);
    expect(h.v().current).toBe(cur);
  });

  it('한 명 탈락 = 한 라운드, 새 라운드는 탈락자 다음 사람부터, 1명 남으면 종료 (탈락 역순 순위)', () => {
    const h = started(['a', 'b', 'c']);
    const order = [...h.v().order];
    const first = order[0]!;
    h.clock.advance(KKT_RULES.turnStartMs); // 첫 사람 시간 초과
    expect(h.v().phase).toBe('round_result');
    expect(h.v().order).toEqual(order.slice(1));
    h.clock.advance(KKT_TIMING.roundResultMs + KKT_TIMING.roundIntroMs);
    expect(h.v().round).toBe(2);
    expect(h.v().current).toBe(order[1]);
    h.clock.advance(KKT_RULES.turnStartMs); // 두 번째 사람도 시간 초과 → 1명 남음
    expect(h.outcome).not.toBeNull();
    expect(h.outcome!.ranking).toEqual([[order[2]], [order[1]], [first]]);
    expect(h.outcome!.aborted).toBeFalsy();
    expect(h.v().phase).toBe('done');
  });

  it('차례인 사람이 나가면 그 차례 탈락, 다른 사람이 나가면 탈락 기록만 하고 계속', () => {
    const h = started(['a', 'b', 'c', 'd']);
    const [p0, p1, p2] = h.v().order;
    h.left.add(p2!);
    h.inst.onPlayerLeft!(p2!);
    expect(h.v().phase).toBe('turn');
    expect(h.v().current).toBe(p0);
    expect(h.v().eliminated).toEqual([{ id: p2, reason: 'left' }]);
    h.left.add(p0!);
    h.inst.onPlayerLeft!(p0!);
    expect(h.v().phase).toBe('round_result');
    expect(h.v().eliminated.map((e) => e.id)).toEqual([p2, p0]);
    h.clock.advance(KKT_TIMING.roundResultMs + KKT_TIMING.roundIntroMs);
    expect(h.v().current).toBe(p1);
  });

  it('한방단어 표시: 이어 갈 단어가 없는 글자로 끝나면 hanbang', () => {
    const dict = () => buildDictionary([['가나쀍', ''], ['가나다', '']], 't');
    const h = harness(['a', 'b', 'c'], { dict });
    h.inst.start();
    h.clock.advance(KKT_TIMING.roundIntroMs);
    h.submit('가나쀍');
    expect(h.v().chain[0]!.hanbang).toBe(true);
    expect(h.said.some((s) => s.includes('한방'))).toBe(true);
  });

  it('사전을 못 읽으면 탈락이 아니라 경기 중단', () => {
    const h = harness(['a', 'b', 'c'], {
      dict: () => {
        throw new Error('io');
      },
    });
    h.inst.start();
    expect(h.outcome?.aborted).toBe(true);
    expect(h.outcome?.ranking).toEqual([['a', 'b', 'c']]);
  });

  it('입력 정규화: 공백 제거, NFD도 같은 단어로', () => {
    const h = started();
    const start = h.v().startSyllable;
    const w = WORDS.find((x) => x[0] === start)!;
    h.submit(` ${w.normalize('NFD').split('').join('')} `);
    expect(h.v().chain.map((c) => c.word)).toEqual([w]);
  });
});

describe('쿵쿵따 이탈 기록', () => {
  it('다른 사람이 모두 나가서 끝나면 경기 중단(aborted)으로 기록', () => {
    const h = started(['a', 'b', 'c']);
    const [p0, p1, p2] = h.v().order;
    for (const id of [p1!, p2!]) {
      h.left.add(id);
      h.inst.onPlayerLeft!(id);
    }
    expect(h.outcome?.aborted).toBe(true);
    expect(h.outcome?.ranking[0]).toEqual([p0]);
  });
});
