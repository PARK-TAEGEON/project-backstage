/**
 * 쿵쿵따용 한글 도구 — 정규화와 두음법칙 표 (KKT 스펙 K-1, “두음법칙 표”).
 * 두음법칙 표 버전을 바꾸면 KKT_DUEUM_VERSION도 올린다.
 */

export const KKT_DUEUM_VERSION = 'dueum-1 (한글 맞춤법 제10~12항)';

const BASE = 0xac00;
const JUNG = 21;
const JONG = 28;
// 초성 인덱스: ㄴ=2, ㄹ=5, ㅇ=11
const CHO_N = 2;
const CHO_R = 5;
const CHO_O = 11;
// 중성 인덱스
const V = { a: 0, ae: 1, ya: 2, yae: 3, eo: 4, e: 5, yeo: 6, ye: 7, o: 8, oe: 11, yo: 12, u: 13, yu: 17, eu: 18, i: 20 } as const;

/** ㄴ → ㅇ (제10항: 녀·뇨·뉴·니) */
const N_TO_O: number[] = [V.yeo, V.yo, V.yu, V.i];
/** ㄹ → ㅇ (제11항: 랴·려·례·료·류·리) */
const R_TO_O: number[] = [V.ya, V.yeo, V.ye, V.yo, V.yu, V.i];
/** ㄹ → ㄴ (제12항: 라·래·로·뢰·루·르) */
const R_TO_N: number[] = [V.a, V.ae, V.o, V.oe, V.u, V.eu];

function isSyllable(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return ch.length === 1 && c >= BASE && c <= 0xd7a3;
}

function compose(cho: number, jung: number, jong: number): string {
  return String.fromCharCode(BASE + (cho * JUNG + jung) * JONG + jong);
}

/** 한 음절의 두음법칙 형태. 해당 없으면 null. 예: 력→역, 녀→여, 라→나, 락→낙 */
export function dueum(syl: string): string | null {
  if (!isSyllable(syl)) return null;
  const idx = syl.charCodeAt(0) - BASE;
  const cho = Math.floor(idx / (JUNG * JONG));
  const jung = Math.floor((idx % (JUNG * JONG)) / JONG);
  const jong = idx % JONG;
  if (cho === CHO_N && N_TO_O.includes(jung)) return compose(CHO_O, jung, jong);
  if (cho === CHO_R && R_TO_O.includes(jung)) return compose(CHO_O, jung, jong);
  if (cho === CHO_R && R_TO_N.includes(jung)) return compose(CHO_N, jung, jong);
  return null;
}

/**
 * 앞 단어의 끝 음절로 시작할 수 있는 음절들. 방향은 한쪽만: 력 → [력, 역]. 역 → [역] (역방향 없음).
 */
export function allowedStarts(lastSyl: string): string[] {
  const d = dueum(lastSyl);
  return d ? [lastSyl, d] : [lastSyl];
}

/** 제출 단어 정규화: NFC, 공백 제거. 한글 외 글자는 그대로 둬서 “세 글자 아님”으로 걸리게 한다. */
export function normalizeSubmission(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, '');
}

export function isThreeSyllables(word: string): boolean {
  return [...word].length === 3 && [...word].every(isSyllable);
}
