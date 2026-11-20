/* global document, window, contextCountrySource, contextCountry -- isolated Playwright page callbacks. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { countryRolePreview } from '../../scripts/country-role-qa.mjs';
import { OFFICIAL_DATASETS } from '../../apps/world-api/src/integration/official-dataset-registry.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const selectionChecksumSha256 =
  '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';
const metadata = (slug) => {
  const spec = OFFICIAL_DATASETS.find((row) => row.slug === slug);
  return {
    schemaVersion: 'official-source-dataset-v1',
    dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
    packageId: 'BALANCED_2026_09_28_V1',
    selectionChecksumSha256,
    dataset: slug,
    sourcePath: spec.sourcePath,
    sourceSha256: spec.sha256,
    sourceBytes: spec.bytes,
    sourceKind: spec.kind,
    numericEncoding: 'DECIMAL_STRING_EXACT',
    unitTreatment: 'SOURCE_UNITS_PRESERVED_NO_CONVERSION',
    unitsSourcePath: 'DATA_DICTIONARY.md',
    associations: {
      countryFields: spec.countryFields,
      entityFields: spec.entityFields,
      referenceFields: spec.referenceFields,
    },
    proposalFieldsAreExecuted: false,
    liveWorldState: false,
  };
};
const catalogue = {
  ok: true,
  schemaVersion: 'official-source-catalog-v1',
  dataNature: 'OFFICIAL_SELECTED_SOURCE_DATASET',
  packageId: 'BALANCED_2026_09_28_V1',
  selectionChecksumSha256,
  datasetCount: 34,
  databaseAvailability: 'VERIFY_PER_REQUEST',
  liveWorldState: false,
  datasets: OFFICIAL_DATASETS.map((row) => metadata(row.slug)),
};
export async function verifyBrowserEvidence(output, capabilities) {
  let mode = 'empty',
    release = () => {},
    activeDelay = false;
  const network = [],
    cases = [],
    errors = [];
  const fixture = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    network.push({
      method: request.method,
      path: url.pathname,
      query: url.search,
      mode,
    });
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('content-type', 'application/json');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-source-classification', 'TEST_ONLY');
    if (request.method !== 'GET') {
      response.writeHead(405);
      response.end('{}');
      return;
    }
    if (url.pathname.endsWith('/datasets')) {
      response.end(JSON.stringify(catalogue));
      return;
    }
    if (url.pathname.includes('/countries/')) {
      response.writeHead(503);
      response.end('{"ok":false}');
      return;
    }
    const slug = url.pathname.split('/').at(-1);
    if (slug === 'geography') {
      response.end(
        JSON.stringify(
          url.searchParams.has('section')
            ? {
                ok: true,
                ...metadata(slug),
                section: 'partition.coastPath',
                fragment: 'abcd',
                fragmentLength: 4,
                fragmentOffset: 0,
                totalLength: 8,
                nextFragmentOffset: 0,
              }
            : {
                ok: true,
                ...metadata(slug),
                sections: ['partition.coastPath'],
              },
        ),
      );
      return;
    }
    if (slug !== 'finance') {
      response.writeHead(404);
      response.end('{}');
      return;
    }
    if (mode === 'unavailable') {
      response.writeHead(503);
      response.end('{"ok":false}');
      return;
    }
    const countryId = url.searchParams.get('countryId'),
      offset = Number(url.searchParams.get('offset'));
    const payload = {
      ok: true,
      ...metadata(slug),
      offset,
      filters: { countryId, entityId: null, referenceId: null },
      total: 0,
      returned: 0,
      nextOffset: null,
      items: [],
    };
    if (mode === 'invalid') Object.assign(payload, { total: 2, nextOffset: 0 });
    if (mode === 'normal' || mode === 'delay')
      Object.assign(payload, {
        total: 2,
        returned: 1,
        nextOffset: offset === 0 ? 1 : null,
        items: [
          {
            id: `TEST_ONLY_FINANCE_${offset}`,
            countryId,
            note: 'Synthetic transport fixture; not official economic data',
          },
        ],
      });
    if (mode === 'delay') {
      activeDelay = true;
      release = () => {
        response.end(JSON.stringify(payload));
        activeDelay = false;
      };
    } else response.end(JSON.stringify(payload));
  });
  let fixtureOrigin, preview, browser, context, page, drawer;
  const open = async (slug = 'finance') => {
    if (await drawer.isVisible())
      await drawer.locator('[data-cmd="country-dismiss"]').click();
    await page.locator('[data-cmd="country-source"]').first().click();
    await page
      .locator(`[data-cmd="country-source-dataset"][data-slug="${slug}"]`)
      .click();
  };
  const check = async (name, run) => {
    const before = network.length;
    await run();
    cases.push({
      name,
      status: 'PASS_TEST_ONLY',
      networkRequests: network.length - before,
    });
    console.log(JSON.stringify(cases.at(-1)));
  };
  const sourceFiles = [
    'apps/world-web/public/season1-immersive/country-context.js',
    'apps/world-web/public/season1-immersive/country-game.js',
    'apps/world-web/src/country-runtime/staged-reservation-client.ts',
    'tests/world-web/office-connection-status.test.ts',
    'tools/office-connection/browser-evidence.mjs',
    'apps/world-api/src/integration/official-dataset-registry.ts',
    'apps/world-web/public/season1-immersive/countries/data/01.json',
    'apps/world-web/public/season1-immersive/countries/data/02.json',
    'scripts/country-role-qa.mjs',
  ];
  const readBindings = () =>
    Promise.all(
      sourceFiles.map(async (file) => ({
        file,
        sha256: createHash('sha256')
          .update(await readFile(path.join(root, file)))
          .digest('hex'),
      })),
    );
  let failure = null;
  let sha = null;
  let workingTreeDirty = null;
  let startedBindings = null;
  let result;
  try {
    startedBindings = await readBindings();
    const { chromium } = await import(
      pathToFileURL(capabilities.playwrightModule).href
    );
    await new Promise((resolve, reject) => {
      fixture.once('error', reject);
      fixture.listen(0, '127.0.0.1', resolve);
    });
    fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
    sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    workingTreeDirty =
      execFileSync('git', ['status', '--porcelain'], {
        cwd: root,
        encoding: 'utf8',
      }).trim().length > 0;
    preview = await countryRolePreview(root, sha);
    browser = await chromium.launch({
      headless: true,
      executablePath: capabilities.executable,
      args: [
        '--disable-background-networking',
        ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
      ],
    });
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await context.addInitScript((apiOrigin) => {
      window.__ECONMIND_WORLD_READ_CONFIG__ = { apiOrigin };
    }, fixtureOrigin);
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        ? route.continue()
        : route.abort();
    });
    page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.on('pageerror', (error) => errors.push(error.message));
    drawer = page.locator('.national-drawer');
    await page.goto(
      new URL(
        'season1-immersive/?role=finance&country=01#country',
        preview.baseUrl,
      ).href,
    );
    await page.locator('.country-game').waitFor();
    await check(
      'actual static selected country loads without World/Clock',
      async () => {
        assert.equal(
          await page.locator('[data-national-time]').innerText(),
          'Not started',
        );
        assert.equal(
          await page.locator('.national-confirm').isDisabled(),
          true,
        );
        assert.equal(await page.locator('#world-clock').count(), 0);
        assert.equal(
          await page.evaluate(() => contextCountrySource.runtime),
          'NOT_CONNECTED',
        );
      },
    );
    await check(
      'actual HTTP zero-row result is displayed as no source rows',
      async () => {
        mode = 'empty';
        await open();
        await drawer
          .getByText('No source row for this country.', { exact: true })
          .waitFor();
      },
    );
    await check(
      'actual HTTP non-progress page is invalid rather than no-data',
      async () => {
        mode = 'invalid';
        await open();
        await drawer
          .getByText('Source check failed. No value substituted.', {
            exact: true,
          })
          .waitFor();
        assert.equal(
          await drawer
            .getByText('No source row for this country.', { exact: true })
            .count(),
          0,
        );
      },
    );
    await check(
      'actual HTTP 503 is unavailable rather than no-data',
      async () => {
        mode = 'unavailable';
        await open();
        await drawer
          .getByText('Source unavailable. No value substituted.', {
            exact: true,
          })
          .waitFor();
      },
    );
    await check(
      'actual HTTP page navigation advances to the requested offset',
      async () => {
        mode = 'normal';
        await open();
        await drawer
          .getByText('TEST_ONLY_FINANCE_0', { exact: true })
          .waitFor();
        await drawer.locator('[data-cmd="country-source-more"]').click();
        await drawer
          .getByText('TEST_ONLY_FINANCE_1', { exact: true })
          .waitFor();
        assert.equal(
          await drawer.locator('[data-cmd="country-source-more"]').count(),
          0,
        );
        assert(network.at(-1).query.includes('offset=1'));
      },
    );
    await check('actual HTTP invalid map fragment is rejected', async () => {
      await open('geography');
      await drawer.locator('[data-section="partition.coastPath"]').click();
      await drawer
        .getByText('Source check failed. No value substituted.', {
          exact: true,
        })
        .waitFor();
    });
    await check(
      'closing drawer retires a delayed actual HTTP source response',
      async () => {
        mode = 'delay';
        await open();
        await page.waitForFunction(() =>
          document
            .querySelector('.national-drawer')
            .textContent.includes('Reading finance'),
        );
        const until = Date.now() + 5_000;
        while (!activeDelay && Date.now() < until)
          await new Promise((resolve) => setTimeout(resolve, 10));
        assert(
          activeDelay,
          'Delayed fixture request did not reach the loopback server',
        );
        await drawer.locator('[data-cmd="country-dismiss"]').click();
        release();
        await page.waitForTimeout(100);
        assert.equal(await drawer.isHidden(), true);
        mode = 'normal';
        await open();
        await drawer
          .getByText('TEST_ONLY_FINANCE_0', { exact: true })
          .waitFor();
      },
    );
    await check(
      'role navigation reloads public source session without a seat grant',
      async () => {
        await drawer.locator('[data-cmd="country-dismiss"]').click();
        await page
          .locator('select[data-country-role-switch]')
          .selectOption('trade');
        await page.waitForURL('**/?role=trade&country=01#country');
        await page.locator('.country-game').waitFor();
        await open();
        await drawer
          .getByText('TEST_ONLY_FINANCE_0', { exact: true })
          .waitFor();
        assert.equal(
          await page.locator('.national-confirm').isDisabled(),
          true,
        );
        assert.equal(
          await page.evaluate(() => contextCountrySource.runtime),
          'NOT_CONNECTED',
        );
      },
    );
    await check(
      'country navigation scopes subsequent actual HTTP source requests',
      async () => {
        await page.goto(
          new URL(
            'season1-immersive/?role=finance&country=02#country',
            preview.baseUrl,
          ).href,
        );
        await page.locator('.country-game').waitFor();
        await open();
        await drawer
          .getByText('TEST_ONLY_FINANCE_0', { exact: true })
          .waitFor();
        assert(network.at(-1).query.includes('countryId=visual-territory-02'));
        assert.equal(
          await page.evaluate(() => contextCountry.id),
          'visual-territory-02',
        );
      },
    );
    assert.deepEqual(errors, []);
    assert(network.every((request) => request.method === 'GET'));
  } catch (error) {
    failure = String(error?.stack ?? error);
    if (page)
      await page
        .screenshot({ path: `${output}.failure.png` })
        .catch(() => undefined);
    console.error(failure);
  } finally {
    const finishedBindings = await readBindings().catch(() => {
      failure = 'SOURCE_BINDING_UNAVAILABLE';
      return [];
    });
    if (
      startedBindings &&
      JSON.stringify(startedBindings) !== JSON.stringify(finishedBindings)
    ) {
      failure = 'SOURCE_BYTES_CHANGED_DURING_BROWSER_RUN';
    }
    const evidence = {
      schemaVersion: 'office-frontend-browser-evidence-v1',
      checkedAt: new Date().toISOString(),
      checkoutHead: sha,
      workingTree:
        workingTreeDirty === null
          ? 'NOT_OBSERVED'
          : workingTreeDirty
            ? 'DIRTY_IMPLEMENTATION_UNCOMMITTED'
            : 'CLEAN_CHECKOUT',
      browser: {
        executable: capabilities.executable,
        version: browser?.version() ?? null,
        playwrightModule: capabilities.playwrightModule,
      },
      sourceClassification: {
        page: 'ACTUAL_TRACKED_STATIC_PAGE',
        countryRows: 'BUNDLED_SELECTED_SOURCE',
        sourceResponses: 'TEST_ONLY_SYNTHETIC_HTTP_FIXTURES',
        economicAcceptance: 'NOT_RUN',
        productionConnectivity: 'NOT_RUN',
        stagedRuntimeBrowserAcceptance: 'NOT_RUN',
      },
      script: {
        path: 'tools/office-connection/browser-evidence.mjs',
        sha256: createHash('sha256')
          .update(await readFile(fileURLToPath(import.meta.url)))
          .digest('hex'),
      },
      files: finishedBindings,
      cases,
      pageErrors: errors,
      requests: network,
      failure,
      status: failure ? (browser ? 'FAIL' : 'BLOCKED') : 'PASS_TEST_ONLY',
    };
    release();
    const cleanup = await Promise.allSettled([
      browser?.close(),
      preview?.close(),
      fixture.listening
        ? new Promise((resolve, reject) =>
            fixture.close((error) => (error ? reject(error) : resolve())),
          )
        : undefined,
    ]);
    evidence.cleanup = cleanup.map((result) => result.status);
    if (cleanup.some((result) => result.status === 'rejected'))
      evidence.status = 'FAIL';
    await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    result = evidence;
  }
  return result;
}

export async function browserCapabilities(environment = process.env) {
  const result = {
    platform: process.platform,
    playwrightModule:
      environment.OFFICE_BROWSER_PLAYWRIGHT_MODULE ??
      environment.PLAYWRIGHT_MODULE ??
      (process.platform === 'linux'
        ? '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
        : null),
    executable:
      environment.OFFICE_BROWSER_EXECUTABLE ??
      environment.CHROMIUM_PATH ??
      (process.platform === 'linux' ? '/usr/bin/chromium' : null),
    status: 'BLOCKED',
    reasons: [],
  };
  if (process.platform !== 'linux')
    result.reasons.push('SUPPORTED_LINUX_RUNTIME_REQUIRED');
  for (const [key, permission] of [
    ['playwrightModule', constants.R_OK],
    ['executable', constants.X_OK],
  ]) {
    const value = result[key];
    if (typeof value !== 'string' || !path.isAbsolute(value)) {
      result.reasons.push(`${key.toUpperCase()}_ABSOLUTE_LOCAL_FILE_REQUIRED`);
      continue;
    }
    try {
      if (!(await stat(value)).isFile()) throw Error('NOT_A_FILE');
      await access(value, permission);
    } catch {
      result.reasons.push(`${key.toUpperCase()}_UNAVAILABLE`);
    }
  }
  if (!result.reasons.length) result.status = 'AVAILABLE';
  return result;
}

export async function main(args = []) {
  const mode = args[0] ?? '--plan';
  if (
    !['--plan', '--verify'].includes(mode) ||
    !(args.length <= 1 || (args.length === 3 && args[1] === '--out' && args[2]))
  )
    throw Error('Use --plan (default), or --verify --out NEW_EVIDENCE_PATH');
  if (mode === '--verify' && !args[2])
    throw Error('VERIFY_REQUIRES_NEW_EVIDENCE_PATH');
  const output = args[2] ? path.resolve(args[2]) : null;
  if (output) {
    try {
      await stat(output);
      throw Error('EVIDENCE_PATH_ALREADY_EXISTS');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const runtime = await browserCapabilities();
  if (mode === '--verify' && runtime.status === 'AVAILABLE') {
    const evidence = await verifyBrowserEvidence(output, runtime);
    process.stdout.write(
      JSON.stringify({
        output,
        status: evidence.status,
        cases: evidence.cases.length,
      }) + '\n',
    );
    return evidence.status === 'PASS_TEST_ONLY'
      ? 0
      : evidence.status === 'BLOCKED'
        ? 2
        : 1;
  }
  const plan = {
    schemaVersion: 'office-frontend-browser-plan-v1',
    mode: 'PLAN_ONLY_NO_REQUESTS',
    runtime,
    browserAcceptance: 'NOT_RUN',
    status: runtime.status === 'AVAILABLE' ? 'NOT_RUN' : 'BLOCKED',
    page: 'Actual tracked Season1 static country page on an owned loopback preview',
    responseSource:
      'TEST_ONLY synthetic HTTP catalogue/rows on a separate owned loopback server',
    authority:
      'NO_ADMISSION_NO_COMMANDS_NO_WORLD_NO_CLOCK_NO_PRODUCTION_REQUESTS',
    scenarios: [
      'static-country-no-world-clock',
      'zero-source-rows',
      'non-progress-page-invalid',
      'http-503-unavailable',
      'next-page-offset',
      'invalid-map-fragment',
      'dismiss-late-response',
      'role-navigation-no-seat-grant',
      'country-filter-on-navigation',
    ],
    stagedRuntimeBrowserAcceptance: 'NOT_RUN',
    command:
      'node tools/office-connection/browser-evidence.mjs --verify --out NEW_EVIDENCE_PATH',
  };
  if (output)
    await writeFile(output, JSON.stringify(plan, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
  return mode === '--verify' ? 2 : 0;
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(
        `OFFICE_BROWSER_EVIDENCE_FAILED: ${error.message}\n`,
      );
      process.exitCode = 1;
    });
}
