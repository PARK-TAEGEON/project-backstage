/**
 * 포브스 질문 목록 — docs/context/catalog/games/WHO.md 초안.
 * 포괄성 기준: 성별·나이·직업·연애 여부·음주 여부·가족 구성에 따라 소외되는 질문은 넣지 않는다.
 * kind는 점수 계산용(화면에 표시하지 않음): bad 당선 +1, good 당선 −1.
 */
export interface ForbesQuestion {
  id: string;
  /** 질문 (예: "IQ가 두 자리일 것 같은 사람은?") */
  text: string;
  /** 발표용 타이틀 (예: "IQ가 두 자리일 것 같은 사람") */
  title: string;
  kind: 'good' | 'bad';
  spicy?: boolean;
}

const q = (id: string, title: string, kind: 'good' | 'bad', spicy = false): ForbesQuestion => ({
  id,
  text: `${title}은?`,
  title,
  kind,
  spicy,
});

export const FORBES_DECK_VERSION = '2026-09-29';

export const FORBES_QUESTIONS: ForbesQuestion[] = [
  q('g-rich', '제일 먼저 부자 될 것 같은 사람', 'good'),
  q('g-zombie-survive', '좀비 사태에서 끝까지 살아남을 것 같은 사람', 'good'),
  q('g-secret', '비밀을 제일 잘 지킬 것 같은 사람', 'good'),
  q('g-leader', '무인도에 떨어지면 리더가 될 것 같은 사람', 'good'),
  q('g-kind', '몰래 선행하고 다닐 것 같은 사람', 'good'),
  q('g-karaoke', '노래방 점수 제일 높을 것 같은 사람', 'good'),
  q('g-calm', '위기 상황에서 제일 침착할 것 같은 사람', 'good'),
  q('g-quiz', '퀴즈쇼에 나가면 우승할 것 같은 사람', 'good'),
  q('g-famous', '제일 먼저 유명해질 것 같은 사람', 'good'),
  q('b-iq', 'IQ가 두 자리일 것 같은 사람', 'bad'),
  q('b-late', '약속에 제일 늦을 것 같은 사람', 'bad'),
  q('b-read', '단톡방 읽씹 1위일 것 같은 사람', 'bad'),
  q('b-zombie-first', '좀비 사태 때 제일 먼저 감염될 것 같은 사람', 'bad'),
  q('b-plan', '계획만 세우고 절대 안 할 것 같은 사람', 'bad'),
  q('b-selfie', '셀카 100장 찍고 1장 올릴 것 같은 사람', 'bad'),
  q('b-lost', '길 잃고도 아는 척할 것 같은 사람', 'bad'),
  q('b-alarm', '알람 10개 맞추고 다 끌 것 같은 사람', 'bad'),
  q('b-box', '택배 박스 한 달 방치할 것 같은 사람', 'bad'),
  q('b-umbrella', '우산을 제일 많이 잃어버렸을 것 같은 사람', 'bad'),
  q('s-search', '검색 기록 절대 못 보여줄 것 같은 사람', 'bad', true),
  q('s-photo', '흑역사 사진 제일 많을 것 같은 사람', 'bad', true),
  q('s-alone', '혼자 있을 때 제일 이상할 것 같은 사람', 'bad', true),
];
