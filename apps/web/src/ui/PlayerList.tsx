import type { PlayerPublic } from '@backstage/shared';
import { Avatar } from './Avatar';
import { T } from '../content/ko';
import s from './PlayerList.module.css';

export function PlayerCard({ p, meId, right }: { p: PlayerPublic; meId: string; right?: React.ReactNode }) {
  return (
    <li className={`${s.item} ${p.id === meId ? s.me : ''}`}>
      <Avatar avatar={p.avatar} size={44} dimmed={!p.connected} label={p.nickname} />
      <div className={s.meta}>
        <span className={s.name}>
          {p.nickname}
          {p.id === meId && <span className="faint"> (나)</span>}
        </span>
        <span className="row">
          {p.isHost && <span className="badge badge-host">{T.lobby.host}</span>}
          {!p.connected && <span className="badge badge-bad">연결 끊김</span>}
        </span>
      </div>
      {right}
    </li>
  );
}

export function PlayerList({ players, meId, showReady = false }: { players: PlayerPublic[]; meId: string; showReady?: boolean }) {
  return (
    <ul className={s.list}>
      {players.map((p) => (
        <PlayerCard
          key={p.id}
          p={p}
          meId={meId}
          right={showReady ? <span className={`badge ${p.ready ? 'badge-good' : ''}`}>{p.ready ? '준비 완료' : '대기'}</span> : undefined}
        />
      ))}
    </ul>
  );
}
