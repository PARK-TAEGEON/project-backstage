/**
 * 방(Room) — 로비, 방 설정, 매치(여러 게임을 이어서 진행), 채팅, 재접속을 담당한다.
 * 소켓과 직접 엮지 않고 RoomTransport로만 내보내서 테스트에서 그대로 돌릴 수 있다.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import {
  CHAT_MAX_LENGTH,
  ROOM_MIN_PLAYERS,
  buildPlaylist,
  defaultRoomSettings,
  isPlayableWith,
  placementPoints,
  rankByScore,
  sanitizeAvatar,
  sanitizeNickname,
  sanitizeRoomSettings,
  type AvatarConfig,
  type ChatMessage,
  type GameResultView,
  type MatchView,
  type PlayerPublic,
  type Profile,
  type RoomPhase,
  type RoomSettings,
  type RoomView,
} from '@backstage/shared';
import type { Clock, TimerId } from './clock.js';
import type { EventSink } from './analytics.js';
import type { ChatDecision, GameContext, GameInstance, GameOutcome, ServerGame } from './games/types.js';

export const ROOM_TIMING = { introMs: 4000, gameResultMs: 7000, graceMs: 10_000 };
const CHAT_HISTORY = 100;
const CHAT_RATE = { count: 6, perMs: 3000 };

export interface RoomTransport {
  state(playerId: string, view: RoomView): void;
  gameView(playerId: string, gameId: string, view: unknown): void;
  chat(playerIds: string[], msg: ChatMessage): void;
  chatHistory(playerId: string, msgs: ChatMessage[]): void;
  toast(playerId: string, text: string): void;
}

interface PlayerState {
  id: string;
  token: string;
  nickname: string;
  avatar: AvatarConfig;
  ready: boolean;
  connected: boolean;
  left: boolean;
  joinedAt: number;
  graceTimer: TimerId | null;
  requestIds: string[];
  chatTimes: number[];
}

interface RunningGame {
  game: ServerGame;
  instance: GameInstance;
  participants: string[];
  timers: Set<TimerId>;
  ended: boolean;
  startedAt: number;
}

interface MatchState {
  id: string;
  playlist: string[];
  index: number;
  scores: Record<string, number>;
  startedAt: number;
  playerCount: number;
  lastResult?: GameResultView;
  finalRanking?: string[][];
  running?: RunningGame;
}

export type JoinResult = { ok: true; playerId: string; token: string } | { ok: false; error: string };

export class Room {
  readonly id = randomUUID();
  private players = new Map<string, PlayerState>();
  private order: string[] = [];
  private hostId = '';
  private phase: RoomPhase = 'lobby';
  private phaseDeadline: number | null = null;
  private phaseTimer: TimerId | null = null;
  private settings: RoomSettings;
  /** audience가 있으면 그 사람들에게만 보이는 메시지 (그룹 채팅). 전송할 때는 audience를 떼고 보낸다 */
  private chatLog: (ChatMessage & { audience?: string[] })[] = [];
  private match: MatchState | null = null;
  private closed = false;

  constructor(
    readonly code: string,
    private games: ServerGame[],
    private clock: Clock,
    private sink: EventSink,
    private transport: RoomTransport,
    private onEmpty: (room: Room) => void,
    private random: () => number = Math.random,
  ) {
    this.settings = defaultRoomSettings(games.map((g) => g.meta));
    sink.record({ type: 'room_created', roomId: this.id });
  }

  // ───────── 입장 / 퇴장 ─────────

  get phaseName(): RoomPhase {
    return this.phase;
  }

  memberCount(): number {
    return this.members().length;
  }

  private members(): PlayerState[] {
    return this.order.map((id) => this.players.get(id)!).filter((p) => p && !p.left);
  }

  applyInitialSettings(input: unknown) {
    this.settings = sanitizeRoomSettings(this.metas(), input, this.settings, 0);
  }

  join(profile: Profile): JoinResult {
    if (this.closed) return { ok: false, error: '없는 방이에요.' };
    if (this.phase !== 'lobby') return { ok: false, error: '게임이 진행 중인 방이에요. 끝나면 다시 들어와 주세요.' };
    if (this.memberCount() >= this.settings.maxPlayers) return { ok: false, error: '방이 가득 찼어요.' };
    const nickname = sanitizeNickname(profile?.nickname);
    if (!nickname) return { ok: false, error: '닉네임은 1~10자로 정해 주세요.' };
    if (this.members().some((p) => p.nickname === nickname)) return { ok: false, error: '같은 닉네임이 이미 있어요.' };
    const id = randomUUID().slice(0, 8);
    const token = randomBytes(16).toString('hex');
    this.players.set(id, {
      id,
      token,
      nickname,
      avatar: sanitizeAvatar(profile?.avatar),
      ready: false,
      connected: true,
      left: false,
      joinedAt: this.clock.now(),
      graceTimer: null,
      requestIds: [],
      chatTimes: [],
    });
    this.order.push(id);
    if (!this.hostId) this.hostId = id;
    this.sink.record({ type: 'player_joined', roomId: this.id, playerCount: this.memberCount() });
    this.systemChat(`${nickname} 님이 들어왔어요.`);
    this.transport.chatHistory(id, this.historyFor(id));
    this.broadcastState();
    return { ok: true, playerId: id, token };
  }

  /** 같은 브라우저가 다시 연결될 때 (새로고침·잠깐 끊김) */
  resume(playerId: string, token: string): boolean {
    const p = this.players.get(playerId);
    if (!p || p.left || p.token !== token) return false;
    p.connected = true;
    if (p.graceTimer !== null) {
      this.clock.clearTimeout(p.graceTimer);
      p.graceTimer = null;
    }
    this.transport.chatHistory(playerId, this.historyFor(playerId));
    this.broadcastState();
    this.sendGameView(playerId);
    return true;
  }

  disconnect(playerId: string) {
    const p = this.players.get(playerId);
    if (!p || p.left) return;
    p.connected = false;
    if (p.graceTimer !== null) this.clock.clearTimeout(p.graceTimer);
    // 이탈 확정은 유예 시간 뒤 (09-ENGINE-RULES 4절)
    p.graceTimer = this.clock.setTimeout(() => {
      p.graceTimer = null;
      if (!p.connected) this.leave(playerId);
    }, ROOM_TIMING.graceMs);
    const running = this.match?.running;
    if (running && !running.ended && running.participants.includes(playerId) && running.instance.onPlayerDisconnected) {
      this.safe(running, () => running.instance.onPlayerDisconnected!(playerId));
    }
    this.broadcastState();
  }

  /** 재접속 토큰 확인 (상태 변경 없음) */
  canResume(playerId: string, token: string): boolean {
    const p = this.players.get(playerId);
    return !!p && !p.left && p.token === token;
  }

  leave(playerId: string) {
    const p = this.players.get(playerId);
    if (!p || p.left) return;
    if (p.graceTimer !== null) this.clock.clearTimeout(p.graceTimer);
    p.left = true;
    p.connected = false;
    this.sink.record({ type: 'player_left', roomId: this.id, phase: this.phase, playerCount: this.memberCount() });
    if (this.phase === 'lobby') {
      this.players.delete(playerId);
      this.order = this.order.filter((id) => id !== playerId);
    }
    this.systemChat(`${p.nickname} 님이 나갔어요.`);
    if (this.hostId === playerId) {
      const next = this.members().find((m) => m.connected) ?? this.members()[0];
      this.hostId = next?.id ?? '';
      if (next) this.systemChat(`${next.nickname} 님이 방장이 됐어요.`);
    }
    const running = this.match?.running;
    if (running && !running.ended && running.participants.includes(playerId)) {
      this.safe(running, () => running.instance.onPlayerLeft?.(playerId));
    }
    if (this.memberCount() === 0) {
      this.close();
      return;
    }
    this.broadcastState();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.clearPhaseTimer();
    if (this.match?.running) this.disposeRunning(this.match.running);
    for (const p of this.players.values()) if (p.graceTimer !== null) this.clock.clearTimeout(p.graceTimer);
    this.onEmpty(this);
  }

  isMember(playerId: string): boolean {
    const p = this.players.get(playerId);
    return !!p && !p.left;
  }

  // ───────── 로비 ─────────

  setReady(playerId: string, ready: boolean) {
    const p = this.players.get(playerId);
    if (!p || p.left || this.phase !== 'lobby') return;
    p.ready = !!ready;
    this.broadcastState();
  }

  updateProfile(playerId: string, patch: Partial<Profile>): string | null {
    const p = this.players.get(playerId);
    if (!p || p.left) return '방에 없어요.';
    if (this.phase !== 'lobby') return '로비에서만 바꿀 수 있어요.';
    if (patch.nickname !== undefined) {
      const n = sanitizeNickname(patch.nickname);
      if (!n) return '닉네임은 1~10자로 정해 주세요.';
      if (this.members().some((m) => m.id !== playerId && m.nickname === n)) return '같은 닉네임이 이미 있어요.';
      p.nickname = n;
    }
    if (patch.avatar !== undefined) p.avatar = sanitizeAvatar(patch.avatar);
    this.broadcastState();
    return null;
  }

  updateSettings(playerId: string, input: unknown): string | null {
    if (playerId !== this.hostId) return '방장만 바꿀 수 있어요.';
    if (this.phase !== 'lobby') return '로비에서만 바꿀 수 있어요.';
    this.settings = sanitizeRoomSettings(this.metas(), input, this.settings, this.memberCount());
    this.sink.record({
      type: 'settings_changed',
      roomId: this.id,
      gameRounds: this.settings.gameRounds,
      enabledGameIds: this.settings.enabledGameIds,
      maxPlayers: this.settings.maxPlayers,
    });
    this.broadcastState();
    return null;
  }

  startBlockers(): string[] {
    const members = this.members();
    const out: string[] = [];
    if (members.length < ROOM_MIN_PLAYERS) out.push(`${ROOM_MIN_PLAYERS}명 이상 모여야 시작할 수 있어요.`);
    if (members.some((m) => !m.connected)) out.push('연결이 끊긴 사람이 있어요.');
    if (members.some((m) => m.id !== this.hostId && !m.ready)) out.push('아직 준비 안 한 사람이 있어요.');
    const playable = this.settings.enabledGameIds.filter((id) => {
      const g = this.games.find((x) => x.meta.id === id);
      return g && isPlayableWith(g.meta, members.length);
    });
    if (members.length >= ROOM_MIN_PLAYERS && playable.length === 0) out.push('지금 인원으로 할 수 있는 게임이 켜져 있지 않아요.');
    return out;
  }

  start(playerId: string): string | null {
    if (playerId !== this.hostId) return '방장만 시작할 수 있어요.';
    if (this.phase !== 'lobby') return '이미 시작했어요.';
    const blockers = this.startBlockers();
    if (blockers.length) return blockers[0]!;
    const members = this.members();
    const playlist = buildPlaylist(this.metas(), this.settings, members.length, this.random);
    this.match = {
      id: randomUUID(),
      playlist,
      index: 0,
      scores: Object.fromEntries(members.map((m) => [m.id, 0])),
      startedAt: this.clock.now(),
      playerCount: members.length,
    };
    this.sink.record({
      type: 'match_started',
      roomId: this.id,
      matchId: this.match.id,
      playerCount: members.length,
      gameIds: playlist,
      gameRounds: this.settings.gameRounds,
    });
    this.systemChat(`게임 시작! 이번 판: ${playlist.map((id) => this.meta(id)?.name).join(' → ')}`);
    this.goIntro(0);
    return null;
  }

  playAgain(playerId: string) {
    if (playerId !== this.hostId || this.phase !== 'final') return;
    this.sink.record({ type: 'play_again', roomId: this.id, playerCount: this.memberCount() });
    this.backToLobby();
  }

  private backToLobby() {
    this.clearPhaseTimer();
    if (this.match?.running) this.disposeRunning(this.match.running);
    this.match = null;
    this.phase = 'lobby';
    for (const [id, p] of this.players) {
      if (p.left) {
        this.players.delete(id);
        this.order = this.order.filter((x) => x !== id);
      } else p.ready = false;
    }
    if (this.settings.maxPlayers < this.memberCount()) this.settings.maxPlayers = this.memberCount();
    this.systemChat('로비로 돌아왔어요.');
    this.broadcastState();
  }

  // ───────── 매치 진행 ─────────

  private goIntro(index: number) {
    const m = this.match!;
    m.index = index;
    if (this.memberCount() < ROOM_MIN_PLAYERS) return this.goFinal('인원이 3명 미만이 되어 경기를 끝냈어요.');
    this.setPhase('intro', ROOM_TIMING.introMs, () => this.startGame(index));
  }

  private startGame(index: number) {
    const m = this.match!;
    const game = this.games.find((g) => g.meta.id === m.playlist[index]);
    const participants = this.members().map((p) => p.id);
    if (!game || !isPlayableWith(game.meta, participants.length)) {
      this.finishGame(
        { ranking: [participants], headlines: ['지금 인원으로는 이 게임을 할 수 없어 건너뛰어요.'], aborted: true },
        game?.meta.id ?? String(m.playlist[index]),
        participants,
      );
      return;
    }
    const running: RunningGame = {
      game,
      instance: undefined as unknown as GameInstance,
      participants,
      timers: new Set(),
      ended: false,
      startedAt: this.clock.now(),
    };
    const ctx: GameContext = {
      players: participants.map((id) => ({ id, nickname: this.players.get(id)!.nickname })),
      settings: this.settings.gameOptions[game.meta.id] ?? {},
      now: () => this.clock.now(),
      setTimer: (ms, fn) => {
        const id = this.clock.setTimeout(() => {
          running.timers.delete(id);
          if (!running.ended) this.safe(running, fn);
        }, ms);
        running.timers.add(id);
        return id;
      },
      clearTimer: (id) => {
        this.clock.clearTimeout(id);
        running.timers.delete(id);
      },
      isActive: (id) => this.isMember(id),
      activePlayerIds: () => participants.filter((id) => this.isMember(id)),
      update: () => {
        if (!running.ended) this.sendGameViews();
      },
      updatePlayer: (id) => {
        if (!running.ended) this.sendGameView(id);
      },
      say: (text, audience) => this.pushChat({ id: randomUUID(), text, at: Date.now(), kind: 'game' }, audience),
      end: (outcome) => {
        if (running.ended) return;
        this.finishGame(outcome, game.meta.id, participants);
      },
      random: this.random,
    };
    running.instance = game.create(ctx);
    m.running = running;
    this.clearPhaseTimer();
    this.phase = 'playing';
    this.phaseDeadline = null;
    this.sink.record({ type: 'game_started', roomId: this.id, matchId: m.id, gameId: game.meta.id, playerCount: participants.length });
    this.broadcastState();
    this.safe(running, () => running.instance.start());
    this.sendGameViews();
  }

  /** 게임 코드에서 예외가 나도 방 전체가 멈추지 않도록, 그 게임만 중단 처리한다. */
  private safe(running: RunningGame, fn: () => void) {
    try {
      fn();
    } catch (err) {
      console.error(`[game:${running.game.meta.id}] 오류`, err);
      if (!running.ended) {
        this.finishGame(
          { ranking: [running.participants], headlines: ['게임에 문제가 생겨 이번 게임은 무효 처리했어요.'], aborted: true },
          running.game.meta.id,
          running.participants,
        );
      }
    }
  }

  private disposeRunning(running: RunningGame) {
    running.ended = true;
    for (const t of running.timers) this.clock.clearTimeout(t);
    running.timers.clear();
    try {
      running.instance?.dispose?.();
    } catch {
      /* 무시 */
    }
  }

  private finishGame(outcome: GameOutcome, gameId: string, participants: string[]) {
    const m = this.match!;
    const running = m.running;
    if (running) {
      this.sendGameViews(); // 마지막 상태 전달
      this.disposeRunning(running);
    }
    // 순위에 빠진 참가자는 맨 뒤 공동 순위로
    const seen = new Set(outcome.ranking.flat());
    const ranking = outcome.ranking.map((g) => g.filter((id) => participants.includes(id))).filter((g) => g.length);
    const missing = participants.filter((id) => !seen.has(id));
    if (missing.length) ranking.push(missing);
    const pointsGained = outcome.aborted ? {} : placementPoints(ranking);
    for (const [id, pts] of Object.entries(pointsGained)) m.scores[id] = (m.scores[id] ?? 0) + pts;
    const meta = this.meta(gameId);
    m.lastResult = {
      gameId,
      gameName: meta?.name ?? gameId,
      ranking,
      pointsGained,
      gameScores: outcome.gameScores,
      headlines: outcome.headlines,
      aborted: outcome.aborted,
    };
    const durationMs = running ? Math.round(this.clock.now() - running.startedAt) : 0;
    if (outcome.aborted) {
      this.sink.record({ type: 'game_aborted', roomId: this.id, matchId: m.id, gameId, playerCount: participants.length, reason: outcome.headlines[0] ?? '' });
    } else {
      this.sink.record({ type: 'game_completed', roomId: this.id, matchId: m.id, gameId, playerCount: participants.length, durationMs });
    }
    m.running = undefined;
    this.setPhase('game_result', ROOM_TIMING.gameResultMs, () => {
      if (m.index + 1 < m.playlist.length) this.goIntro(m.index + 1);
      else this.goFinal();
    });
  }

  private goFinal(note?: string) {
    const m = this.match!;
    this.clearPhaseTimer();
    m.finalRanking = rankByScore(m.scores);
    this.phase = 'final';
    this.phaseDeadline = null;
    if (note) this.systemChat(note);
    this.sink.record({
      type: 'match_completed',
      roomId: this.id,
      matchId: m.id,
      playerCount: m.playerCount,
      durationMs: Math.round(this.clock.now() - m.startedAt),
    });
    this.broadcastState();
  }

  // ───────── 입력 ─────────

  chat(playerId: string, raw: unknown, receivedAt: number) {
    const p = this.players.get(playerId);
    if (!p || p.left || typeof raw !== 'string') return;
    const text = raw.normalize('NFC').trim().slice(0, CHAT_MAX_LENGTH);
    if (!text) return;
    const now = this.clock.now();
    p.chatTimes = p.chatTimes.filter((t) => now - t < CHAT_RATE.perMs);
    if (p.chatTimes.length >= CHAT_RATE.count) {
      this.transport.toast(playerId, '채팅이 너무 빨라요. 잠깐만요!');
      return;
    }
    p.chatTimes.push(now);
    const running = this.match?.running;
    let audience: string[] | undefined;
    if (this.phase === 'playing' && running && !running.ended && running.participants.includes(playerId) && running.instance.onChat) {
      const holder: { d: ChatDecision } = { d: { allow: true } };
      this.safe(running, () => {
        holder.d = running.instance.onChat!(playerId, text, receivedAt);
      });
      if (!holder.d.allow) {
        this.transport.toast(playerId, holder.d.reason);
        return;
      }
      audience = holder.d.audience;
    }
    this.pushChat({ id: randomUUID(), from: playerId, text, at: Date.now(), kind: 'user' }, audience);
  }

  action(playerId: string, requestId: unknown, action: unknown, receivedAt: number) {
    const p = this.players.get(playerId);
    const running = this.match?.running;
    if (!p || p.left || !running || running.ended || this.phase !== 'playing') return;
    if (!running.participants.includes(playerId)) return;
    // 같은 요청은 한 번만 적용 (09-ENGINE-RULES 2절)
    if (typeof requestId !== 'string' || p.requestIds.includes(requestId)) return;
    p.requestIds.push(requestId);
    if (p.requestIds.length > 200) p.requestIds.shift();
    this.safe(running, () => running.instance.onAction(playerId, action, receivedAt));
  }

  // ───────── 출력 ─────────

  private systemChat(text: string, kind: 'system' | 'game' = 'system') {
    this.pushChat({ id: randomUUID(), text, at: Date.now(), kind });
  }

  private pushChat(msg: ChatMessage, audience?: string[]) {
    this.chatLog.push(audience ? { ...msg, audience: [...audience] } : msg);
    if (this.chatLog.length > CHAT_HISTORY) this.chatLog.shift();
    const to = this.members().filter((m) => m.connected && (!audience || audience.includes(m.id)));
    this.transport.chat(
      to.map((m) => m.id),
      msg,
    );
  }

  private historyFor(playerId: string): ChatMessage[] {
    return this.chatLog.filter((m) => !m.audience || m.audience.includes(playerId)).map(({ audience: _a, ...m }) => m);
  }

  private setPhase(phase: RoomPhase, ms: number, next: () => void) {
    this.clearPhaseTimer();
    this.phase = phase;
    this.phaseDeadline = this.clock.now() + ms;
    this.phaseTimer = this.clock.setTimeout(() => {
      this.phaseTimer = null;
      next();
    }, ms);
    this.broadcastState();
  }

  private clearPhaseTimer() {
    if (this.phaseTimer !== null) this.clock.clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
    this.phaseDeadline = null;
  }

  private sendGameViews() {
    const running = this.match?.running;
    if (!running) return;
    for (const id of running.participants) this.sendGameView(id);
  }

  private sendGameView(playerId: string) {
    const running = this.match?.running;
    const p = this.players.get(playerId);
    if (!running || !p || !p.connected || !running.participants.includes(playerId)) return;
    try {
      this.transport.gameView(playerId, running.game.meta.id, running.instance.view(playerId));
    } catch (err) {
      console.error('[game view] 오류', err);
    }
  }

  private broadcastState() {
    for (const p of this.members()) if (p.connected) this.transport.state(p.id, this.viewFor(p.id));
  }

  private metas() {
    return this.games.map((g) => g.meta);
  }

  private meta(id: string) {
    return this.games.find((g) => g.meta.id === id)?.meta;
  }

  viewFor(meId: string): RoomView {
    const shown = this.phase === 'lobby' ? this.members() : this.order.map((id) => this.players.get(id)!).filter(Boolean);
    const players: PlayerPublic[] = shown.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      ready: p.ready || p.id === this.hostId,
      connected: p.connected && !p.left,
      isHost: p.id === this.hostId,
    }));
    const m = this.match;
    let match: MatchView | undefined;
    if (m) {
      match = {
        index: m.index,
        total: m.playlist.length,
        playlist: m.playlist.map((gameId) => ({ gameId, name: this.meta(gameId)?.name ?? gameId })),
        scores: m.scores,
        lastResult: m.lastResult,
        finalRanking: m.finalRanking,
      };
    }
    const cur = m && (this.phase === 'intro' || this.phase === 'playing') ? this.meta(m.playlist[m.index]!) : undefined;
    return {
      code: this.code,
      phase: this.phase,
      phaseRemainingMs: this.phaseDeadline !== null ? Math.max(0, Math.round(this.phaseDeadline - this.clock.now())) : undefined,
      meId,
      players,
      settings: this.settings,
      catalog: this.metas(),
      currentGame: cur ? { gameId: cur.id, name: cur.name, tagline: cur.tagline } : undefined,
      match,
      startBlockers: this.phase === 'lobby' ? this.startBlockers() : [],
    };
  }
}
