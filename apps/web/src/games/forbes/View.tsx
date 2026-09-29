import { useRemaining } from '../../state/RoomProvider';
import { Avatar } from '../../ui/Avatar';
import { Marquee, TimerBar } from '../../ui/Marquee';
import type { GameViewProps } from '../registry';
import s from './View.module.css';

/** 서버 ForbesView와 같은 모양 (apps/server/src/games/forbes) */
interface View {
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

export function ForbesView({ view, receivedAt, players, meId, sendAction }: GameViewProps<View>) {
  const remaining = useRemaining(view.remainingMs, receivedAt);
  const byId = new Map(players.map((p) => [p.id, p]));
  const total = view.phase === 'spicy_vote' ? 10_000 : view.phase === 'reveal' ? 5000 : 10_000;

  if (view.phase === 'spicy_vote') {
    const chosen = view.spicy.myChoice;
    return (
      <div className={s.wrap}>
        <Marquee size="md" kicker="시작 전 투표" title="매운맛 질문 허용?" subtitle="한 명이라도 싫으면 순한맛으로 가요. 누가 뭘 골랐는지는 안 보여요." />
        {remaining !== undefined && <TimerBar remainingMs={remaining} totalMs={total} />}
        <div className={s.choices}>
          <button className="btn btn-primary" disabled={chosen !== undefined} aria-pressed={chosen === true} onClick={() => sendAction({ type: 'spicy', allow: true })}>
            🌶 좋아
          </button>
          <button className="btn" disabled={chosen !== undefined} aria-pressed={chosen === false} onClick={() => sendAction({ type: 'spicy', allow: false })}>
            🍼 순한맛
          </button>
        </div>
        <p className="dim" style={{ textAlign: 'center' }}>
          {chosen !== undefined ? '투표 완료! ' : ''}
          {view.spicy.answered} / {view.spicy.total}명 응답
        </p>
      </div>
    );
  }

  if (view.phase === 'reveal' && view.reveal) {
    const r = view.reveal;
    const max = Math.max(1, ...Object.values(r.counts));
    return (
      <div className={s.wrap}>
        <Marquee
          size="md"
          kicker={`포브스 선정 · ${view.round} / ${view.rounds}`}
          title={r.winners.length ? r.winners.map((id) => byId.get(id)?.nickname ?? '?').join(', ') : '당선자 없음'}
          subtitle={`‘${r.title}’ ${r.winners.length > 1 ? '공동 ' : ''}1위`}
        >
          <div className="row" style={{ justifyContent: 'center' }}>
            {r.winners.map((id) => {
              const p = byId.get(id);
              return p ? <Avatar key={id} avatar={p.avatar} size={88} label={p.nickname} /> : null;
            })}
          </div>
        </Marquee>
        <ul className={s.bars}>
          {Object.entries(r.counts)
            .sort((a, b) => b[1] - a[1])
            .map(([id, c]) => (
              <li key={id}>
                <span className={s.barName}>{byId.get(id)?.nickname ?? '?'}</span>
                <span className={s.bar}>
                  <span className={s.barFill} style={{ width: `${(c / max) * 100}%` }} />
                </span>
                <strong>{c}표</strong>
              </li>
            ))}
        </ul>
      </div>
    );
  }

  if (view.phase === 'question' && view.question) {
    const voted = view.myVote !== undefined;
    const canVote = view.candidates.includes(meId);
    return (
      <div className={s.wrap}>
        <div className={s.qBox}>
          <span className="badge">
            질문 {view.round} / {view.rounds}
          </span>
          <h2 className={`${s.question} display`}>{view.question.text}</h2>
        </div>
        {remaining !== undefined && <TimerBar remainingMs={remaining} totalMs={total} />}
        <ul className={s.cands}>
          {view.candidates
            .filter((id) => id !== meId)
            .map((id) => {
              const p = byId.get(id);
              if (!p) return null;
              return (
                <li key={id}>
                  <button
                    className={`${s.cand} ${view.myVote === id ? s.picked : ''}`}
                    disabled={voted || !canVote}
                    onClick={() => sendAction({ type: 'vote', target: id })}
                    aria-pressed={view.myVote === id}
                  >
                    <Avatar avatar={p.avatar} size={64} dimmed={voted && view.myVote !== id} />
                    <span>{p.nickname}</span>
                  </button>
                </li>
              );
            })}
        </ul>
        <p className="dim" style={{ textAlign: 'center' }}>
          {voted ? '지목 완료! ' : canVote ? '한 명을 골라요. 한 번 고르면 못 바꿔요. ' : ''}
          {view.votedCount} / {view.voterCount}명 지목
        </p>
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <p className="dim" style={{ textAlign: 'center' }}>
        결과 집계 중…
      </p>
    </div>
  );
}
