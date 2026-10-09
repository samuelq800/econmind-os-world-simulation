/* global document, getComputedStyle -- isolated browser test callbacks. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? 'playwright'
);
const base = process.env.VISUAL_PREVIEW_URL ?? 'http://127.0.0.1:4198/';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) {
  throw new Error('LOCAL_PREVIEW_REQUIRED');
}
const out = path.resolve(
  process.env.VISUAL_QA_OUT ??
    'docs/reports/legacy-visual-completion-20261009/evidence',
);
await mkdir(out, { recursive: true });
const baselineRecord = JSON.parse(
  await readFile(
    process.env.VISUAL_BASELINE ??
      'docs/reports/legacy-visual-completion-20261009/BEFORE_ROLES.json',
    'utf8',
  ),
);
const baseline = baselineRecord.rows ?? baselineRecord;
const failures = [],
  results = [];
const assert = (value, label) => {
  if (!value) failures.push(label);
};
const roles = [
  'captain',
  'finance',
  'central_bank',
  'industry',
  'trade',
  'social',
];
const browser = await chromium.launch({ headless: true });
const contrast = async (page, selector) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const rgb = (value) =>
        value
          .match(/[\d.]+/g)
          .map(Number)
          .slice(0, 3);
      const luminance = (c) =>
        c
          .map((v) => {
            const s = v / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          })
          .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
      let surface = el;
      while (
        surface &&
        getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)'
      )
        surface = surface.parentElement;
      const fg = getComputedStyle(el).color,
        bg = getComputedStyle(surface).backgroundColor;
      const a = luminance(rgb(fg)),
        b = luminance(rgb(bg));
      return {
        fg,
        bg,
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
try {
  for (const [name, width, height] of [
    ['desktop', 1440, 900],
    ['mobile', 390, 844],
    ['narrow', 320, 740],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      locale: 'en-US',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const role of roles) {
      await page.goto(
        `${base}season1-immersive/?role=${role}&country=01#country`,
      );
      await page.locator('.country-game').waitFor();
      const state = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        controls: document.querySelectorAll('button,a,input,select').length,
        confirmDisabled: document.querySelector('.national-confirm').disabled,
        clock: document.querySelector('.national-time').innerText,
        roleOptions: [
          ...document.querySelector('[data-country-role-switch]').options,
        ].map((o) => o.value),
        navigationBars: document.querySelectorAll('.national-hud').length,
      }));
      assert(
        state.scrollWidth === state.width,
        `${name}/${role} document overflow`,
      );
      assert(
        state.confirmDisabled,
        `${name}/${role} allocation remains disabled`,
      );
      assert(
        state.clock.includes('Not started') &&
          state.clock.includes('No live World clock'),
        `${name}/${role} real clock semantics`,
      );
      assert(
        JSON.stringify(state.roleOptions) === JSON.stringify(roles),
        `${name}/${role} six public role views`,
      );
      assert(state.navigationBars === 1, `${name}/${role} no duplicate HUD`);
      const before = baseline.find((r) => r.size === name && r.role === role);
      if (before)
        assert(
          state.controls === before.controls &&
            state.clock === before.clock &&
            state.confirmDisabled === before.confirmDisabled,
          `${name}/${role} baseline controls and state preserved`,
        );
      await page.locator('.national-atlas').focus();
      assert(
        (await page
          .locator('.national-atlas')
          .evaluate((el) => getComputedStyle(el).outlineStyle)) === 'solid',
        `${name}/${role} visible keyboard focus`,
      );
      await page.screenshot({
        path: path.join(out, `after-${name}-${role}.jpg`),
        fullPage: true,
        type: 'jpeg',
      });
      await page
        .getByRole('button', { name: 'All office actions', exact: true })
        .click();
      const drawer = page.locator(
        '.national-drawer[role="dialog"]:not([hidden])',
      );
      await drawer.waitFor();
      const moduleCount = await drawer
        .locator('[data-cmd="country-module"]')
        .count();
      assert(
        moduleCount ===
          {
            captain: 9,
            finance: 20,
            central_bank: 15,
            industry: 23,
            trade: 28,
            social: 25,
          }[role],
        `${name}/${role} all 120 modules retained`,
      );
      const drawerContrast = await contrast(
        page,
        '.national-drawer[role="dialog"] .national-site-list small',
      );
      assert(
        drawerContrast.ratio >= 4.5,
        `${name}/${role} drawer secondary text contrast`,
      );
      if (role === 'finance')
        await page.screenshot({
          path: path.join(out, `after-${name}-finance-drawer.jpg`),
          fullPage: true,
          type: 'jpeg',
        });
      await drawer.getByRole('button').first().click();
      await page
        .getByRole('button', {
          name: 'Authorized World projection',
          exact: true,
        })
        .click();
      const projection = page.locator('dialog[data-office-projection-dialog]');
      const missing = await projection.locator('[role="status"]').innerText();
      assert(
        missing.includes('MISSING') &&
          missing.includes('TRUSTED_READ_BINDING_MISSING'),
        `${name}/${role} honest missing projection`,
      );
      if (role === 'finance')
        await page.screenshot({
          path: path.join(out, `after-${name}-finance-missing.jpg`),
          fullPage: true,
          type: 'jpeg',
        });
      await page.keyboard.press('Escape');
      assert(
        (await projection.innerText()) === '',
        `${name}/${role} closed private drawer clears`,
      );
      await page.locator('.national-card').first().click();
      await drawer.waitFor();
      const notice = await drawer.locator('[role="status"]').innerText();
      assert(
        notice.includes('尚未接通') || notice.includes('not connected'),
        `${name}/${role} guarded module feedback`,
      );
      assert(
        (await drawer.innerText()).includes('No World command was submitted'),
        `${name}/${role} module did not submit a command`,
      );
      await drawer
        .getByRole('button', { name: 'Return to country home →' })
        .click();
      assert(
        await page.locator('.national-confirm').isDisabled(),
        `${name}/${role} return retains allocation guard`,
      );
      assert(errors.length === 0, `${name}/${role} no page errors`);
      results.push({
        name,
        role,
        ...state,
        moduleCount,
        missing,
        drawerContrast,
        notice,
        errors: [...errors],
      });
    }
    await page.goto(base);
    await page.locator('.world-explorer').waitFor();
    await page.screenshot({
      path: path.join(out, `after-${name}-atlas.jpg`),
      fullPage: true,
      type: 'jpeg',
    });
    const atlas = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      connection: document.querySelector('.official-source-connection').dataset
        .sourceConnection,
    }));
    assert(
      atlas.width === atlas.scrollWidth,
      `${name}/atlas document overflow`,
    );
    assert(
      atlas.connection === 'NOT_CONFIGURED',
      `${name}/atlas honest source configuration`,
    );
    await page.getByRole('link', { name: '国家操作 ↗' }).click();
    await page.locator('.country-game').waitFor();
    await page.locator('[data-country-role-switch]').selectOption('trade');
    await page.waitForURL('**/?role=trade&country=01#country');
    await page.locator('.country-game[data-office="trade"]').waitFor();
    await page.getByRole('link', { name: 'Country atlas ↗' }).click();
    assert(
      page.url().includes('/countries/'),
      `${name}/country atlas return route`,
    );
    await page.goBack();
    await page.locator('.country-game[data-office="trade"]').waitFor();
    results.push({
      name,
      atlas,
      publicRoleSwitch: true,
      atlasReturnAndBack: true,
      errors: [...errors],
    });
    await context.close();
  }
} finally {
  await browser.close();
}
const css = await readFile(
  'apps/world-web/public/shared/econmind-os-visual.css',
);
await writeFile(
  path.join(out, 'COMPLETION_BROWSER.json'),
  JSON.stringify(
    {
      status: failures.length ? 'FAIL' : 'PASS',
      base,
      cssSha256: createHash('sha256').update(css).digest('hex'),
      results,
      failures,
      liveEconomicExecution: 'NOT_RUN',
      formAndChartInteriors: 'NOT_RUN_GUARDED_BY_DISCONNECTED_RUNTIME',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    status: failures.length ? 'FAIL' : 'PASS',
    failures,
    rows: results.length,
  }),
);
process.exitCode = failures.length ? 1 : 0;
