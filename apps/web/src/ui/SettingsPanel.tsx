/**
 * 방 규칙 설정 — 방 만들기 화면과 대기실에서 같이 쓴다.
 * 게임별 설정 칸은 게임 meta.settings 정의를 보고 자동으로 그린다 (새 게임을 넣으면 설정 UI도 따라옴).
 */
import {
  GAME_ROUNDS_MAX,
  GAME_ROUNDS_MIN,
  ROOM_MAX_PLAYERS,
  ROOM_MIN_PLAYERS,
  isRobloxCandidate,
  type GameMeta,
  type GameSettingDef,
  type GameSettingValue,
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

function SettingInput({ def, value, onChange, disabled }: { def: GameSettingDef; value: GameSettingValue | undefined; onChange: (v: GameSettingValue) => void; disabled: boolean }) {
  if (def.type === 'int') {
    return <Stepper label={def.label} value={Number(value ?? def.default)} min={def.min} max={def.max} onChange={onChange} disabled={disabled} />;
  }
  if (def.type === 'bool') {
    const v = Boolean(value ?? def.default);
    return (
      <div className="row">
        <button type="button" className="chip" aria-pressed={v} disabled={disabled} onClick={() => onChange(true)}>
          켜기
        </button>
        <button type="button" className="chip" aria-pressed={!v} disabled={disabled} onClick={() => onChange(false)}>
          끄기
        </button>
      </div>
    );
  }
  return (
    <div className="row">
      {def.options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={(value ?? def.default) === o.value} disabled={disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
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
      {isRobloxCandidate(meta) && <span className="badge">Roblox 후보</span>}
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
  const setOpt = (gameId: string, key: string, v: GameSettingValue) =>
    onChange({ gameOptions: { ...settings.gameOptions, [gameId]: { ...settings.gameOptions[gameId], [key]: v } } });

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
                {on && g.settings.length > 0 && (
                  <div className={s.opts}>
                    {g.settings.map((def) => (
                      <div key={def.key} className={s.opt}>
                        <span className="label">{def.label}</span>
                        <SettingInput def={def} value={settings.gameOptions[g.id]?.[def.key]} disabled={dis} onChange={(v) => setOpt(g.id, def.key, v)} />
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
