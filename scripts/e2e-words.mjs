/**
 * 스모크 테스트 2: 브라우저 3개로 단어 말하기(3라운드) → 금지어(2라운드)를 끝까지 진행한다.
 * 라운드 시간을 줄여서 돌린다: 서버를 BACKSTAGE_TEST_ROUND_MS=20000 으로 띄울 것.
 *
 *   npm run build && BACKSTAGE_TEST_ROUND_MS=20000 PORT=3999 npm start
 *   BASE_URL=http://localhost:3999 node scripts/e2e-words.mjs
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3999';
const OUT = 'e2e-artifacts';
mkdirSync(OUT, { recursive: true });
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath: exe });
const log = (...a) => console.log('[e2e-words]', ...a);
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const errors = [];
const fail = (msg) => {
  throw new Error(msg);
};

async function newPlayer(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL|fonts\.g/.test(m.text()) && errors.push(m.text()));
  return page;
}

const names = ['방장', '둘째', '셋째'];
const host = await newPlayer();
const p2 = await newPlayer({ width: 390, height: 844 });
const p3 = await newPlayer();
const players = [host, p2, p3];
const say = async (page, text) => {
  const box = page.getByPlaceholder(/채팅하면서|말조심|메시지/).first();
  await box.fill(text);
  await box.press('Enter');
};

// 방 만들기: 단어 말하기·금지어만, 목록 순서, 방 라운드 2
await host.goto(BASE);
await host.getByPlaceholder('1~10자').fill(names[0]);
await host.getByRole('button', { name: /방 만들기/ }).first().click();
const dlg = host.getByRole('dialog');
await dlg.waitFor();
await dlg.getByRole('button', { name: '목록 순서' }).click();
for (const g of ['눈치게임', '포브스', '쿵쿵따']) await dlg.getByText(g, { exact: true }).click();
await dlg.getByRole('button', { name: '방 라운드 (게임 수) 줄이기' }).click();
await shot(host, 'w01-create');
await host.getByTestId('create-confirm').click();
const code = (await host.getByTestId('room-code').textContent()).trim();
for (const [page, name] of [
  [p2, names[1]],
  [p3, names[2]],
]) {
  await page.goto(`${BASE}/?room=${code}`);
  await page.getByPlaceholder('1~10자').fill(name);
  await page.getByRole('button', { name: '입장' }).click();
  await page.getByTestId('ready').click();
}
await host.getByText(names[2]).first().waitFor();
await host.getByTestId('start').click();

// ── 단어 말하기 (3라운드) ──
for (let r = 1; r <= 3; r++) {
  await host.getByTestId('word-mine').waitFor({ timeout: 20_000 });
  const mine = (await host.getByTestId('word-mine').textContent()).trim();
  const w2 = (await p2.getByTestId('word-mine').textContent()).trim();
  log(`${r}라운드 방장 단어`, mine, '/ 둘째 단어', w2);
  await say(host, `아까 ${mine} 얘기 나왔잖아`);
  await host.getByText('+1 🤫').waitFor({ timeout: 3000 });
  // 다른 사람 화면에는 방장 단어가 없어야 한다
  if ((await p3.content()).includes(`>${mine}<`)) fail('남의 비밀 단어가 화면에 보여요');
  if (r === 1) {
    await shot(host, 'w02-word-play');
    await shot(p2, 'w03-word-mobile');
  }
  // 셋째가 둘째 단어로 챌린지 → 성공
  const p2id = await p3.locator('[data-testid^="word-challenge-"]').evaluateAll((els, n) => els.map((e) => e.getAttribute('data-testid')), null);
  let ok = false;
  for (const tid of p2id) {
    const card = p3.getByTestId(tid).locator('xpath=ancestor::li');
    if ((await card.textContent()).includes(names[1])) {
      await p3.getByTestId(tid).click();
      await p3.getByTestId('word-guess').fill(w2);
      await p3.getByTestId('word-guess-send').click();
      ok = true;
    }
  }
  if (!ok) fail('둘째 챌린지 버튼을 못 찾았어요');
  await host.getByText('챌린지 성공', { exact: false }).first().waitFor({ timeout: 3000 });
  await host.getByTestId('word-reveal').waitFor({ timeout: 40_000 });
  if (r === 1) await shot(host, 'w04-word-reveal');
}

// ── 금지어 ──
for (let r = 1; r <= 2; r++) {
  await host.getByTestId(/ban-word-/).first().waitFor({ timeout: 40_000 });
  await host.getByText('남이 자기 금지어를', { exact: false }).waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  await host.waitForTimeout(300);
  // 방장 화면에서 둘째의 금지어를 읽는다 (자기 것은 없어야 함)
  const cards = await host.locator('[data-testid^="ban-word-"]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-testid'), e.textContent]));
  if (cards.length !== 2) fail(`방장에게 보이는 금지어가 ${cards.length}개 (2개여야 함)`);
  const p2Card = await p2.locator('[data-testid^="ban-card-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  const myIdOnP2 = await p2.locator('[data-testid^="ban-card-"]', { hasText: '(나)' }).getAttribute('data-testid');
  const p2Id = myIdOnP2.replace('ban-card-', '');
  const p2Word = cards.find(([tid]) => tid === `ban-word-${p2Id}`)?.[1];
  if (!p2Word) fail('둘째 금지어를 못 읽었어요');
  log(`${r}라운드 둘째 금지어`, p2Word, p2Card.length);
  // 둘째가 자기 금지어를 말한다 → 적발
  await host.getByTestId('ban-word-' + p2Id).waitFor();
  await say(p2, `나 오늘 ${p2Word} 때문에`);
  await p2.getByTestId('ban-alert').waitFor({ timeout: 3000 });
  if (r === 1) {
    await shot(p2, 'w05-ban-alert-mobile');
    await shot(host, 'w06-ban-host');
    await p2.getByTestId('ban-skip').click();
    await p2.getByTestId('ban-muted').waitFor({ timeout: 3000 });
    await shot(p2, 'w07-ban-muted');
  } else {
    await p2.getByTestId('ban-guess').fill(p2Word);
    await p2.getByTestId('ban-guess-send').click();
    await host.getByText('챌린지 성공', { exact: false }).last().waitFor({ timeout: 3000 });
  }
  await host.getByTestId('ban-reveal').waitFor({ timeout: 40_000 });
  if (r === 1) await shot(host, 'w08-ban-reveal');
}

await host.getByText('최종 순위').waitFor({ timeout: 40_000 });
await shot(host, 'w09-final');
await browser.close();
if (errors.length) {
  console.error('[e2e-words] 브라우저 오류', errors);
  process.exit(1);
}
log('통과');
