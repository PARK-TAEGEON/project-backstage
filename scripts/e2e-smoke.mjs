/**
 * 스모크 테스트: 브라우저 4개(방장 + 3명)가 방을 만들고(팝업에서 방 규칙 설정) 들어가서,
 * 눈치게임(3라운드) → 포브스(7문항) → 쿵쿵따(3라운드) 한 매치를 끝까지 진행한 뒤 관리자 통계를 확인한다.
 *
 * 사용법: 서버를 먼저 띄운 뒤 (npm run build && PORT=3999 npm start)
 *   BASE_URL=http://localhost:3999 npm run e2e
 * 화면 캡처는 e2e-artifacts/ 에 저장된다.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

// 쿵쿵따용: 서버와 같은 사전에서 정답 단어를 고른다
const DICT = gunzipSync(readFileSync('apps/server/dict/stdict-3syl.tsv.gz'))
  .toString('utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => l.split('\t')[0]);

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
const p4 = await newPlayer();
const players = [host, p2, p3, p4];

// 1) 방장: 닉네임 → 방 만들기 → 팝업에서 방 규칙(목록 순서) → 만들기
await host.goto(BASE);
await host.getByPlaceholder('1~10자').fill('방장');
await shot(host, '01-home');
await host.getByRole('button', { name: /방 만들기/ }).first().click();
await host.getByRole('dialog').waitFor();
await host.getByRole('dialog').getByRole('button', { name: '목록 순서' }).click();
await shot(host, '02-create-modal');
await host.getByTestId('create-confirm').click();
const code = (await host.getByTestId('room-code').textContent()).trim();
log('방 코드', code);

// 2) 세 명 입장 (초대 링크) + 준비
for (const [page, name] of [
  [p2, '둘째'],
  [p3, '셋째'],
  [p4, '넷째'],
]) {
  await page.goto(`${BASE}/?room=${code}`);
  await page.getByPlaceholder('1~10자').fill(name);
  await page.getByRole('button', { name: '입장' }).click();
  await page.getByTestId('ready').click();
}
await host.getByText('넷째').first().waitFor();
await host.waitForTimeout(300);
await shot(host, '03-lobby-host');
await shot(p2, '04-lobby-mobile');

// 3) 시작 → 전광판
await host.getByTestId('start').click();
await host.getByText('NEXT GAME', { exact: false }).waitFor();
await shot(host, '05-intro-marquee');

// 4) 눈치게임 3라운드: 매번 방장 1, 둘째 2, 셋째 3 → 넷째 마지막까지 못 침 (탈락 1명)
const chatInput = (page) => page.getByPlaceholder('숫자 입력 (1~8)');
const typeNum = async (page, n) => {
  await chatInput(page).fill(String(n));
  await chatInput(page).press('Enter');
};
for (let r = 1; r <= 3; r++) {
  await host.getByText(`라운드 ${r} / 3`).waitFor({ timeout: 15_000 });
  await host.waitForTimeout(3300);
  await typeNum(host, 1);
  await host.waitForTimeout(300);
  await typeNum(p2, 2);
  await host.waitForTimeout(300);
  await typeNum(p3, 3);
  await host.waitForTimeout(500);
  if (r === 1) {
    await shot(host, '06-nunchi-result');
    await shot(p2, '07-nunchi-mobile');
  }
}

// 5) 게임 결과 → 전광판 → 포브스 (매운맛 투표 → 7문항)
await host.getByText('게임 결과').waitFor({ timeout: 15_000 });
await shot(host, '08-game-result');
await host.getByText('매운맛 질문 허용?').waitFor({ timeout: 20_000 });
for (const page of players) await page.getByRole('button', { name: /순한맛/ }).click();
const targets = { 0: '둘째', 1: '셋째', 2: '둘째', 3: '둘째' };
for (let q = 1; q <= 7; q++) {
  await host.getByText(`질문 ${q} / 7`).waitFor({ timeout: 20_000 });
  if (q === 1) await shot(p3, '09-forbes-question');
  for (let i = 0; i < players.length; i++) await players[i].getByRole('button', { name: new RegExp(targets[i]) }).click();
  await host.getByText('포브스 선정', { exact: false }).first().waitFor();
  if (q === 1) await shot(host, '10-forbes-reveal');
}

// 6) 쿵쿵따: 4명 → 3라운드. 차례인 사람이 사전 단어로 두 번 잇고, 세 번째는 지어낸 단어로 탈락
await host.getByText('쿵쿵따', { exact: false }).first().waitFor({ timeout: 30_000 });
const used = new Set();
let turns = 0;
let kktShots = 0;
while (turns < 40) {
  if (await host.getByText('최종 순위').isVisible().catch(() => false)) break;
  let turnPage = null;
  for (const page of players) {
    if (await page.getByText('내 차례!').isVisible().catch(() => false)) {
      turnPage = page;
      break;
    }
  }
  if (!turnPage) {
    await host.waitForTimeout(150);
    continue;
  }
  const need = (await turnPage.getByTestId('kkt-need').textContent()).trim();
  const starts = [...need.replace(/[()·\s]/g, '')];
  turns += 1;
  const fake = turns % 3 === 0;
  const word = fake ? `${starts[0]}쀍쀍` : DICT.find((w) => starts.includes(w[0]) && !used.has(w));
  used.add(word);
  await turnPage.getByTestId('kkt-input').fill(word);
  await turnPage.getByTestId('kkt-submit').click();
  if (!fake && kktShots === 0) {
    await host.waitForTimeout(200);
    await shot(host, '11a-kkt-turn');
    await shot(p2, '11b-kkt-mobile');
    kktShots += 1;
  }
  if (fake && kktShots === 1) {
    await host.waitForTimeout(200);
    await shot(host, '11c-kkt-fail');
    kktShots += 1;
  }
  // 차례가 넘어갈 때까지 대기 (다음 사람 차례 또는 라운드 결과)
  await turnPage.getByText('내 차례!').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
}
log('쿵쿵따 제출 수', turns);
if (turns < 9) throw new Error('쿵쿵따가 예상보다 빨리 끝났어요');

// 7) 최종 순위
await host.getByText('최종 순위').waitFor({ timeout: 30_000 });
await shot(host, '11-final');
await shot(p2, '12-final-mobile');

// 8) 한 판 더 → 로비
await host.getByTestId('again').click();
await host.getByTestId('room-code').waitFor();

// 9) 관리자 통계
const admin = await newPlayer();
await admin.goto(`${BASE}/admin`);
await admin.getByText('몇 명으로 많이 플레이했나').waitFor();
await admin.waitForTimeout(300);
await shot(admin, '13-admin');
const stats = await (await fetch(`${BASE}/api/admin/stats`)).json();
log('통계', JSON.stringify(stats.totals), JSON.stringify(stats.matchesByPlayerCount));

await browser.close();
if (errors.length) {
  console.error('[e2e] 브라우저 오류', errors);
  process.exit(1);
}
const ok = stats.totals.matchesCompleted >= 1 && stats.totals.playAgain >= 1 && stats.matchesByPlayerCount.some((r) => r.key === '4');
if (!ok) {
  console.error('[e2e] 통계가 기대와 달라요');
  process.exit(1);
}
log('통과');
