/**
 * 브라우저 스모크 테스트용 시간 단축. 평소에는 아무 영향이 없다.
 * BACKSTAGE_TEST_ROUND_MS=15000 처럼 주면 단어 말하기·금지어의 라운드 시간만 그 값으로 줄인다.
 */
const raw = typeof process !== 'undefined' ? Number(process.env.BACKSTAGE_TEST_ROUND_MS) : NaN;

export function testRoundMs(normal: number): number {
  return Number.isFinite(raw) && raw > 0 ? raw : normal;
}
