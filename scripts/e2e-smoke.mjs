/**
 * 스모크 테스트: 브라우저 3개(방장 + 2명)가 방을 만들고 들어가서,
 * 방 규칙을 바꾸고, 눈치게임 → 포브스 한 매치를 끝까지 진행한 뒤 관리자 통계를 확인한다.
 *
 * 사용법: 서버를 먼저 띄운 뒤 (npm run build && PORT=3999 npm start)
 *   BASE_URL=http://localhost:3999 npm run e2e
 * 화면 캡처는 e2e-artifacts/ 에 저장된다.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3999';
const OUT = 'e2e-artifacts';
mkdirSync(OUT, { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => existsSync(p));

const browser = await chromium.launch({ executablePath: exe });
const log = (...a) => console.log('[e2e]', ...a);
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const errors = [];

async function newPlayer(viewport = { width: 1280, height: 860 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL|fonts\.g/.test(m.text()) && errors.push(m.text()));
  return page;
}

const host = await newPlayer();
const p2 = await newPlayer({ width: 390, height: 844 }); // 모바일 화면
const p3 = await newPlayer();

// 1) 방장: 닉네임 + 방 만들기
await host.goto(BASE);
await host.getByPlaceholder('1~10자').fill('방장');
await shot(host, '01-home');
await host.getByRole('button', { name: /방 만들기/ }).click();
const code = (await host.getByTestId('room-code').textContent()).trim();
log('방 코드', code);

// 2) 방장: 방 규칙 바꾸기 — 목록 순서, 눈치게임 1라운드, 포브스 질문 1개·매운맛 투표 끔
await host.getByRole('button', { name: '목록 순서' }).click();
for (let i = 0; i < 2; i++) await host.getByRole('button', { name: '게임 안 라운드 수 줄이기' }).click();
for (let i = 0; i < 6; i++) await host.getByRole('button', { name: '질문 수 줄이기' }).click();
await host.getByRole('button', { name: '끄기' }).click();

// 3) 두 명 입장 (초대 링크) + 준비
for (const [page, name] of [
  [p2, '둘째'],
  [p3, '셋째'],
]) {
  await page.goto(`${BASE}/?room=${code}`);
  await page.getByPlaceholder('1~10자').fill(name);
  await page.getByRole('button', { name: '입장' }).click();
  await page.getByTestId('ready').click();
}
await host.getByText('셋째').first().waitFor();
await host.waitForTimeout(300);
await shot(host, '02-lobby-host');
await shot(p2, '03-lobby-mobile');

// 4) 시작 → 전광판
await host.getByTestId('start').click();
await host.getByText('NEXT GAME', { exact: false }).waitFor();
await shot(host, '04-intro-marquee');

// 5) 눈치게임: 카운트다운 후 방장 1, 둘째 2 → 셋째 마지막까지 못 침
await host.getByText('다음 숫자').waitFor({ timeout: 10_000 });
await host.waitForTimeout(3300);
const chatInput = (page) => page.getByPlaceholder('숫자 입력 (1~8)');
await chatInput(host).fill('1');
await chatInput(host).press('Enter');
await host.waitForTimeout(400);
await chatInput(p2).fill('2');
await chatInput(p2).press('Enter');
await host.waitForTimeout(600);
await shot(host, '05-nunchi-result');
await shot(p2, '06-nunchi-mobile');

// 6) 게임 결과 → 전광판 → 포브스
await host.getByText('게임 결과').waitFor({ timeout: 10_000 });
await shot(host, '07-game-result');
await p3.getByText('질문 1 / 1').waitFor({ timeout: 20_000 });
await shot(p3, '08-forbes-question');
const vote = async (page, target) => page.getByRole('button', { name: new RegExp(target) }).click();
await vote(host, '둘째');
await vote(p2, '셋째');
await vote(p3, '둘째');
await host.getByText('포브스 선정', { exact: false }).first().waitFor();
await shot(host, '09-forbes-reveal');

// 7) 최종 순위
await host.getByText('최종 순위').waitFor({ timeout: 30_000 });
await shot(host, '10-final');
await shot(p2, '11-final-mobile');

// 8) 한 판 더 → 로비
await host.getByTestId('again').click();
await host.getByTestId('room-code').waitFor();

// 9) 관리자 통계
const admin = await newPlayer();
await admin.goto(`${BASE}/admin`);
await admin.getByText('몇 명으로 많이 플레이했나').waitFor();
await admin.waitForTimeout(300);
await shot(admin, '12-admin');
const stats = await (await fetch(`${BASE}/api/admin/stats`)).json();
log('통계', JSON.stringify(stats.totals), JSON.stringify(stats.matchesByPlayerCount));

await browser.close();
if (errors.length) {
  console.error('[e2e] 브라우저 오류', errors);
  process.exit(1);
}
const ok = stats.totals.matchesCompleted >= 1 && stats.totals.playAgain >= 1 && stats.matchesByPlayerCount.some((r) => r.key === '3');
if (!ok) {
  console.error('[e2e] 통계가 기대와 달라요');
  process.exit(1);
}
log('통과');
