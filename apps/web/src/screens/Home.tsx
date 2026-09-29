import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_AVATAR, defaultRoomSettings, randomAvatar, sanitizeNickname, type GameMeta, type Profile, type RoomSettings } from '@backstage/shared';
import { BRAND } from '../config/brand';
import { T } from '../content/ko';
import { savedProfile } from '../net/socket';
import { useRoom } from '../state/RoomProvider';
import { AvatarEditor } from '../ui/AvatarEditor';
import { SettingsPanel } from '../ui/SettingsPanel';
import s from './Home.module.css';

export function Home() {
  const { create, join, connected, resuming, toast } = useRoom();
  const [profile, setProfile] = useState<Profile>(() => savedProfile.get() ?? { nickname: '', avatar: randomAvatar() });
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<GameMeta[]>([]);
  const [settings, setSettings] = useState<RoomSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetch('/api/catalog')
      .then((r) => r.json())
      .then((c: GameMeta[]) => {
        setCatalog(c);
        setSettings(defaultRoomSettings(c));
      })
      .catch(() => {});
  }, []);

  const nickOk = !!sanitizeNickname(profile.nickname);
  const invited = code.length === 4;

  const run = async (fn: () => Promise<string | null>) => {
    if (!nickOk) return toast('닉네임을 먼저 정해 주세요.');
    savedProfile.set(profile);
    setBusy(true);
    const err = await fn();
    setBusy(false);
    if (err) toast(err);
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    run(() => join(code, profile));
  };

  return (
    <main className="page">
      <header className={s.hero}>
        <div className={s.logo} aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <h1 className={`${s.brand} display`}>{BRAND.name}</h1>
        <p className="dim">{BRAND.tagline}</p>
        <p className={`pixel blink ${s.press}`} aria-hidden>
          ▶ PRESS START
        </p>
        {resuming && <p className="faint">{T.home.reconnecting}</p>}
        {!connected && <p className="faint">서버에 연결하는 중…</p>}
      </header>

      <div className={s.grid}>
        <section className="card stack">
          <label className="stack" style={{ gap: 6 }}>
            <span className="label">{T.home.nickname}</span>
            <input
              className="input"
              value={profile.nickname}
              maxLength={10}
              placeholder={T.home.nicknamePlaceholder}
              onChange={(e) => setProfile({ ...profile, nickname: e.target.value })}
              autoComplete="nickname"
            />
          </label>
          <span className="label">{T.home.avatar}</span>
          <AvatarEditor value={profile.avatar ?? DEFAULT_AVATAR} onChange={(avatar) => setProfile({ ...profile, avatar })} />
        </section>

        <section className="stack">
          <form className="card stack" onSubmit={onJoin}>
            <span className="card-title">{T.home.orJoin}</span>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                className={`input ${s.code}`}
                value={code}
                maxLength={4}
                placeholder={T.home.codePlaceholder}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                aria-label={T.home.codePlaceholder}
                autoCapitalize="characters"
              />
              <button className={`btn ${invited ? 'btn-primary' : ''}`} type="submit" disabled={busy || !connected || code.length !== 4}>
                {T.home.join}
              </button>
            </div>
          </form>

          <div className="card stack">
            <button className={`btn btn-block ${invited ? '' : 'btn-marquee'}`} disabled={busy || !connected} onClick={() => run(() => create(profile, settings ?? undefined))}>
              🎬 {T.home.create}
            </button>
            {settings && (
              <>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}>
                  {showSettings ? '방 규칙 접기' : '⚙️ 방 규칙 미리 정하기'}
                </button>
                {showSettings && <SettingsPanel settings={settings} catalog={catalog} editable playerCount={1} onChange={(p) => setSettings({ ...settings, ...p })} />}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
