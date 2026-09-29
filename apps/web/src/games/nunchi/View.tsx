import { useRemaining } from '../../state/RoomProvider';
import { Avatar } from '../../ui/Avatar';
import { Countdown, TimerBar } from '../../ui/Marquee';
import type { GameViewProps } from '../registry';
import s from './View.module.css';

/** 서버 NunchiView와 같은 모양 (apps/server/src/games/nunchi) */
interface View {
  phase: 'countdown' | 'live' | 'round_result' | 'done';
  round: number;
  rounds: number;
  startsInMs?: number;
  idleRemainingMs?: number;
  expected: number;
  windowMs: number;
  players: { id: string; status: 'pending' | 'success' | 'out' | 'spectator'; reason?: string; outCount: number }[];
  claims: { number: number; ids: string[]; collision: boolean; diffMs?: number }[];
  me: 'pending' | 'success' | 'out' | 'spectator';
}

const ICON = { pending: '⌨️', success: '✅', out: '❌', spectator: '👀' } as const;

export function NunchiView({ view, receivedAt, players, meId }: GameViewProps<View>) {
  const startsIn = useRemaining(view.startsInMs, receivedAt, 50);
  const idle = useRemaining(view.idleRemainingMs, receivedAt);
  const byId = new Map(players.map((p) => [p.id, p]));
  const meLine =
    view.me === 'pending' ? '채팅창에 숫자를 쳐요!' : view.me === 'success' ? '통과! 이제 구경하세요 😎' : view.me === 'out' ? '탈락… 다음 라운드를 노려요' : '구경 중';

  return (
    <div className={s.wrap}>
      {view.phase === 'countdown' && startsIn !== undefined && <Countdown ms={startsIn} />}
      <div className="row">
        <span className="badge">
          라운드 {view.round} / {view.rounds}
        </span>
        <span className="badge">동시 기준 {(view.windowMs / 1000).toFixed(view.windowMs < 100 ? 2 : 1)}초</span>
      </div>

      <div className={s.next}>
        <span className="dim">다음 숫자</span>
        <span key={view.expected} className={`${s.bigNum} display pop-in`}>
          {view.phase === 'round_result' || view.phase === 'done' ? '끝' : view.expected}
        </span>
        <span className={s.meLine}>{meLine}</span>
      </div>

      {view.phase === 'live' && idle !== undefined && <TimerBar remainingMs={idle} totalMs={10_000} />}

      <ul className={s.grid}>
        {view.players.map((p) => {
          const pl = byId.get(p.id);
          return (
            <li key={p.id} className={`${s.tile} ${s[p.status]}`}>
              {pl && <Avatar avatar={pl.avatar} size={40} dimmed={p.status === 'out'} />}
              <div className={s.tileMeta}>
                <strong className={s.tileName}>
                  {pl?.nickname ?? '?'}
                  {p.id === meId && ' (나)'}
                </strong>
                <span className="faint">{p.reason ?? (p.status === 'success' ? '통과' : p.status === 'pending' ? '눈치 보는 중' : '')}</span>
              </div>
              <span aria-hidden>{ICON[p.status]}</span>
            </li>
          );
        })}
      </ul>

      {view.claims.length > 0 && (
        <ol className={s.claims}>
          {view.claims.map((c) => (
            <li key={c.number} className={c.collision ? s.collision : ''}>
              <span className="display">{c.number}</span>
              {c.ids.map((id) => byId.get(id)?.nickname ?? '?').join(' · ')}
              {c.collision && c.diffMs !== undefined && <em> 💥 {(c.diffMs / 1000).toFixed(3)}초 차</em>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
