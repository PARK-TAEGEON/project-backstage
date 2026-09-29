import { useEffect, useRef, useState } from 'react';
import { useRemaining } from '../../state/RoomProvider';
import { Avatar } from '../../ui/Avatar';
import { Marquee, TimerBar } from '../../ui/Marquee';
import type { GameViewProps } from '../registry';
import s from '../wordcore/WordGames.module.css';

/** 서버 WordView와 같은 모양 (apps/server/src/games/word) */
interface View {
  phase: 'intro' | 'play' | 'reveal' | 'done';
  round: number;
  rounds: number;
  remainingMs?: number;
  roundMs: number;
  myWord?: { word: string; pool: 1 | 2 | 3 };
  myLocked: boolean;
  myRoundScore: number;
  myUses: number;
  myNextScoreInMs: number;
  myScoreSeq: number;
  players: { id: string; locked: boolean; left: boolean }[];
  challenges: { by: string; target: string; success: boolean; text: string }[];
  totals: Record<string, number>;
  reveal?: { id: string; word: string; pool: 1 | 2 | 3; uses: number; challengePoints: number; roundScore: number; bestLine?: string; locked: boolean }[];
}

const POOL_NOTE = { 1: '입버릇 단어 — 숨기기 쉬워요', 2: '생활 단어 — 자연스럽게!', 3: '전문용어 — 쓰는 순간 의심받아요 😈' } as const;

export function WordView({ view, receivedAt, players, meId, sendAction }: GameViewProps<View>) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id: string) => byId.get(id)?.nickname ?? '?';
  const remaining = useRemaining(view.remainingMs, receivedAt, 250);
  const nextScore = useRemaining(view.phase === 'play' ? view.myNextScoreInMs : undefined, receivedAt, 250);
  const [target, setTarget] = useState<string | null>(null);
  const [guess, setGuess] = useState('');
  const [plus, setPlus] = useState(false);
  const seq = useRef(view.myScoreSeq);

  // 단어 득점은 나만 아는 “+1”
  useEffect(() => {
    if (view.myScoreSeq > seq.current) {
      setPlus(true);
      const id = setTimeout(() => setPlus(false), 1500);
      seq.current = view.myScoreSeq;
      return () => clearTimeout(id);
    }
    seq.current = view.myScoreSeq;
  }, [view.myScoreSeq]);
  useEffect(() => {
    if (view.phase !== 'play') setTarget(null);
  }, [view.phase]);

  const submitChallenge = () => {
    const g = guess.trim();
    if (!target || !g) return;
    sendAction({ type: 'challenge', target, guess: g });
    setTarget(null);
    setGuess('');
  };

  if (view.phase === 'intro' && view.myWord) {
    return (
      <div className={s.wrap}>
        <Marquee size="md" kicker={`단어 말하기 · ${view.round} / ${view.rounds}라운드 · 나만 보여요`} title={view.myWord.word} subtitle={POOL_NOTE[view.myWord.pool]} />
      </div>
    );
  }

  if ((view.phase === 'reveal' || view.phase === 'done') && view.reveal) {
    const rows = [...view.reveal].sort((a, b) => b.roundScore - a.roundScore);
    return (
      <div className={s.wrap}>
        <Marquee size="md" kicker={`${view.round}라운드 공개`} title="그래서 그랬구나!" />
        <table className={s.table} data-testid="word-reveal">
          <thead>
            <tr>
              <th>이름 · 단어</th>
              <th className={s.num}>사용</th>
              <th className={s.num}>챌린지</th>
              <th className={s.num}>점수</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{nick(r.id)}</strong> 「{r.word}」{r.pool === 3 && ' 🧪'}
                  {r.locked && ' 🔒'}
                  {r.bestLine && <div className={s.line}>“{r.bestLine}”</div>}
                </td>
                <td className={s.num}>{r.uses}</td>
                <td className={s.num}>{r.challengePoints > 0 ? `+${r.challengePoints}` : r.challengePoints}</td>
                <td className={s.num}>{r.roundScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {remaining !== undefined && view.phase === 'reveal' && <TimerBar remainingMs={remaining} totalMs={10_000} />}
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <div className="row">
        <span className="badge">
          {view.round} / {view.rounds}라운드
        </span>
        <span className="spacer" />
        {plus && <span className={s.plus}>+1 🤫</span>}
      </div>
      {remaining !== undefined && <TimerBar remainingMs={remaining} totalMs={view.roundMs} />}

      {view.myWord && (
        <section className={`${s.secret} ${view.myLocked ? s.locked : ''}`}>
          <span className="faint">내 단어 (나만 보여요)</span>
          <span className={`${s.secretWord} display`} data-testid="word-mine">
            {view.myWord.word}
          </span>
          <span className={view.myWord.pool === 3 ? s.pool3 : 'dim'}>{POOL_NOTE[view.myWord.pool]}</span>
          <div className={s.stats}>
            <span className="badge">이번 라운드 {view.myRoundScore}점</span>
            <span className="badge">사용 {view.myUses}회</span>
            {view.myLocked ? (
              <span className="badge">🔒 들켰어요 — 챌린지로 만회!</span>
            ) : nextScore ? (
              <span className="badge">다음 득점까지 {Math.ceil(nextScore / 1000)}초</span>
            ) : (
              <span className="badge">지금 쓰면 +1</span>
            )}
          </div>
        </section>
      )}

      <p className="dim" style={{ margin: 0, textAlign: 'center' }}>
        수상한 사람을 눌러 단어를 맞혀 보세요 — 맞히면 +3, 틀리면 −3
      </p>
      <ul className={s.people}>
        {view.players
          .filter((p) => p.id !== meId)
          .map((p) => {
            const pl = byId.get(p.id);
            const open = target === p.id;
            return (
              <li key={p.id} className={`${s.person} ${p.locked ? s.locked : ''}`}>
                <div className={s.personHead}>
                  {pl && <Avatar avatar={pl.avatar} size={32} dimmed={p.left} />}
                  <span className={s.personName}>{nick(p.id)}</span>
                  <span className="faint">{p.locked ? '🔒' : `${view.totals[p.id] ?? 0}점`}</span>
                </div>
                {open ? (
                  <form
                    className={s.form}
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitChallenge();
                    }}
                  >
                    <input className="input" autoFocus value={guess} maxLength={30} placeholder="단어 추측" onChange={(e) => setGuess(e.target.value)} data-testid="word-guess" />
                    <button className="btn btn-sm btn-primary" disabled={!guess.trim()} data-testid="word-guess-send">
                      찍기
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={p.locked || view.phase !== 'play'}
                    onClick={() => {
                      setTarget(p.id);
                      setGuess('');
                    }}
                    data-testid={`word-challenge-${p.id}`}
                  >
                    {p.locked ? '들킴' : '🎯 챌린지'}
                  </button>
                )}
              </li>
            );
          })}
      </ul>

      {view.challenges.length > 0 && (
        <ul className={s.log}>
          {view.challenges.map((c, i) => (
            <li key={i} className={c.success ? s.good : s.bad}>
              {c.success ? '🎯' : '💀'} {nick(c.by)} → {nick(c.target)} 「{c.text}」 {c.success ? '성공 +3' : '실패 −3'}
            </li>
          ))}
        </ul>
      )}
      <p className={s.small}>득점은 나만 알아요. 다른 사람 점수는 라운드가 끝나면 공개돼요.</p>
    </div>
  );
}
