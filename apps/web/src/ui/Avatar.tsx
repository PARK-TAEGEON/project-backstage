/**
 * 아바타 그림. 지금은 얼굴 카드(SVG)지만, 움직이는 아바타를 도입할 때도
 * AvatarConfig를 받아 그리는 이 컴포넌트만 바꾸면 모든 화면에 반영된다.
 */
import { AVATAR_COLORS, type AvatarConfig } from '@backstage/shared';

const INK = '#1b1626';

function Face({ face }: { face: string }) {
  switch (face) {
    case 'grin':
      return (
        <g>
          <path d="M34 44 q4 -4 8 0" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M58 44 q4 -4 8 0" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M36 58 q14 14 28 0 z" fill={INK} />
        </g>
      );
    case 'cool':
      return (
        <g>
          <rect x="28" y="38" width="20" height="11" rx="4" fill={INK} />
          <rect x="52" y="38" width="20" height="11" rx="4" fill={INK} />
          <rect x="46" y="41" width="8" height="3" fill={INK} />
          <path d="M42 62 q8 5 16 0" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'sleepy':
      return (
        <g>
          <path d="M32 45 h12" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M56 45 h12" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          <ellipse cx="50" cy="62" rx="5" ry="4" fill={INK} />
          <text x="70" y="30" fontSize="12" fontWeight="900" fill={INK}>z</text>
        </g>
      );
    case 'wow':
      return (
        <g>
          <circle cx="38" cy="44" r="5" fill={INK} />
          <circle cx="62" cy="44" r="5" fill={INK} />
          <ellipse cx="50" cy="62" rx="6" ry="8" fill={INK} />
        </g>
      );
    case 'smug':
      return (
        <g>
          <path d="M32 46 q6 -3 12 0" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M56 46 q6 -3 12 0" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <path d="M42 60 q10 6 18 -3" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'smile':
    default:
      return (
        <g>
          <circle cx="38" cy="44" r="4.5" fill={INK} />
          <circle cx="62" cy="44" r="4.5" fill={INK} />
          <path d="M38 58 q12 10 24 0" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </g>
      );
  }
}

function Hat({ hat }: { hat: string }) {
  switch (hat) {
    case 'cap':
      return (
        <g>
          <path d="M22 26 q28 -26 56 0 v4 h-56 z" fill="#2E6BFF" />
          <rect x="50" y="26" width="34" height="6" rx="3" fill="#2253C9" />
        </g>
      );
    case 'crown':
      return <path d="M28 26 l6 -18 l10 12 l6 -14 l6 14 l10 -12 l6 18 z" fill="#FFCE3D" stroke="#C99400" strokeWidth="2" />;
    case 'bow':
      return (
        <g>
          <path d="M50 16 l-18 -10 v20 z" fill="#FF4F8B" />
          <path d="M50 16 l18 -10 v20 z" fill="#FF4F8B" />
          <circle cx="50" cy="16" r="5" fill="#E0306E" />
        </g>
      );
    case 'sprout':
      return (
        <g>
          <path d="M50 18 v-10" stroke="#2F9E44" strokeWidth="3" strokeLinecap="round" />
          <path d="M50 10 q-12 -8 -16 2 q10 4 16 -2" fill="#51CF66" />
          <path d="M50 8 q12 -8 16 2 q-10 4 -16 -2" fill="#51CF66" />
        </g>
      );
    case 'party':
      return (
        <g>
          <path d="M36 20 l14 -20 l14 20 z" fill="#9B7BFF" />
          <circle cx="50" cy="0" r="4" fill="#FFCE3D" />
          <path d="M42 12 h16" stroke="#FFCE3D" strokeWidth="3" />
        </g>
      );
    default:
      return null;
  }
}

export function Avatar({ avatar, size = 56, dimmed = false, label }: { avatar: AvatarConfig; size?: number; dimmed?: boolean; label?: string }) {
  const hex = AVATAR_COLORS.find((c) => c.id === avatar.color)?.hex ?? '#5AB4FF';
  return (
    <svg
      viewBox="0 -8 100 104"
      width={size}
      height={size}
      role="img"
      aria-label={label ?? '아바타'}
      style={{ opacity: dimmed ? 0.4 : 1, filter: dimmed ? 'grayscale(0.8)' : undefined, flexShrink: 0 }}
    >
      <rect x="14" y="18" width="72" height="72" rx="30" fill={hex} />
      <ellipse cx="32" cy="52" rx="6" ry="4" fill="#fff" opacity="0.25" />
      <Face face={avatar.face} />
      <Hat hat={avatar.hat} />
    </svg>
  );
}
