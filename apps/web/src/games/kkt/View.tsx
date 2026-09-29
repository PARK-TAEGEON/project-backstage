import { useEffect, useRef, useState } from 'react';
import { useRemaining } from '../../state/RoomProvider';
import { Avatar } from '../../ui/Avatar';
import { Marquee, TimerBar } from '../../ui/Marquee';
import type { GameViewProps } from '../registry';
import { BARS_PER_TURN, isMuted, onMutedChange, playBomb, playFail, playFanfare, playPass, playReject, playTurnBeat, setMuted, stopScheduled } from './sound';
import s from './View.module.css';

type FailReason = 'timeout' | 'length' | 'start' | 'not_in_dict' | 'used' | 'left';

/** 서버 KktView와 같은 모양 (apps/server/src/games/kkt) */
interface View {
  phase: 'intro' | 'turn' | 'round_result' | 'done';
  round: number;
  startSyllable: string;
  current?: string;
  required: string[];
  turnMs: number;
  turnRemainingMs?: number;
  phaseRemainingMs?: number;
  order: string[];
  eliminated: { id: string; reason: FailReason; word?: string }[];
  chain: { word: string; by: string; def: string; hanbang: boolean }[];
  lastFail?: { id: string; reason: FailReason; word?: string };
  rejected?: { id: string; reason: FailReason; word: string };
  rejectCount: number;
  me: 'alive' | 'out' | 'spectator';
  usedCount: number;
  dict: { version: string; credit: string };
}

const FAIL_TEXT: Record<FailReason, string> = {
  timeout: '시간 초과',
  length: '세 글자가 아니에요',
  start: '첫 글자가 안 맞아요',
  not_in_dict: '없는 단어예요',
  used: '이미 나온 단어예요',
  left: '나감',
};

export function KktView({ view, receivedAt, players, meId, sendAction }: GameViewProps<View>) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id?: string) => (id ? (byId.get(id)?.nickname ?? '?') : '');
  const remaining = useRemaining(view.turnRemainingMs, receivedAt, 50);
  const myTurn = view.phase === 'turn' && view.current === meId;
  const turnKey = `${view.round}:${view.usedCount}:${view.current ?? ''}:${view.phase}`;
  /** 제출 하나에 대한 서버 답(통과·거절)을 받기 전까지 다시 못 보내게 잠그는 키 */
  const attemptKey = `${turnKey}:${view.rejectCount}`;

  const [word, setWord] = useState('');
  const [sentKey, setSentKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [muted, setMutedState] = useState(isMuted());
  useEffect(() => onMutedChange(setMutedState), []);

  // 내가 낸 차례가 지나가면 입력칸 비우기. 내 차례면 바로 입력할 수 있게 포커스
  // (모바일은 포커스만으로 키보드가 안 뜰 수 있어서, 생존자에게는 입력칸을 계속 보여 준다 → 키보드를 켜 둔 채 기다릴 수 있음)
  useEffect(() => {
    // 서버가 답했다: 통과면 차례가 넘어갔고, 내 단어가 거절됐으면 다시 시도할 수 있게 비우고 포커스
    if (sentKey !== null || (view.rejected?.id === meId && myTurn)) setWord('');
    setSentKey(null);
    if (myTurn) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptKey, myTurn]);

  // ── 사운드 실험: 차례마다 쿵·쿵·따 비트, 통과/탈락/한방/팡파르 효과음 ──
  useEffect(() => {
    // 음소거를 차례 도중에 풀어도 남은 박자부터 다시 울린다
    if (!muted && view.phase === 'turn' && view.turnRemainingMs !== undefined) {
      playTurnBeat(view.turnMs, Math.max(0, view.turnRemainingMs - (performance.now() - receivedAt)));
    } else stopScheduled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey, muted]);
  useEffect(() => {
    if (view.rejectCount > 0) playReject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptKey]);
  const prev = useRef({ used: view.usedCount, out: view.eliminated.length, phase: view.phase });
  useEffect(() => {
    const p = prev.current;
    if (view.usedCount > p.used) {
      const last = view.chain[view.chain.length - 1];
      if (last?.hanbang) playBomb();
      else playPass();
    }
    if (view.phase === 'done' && p.phase !== 'done') playFanfare();
    else if (view.eliminated.length > p.out) playFail();
    prev.current = { used: view.usedCount, out: view.eliminated.length, phase: view.phase };
  }, [view.usedCount, view.eliminated.length, view.phase, view.chain]);
  useEffect(() => () => stopScheduled(), []);

  // 서버가 제출을 조용히 무시한 경우(연타 방지 등)에도 입력이 잠긴 채 남지 않게 잠시 뒤 풀어 준다
  useEffect(() => {
    if (sentKey === null) return;
    const id = setTimeout(() => setSentKey(null), 1000);
    return () => clearTimeout(id);
  }, [sentKey]);

  const submit = () => {
    const w = word.trim();
    if (!myTurn || !w || sentKey === attemptKey) return;
    setSentKey(attemptKey);
    sendAction({ type: 'word', word: w });
  };

  const beatPos = remaining !== undefined ? Math.min(BARS_PER_TURN * 3 - 1, Math.floor(((view.turnMs - remaining) / view.turnMs) * BARS_PER_TURN * 3)) : -1;
  const lastWord = view.chain[view.chain.length - 1];
  const needLabel = view.required.length > 1 ? `${view.required[0]} (${view.required.slice(1).join('·')})` : view.required[0];

  if (view.phase === 'intro') {
    return (
      <div className={s.wrap}>
        <Marquee size="md" kicker={`쿵쿵따 · ${view.round}라운드`} title={`「${view.startSyllable}」`} subtitle={`${nick(view.current) || '첫 사람'} 님부터! 세 글자로 이어요`} />
        <Footer view={view} />
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <div className="row">
        <span className="badge">{view.round}라운드</span>
        <span className="badge">생존 {view.order.length}명</span>
        <span className="spacer" />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMuted(!muted)} aria-pressed={muted} data-testid="kkt-mute">
          {muted ? '🔇 소리 켜기' : '🔊 소리 끄기'}
        </button>
      </div>

      <section className={s.stage}>
        {view.phase === 'turn' ? (
          <>
            <span className="dim">{myTurn ? '내 차례!' : `${nick(view.current)} 님 차례`}</span>
            <span key={turnKey} className={`${s.need} display pop-in`} data-testid="kkt-need">
              {needLabel}
            </span>
            {view.rejected ? (
              <span key={view.rejectCount} className={`${s.reject} pop-in`} data-testid="kkt-reject">
                ✖ {view.rejected.id === meId ? '' : `${nick(view.rejected.id)} `}「{view.rejected.word}」 {FAIL_TEXT[view.rejected.reason]}! 다시!
              </span>
            ) : (
              <span className="faint">(으)로 시작하는 세 글자 · 이번 차례 {view.turnMs / 1000}초</span>
            )}
          </>
        ) : (
          view.lastFail && (
            <>
              <span className={`${s.fail} display pop-in`}>땡!</span>
              <span className={s.failLine}>
                {nick(view.lastFail.id)} {view.lastFail.word ? `「${view.lastFail.word}」 · ` : ''}
                {FAIL_TEXT[view.lastFail.reason]}
              </span>
            </>
          )
        )}
        {view.phase === 'done' && <span className={`${s.need} display pop-in`}>끝!</span>}
      </section>

      {view.phase === 'turn' && remaining !== undefined && (
        <>
          <ol className={s.beats} aria-hidden>
            {Array.from({ length: BARS_PER_TURN * 3 }, (_, i) => (
              <li key={i} className={`${i % 3 === 2 ? s.tta : s.kung} ${i <= beatPos ? s.lit : ''}`}>
                {i % 3 === 2 ? '따' : '쿵'}
              </li>
            ))}
          </ol>
          <TimerBar remainingMs={remaining} totalMs={view.turnMs} />
        </>
      )}

      {view.me === 'alive' && view.phase !== 'done' && (
        <form
          className={s.inputRow}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            className={`input ${s.wordInput}`}
            value={word}
            maxLength={10}
            placeholder={myTurn ? `${view.required[0]}○○` : '내 차례를 기다리는 중…'}
            onChange={(e) => setWord(e.target.value)}
            readOnly={sentKey === attemptKey}
            autoComplete="off"
            aria-label="세 글자 단어"
            data-testid="kkt-input"
          />
          <button className="btn btn-marquee" disabled={!myTurn || sentKey === attemptKey || !word.trim()} data-testid="kkt-submit">
            따!
          </button>
        </form>
      )}
      {!myTurn && view.phase === 'turn' && <p className={`${s.hint} dim`}>{view.me === 'alive' ? '내 차례가 아닐 땐 채팅으로 마음껏 방해하세요 😈' : '탈락… 채팅으로 방해는 가능!'}</p>}

      {view.chain.length > 0 && (
        <ol className={s.chain} data-testid="kkt-chain">
          {view.chain.map((c, i) => (
            <li key={`${c.word}-${i}`} className={c.hanbang ? s.bomb : ''}>
              <span className={s.chainWord}>{c.word}</span>
              <span className="faint">{nick(c.by)}</span>
              {c.hanbang && <em>💣 한방</em>}
            </li>
          ))}
        </ol>
      )}
      {lastWord?.def && (
        <p className={s.def}>
          <strong>{lastWord.word}</strong> — {lastWord.def}
        </p>
      )}

      <ul className={s.players}>
        {view.order.map((id) => (
          <li key={id} className={id === view.current ? s.now : ''}>
            {byId.get(id) && <Avatar avatar={byId.get(id)!.avatar} size={32} />}
            <span>
              {nick(id)}
              {id === meId && ' (나)'}
            </span>
          </li>
        ))}
        {view.eliminated.map((e) => (
          <li key={e.id} className={s.out}>
            {byId.get(e.id) && <Avatar avatar={byId.get(e.id)!.avatar} size={32} dimmed />}
            <span>
              {nick(e.id)} <span className="faint">· {FAIL_TEXT[e.reason]}</span>
            </span>
          </li>
        ))}
      </ul>

      <Footer view={view} />
    </div>
  );
}

function Footer({ view }: { view: View }) {
  return (
    <p className={s.credit}>
      {view.dict.credit} ({view.dict.version})
    </p>
  );
}
