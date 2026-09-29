/**
 * 방 규칙 설정 — 방 만들기 화면과 대기실에서 같이 쓴다.
 * 게임 내부 규칙(라운드 수 등)은 방에서 바꿀 수 없다 (DEC-15). Roblox 후보 같은 내부 참고 정보는 관리자 화면에만 둔다.
 */
import {
  GAME_ROUNDS_MAX,
  GAME_ROUNDS_MIN,
  ROOM_MAX_PLAYERS,
  ROOM_MIN_PLAYERS,
  type GameMeta,
  type RoomSettings,
} from '@backstage/shared';
import { T } from '../content/ko';
import s from './SettingsPanel.module.css';

function Stepper({ value, min, max, onChange, disabled, label }: { value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  return (
    <div className={s.stepper} role="group" aria-label={label}>
      <button type="button" className="btn btn-sm" disabled={disabled || value <= min} onClick={() => onChange(value - 1)} aria-label={`${label} 줄이기`}>
        −
      </button>
      <span className={s.stepValue} aria-live="polite">
        {value}
      </span>
      <button type="button" className="btn btn-sm" disabled={disabled || value >= max} onClick={() => onChange(value + 1)} aria-label={`${label} 늘리기`}>
        +
      </button>
    </div>
  );
}

export function GameBadges({ meta }: { meta: GameMeta }) {
  return (
    <span className="row">
      <span className={`badge ${meta.ai === 'none' ? 'badge-good' : ''}`}>{meta.ai === 'none' ? T.settings.noAi : `${T.settings.ai} · ${meta.ai}`}</span>
      <span className="badge">
        {meta.minPlayers}~{meta.maxPlayers}
        {T.settings.players}
      </span>
    </span>
  );
}

export function SettingsPanel({
  settings,
  catalog,
  editable,
  playerCount,
  onChange,
}: {
  settings: RoomSettings;
  catalog: GameMeta[];
  editable: boolean;
  playerCount: number;
  onChange: (patch: Partial<RoomSettings>) => void;
}) {
  const dis = !editable;
  const toggleGame = (id: string) => {
    const on = settings.enabledGameIds.includes(id);
    const next = on ? settings.enabledGameIds.filter((x) => x !== id) : [...settings.enabledGameIds, id];
    if (next.length) onChange({ enabledGameIds: next });
  };

  return (
    <div className={s.panel}>
      {!editable && <p className="faint">{T.settings.onlyHost}</p>}

      <div className={s.field}>
        <span className="label">{T.settings.maxPlayers}</span>
        <div className="row">
          {Array.from({ length: ROOM_MAX_PLAYERS - ROOM_MIN_PLAYERS + 1 }, (_, i) => i + ROOM_MIN_PLAYERS).map((n) => (
            <button key={n} type="button" className="chip" aria-pressed={settings.maxPlayers === n} disabled={dis || n < playerCount} onClick={() => onChange({ maxPlayers: n })}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className={s.field}>
        <span className="label">{T.settings.gameRounds}</span>
        <Stepper label={T.settings.gameRounds} value={settings.gameRounds} min={GAME_ROUNDS_MIN} max={GAME_ROUNDS_MAX} disabled={dis} onChange={(v) => onChange({ gameRounds: v })} />
        <span className="faint" style={{ fontSize: 'var(--fs-xs)' }}>
          {T.settings.gameRoundsHelp}
        </span>
      </div>

      <div className={s.field}>
        <span className="label">{T.settings.order}</span>
        <div className="row">
          <button type="button" className="chip" aria-pressed={settings.order === 'random'} disabled={dis} onClick={() => onChange({ order: 'random' })}>
            {T.settings.orderRandom}
          </button>
          <button type="button" className="chip" aria-pressed={settings.order === 'listed'} disabled={dis} onClick={() => onChange({ order: 'listed' })}>
            {T.settings.orderListed}
          </button>
        </div>
      </div>

      <div className={s.field}>
        <span className="label">{T.settings.games}</span>
        <ul className={s.games}>
          {catalog.map((g) => {
            const on = settings.enabledGameIds.includes(g.id);
            return (
              <li key={g.id} className={`${s.game} ${on ? s.gameOn : ''}`}>
                <label className={s.gameHead}>
                  <input type="checkbox" checked={on} disabled={dis} onChange={() => toggleGame(g.id)} />
                  <span className={s.gameName}>{g.name}</span>
                  <GameBadges meta={g} />
                </label>
                <p className="faint" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
                  {g.tagline}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
