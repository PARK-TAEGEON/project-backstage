/**
 * 가벼운 커스터마이징용 아바타. 지금은 2D 얼굴 카드지만,
 * 추후 움직이는 아바타(inputs: 'avatar')로 확장할 때도 같은 AvatarConfig를 기반으로 늘린다.
 * 새 파츠를 추가할 때는 옵션 배열에만 항목을 더하면 되고, 기존 저장값은 그대로 유효하다.
 */

export interface AvatarConfig {
  /** 몸 색 */
  color: string;
  /** 표정 */
  face: string;
  /** 머리 장식 */
  hat: string;
}

export const AVATAR_COLORS = [
  { id: 'coral', label: '코랄', hex: '#FF7A6B' },
  { id: 'mango', label: '망고', hex: '#FFB547' },
  { id: 'lime', label: '라임', hex: '#8BD65C' },
  { id: 'mint', label: '민트', hex: '#4FD1B5' },
  { id: 'sky', label: '하늘', hex: '#5AB4FF' },
  { id: 'grape', label: '포도', hex: '#9B7BFF' },
  { id: 'pink', label: '핑크', hex: '#FF7EC0' },
  { id: 'stone', label: '회색', hex: '#A3A9B5' },
] as const;

export const AVATAR_FACES = [
  { id: 'smile', label: '웃음' },
  { id: 'grin', label: '히죽' },
  { id: 'cool', label: '선글라스' },
  { id: 'sleepy', label: '졸림' },
  { id: 'wow', label: '놀람' },
  { id: 'smug', label: '뿌듯' },
] as const;

export const AVATAR_HATS = [
  { id: 'none', label: '없음' },
  { id: 'cap', label: '모자' },
  { id: 'crown', label: '왕관' },
  { id: 'bow', label: '리본' },
  { id: 'sprout', label: '새싹' },
  { id: 'party', label: '고깔' },
] as const;

export const DEFAULT_AVATAR: AvatarConfig = { color: 'sky', face: 'smile', hat: 'none' };

export function sanitizeAvatar(input: unknown): AvatarConfig {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const pick = <T extends { id: string }>(list: readonly T[], v: unknown, fallback: string) =>
    typeof v === 'string' && list.some((o) => o.id === v) ? v : fallback;
  return {
    color: pick(AVATAR_COLORS, src.color, DEFAULT_AVATAR.color),
    face: pick(AVATAR_FACES, src.face, DEFAULT_AVATAR.face),
    hat: pick(AVATAR_HATS, src.hat, DEFAULT_AVATAR.hat),
  };
}

export function randomAvatar(rand: () => number = Math.random): AvatarConfig {
  const r = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!;
  return { color: r(AVATAR_COLORS).id, face: r(AVATAR_FACES).id, hat: r(AVATAR_HATS).id };
}

export const NICKNAME_MAX = 10;

/** 닉네임: 앞뒤 공백 제거, NFC, 1~10자. 실패하면 null. */
export function sanitizeNickname(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (s.length < 1 || [...s].length > NICKNAME_MAX) return null;
  return s;
}
