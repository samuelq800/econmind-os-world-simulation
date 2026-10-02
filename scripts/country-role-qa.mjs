/* global document, window, getComputedStyle -- isolated Playwright page callbacks. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadBalancedCountryCandidate } from './balanced-country-candidate-intake.mjs';
import {
  canonicalDecimal,
  parseLosslessJson,
} from './official-world-opening-mapping.mjs';

export const COUNTRY_ROLE_QA_SCHEMA = 'COUNTRY_ROLE_BROWSER_AUDIT_V1';
export const QA_ROLES = [
  'captain',
  'finance',
  'central_bank',
  'industry',
  'trade',
  'social',
];
export const QA_COUNTRIES = Array.from({ length: 70 }, (_, i) =>
  String(i + 1).padStart(2, '0'),
);
export const QA_VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const numeric = (value) =>
  typeof value === 'string' && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value);
const pointerValue = (value, pointer) =>
  pointer
    .split('/')
    .slice(1)
    .reduce(
      (row, key) => row?.[key.replace(/~1/gu, '/').replace(/~0/gu, '~')],
      value,
    );
const cachedPlaywright =
  '/Users/samuel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

export function localAuditUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('COUNTRY_ROLE_LOOPBACK_URL_REQUIRED');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

/** @typedef {{technicalStatus: string, errors: string[], consoleErrors: string[], requests: Array<{status: string}>}} AuditViewport */
export function auditMatrix() {
  return QA_COUNTRIES.flatMap((country) =>
    QA_ROLES.map((role) => ({
      country,
      role,
      technicalStatus: 'NOT_RUN',
      playabilityStatus: 'NOT_RUN',
      viewports: /** @type {AuditViewport[]} */ ([]),
    })),
  );
}

export async function countryRoleInputs(root, expectedSha) {
  const checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (!/^[a-f0-9]{40}$/u.test(expectedSha) || checkoutSha !== expectedSha)
    throw new Error('COUNTRY_ROLE_SHA_MISMATCH');
  const baseline = await loadBalancedCountryCandidate(root);
  const artifacts = new Map(
    baseline.artifacts.map((item) => [item.sourcePath, item]),
  );
  const parsed = new Map();
  const countries = new Map();
  for (const number of QA_COUNTRIES) {
    const file = `apps/world-web/public/season1-immersive/countries/data/${number}.json`;
    const bytes = await readFile(path.join(root, file));
    const data = JSON.parse(bytes.toString('utf8'));
    const selected = baseline.countries.find((row) => row.number === number);
    const meta = data.officialSource;
    if (
      !selected ||
      data.id !== selected.id ||
      data.name !== selected.name ||
      data.profile?.population !== selected.population ||
      data.profile?.labourForce !== selected.labourForce ||
      meta?.schemaVersion !== 'OFFICIAL_UI_FIELD_PROVENANCE_V1' ||
      meta.sourcePackageId !== baseline.candidateId ||
      meta.sourceChecksumsSha256 !== baseline.manifestSha256
    )
      throw new Error(`COUNTRY_ROLE_BASELINE_MISMATCH:${number}`);
    for (const field of Object.values(meta.fields)) {
      const spec = meta.datasets[field.dataset];
      const artifact = spec && artifacts.get(spec.sourcePath);
      if (!artifact || artifact.sha256 !== spec.sha256)
        throw new Error(`COUNTRY_ROLE_SOURCE_HASH_MISMATCH:${number}`);
      if (!parsed.has(spec.sourcePath))
        parsed.set(
          spec.sourcePath,
          parseLosslessJson(artifact.content, spec.sourcePath),
        );
      const raw = pointerValue(
        parsed.get(spec.sourcePath),
        field.sourcePointer,
      );
      const row = parsed.get(spec.sourcePath)[field.rowIndex];
      const rowId =
        row?.id ??
        row?.facilityId ??
        (row?.commodityId
          ? `${row.countryId}:${row.commodityId}`
          : row?.countryId);
      if (
        !row ||
        (row.countryId ?? row.id) !== data.id ||
        field.rowId !== rowId ||
        raw !== field.rawToken ||
        canonicalDecimal(raw, field.field) !== field.exact
      )
        throw new Error(`COUNTRY_ROLE_EXACT_SOURCE_MISMATCH:${number}`);
    }
    for (const [name, collection] of Object.entries(meta.collections)) {
      const spec = meta.datasets[collection.dataset];
      const artifact = spec && artifacts.get(spec.sourcePath);
      if (!artifact || artifact.sha256 !== spec.sha256)
        throw new Error(
          `COUNTRY_ROLE_COLLECTION_SOURCE_MISMATCH:${number}:${name}`,
        );
      if (!parsed.has(spec.sourcePath))
        parsed.set(
          spec.sourcePath,
          parseLosslessJson(artifact.content, spec.sourcePath),
        );
      const rows = parsed
        .get(spec.sourcePath)
        .filter(
          (row) =>
            row.countryId === data.id &&
            (name !== 'historicalDevelopmentOptions' ||
              row.scenarioRole === 'DEVELOPMENT_OPTION'),
        );
      const ids = rows.map((row) => row.id ?? row.facilityId);
      if (
        collection.countExact !== String(rows.length) ||
        collection.predicate?.countryId !== data.id ||
        collection.rule !==
          (name === 'historicalDevelopmentOptions'
            ? 'FILTER_COUNTRY_ID_AND_SCENARIO_ROLE_DEVELOPMENT_OPTION'
            : 'FILTER_COUNTRY_ID') ||
        JSON.stringify(collection.sourceRowIds) !== JSON.stringify(ids) ||
        (name === 'facilities' && data.facilities.length !== rows.length) ||
        (name === 'resources' && data.resources.length !== rows.length)
      )
        throw new Error(`COUNTRY_ROLE_COLLECTION_MISMATCH:${number}:${name}`);
    }
    countries.set(number, { data, sha256: sha256(bytes), bytes: bytes.length });
  }
  return {
    checkoutSha,
    baseline: {
      packageId: baseline.candidateId,
      checksumSha256: baseline.manifestSha256,
      countries: 70,
    },
    countries,
    sourceNature: 'SELECTED_SOURCE_NOT_RUNTIME',
  };
}

// Reuses G's local prefixed static-preview method. It never handles commands.
export async function countryRolePreview(root, checkoutSha) {
  const publicRoot = await realpath(path.join(root, 'apps/world-web/public'));
  const prefix = '/econmind-os-world-simulation/';
  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  const server = createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405);
      response.end();
      return;
    }
    try {
      let name = decodeURIComponent(
        new URL(request.url, 'http://127.0.0.1').pathname,
      );
      if (!name.startsWith(prefix)) throw new Error('OUTSIDE_PREFIX');
      name = name.slice(prefix.length);
      if (name.endsWith('/') || name === '') name += 'index.html';
      let file = path.resolve(publicRoot, name);
      if (!file.startsWith(`${publicRoot}${path.sep}`))
        throw new Error('OUTSIDE_PUBLIC');
      const mapAsset =
        /^season1-immersive\/countries\/assets\/(scenes|details)\/([a-z0-9-]+\.(?:png|svg))$/u.exec(
          name,
        );
      if (mapAsset)
        file = path.join(
          root,
          `apps/world-web/src/assets/country-${mapAsset[1] === 'scenes' ? 'scenes' : 'detail'}`,
          mapAsset[2],
        );
      const resolved = await realpath(file);
      if (!mapAsset && !resolved.startsWith(`${publicRoot}${path.sep}`))
        throw new Error('OUTSIDE_PUBLIC');
      const bytes = await readFile(resolved);
      response.writeHead(200, {
        'content-type':
          mime[path.extname(resolved)] ?? 'application/octet-stream',
        'x-country-role-checkout-sha': checkoutSha,
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}${prefix}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

export async function countryRoleBrowser(
  modulePath = process.env.PLAYWRIGHT_MODULE ?? cachedPlaywright,
) {
  try {
    const module = await import(
      path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath
    );
    const browser = await module.chromium.launch({ headless: true });
    return { browser, modulePath, version: browser.version() };
  } catch (error) {
    throw new Error(
      `COUNTRY_ROLE_BROWSER_DEPENDENCY_MISSING:${String(error)}`,
      { cause: error },
    );
  }
}

export function controlNature(control, boundary) {
  if (
    control.cmd === 'country-confirm' &&
    /Local|Not executed|not connected|LOCAL_NOT_EXECUTED/iu.test(boundary)
  )
    return 'LOCAL_ONLY';
  if (control.claimedNature === 'COMMAND_READY')
    return 'COMMAND_READY_CLAIM_UNVERIFIED';
  if (
    [
      'country-source',
      'country-metric',
      'country-dismiss',
      'country-sites',
      'country-functions',
      'country-records',
      'roles',
      'switch',
    ].includes(control.cmd) ||
    control.tag === 'A' ||
    control.tag === 'SUMMARY'
  )
    return 'READ_OR_NAVIGATION';
  return 'UNCLASSIFIED_NOT_EXECUTED';
}

const requiredMetrics = {
  captain: ['population', 'sites', 'resources'],
  finance: ['treasury', 'maintenance', 'sites'],
  central_bank: ['reserves', 'deposits', 'equity'],
  industry: ['power', 'workers', 'build'],
  trade: ['grain', 'demand', 'resources'],
  social: ['labour', 'unemployed', 'workers'],
};
const metricPointers = {
  population: '/profile/population',
  treasury: '/profile/treasuryCentralBankBalanceGcu',
  reserves: '/profile/bankReservesGcu',
  deposits: '/profile/bankDepositsGcu',
  equity: '/profile/bankEquityGcu',
  grain: '/profile/foodAvailableStockTonnes',
  demand: '/profile/foodDemandTonnesDay',
  labour: '/profile/labourForce',
  unemployed: '/profile/scenarioUnemployed',
};

export function assessCountryRoleSnapshot(snapshot, expected, role) {
  const failures = [],
    gaps = [];
  if (
    snapshot.countryId !== expected.id ||
    snapshot.countryNumber !== expected.number ||
    snapshot.office !== role ||
    snapshot.runtimeRole !== role ||
    !snapshot.identityText.includes(expected.name)
  )
    failures.push('COUNTRY_OR_OFFICE_RENDER_MISMATCH');
  if (snapshot.horizontalOverflow) failures.push('HORIZONTAL_OVERFLOW');
  if (!snapshot.backgroundRendered) failures.push('COUNTRY_ART_NOT_RENDERED');
  for (const name of requiredMetrics[role]) {
    const rendered = snapshot.metrics.find((item) => item.metric === name);
    if (!rendered) {
      gaps.push(`HUD_SOURCE_HOOK_MISSING:${name}`);
      continue;
    }
    const metadata =
      name === 'sites'
        ? expected.officialSource.collections.facilities
        : name === 'resources'
          ? expected.officialSource.collections.resources
          : expected.officialSource.fields[rendered.outputPointer];
    const facilityAlias = {
      maintenance: 'maintenanceGcuDay',
      power: 'requiredPowerMW',
      workers: 'requiredWorkers',
      build: 'constructionSimDays',
    }[name];
    const selectedIndex = expected.facilities.findIndex(
      (row) => row.id === snapshot.selectedSite,
    );
    if (
      !metadata ||
      !numeric(rendered.exact) ||
      rendered.exact !== (metadata.exact ?? metadata.countExact) ||
      rendered.dataset !== metadata.dataset ||
      (metadata.field && rendered.field !== metadata.field) ||
      rendered.unit !== metadata.unit ||
      (metricPointers[name] &&
        rendered.outputPointer !== metricPointers[name]) ||
      (facilityAlias &&
        rendered.outputPointer !==
          `/facilities/${selectedIndex}/record/${facilityAlias}`) ||
      rendered.sourcePointer !== (metadata.sourcePointer ?? metadata.rule) ||
      (metadata.rowId && rendered.rowId !== metadata.rowId) ||
      rendered.nature !== metadata.nature
    )
      failures.push(`HUD_EXACT_OR_PROVENANCE_MISMATCH:${name}`);
  }
  if (!snapshot.heading || !snapshot.goal)
    gaps.push('VISIBLE_TASK_GOAL_MISSING');
  return {
    failures,
    gaps,
    technicalStatus: failures.length
      ? 'FAIL'
      : gaps.length
        ? 'BLOCKED'
        : 'PASS',
    playability: {
      status: 'BLOCKED',
      taskGoal: {
        status:
          snapshot.heading && snapshot.goal
            ? 'VISIBLE_NOT_SEMANTICALLY_APPROVED'
            : 'NOT_IMPLEMENTED',
        heading: snapshot.heading,
        explanation: snapshot.goal,
      },
      meaningfulChoices: {
        status: 'HUMAN_REVIEW_REQUIRED',
        observedOptions: snapshot.options,
      },
      costAndConsequences: {
        status: 'LOCAL_REFERENCE_ONLY_NOT_VERIFIED',
        explanation: snapshot.lesson,
      },
      execution: 'NOT_EXERCISED_READ_ONLY',
      finalReceiptChain: 'NOT_EXERCISED_READ_ONLY',
      receiptRefresh: 'NOT_EXERCISED_READ_ONLY',
      stoppingPoint: {
        status: 'HUMAN_REVIEW_REQUIRED',
        visibleBoundary: snapshot.boundary,
      },
    },
  };
}

async function renderedSnapshot(page) {
  return page.evaluate(() => {
    const game = document.querySelector('.country-game');
    const text = (selector) =>
      document.querySelector(selector)?.textContent?.trim() ?? '';
    const visible = (el) =>
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== 'hidden';
    const body = document.body,
      country = window.CountryGame?.country?.();
    return {
      countryId: country?.id ?? null,
      countryNumber: game?.dataset.country ?? null,
      office: game?.dataset.office ?? null,
      runtimeRole: window.GameTest?.role?.() ?? null,
      identityText: text('.national-identity'),
      selectedSite:
        document.querySelector('.national-site-pins button.selected[data-id]')
          ?.dataset.id ??
        window.CountryGame?.state?.()?.site ??
        null,
      heading: text('.national-mission h1'),
      goal: text('.national-mission p'),
      lesson: text('.national-lesson'),
      boundary:
        text('[data-national-status]') + ' ' + text('.national-edition'),
      sourceState: game?.dataset.dataSource ?? null,
      horizontalOverflow:
        Math.max(body.scrollWidth, document.documentElement.scrollWidth) >
        window.innerWidth + 2,
      backgroundRendered:
        getComputedStyle(document.querySelector('.national-world') ?? body)
          .backgroundImage !== 'none',
      metrics: [
        ...document.querySelectorAll(
          '[data-cmd="country-metric"][data-metric]',
        ),
      ]
        .filter(visible)
        .map((el) => ({
          metric: el.dataset.metric,
          exact: el.dataset.sourceExact ?? null,
          dataset: el.dataset.sourceDataset ?? null,
          field: el.dataset.sourceField ?? null,
          outputPointer: el.dataset.outputPointer ?? null,
          sourcePointer: el.dataset.sourcePointer ?? null,
          nature: el.dataset.sourceNature ?? null,
          unit: el.dataset.sourceUnit ?? null,
          rowId: el.dataset.sourceRowId ?? null,
          state: el.dataset.sourceState ?? null,
        })),
      options: [
        ...document.querySelectorAll(
          '.national-tokens button, [data-national-amount]',
        ),
      ]
        .filter(visible)
        .map((el) => ({
          name: el.getAttribute('aria-label') ?? el.textContent.trim(),
          value: el.getAttribute('data-value') ?? null,
          minimum: el.getAttribute('min'),
          maximum: el.getAttribute('max'),
          step: el.getAttribute('step'),
        })),
      controls: [...document.querySelectorAll('button,a,input,select,summary')]
        .map((el, index) => ({
          index,
          visible: visible(el),
          tag: el.tagName,
          cmd: el.dataset.cmd ?? '',
          claimedNature: el.dataset.actionNature ?? null,
          label:
            el.getAttribute('aria-label') ??
            el.getAttribute('title') ??
            el.textContent.trim(),
          disabled: el.disabled === true,
          disabledReason: el.dataset.disabledReason ?? null,
          tabIndex: el.tabIndex,
          primary:
            !!el.closest(
              '.national-tools,.national-resources,.national-play,.national-buildings,.national-hand',
            ) ||
            el.matches(
              '.national-atlas,[data-country-role-switch],[data-cmd="roles"]',
            ),
        }))
        .filter((row) => row.visible),
    };
  });
}

async function readOnlyDrawer(page, selector) {
  const button = page.locator(selector).first();
  if (!(await button.isVisible().catch(() => false)))
    return { status: 'NOT_IMPLEMENTED' };
  try {
    await button.click({ timeout: 2000 });
    const drawer = page.locator('.national-drawer:not([hidden])');
    await drawer.waitFor({ timeout: 2000 });
    // Native disclosures are real read-only controls: hidden DOM text is not
    // evidence of a visible/accessible provenance chain.
    const disclosures = drawer.locator('details:not([open]) > summary');
    const disclosureCount = await disclosures.count();
    for (let i = 0; i < disclosureCount; i += 1)
      await disclosures.first().click({ timeout: 2000 });
    const text = await drawer.innerText();
    const verificationControls = await drawer
      .locator('[data-cmd="country-metric-verify"]')
      .evaluateAll((controls) =>
        controls.map((el) => ({
          disabled: el.disabled === true,
          disabledReason: el.dataset.disabledReason ?? null,
          exercised: false,
        })),
      );
    const close = drawer
      .locator('[data-cmd="country-dismiss"],.national-drawer-head button')
      .first();
    await close.click({ timeout: 2000 });
    return {
      status: 'RENDERED_READ_ONLY',
      text,
      verificationControls,
      disclosuresOpened: disclosureCount,
    };
  } catch (error) {
    return { status: 'FAIL', error: String(error) };
  }
}

export async function runCountryRoleAudit({
  browser = null,
  inputs,
  baseUrl,
  countries = ['02', '70'],
  roles = ['finance'],
  runKind = 'SAMPLE_LOCAL',
  confirmIntegrationSha = null,
  evidenceDirectory = null,
  maxEvidenceScreenshots = 40,
  maxCacheBytes = 256 * 1024 * 1024,
}) {
  const base = localAuditUrl(baseUrl);
  const startedAt = new Date().toISOString();
  if (
    !countries.length ||
    new Set(countries).size !== countries.length ||
    countries.some((country) => !QA_COUNTRIES.includes(country)) ||
    !roles.length ||
    new Set(roles).size !== roles.length ||
    roles.some((role) => !QA_ROLES.includes(role))
  )
    throw new Error('COUNTRY_ROLE_SELECTION_INVALID');
  const full = countries.length === 70 && roles.length === 6;
  if (
    full &&
    (runKind !== 'FULL_INTEGRATED' ||
      confirmIntegrationSha !== inputs.checkoutSha)
  )
    throw new Error(
      'COUNTRY_ROLE_FULL_RUN_REQUIRES_FIXED_INTEGRATION_CONFIRMATION',
    );
  if (runKind === 'FULL_INTEGRATED' && !full)
    throw new Error('COUNTRY_ROLE_PARTIAL_RUN_CANNOT_BE_FULL');
  if (!browser) throw new Error('COUNTRY_ROLE_BROWSER_REQUIRED');
  let evidenceScreenshots = 0;
  const matrix = auditMatrix();
  const cache = new Map(),
    statistics = { hits: 0, misses: 0, bytes: 0, evictions: 0 };
  const context = await browser.newContext({
    viewport: QA_VIEWPORTS.desktop,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  let missingCountry = null,
    loadingProbe = null,
    activeRequests = [],
    errors = [],
    consoleErrors = [];
  await context.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) ||
      url.origin !== base.origin ||
      request.headers().authorization
    ) {
      activeRequests.push({
        method: request.method(),
        path: url.pathname,
        status: 'BLOCKED_NON_READ_ONLY_OR_EXTERNAL',
      });
      await route.abort();
      return;
    }
    if (
      missingCountry &&
      url.pathname.endsWith(`/countries/data/${missingCountry}.json`)
    ) {
      await page
        .waitForFunction(() => document.readyState !== 'loading', null, {
          timeout: 3000,
        })
        .catch(() => {});
      loadingProbe = await page.evaluate(() => ({
        countryId: window.CountryGame?.country?.()?.id ?? null,
        gameVisible: !!document.querySelector('.country-game'),
        text:
          document.querySelector('#game')?.innerText ?? document.body.innerText,
      }));
      loadingProbe.status =
        !loadingProbe.countryId &&
        !loadingProbe.gameVisible &&
        !/Avenor|North Harbour|北港|120,000,000/u.test(loadingProbe.text)
          ? 'PASS_NO_FALLBACK_WHILE_SOURCE_PENDING'
          : 'FAIL_LOADING_FALLBACK';
      await route.fulfill({ status: 404, body: 'TEST_MISSING_COUNTRY' });
      return;
    }
    const key = `${request.method()}:${url.href}`;
    try {
      let entry = cache.get(key);
      if (entry) {
        statistics.hits += 1;
        cache.delete(key);
        cache.set(key, entry);
      } else {
        statistics.misses += 1;
        const response = await route.fetch({ maxRedirects: 0, timeout: 15000 });
        const body = await response.body();
        entry = {
          status: response.status(),
          headers: response.headers(),
          body,
        };
        delete entry.headers['set-cookie'];
        delete entry.headers['content-encoding'];
        delete entry.headers['content-length'];
        if (entry.status === 200 && body.length <= maxCacheBytes) {
          while (statistics.bytes + body.length > maxCacheBytes && cache.size) {
            const oldest = cache.keys().next().value;
            statistics.bytes -= cache.get(oldest).body.length;
            cache.delete(oldest);
            statistics.evictions += 1;
          }
          cache.set(key, entry);
          statistics.bytes += body.length;
        }
      }
      const countryNumber = /\/countries\/data\/(\d{2})\.json$/u.exec(
        url.pathname,
      )?.[1];
      if (entry.status >= 400)
        activeRequests.push({
          path: url.pathname,
          status: 'READ_HTTP_ERROR',
          httpStatus: entry.status,
        });
      if (
        countryNumber &&
        request.method() === 'GET' &&
        entry.status === 200 &&
        sha256(entry.body) !== inputs.countries.get(countryNumber)?.sha256
      )
        activeRequests.push({
          path: url.pathname,
          status: 'COUNTRY_BYTES_MISMATCH',
        });
      await route.fulfill(entry);
    } catch (error) {
      activeRequests.push({
        path: url.pathname,
        status: 'READ_FAILED',
        error: String(error),
      });
      await route.abort();
    }
  });
  if (context.routeWebSocket)
    await context.routeWebSocket('**/*', (socket) => socket.close());
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  try {
    for (const country of countries)
      for (const role of roles) {
        const cell = matrix.find(
          (item) => item.country === country && item.role === role,
        );
        const expected = inputs.countries.get(country).data;
        for (const [viewport, size] of Object.entries(QA_VIEWPORTS)) {
          errors = [];
          consoleErrors = [];
          activeRequests = [];
          const result = {
            viewport,
            errors,
            consoleErrors,
            requests: activeRequests,
          };
          try {
            await page.setViewportSize(size);
            await page.goto(
              new URL(
                `season1-immersive/?role=${role}&country=${country}#country`,
                base,
              ).href,
              { waitUntil: 'load', timeout: 20000 },
            );
            await page.locator('.country-game').waitFor({ timeout: 8000 });
            const snapshot = await renderedSnapshot(page);
            Object.assign(
              result,
              assessCountryRoleSnapshot(snapshot, expected, role),
              { snapshot, controls: [] },
            );
            for (const control of snapshot.controls.filter(
              (item) => item.primary,
            )) {
              const audit = {
                ...control,
                nature: controlNature(control, snapshot.boundary),
                reachability: 'NOT_RUN',
              };
              const element = page
                .locator('button,a,input,select,summary')
                .nth(control.index);
              if (control.disabled) audit.reachability = 'BLOCKED_DISABLED';
              else {
                try {
                  await element.scrollIntoViewIfNeeded({ timeout: 750 });
                  await element.click({ trial: true, timeout: 750 });
                  await element.focus();
                  audit.focused = await element.evaluate(
                    (el) => document.activeElement === el,
                  );
                  audit.focusStyle = await element.evaluate((el) => ({
                    outline: getComputedStyle(el).outlineStyle,
                    boxShadow: getComputedStyle(el).boxShadow,
                  }));
                  audit.reachability =
                    audit.focused && control.tabIndex >= 0
                      ? 'PASS'
                      : 'FAIL_FOCUS';
                } catch (error) {
                  audit.reachability = 'FAIL';
                  audit.error = String(error);
                }
              }
              result.controls.push(audit);
            }
            const metricDetails = [];
            for (const metric of requiredMetrics[role]) {
              const detail = await readOnlyDrawer(
                page,
                `[data-cmd="country-metric"][data-metric="${metric}"]`,
              );
              const observed = snapshot.metrics.find(
                (item) => item.metric === metric,
              );
              if (observed?.exact && detail.status === 'RENDERED_READ_ONLY') {
                const exactPattern = new RegExp(
                  `(?:^|[^a-zA-Z0-9.])${observed.exact.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:$|[^a-zA-Z0-9.])`,
                  'u',
                );
                const sourceHash =
                  expected.officialSource.datasets[observed.dataset]?.sha256;
                if (
                  !exactPattern.test(detail.text) ||
                  !sourceHash ||
                  !detail.text.includes(sourceHash)
                )
                  detail.status = 'FAIL_EXACT_OR_SOURCE_HASH_NOT_VISIBLE';
              }
              metricDetails.push({ metric, ...detail });
            }
            result.metricDetails = metricDetails;
            result.sourceAccess = await readOnlyDrawer(
              page,
              '[data-cmd="country-source"]',
            );
            result.scroll = await page.evaluate(() => {
              const scroller = document.scrollingElement;
              const before = scroller.scrollTop;
              window.scrollTo(0, scroller.scrollHeight);
              return {
                before,
                after: scroller.scrollTop,
                height: scroller.scrollHeight,
                clientHeight: scroller.clientHeight,
                needed: scroller.scrollHeight > scroller.clientHeight + 2,
              };
            });
            const atlas = page.locator('.national-atlas').first();
            result.navigation = {
              atlasReturn: 'NOT_IMPLEMENTED',
              roleSwitch: 'NOT_IMPLEMENTED',
              atlasSelector: '.national-atlas',
              atlasUrl: null,
              expectedReturn: {
                path: new URL('season1-immersive/', base).pathname,
                country,
                role,
              },
              matchingReturnLinkIndex: null,
              roleSwitchSelector: 'select[data-country-role-switch]',
            };
            if (await atlas.isVisible().catch(() => false)) {
              await atlas.click({ timeout: 2000 });
              const state = new URL(page.url());
              result.navigation.atlasUrl = state.href;
              if (
                state.searchParams.get('country') !== country ||
                state.searchParams.get('role') !== role
              )
                result.failures.push('ATLAS_NAVIGATION_LOST_COUNTRY_OR_ROLE');
              const returnIndex = await page.locator('a[href]').evaluateAll(
                (links, args) =>
                  links.findIndex((link) => {
                    const url = new URL(link.href);
                    return (
                      url.pathname === args.path &&
                      url.searchParams.get('country') === args.country &&
                      url.searchParams.get('role') === args.role
                    );
                  }),
                {
                  path: new URL('season1-immersive/', base).pathname,
                  country,
                  role,
                },
              );
              result.navigation.matchingReturnLinkIndex = returnIndex;
              if (returnIndex >= 0) {
                await page.locator('a[href]').nth(returnIndex).click();
                await page.locator('.country-game').waitFor({ timeout: 8000 });
                result.navigation.atlasReturn = 'IN_APP_RETURN_RENDERED';
              } else {
                await page.goBack();
                result.gaps.push('IN_APP_ATLAS_RETURN_MISSING');
              }
              const returned = await renderedSnapshot(page);
              if (
                returned.countryId !== expected.id ||
                returned.countryNumber !== country ||
                returned.office !== role ||
                returned.runtimeRole !== role
              )
                result.failures.push('ATLAS_RETURN_LOST_COUNTRY_OR_ROLE');
            } else result.gaps.push('ATLAS_LINK_MISSING');
            const switcher = page
              .locator('select[data-country-role-switch]')
              .first();
            if (await switcher.isVisible().catch(() => false)) {
              const nextRole =
                QA_ROLES[(QA_ROLES.indexOf(role) + 1) % QA_ROLES.length];
              await switcher.selectOption(nextRole);
              await page.waitForFunction(
                (wanted) =>
                  document.querySelector('.country-game')?.dataset.office ===
                  wanted,
                nextRole,
                { timeout: 8000 },
              );
              const switched = await renderedSnapshot(page);
              result.navigation.roleSwitch =
                switched.countryId === expected.id &&
                switched.countryNumber === country &&
                switched.office === nextRole &&
                switched.runtimeRole === nextRole
                  ? 'PASS'
                  : 'FAIL';
              if (result.navigation.roleSwitch === 'FAIL')
                result.failures.push('ROLE_SWITCH_LOST_COUNTRY_OR_ROLE');
            } else result.gaps.push('VISIBLE_ROLE_SWITCH_NOT_IMPLEMENTED');
            if (
              result.controls.some((item) =>
                item.reachability.startsWith('FAIL'),
              )
            )
              result.failures.push('PRIMARY_CONTROL_REACHABILITY_OR_FOCUS');
            if (result.controls.some((item) => !item.label))
              result.failures.push('PRIMARY_CONTROL_ACCESSIBLE_NAME_MISSING');
            if (
              result.metricDetails.some((item) =>
                item.status.startsWith('FAIL'),
              )
            )
              result.failures.push('EXACT_SOURCE_DETAIL_RENDER');
            if (
              result.metricDetails.some(
                (item) => item.status === 'NOT_IMPLEMENTED',
              )
            )
              result.gaps.push('SOURCE_DETAIL_NOT_IMPLEMENTED');
            if (
              result.scroll.needed &&
              result.scroll.after <= result.scroll.before
            )
              result.failures.push('DOCUMENT_SCROLL_NOT_REACHABLE');
            await page
              .waitForLoadState('networkidle', { timeout: 3000 })
              .catch(() => {
                result.gaps.push('READ_RESOURCES_NOT_QUIET_WITHIN_BOUND');
              });
            if (errors.length || consoleErrors.length || activeRequests.length)
              result.failures.push('BROWSER_OR_READ_BOUNDARY_ERROR');
            result.technicalStatus = result.failures.length
              ? 'FAIL'
              : result.gaps.length
                ? 'BLOCKED'
                : 'PASS';
          } catch (error) {
            result.technicalStatus = 'FAIL';
            result.failure = String(error);
            result.playability = {
              status: 'BLOCKED',
              reason: 'RENDER_OR_INTERACTION_FAILED',
            };
          }
          if (
            evidenceDirectory &&
            result.technicalStatus !== 'PASS' &&
            evidenceScreenshots < maxEvidenceScreenshots
          ) {
            await mkdir(evidenceDirectory, { recursive: true });
            result.screenshot = path.join(
              evidenceDirectory,
              `${country}-${role}-${viewport}.png`,
            );
            await page.screenshot({ path: result.screenshot, fullPage: true });
            evidenceScreenshots += 1;
          }
          cell.viewports.push(result);
        }
        cell.technicalStatus = cell.viewports.some(
          (row) => row.technicalStatus === 'FAIL',
        )
          ? 'FAIL'
          : cell.viewports.some((row) => row.technicalStatus === 'BLOCKED')
            ? 'BLOCKED'
            : 'PASS';
        cell.playabilityStatus = 'BLOCKED_NOT_FULL_ECONOMIC_LOOP';
      }
    const missingDataProbes = [];
    for (const country of countries) {
      // Expected fault-probe 404/console events must not leak into the last
      // normal cell's array references or be mistaken for normal rendering.
      errors = [];
      consoleErrors = [];
      activeRequests = [];
      loadingProbe = null;
      missingCountry = country;
      await page.goto(
        new URL(
          `season1-immersive/?role=${roles[0]}&country=${country}#country`,
          base,
        ).href,
        { waitUntil: 'load' },
      );
      await page
        .waitForFunction(
          () => /unavailable|缺失|不可用/iu.test(document.body.innerText),
          null,
          { timeout: 8000 },
        )
        .catch(() => {});
      const probe = await page.evaluate(() => ({
        countryId: window.CountryGame?.country?.()?.id ?? null,
        gameVisible: !!document.querySelector('.country-game'),
        text:
          document.querySelector('#game')?.innerText ?? document.body.innerText,
      }));
      const missingProbe = {
        country,
        ...probe,
        loading: loadingProbe ?? { status: 'NOT_OBSERVED' },
        errors,
        consoleErrors,
        requests: activeRequests,
        status:
          !probe.countryId &&
          !probe.gameVisible &&
          /unavailable|缺失|不可用/iu.test(probe.text) &&
          !/Avenor|North Harbour|北港|120,000,000/u.test(probe.text)
            ? 'PASS_NO_FALLBACK'
            : 'FAIL_FALLBACK_OR_NO_MISSING_STATE',
      };
      missingDataProbes.push(missingProbe);
      if (
        missingProbe.status !== 'PASS_NO_FALLBACK' ||
        loadingProbe?.status === 'FAIL_LOADING_FALLBACK'
      )
        for (const cell of matrix.filter(
          (row) => row.country === country && row.technicalStatus !== 'NOT_RUN',
        )) {
          cell.technicalStatus = 'FAIL';
          cell.missingDataProbeStatus = missingProbe.status;
          cell.loadingProbeStatus = loadingProbe?.status ?? 'NOT_OBSERVED';
        }
      missingCountry = null;
    }
    return {
      schemaVersion: COUNTRY_ROLE_QA_SCHEMA,
      runKind,
      startedAt,
      completedAt: new Date().toISOString(),
      targetSha: inputs.checkoutSha,
      deploymentVerified: false,
      baseline: inputs.baseline,
      runtimeAuthority: false,
      viewports: QA_VIEWPORTS,
      coverage: {
        targetCombinations: 420,
        requested: countries.length * roles.length,
        executed: matrix.filter((row) => row.technicalStatus !== 'NOT_RUN')
          .length,
        notRun: matrix.filter((row) => row.technicalStatus === 'NOT_RUN')
          .length,
        full420Executed: full,
      },
      resourceCache: statistics,
      evidence: {
        screenshots: evidenceScreenshots,
        limit: maxEvidenceScreenshots,
      },
      technicalSummary: Object.fromEntries(
        ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].map((status) => [
          status,
          matrix.filter((row) => row.technicalStatus === status).length,
        ]),
      ),
      matrix,
      missingDataProbes,
      fullPlayabilityAcceptance:
        'NOT_GRANTED_READ_ONLY_AUDIT_AND_HUMAN_REVIEW_REQUIRED',
    };
  } finally {
    await context.close();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2),
    option = (flag) => args[args.indexOf(flag) + 1];
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const expectedSha = args.includes('--sha') ? option('--sha') : '';
  const inputs = await countryRoleInputs(root, expectedSha);
  const full = args.includes('--full');
  if (
    execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
  )
    throw new Error('COUNTRY_ROLE_RUN_REQUIRES_CLEAN_TRACKED_CHECKOUT');
  const output = args.includes('--output')
    ? path.resolve(option('--output'))
    : null;
  if (!output) throw new Error('COUNTRY_ROLE_NEW_OUTPUT_FILE_REQUIRED');
  const preview = await countryRolePreview(root, inputs.checkoutSha);
  let runtime;
  try {
    runtime = await countryRoleBrowser();
    const result = await runCountryRoleAudit({
      browser: runtime.browser,
      inputs,
      baseUrl: preview.baseUrl,
      countries: full
        ? QA_COUNTRIES
        : args.includes('--countries')
          ? option('--countries').split(',')
          : ['02', '70'],
      roles: full
        ? QA_ROLES
        : args.includes('--roles')
          ? option('--roles').split(',')
          : ['finance'],
      runKind: full ? 'FULL_INTEGRATED' : 'SAMPLE_LOCAL',
      confirmIntegrationSha: args.includes('--confirm-integration-sha')
        ? option('--confirm-integration-sha')
        : null,
      evidenceDirectory: `${output}.evidence`,
    });
    result.browser = {
      engine: 'Chromium',
      version: runtime.version,
      modulePath: runtime.modulePath,
    };
    result.harnessSha256 = sha256(
      await readFile(fileURLToPath(import.meta.url)),
    );
    await writeFile(output, JSON.stringify(result, null, 2) + '\n', {
      flag: 'wx',
    });
    process.stdout.write(
      JSON.stringify({
        output,
        coverage: result.coverage,
        missingDataProbes: result.missingDataProbes.map(
          ({ country, status }) => ({ country, status }),
        ),
      }) + '\n',
    );
  } finally {
    await runtime?.browser.close();
    await preview.close();
  }
}
