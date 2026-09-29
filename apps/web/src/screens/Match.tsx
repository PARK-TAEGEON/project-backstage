import type { RoomView } from '@backstage/shared';
import { WEB_GAMES } from '../games/registry';
import { T } from '../content/ko';
import { useRemaining, useRoom } from '../state/RoomProvider';
import { Avatar } from '../ui/Avatar';
import { ChatPanel } from '../ui/ChatPanel';
import { Marquee } from '../ui/Marquee';
import s from './Match.module.css';

function Scoreboard({ room }: { room: RoomView }) {
  const scores = room.match?.scores ?? {};
  const rows = [...room.players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  return (
    <ol className={s.score}>
      {rows.map((p) => (
        <li key={p.id} className={p.id === room.meId ? s.meRow : ''}>
          <Avatar avatar={p.avatar} size={24} dimmed={!p.connected} />
          <span className={s.scoreName}>{p.nickname}</span>
          <strong>{scores[p.id] ?? 0}</strong>
        </li>
      ))}
    </ol>
  );
}

function Intro({ room, receivedAt }: { room: RoomView; receivedAt: number }) {
  const m = room.match!;
  const left = useRemaining(room.phaseRemainingMs, receivedAt);
  return (
    <Marquee kicker={`${T.match.nextGame} · ${T.match.gameOf(m.index + 1, m.total)}`} title={room.currentGame?.name ?? ''} subtitle={room.currentGame?.tagline}>
      {left !== undefined && <span className="faint">{Math.ceil(left / 1000)}초 뒤 시작</span>}
    </Marquee>
  );
}

function RankList({ room, ranking, gained, gameScores }: { room: RoomView; ranking: string[][]; gained?: Record<string, number>; gameScores?: Record<string, number> }) {
  const byId = new Map(room.players.map((p) => [p.id, p]));
  let place = 1;
  return (
    <ol className={s.rank}>
      {ranking.map((group) => {
        const at = place;
        place += group.length;
        return group.map((id) => {
          const p = byId.get(id);
          return (
            <li key={id} className={`${id === room.meId ? s.meRow : ''} rise`}>
              <span className={`${s.place} display`}>{at}</span>
              {p && <Avatar avatar={p.avatar} size={36} />}
              <span className={s.scoreName}>{p?.nickname ?? '나간 사람'}</span>
              {gameScores && <span className="faint">({gameScores[id] ?? 0})</span>}
              {gained && <span className="badge badge-good">+{gained[id] ?? 0}{T.match.points}</span>}
              <strong>
                {T.match.total} {room.match?.scores[id] ?? 0}
              </strong>
            </li>
          );
        });
      })}
    </ol>
  );
}

function GameResult({ room, receivedAt }: { room: RoomView; receivedAt: number }) {
  const r = room.match!.lastResult!;
  const left = useRemaining(room.phaseRemainingMs, receivedAt);
  return (
    <div className="stack">
      <Marquee size="md" kicker={T.match.result} title={r.gameName} subtitle={r.aborted ? T.match.aborted : undefined}>
        {r.headlines.map((h) => (
          <p key={h} className={s.headline}>
            {h}
          </p>
        ))}
      </Marquee>
      <RankList room={room} ranking={r.ranking} gained={r.pointsGained} />
      {left !== undefined && <p className="faint" style={{ textAlign: 'center' }}>{Math.ceil(left / 1000)}초 뒤 다음으로</p>}
    </div>
  );
}

function Final({ room }: { room: RoomView }) {
  const { again, leave } = useRoom();
  const m = room.match!;
  const byId = new Map(room.players.map((p) => [p.id, p]));
  const top = m.finalRanking?.[0] ?? [];
  const isHost = room.players.find((p) => p.id === room.meId)?.isHost;
  return (
    <div className="stack">
      <Marquee kicker={T.match.final} title={top.map((id) => byId.get(id)?.nickname ?? '?').join(', ')} subtitle="🏆 오늘의 우승">
        <div className="row" style={{ justifyContent: 'center' }}>
          {top.map((id) => {
            const p = byId.get(id);
            return p ? <Avatar key={id} avatar={{ ...p.avatar, hat: 'crown' }} size={96} label={p.nickname} /> : null;
          })}
        </div>
      </Marquee>
      <RankList room={room} ranking={m.finalRanking ?? []} />
      <div className="row" style={{ justifyContent: 'center' }}>
        {isHost ? (
          <button className="btn btn-marquee" onClick={again} data-testid="again">
            🔁 {T.match.again}
          </button>
        ) : (
          <span className="dim">{T.match.waitingHost}</span>
        )}
        <button className="btn btn-ghost" onClick={leave}>
          {T.lobby.leave}
        </button>
      </div>
    </div>
  );
}

export function Match({ room, receivedAt }: { room: RoomView; receivedAt: number }) {
  const { game, chat, sendChat, sendAction } = useRoom();
  const m = room.match;
  const web = room.phase === 'playing' && game ? WEB_GAMES[game.data.gameId] : undefined;

  let body: React.ReactNode;
  if (room.phase === 'intro') body = <Intro room={room} receivedAt={receivedAt} />;
  else if (room.phase === 'game_result' && m?.lastResult) body = <GameResult room={room} receivedAt={receivedAt} />;
  else if (room.phase === 'final' && m) body = <Final room={room} />;
  else if (room.phase === 'playing' && game && web)
    body = <web.View view={game.data.view} receivedAt={game.at} room={room} meId={room.meId} players={room.players} sendAction={sendAction} />;
  else body = <p className="dim">준비 중…</p>;

  return (
    <main className={`page ${s.layout}`}>
      <header className={s.top}>
        <span className="badge">방 {room.code}</span>
        {m && (
          <ol className={s.progress} aria-label="게임 진행">
            {m.playlist.map((g, i) => (
              <li key={i} className={i < m.index || room.phase === 'final' ? s.done : i === m.index ? s.now : ''}>
                {g.name}
              </li>
            ))}
          </ol>
        )}
      </header>
      <div className={s.cols}>
        <section className={s.stage}>{body}</section>
        <aside className={s.side}>
          {room.phase !== 'final' && (
            <div className={`card ${s.scoreCard}`}>
              <div className="card-title">방 점수</div>
              <Scoreboard room={room} />
            </div>
          )}
          <div className={s.chat}>
            <ChatPanel messages={chat} players={room.players} meId={room.meId} onSend={sendChat} emphasize={!!web?.chatIsInput} hint={web?.chatHint} />
          </div>
        </aside>
      </div>
    </main>
  );
}
