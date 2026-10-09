/* global document, getComputedStyle, window, scrollY -- Playwright page callbacks. */
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? 'playwright'
);
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const out = new URL('.', import.meta.url).pathname;
const browser = await chromium.launch({ headless: true });
const base =
  process.env.VISUAL_PREVIEW_URL ??
  'http://127.0.0.1:4197/econmind-os-world-simulation/';
const results = [];
const failures = [];
const assert = (yes, label) => {
  if (!yes) failures.push(label);
};
async function geometry(page, selectors) {
  return page.evaluate(
    (selectors) =>
      Object.fromEntries(
        selectors.map((s) => {
          const el = document.querySelector(s);
          if (!el) return [s, null];
          const r = el.getBoundingClientRect(),
            c = getComputedStyle(el);
          return [
            s,
            {
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              overflowX: c.overflowX,
              overflowY: c.overflowY,
              scrollHeight: el.scrollHeight,
              scrollWidth: el.scrollWidth,
            },
          ];
        }),
      ),
    selectors,
  );
}
for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  let errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const role of [
    'captain',
    'finance',
    'central_bank',
    'industry',
    'trade',
    'social',
  ]) {
    await page.goto(
      base + `season1-immersive/?role=${role}&country=01#country`,
    );
    await page.locator('.country-game').waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('.national-world') &&
        getComputedStyle(document.querySelector('.national-world'))
          .backgroundImage !== 'none',
    );
    const url = await page
      .locator('link[href*="econmind-os-visual"]')
      .evaluate((e) => e.href);
    const response = await page.request.get(url);
    assert(response.status() === 200, `${name}/${role} css 200`);
    const selectors = [
      '.country-game',
      '.national-hud',
      '.national-play',
      '.national-bottom',
      '.national-world',
      '.national-drawer',
    ];
    const adapted = await geometry(page, selectors);
    await page
      .locator('link[href*="econmind-os-visual"]')
      .evaluate((e) => (e.sheet.disabled = true));
    const original = await geometry(page, selectors);
    await page
      .locator('link[href*="econmind-os-visual"]')
      .evaluate((e) => (e.sheet.disabled = false));
    assert(
      JSON.stringify(adapted) === JSON.stringify(original),
      `${name}/${role} geometry and scroll metrics unchanged`,
    );
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({
      tag: document.activeElement.tagName,
      outline: getComputedStyle(document.activeElement).outlineStyle,
      color: getComputedStyle(document.activeElement).outlineColor,
    }));
    assert(focus.outline === 'solid', `${name}/${role} keyboard focus`);
    if (name === 'mobile') {
      await page.evaluate(() => window.scrollTo(0, 500));
      assert(
        (await page.evaluate(() => scrollY)) > 0,
        `${role} mobile document scroll`,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.locator('[data-cmd="country-functions"]').click();
    await page
      .locator('.national-drawer[role="dialog"]:not([hidden])')
      .waitFor();
    const moduleCount = await page
      .locator('.national-drawer[role="dialog"] button')
      .count();
    assert(
      moduleCount ===
        {
          captain: 10,
          finance: 21,
          central_bank: 16,
          industry: 24,
          trade: 29,
          social: 26,
        }[role],
      `${name}/${role} module groups preserved`,
    );
    await page.locator('.national-drawer-head button').click();
    if (
      (name === 'desktop' && role === 'finance') ||
      (name === 'mobile' && role === 'trade')
    )
      await page.screenshot({
        path: `${out}/${name}-${role}.png`,
        fullPage: true,
      });
    await page.locator('[data-cmd="country-source"]').click();
    await page
      .locator('.national-drawer[role="dialog"]:not([hidden])')
      .waitFor();
    const sourceVisible = await page
      .locator('.national-drawer[role="dialog"]')
      .innerText();
    assert(
      sourceVisible.includes('Source') || sourceVisible.includes('来源'),
      `${name}/${role} source access`,
    );
    await page.locator('.national-drawer-head button').click();
    await page.locator('.national-card').first().click();
    const moduleNotice = await page.locator('body').innerText();
    assert(
      moduleNotice.includes('尚未接通'),
      `${name}/${role} disconnected module gateway remains guarded`,
    );
    assert(errors.length === 0, `${name}/${role} no page errors`);
    results.push({
      sourceAccessible: true,
      moduleAvailability: 'DISCONNECTED_OFFICIAL_BRIDGE',
      name,
      role,
      cssStatus: response.status(),
      geometryUnchanged: JSON.stringify(adapted) === JSON.stringify(original),
      focus,
      moduleCount,
      errors: [...errors],
    });
    errors = [];
  }
  await page.goto(base);
  await page.locator('.world-explorer').waitFor();
  const cssUrl = await page
    .locator('link[href*="econmind-os-visual"]')
    .evaluate((e) => e.href);
  assert((await page.request.get(cssUrl)).status() === 200, `${name}/map CSS`);
  const sels = [
    '.world-explorer',
    '.explorer-topbar',
    '.explorer-viewport',
    '.explorer-terrain',
  ];
  const adapted = await geometry(page, sels);
  await page
    .locator('link[href*="econmind-os-visual"]')
    .evaluate((e) => (e.sheet.disabled = true));
  const original = await geometry(page, sels);
  await page
    .locator('link[href*="econmind-os-visual"]')
    .evaluate((e) => (e.sheet.disabled = false));
  assert(
    JSON.stringify(adapted) === JSON.stringify(original),
    `${name}/map geometry`,
  );
  await page.locator('.explorer-viewport').focus();
  const focus = await page
    .locator('.explorer-viewport')
    .evaluate((e) => getComputedStyle(e).outlineStyle);
  assert(focus === 'solid', `${name}/map focus`);
  const before = await page
    .locator('.explorer-terrain')
    .getAttribute('viewBox');
  await page.keyboard.press('+');
  const after = await page.locator('.explorer-terrain').getAttribute('viewBox');
  assert(before !== after, `${name}/map keyboard zoom`);
  const viewportBox = await page.locator('.explorer-viewport').boundingBox();
  await page.mouse.move(
    viewportBox.x + viewportBox.width / 2,
    viewportBox.y + viewportBox.height / 2,
  );
  await page.mouse.wheel(0, -150);
  await page.waitForFunction(
    (previous) =>
      document.querySelector('.explorer-terrain').getAttribute('viewBox') !==
      previous,
    after,
  );
  const wheelZoom =
    (await page.locator('.explorer-terrain').getAttribute('viewBox')) !== after;
  assert(wheelZoom, `${name}/map wheel zoom`);
  await page.getByRole('button', { name: '探索 70 个国家' }).click();
  await page.locator('.explorer-country-drawer').waitFor();
  const drawerScroll = await page
    .locator('.explorer-country-drawer section')
    .evaluate((e) => {
      e.scrollTop = 150;
      return {
        scrollTop: e.scrollTop,
        scrollHeight: e.scrollHeight,
        clientHeight: e.clientHeight,
      };
    });
  assert(drawerScroll.scrollTop > 0, `${name}/country directory scroll`);
  await page.locator('.explorer-country-drawer input').fill('01');
  await page.locator('.explorer-country-drawer section button').first().click();
  await page.locator('.explorer-sidebar').waitFor();
  const sidebar = await page.locator('.explorer-sidebar').evaluate((e) => ({
    scrollHeight: e.scrollHeight,
    clientHeight: e.clientHeight,
    overflow: getComputedStyle(e).overflowY,
  }));
  results.push({
    name,
    map: true,
    geometryUnchanged: JSON.stringify(adapted) === JSON.stringify(original),
    focus,
    keyboardZoom: before !== after,
    wheelZoom,
    sidebar,
    drawerScroll,
    errors,
  });
  await context.close();
}
await browser.close();
writeFileSync(
  out + '/BROWSER_CHECK.json',
  JSON.stringify(
    {
      status: failures.length ? 'FAIL' : 'PASS',
      base,
      sharedCssSha256: createHash('sha256')
        .update(
          readFileSync(
            new URL(
              '../../../apps/world-web/public/shared/econmind-os-visual.css',
              import.meta.url,
            ),
          ),
        )
        .digest('hex'),
      viewports: ['1440x900', '390x844'],
      results,
      failures,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ failures, rows: results.length }));
process.exitCode = failures.length ? 1 : 0;
