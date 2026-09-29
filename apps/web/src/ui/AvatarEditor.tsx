import { AVATAR_COLORS, AVATAR_FACES, AVATAR_HATS, randomAvatar, type AvatarConfig } from '@backstage/shared';
import { Avatar } from './Avatar';
import { T } from '../content/ko';
import s from './AvatarEditor.module.css';

/** 가벼운 커스터마이징: 색·표정·머리 장식 */
export function AvatarEditor({ value, onChange }: { value: AvatarConfig; onChange: (v: AvatarConfig) => void }) {
  return (
    <div className={s.wrap}>
      <div className={s.preview}>
        <Avatar avatar={value} size={112} />
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(randomAvatar())}>
          🎲 {T.home.randomize}
        </button>
      </div>
      <div className={s.pickers}>
        <div className={s.swatches} role="group" aria-label="색">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={s.swatch}
              style={{ background: c.hex }}
              aria-label={c.label}
              aria-pressed={value.color === c.id}
              onClick={() => onChange({ ...value, color: c.id })}
            />
          ))}
        </div>
        <div className="row" role="group" aria-label="표정">
          {AVATAR_FACES.map((f) => (
            <button key={f.id} type="button" className="chip" aria-pressed={value.face === f.id} onClick={() => onChange({ ...value, face: f.id })}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="row" role="group" aria-label="머리 장식">
          {AVATAR_HATS.map((h) => (
            <button key={h.id} type="button" className="chip" aria-pressed={value.hat === h.id} onClick={() => onChange({ ...value, hat: h.id })}>
              {h.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
