import { useState } from 'react';
import type { Profile, RoomView } from '@backstage/shared';
import { T } from '../content/ko';
import { savedProfile } from '../net/socket';
import { useRoom } from '../state/RoomProvider';
import { AvatarEditor } from '../ui/AvatarEditor';
import { ChatPanel } from '../ui/ChatPanel';
import { PlayerList } from '../ui/PlayerList';
import { SettingsPanel } from '../ui/SettingsPanel';
import s from './Lobby.module.css';

export function Lobby({ room }: { room: RoomView }) {
  const { chat, sendChat, setReady, start, leave, updateSettings, updateProfile, toast } = useRoom();
  const me = room.players.find((p) => p.id === room.meId);
  const isHost = !!me?.isHost;
  const [editing, setEditing] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);

  const copyLink = async () => {
    const url = `${location.origin}/?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(T.lobby.copied);
    } catch {
      toast(url);
    }
  };

  const onStart = async () => {
    setBusy(true);
    const err = await start();
    setBusy(false);
    if (err) toast(err);
  };

  const saveProfile = async () => {
    if (!editing) return;
    const err = await updateProfile(editing);
    if (err) return toast(err);
    savedProfile.set(editing);
    setEditing(null);
  };

  return (
    <main className={`page ${s.layout}`}>
      <header className={s.header}>
        <div>
          <span className="label">{T.lobby.code}</span>
          <div className={`${s.code} display`} data-testid="room-code">
            {room.code}
          </div>
        </div>
        <div className="row">
          <button className="btn btn-sm" onClick={copyLink}>
            🔗 {T.lobby.copyLink}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={leave}>
            {T.lobby.leave}
          </button>
        </div>
      </header>

      <div className={s.cols}>
        <div className="stack">
          <section className="card">
            <div className="row" style={{ marginBottom: 'var(--sp-3)' }}>
              <span className="card-title" style={{ margin: 0 }}>
                {T.lobby.players} {room.players.length} / {room.settings.maxPlayers}
              </span>
              <span className="spacer" />
              {me && !editing && (
                <button className="btn btn-sm btn-ghost" onClick={() => setEditing({ nickname: me.nickname, avatar: me.avatar })}>
                  {T.lobby.editProfile}
                </button>
              )}
            </div>
            {editing ? (
              <div className="stack">
                <input className="input" value={editing.nickname} maxLength={10} onChange={(e) => setEditing({ ...editing, nickname: e.target.value })} aria-label="닉네임" />
                <AvatarEditor value={editing.avatar} onChange={(avatar) => setEditing({ ...editing, avatar })} />
                <div className="row">
                  <button className="btn btn-primary btn-sm" onClick={saveProfile}>
                    {T.lobby.save}
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>
                    {T.lobby.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <PlayerList players={room.players} meId={room.meId} showReady />
            )}
          </section>

          <details className={`card ${s.rules}`} open={isHost || undefined}>
            <summary className="card-title">
              {T.settings.title}
              {!isHost && <span className="faint"> · 방 라운드 {room.settings.gameRounds} · 게임 {room.settings.enabledGameIds.length}개</span>}
            </summary>
            <SettingsPanel
              settings={room.settings}
              catalog={room.catalog}
              editable={isHost}
              playerCount={room.players.length}
              onChange={async (patch) => {
                const err = await updateSettings(patch);
                if (err) toast(err);
              }}
            />
          </details>
        </div>

        <div className={s.chat}>
          <ChatPanel messages={chat} players={room.players} meId={room.meId} onSend={sendChat} />
        </div>
      </div>

      <footer className={s.actionBar}>
        {isHost ? (
          <>
            {room.startBlockers.length > 0 && <span className={s.blocker}>{room.startBlockers[0]}</span>}
            <button className="btn btn-marquee" disabled={busy || room.startBlockers.length > 0} onClick={onStart} data-testid="start">
              ▶ {T.lobby.start}
            </button>
          </>
        ) : (
          <>
            <span className={s.blocker}>{T.lobby.waitingHost}</span>
            <button className={`btn ${me?.ready ? '' : 'btn-primary'}`} onClick={() => setReady(!me?.ready)} data-testid="ready">
              {me?.ready ? `✅ ${T.lobby.ready}` : T.lobby.notReady}
            </button>
          </>
        )}
      </footer>
    </main>
  );
}
