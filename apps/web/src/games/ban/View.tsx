import { useState } from 'react';
import { useRemaining } from '../../state/RoomProvider';
import { Avatar } from '../../ui/Avatar';
import { Marquee, TimerBar } from '../../ui/Marquee';
import type { GameViewProps } from '../registry';
import { Standings } from '../wordcore/Standings';
import s from '../wordcore/WordGames.module.css';

type Status = 'normal' | 'pending' | 'muted' | 'cleared';

/** 서버 BanView와 같은 모양 (apps/server/src/games/ban) */
interface View {
  phase: 'intro' | 'play' | 'reveal' | 'done';
  round: number;
  rounds: number;
  remainingMs?: number;
  roundMs: number;
  groupCount: number;
  myGroupNo: number;
  waiting: boolean;
  group: { id: string; word?: string; pool?: 1 | 2 | 3; status: Status; caught: number; left: boolean }[];
  me: { status: Status; pendingRemainingMs?: number; mutedRemainingMs?: number; caughtLine?: string };
  challengeMs: number;
  scores: Record<string, number>;
  events: { kind: 'caught' | 'success' | 'fail' | 'skip'; id: string; guess?: string }[];
  reveal?: { id: string; word: string; caught: number; groupNo: number; lines: string[]; roundScore: number }[];
}

const STATUS_TEXT: Record<Status, string> = { normal: '', pending: '🚨 적발!', muted: '🤐 입막힘', cleared: '✅ 해제' };

export function BanView({ view, receivedAt, players, meId, sendAction }: GameViewProps<View>) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const nick = (id: string) => byId.get(id)?.nickname ?? '?';
  const remaining = useRemaining(view.remainingMs, receivedAt, 250);
  const pending = useRemaining(view.me.pendingRemainingMs, receivedAt, 100);
  const muted = useRemaining(view.me.mutedRemainingMs, receivedAt, 250);
  const [guess, setGuess] = useState('');
  const groupLabel = view.groupCount > 1 ? `${view.myGroupNo}조 · ` : '';

  if ((view.phase === 'reveal' || view.phase === 'done') && view.reveal) {
    const rows = [...view.reveal].sort((a, b) => a.groupNo - b.groupNo || b.caught - a.caught);
    return (
      <div className={s.wrap}>
        <Marquee size="md" kicker={`${view.round}라운드 금지어 공개`} title="내 금지어는…" />
        <table className={s.table} data-testid="ban-reveal">
          <thead>
            <tr>
              {view.groupCount > 1 && <th>조</th>}
              <th>이름 · 금지어</th>
              <th className={s.num}>적발</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {view.groupCount > 1 && <td>{r.groupNo}</td>}
                <td>
                  <strong>{nick(r.id)}</strong> 「{r.word}」{r.id === meId && ' ← 나'}
                  {r.lines.map((l, i) => (
                    <div key={i} className={s.line}>
                      “{l}”
                    </div>
                  ))}
                </td>
                <td className={s.num}>{r.caught}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Standings rows={view.reveal.map((r) => ({ id: r.id, round: r.roundScore, total: view.scores[r.id] ?? 0 }))} players={players} meId={meId} />
        {remaining !== undefined && view.phase === 'reveal' && <TimerBar remainingMs={remaining} totalMs={10_000} />}
      </div>
    );
  }

  const cards = (
    <ul className={s.people}>
      {view.group.map((g) => {
        const pl = byId.get(g.id);
        const mine = g.id === meId;
        return (
          <li key={g.id} className={`${s.person} ${s[g.status] ?? ''}`} data-testid={`ban-card-${g.id}`}>
            <div className={s.personHead}>
              {pl && <Avatar avatar={pl.avatar} size={32} dimmed={g.left} />}
              <span className={s.personName}>
                {nick(g.id)}
                {mine && ' (나)'}
              </span>
              <span className="faint">{view.scores[g.id] ?? 0}점</span>
            </div>
            {mine ? <span className={s.hidden}>❓❓❓</span> : <span className={`${s.theirWord}`} data-testid={`ban-word-${g.id}`}>{g.word}</span>}
            <span className="faint">
              {STATUS_TEXT[g.status]}
              {g.caught > 0 && ` 적발 ${g.caught}회`}
            </span>
          </li>
        );
      })}
    </ul>
  );

  if (view.phase === 'intro') {
    return (
      <div className={s.wrap}>
        <Marquee size="md" kicker={`금지어 · ${groupLabel}${view.round} / ${view.rounds}라운드`} title="내 금지어만 안 보여요" />
        {cards}
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <div className="row">
        <span className="badge">
          {groupLabel}
          {view.round} / {view.rounds}라운드
        </span>
        <span className="spacer" />
        <span className="badge">내 점수 {view.scores[meId] ?? 0}</span>
      </div>
      {remaining !== undefined && <TimerBar remainingMs={remaining} totalMs={view.roundMs} />}

      {view.me.status === 'pending' && (
        <section className={s.alert} data-testid="ban-alert">
          <span className={`${s.alertTitle} display`}>🚨 금지어를 말했어요!</span>
          {view.me.caughtLine && <span className="dim">방금 한 말: “{view.me.caughtLine}”</span>}
          <span>
            맞히면 <strong>+3</strong> · 틀리면 <strong>−3</strong>
          </span>
          {pending !== undefined && <TimerBar remainingMs={pending} totalMs={view.challengeMs} />}
          <form
            className={s.form}
            onSubmit={(e) => {
              e.preventDefault();
              if (guess.trim()) sendAction({ type: 'challenge', guess: guess.trim() });
              setGuess('');
            }}
          >
            <input className="input" autoFocus value={guess} maxLength={30} placeholder="내 금지어는…?" onChange={(e) => setGuess(e.target.value)} data-testid="ban-guess" />
            <button className="btn btn-primary" disabled={!guess.trim()} data-testid="ban-guess-send">
              챌린지!
            </button>
          </form>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => sendAction({ type: 'skip' })} data-testid="ban-skip">
            패스 (입막힘 10초)
          </button>
        </section>
      )}
      {view.me.status === 'muted' && muted !== undefined && (
        <p className={s.bad} style={{ textAlign: 'center', margin: 0 }} data-testid="ban-muted">
          🤐 입막힘 {Math.ceil(muted / 1000)}초
        </p>
      )}
      {view.me.status === 'cleared' && <p className={s.good} style={{ textAlign: 'center', margin: 0 }}>✅ 판정 해제</p>}
      {view.waiting && <p className="dim" style={{ textAlign: 'center', margin: 0 }}>다른 조 기다리는 중…</p>}

      {cards}
    </div>
  );
}
