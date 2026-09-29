import { describe, expect, it } from 'vitest';
import {
  buildPlaylist,
  defaultRoomSettings,
  placementPoints,
  rankByScore,
  sanitizeRoomSettings,
  type ChatMessage,
  type RoomView,
} from '@backstage/shared';
import { FakeClock } from '../src/clock.js';
import { MemoryEventSink, computeStats } from '../src/analytics.js';
import { GAMES, GAME_METAS } from '../src/games/registry.js';
import { Room, ROOM_TIMING, type RoomTransport } from '../src/room.js';
import { NUNCHI_TIMING } from '../src/games/nunchi/index.js';

describe('방 규칙 유틸', () => {
  it('순위 → 방 점수: 공동 순위는 높은 점수를 함께 받는다', () => {
    expect(placementPoints([['a'], ['b', 'c'], ['d']])).toEqual({ a: 4, b: 3, c: 3, d: 1 });
  });
  it('점수 → 순위', () => {
    expect(rankByScore({ a: 1, b: 3, c: 1 })).toEqual([['b'], ['a', 'c']]);
  });
  it('방 라운드 수만큼 게임 목록을 만들고, 인원으로 못 하는 게임은 뺀다', () => {
    const s = { ...defaultRoomSettings(GAME_METAS), gameRounds: 5 };
    const list = buildPlaylist(GAME_METAS, s, 4, () => 0.3);
    expect(list).toHaveLength(5);
    for (let i = 1; i < list.length; i++) expect(list[i]).not.toBe(list[i - 1]);
    expect(buildPlaylist(GAME_METAS, s, 2)).toEqual([]);
  });
  it('listed 순서는 켠 순서대로 반복', () => {
    const s = { ...defaultRoomSettings(GAME_METAS), gameRounds: 3, order: 'listed' as const, enabledGameIds: ['forbes', 'nunchi'] };
    expect(buildPlaylist(GAME_METAS, s, 4)).toEqual(['forbes', 'nunchi', 'forbes']);
  });
  it('설정 검증: 현재 인원보다 작은 최대 인원, 모르는 게임, 범위 밖 값은 정리된다', () => {
    const prev = defaultRoomSettings(GAME_METAS);
    const s = sanitizeRoomSettings(GAME_METAS, { maxPlayers: 3, gameRounds: 99, enabledGameIds: ['nope', 'nunchi'], gameOptions: { nunchi: { rounds: 50 } } }, prev, 5);
    expect(s.maxPlayers).toBe(5);
    expect(s.gameRounds).toBe(10);
    expect(s.enabledGameIds).toEqual(['nunchi']);
    // 게임 내부 규칙은 방에서 바꿀 수 없다 (DEC-15)
    expect(s.gameOptions.nunchi).toEqual({});
  });
});

function setup() {
  const clock = new FakeClock();
  const sink = new MemoryEventSink();
  const states = new Map<string, RoomView>();
  const views = new Map<string, unknown>();
  const chats: ChatMessage[] = [];
  const transport: RoomTransport = {
    state: (pid, v) => states.set(pid, v),
    gameView: (pid, _g, v) => views.set(pid, v),
    chat: (_ids, m) => chats.push(m),
    chatHistory: () => {},
    toast: () => {},
  };
  let closed = false;
  const room = new Room('ABCD', GAMES, clock, sink, transport, () => (closed = true), () => 0.1);
  const add = (name: string) => {
    const r = room.join({ nickname: name, avatar: { color: 'sky', face: 'smile', hat: 'none' } });
    if (!r.ok) throw new Error(r.error);
    return r.playerId;
  };
  return { clock, sink, states, views, chats, room, add, isClosed: () => closed };
}

describe('방 · 매치 흐름', () => {
  it('3명 미만이거나 준비 안 했으면 시작 불가', () => {
    const t = setup();
    const h = t.add('방장');
    const b = t.add('둘');
    expect(t.room.start(h)).toContain('3명');
    const c = t.add('셋');
    expect(t.room.start(h)).toContain('준비');
    t.room.setReady(b, true);
    t.room.setReady(c, true);
    expect(t.room.start(b)).toContain('방장');
    expect(t.room.start(h)).toBeNull();
  });

  it('게임 중에는 새 입장 불가, 같은 닉네임 불가, 방이 가득 차면 불가', () => {
    const t = setup();
    t.add('가');
    expect(t.room.join({ nickname: '가', avatar: {} as never }).ok).toBe(false);
    t.room.updateSettings(t.states.keys().next().value!, { maxPlayers: 3 });
    t.add('나');
    t.add('다');
    expect(t.room.join({ nickname: '라', avatar: {} as never }).ok).toBe(false);
  });

  it('방장만 설정을 바꿀 수 있다', () => {
    const t = setup();
    const h = t.add('방장');
    const b = t.add('손님');
    expect(t.room.updateSettings(b, { gameRounds: 1 })).not.toBeNull();
    expect(t.room.updateSettings(h, { gameRounds: 1 })).toBeNull();
    expect(t.states.get(b)!.settings.gameRounds).toBe(1);
  });

  it('방 라운드 2 = 게임 2개를 이어서 하고, 게임별 순위 점수를 합산해 최종 순위를 낸다', () => {
    const t = setup();
    const h = t.add('A');
    const b = t.add('B');
    const c = t.add('C');
    const d = t.add('D');
    t.room.updateSettings(h, { gameRounds: 2, order: 'listed', enabledGameIds: ['nunchi', 'forbes'] });
    for (const id of [b, c, d]) t.room.setReady(id, true);
    expect(t.room.start(h)).toBeNull();
    expect(t.states.get(h)!.phase).toBe('intro');
    expect(t.states.get(h)!.currentGame?.gameId).toBe('nunchi');

    // 게임 1: 눈치게임 3라운드 — 매 라운드 A 1, B 2, C 3 → D 탈락
    t.clock.advance(ROOM_TIMING.introMs);
    expect(t.states.get(h)!.phase).toBe('playing');
    for (let r = 0; r < 3; r++) {
      t.clock.advance(NUNCHI_TIMING.countdownMs);
      t.room.chat(h, '1', t.clock.now());
      t.clock.advance(20);
      t.room.chat(b, '2', t.clock.now());
      t.clock.advance(20);
      t.room.chat(c, '3', t.clock.now());
      t.clock.advance(20);
      t.clock.advance(NUNCHI_TIMING.roundResultMs);
    }
    let s = t.states.get(h)!;
    expect(s.phase).toBe('game_result');
    expect(s.match!.lastResult!.pointsGained).toEqual({ [h]: 4, [b]: 4, [c]: 4, [d]: 1 });

    // 게임 2: 포브스 7문항 — 전원 기권 → 당선자 없음 → 전원 공동 1위
    t.clock.advance(ROOM_TIMING.gameResultMs);
    t.clock.advance(ROOM_TIMING.introMs);
    expect(t.states.get(h)!.currentGame?.gameId).toBe('forbes');
    t.clock.advance(10_000 + 7 * (10_000 + 5000) + 100);
    t.clock.advance(ROOM_TIMING.gameResultMs);
    s = t.states.get(h)!;
    expect(s.phase).toBe('final');
    expect(s.match!.scores).toEqual({ [h]: 8, [b]: 8, [c]: 8, [d]: 5 });
    expect(s.match!.finalRanking).toEqual([[h, b, c], [d]]);

    const stats = computeStats(t.sink.all(), null, GAME_METAS.map((m) => m.id));
    expect(stats.totals.matchesCompleted).toBe(1);
    expect(stats.matchesByPlayerCount).toEqual([{ key: '4', count: 1 }]);
    expect(stats.games.find((g) => g.gameId === 'nunchi')!.completed).toBe(1);

    t.room.playAgain(h);
    expect(t.states.get(h)!.phase).toBe('lobby');
    expect(computeStats(t.sink.all()).totals.replayRate).toBe(1);
  });

  it('3명이면 눈치게임(4명부터)은 목록에서 빠진다', () => {
    const t = setup();
    const h = t.add('A');
    const b = t.add('B');
    const c = t.add('C');
    t.room.updateSettings(h, { gameRounds: 2, order: 'listed', enabledGameIds: ['nunchi', 'forbes'] });
    t.room.setReady(b, true);
    t.room.setReady(c, true);
    t.room.start(h);
    expect(t.states.get(h)!.match!.playlist.map((p) => p.gameId)).toEqual(['forbes', 'forbes']);
    t.room.updateSettings(h, {});
  });

  it('3명이서 눈치게임만 켜 두면 시작할 수 없다', () => {
    const t = setup();
    const h = t.add('A');
    t.add('B');
    t.add('C');
    t.room.updateSettings(h, { enabledGameIds: ['nunchi'] });
    expect(t.room.startBlockers().some((b) => b.includes('할 수 있는 게임'))).toBe(true);
  });

  it('연결이 끊기면 유예 시간 뒤 이탈 확정, 그 전에 돌아오면 유지', () => {
    const t = setup();
    const h = t.add('A');
    const b = t.add('B');
    t.room.disconnect(b);
    t.clock.advance(ROOM_TIMING.graceMs - 100);
    expect(t.room.isMember(b)).toBe(true);
    t.clock.advance(200);
    expect(t.room.isMember(b)).toBe(false);
    t.room.leave(h);
    expect(t.isClosed()).toBe(true);
  });

  it('눈치게임 중 연결이 끊기면 그 라운드는 바로 탈락, 돌아와도 복귀 불가 (리뷰 #3)', () => {
    const t = setup();
    const h = t.add('A');
    const b = t.add('B');
    const c = t.add('C');
    const d = t.add('D');
    t.room.updateSettings(h, { gameRounds: 1, enabledGameIds: ['nunchi'] });
    for (const id of [b, c, d]) t.room.setReady(id, true);
    t.room.start(h);
    t.clock.advance(ROOM_TIMING.introMs + NUNCHI_TIMING.countdownMs);
    t.room.disconnect(d);
    const status = (id: string) => (t.views.get(h) as { players: { id: string; status: string }[] }).players.find((p) => p.id === id)!.status;
    expect(status(d)).toBe('out');
    const token = 'x';
    expect(t.room.canResume(d, token)).toBe(false);
    t.room.chat(d, '1', t.clock.now());
    expect(status(d)).toBe('out');
  });

  it('방장이 나가면 다음 사람이 방장', () => {
    const t = setup();
    const h = t.add('A');
    const b = t.add('B');
    t.room.leave(h);
    expect(t.states.get(b)!.players.find((p) => p.id === b)!.isHost).toBe(true);
  });

  it('게임 중 인원이 3명 미만이 되면 다음 게임을 시작하지 않고 최종 결과로 간다', () => {
    const t = setup();
    const h = t.add('A');
    const b = t.add('B');
    const c = t.add('C');
    t.room.updateSettings(h, { gameRounds: 2, order: 'listed', enabledGameIds: ['forbes'] });
    t.room.setReady(b, true);
    t.room.setReady(c, true);
    t.room.start(h);
    t.clock.advance(ROOM_TIMING.introMs);
    t.room.leave(c);
    t.clock.advance(20_000);
    t.clock.advance(ROOM_TIMING.gameResultMs + ROOM_TIMING.introMs);
    expect(t.states.get(h)!.phase).toBe('final');
  });
});
