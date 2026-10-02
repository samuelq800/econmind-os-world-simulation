/* global document, window -- isolated read-only browser callbacks. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  awaitCountryAtlasReturn,
  countryRoleBrowser,
  countryRoleInputs,
  countryRolePreview,
  localAuditUrl,
  QA_COUNTRIES,
  QA_ROLES,
  QA_VIEWPORTS,
} from './country-role-qa.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pageTrees = [
  'apps/world-web/public/season1-immersive',
  'apps/world-web/public/shared',
  'apps/world-web/src/assets/country-scenes',
  'apps/world-web/src/assets/country-detail',
];
export function navigationCases(report) {
  const cases = [],
    seen = new Set();
  for (const cell of report.matrix) {
    if (!QA_COUNTRIES.includes(cell.country) || !QA_ROLES.includes(cell.role))
      throw new Error('NAVIGATION_SOURCE_CASE_INVALID');
    for (const view of cell.viewports) {
      if (!Object.hasOwn(QA_VIEWPORTS, view.viewport))
        throw new Error('NAVIGATION_SOURCE_VIEWPORT_INVALID');
      const key = `${cell.country}:${cell.role}:${view.viewport}`;
      if (seen.has(key)) throw new Error('NAVIGATION_SOURCE_CASE_DUPLICATE');
      seen.add(key);
      if (view.gaps?.includes('IN_APP_ATLAS_RETURN_MISSING'))
        cases.push({
          country: cell.country,
          role: cell.role,
          viewport: view.viewport,
          originalTechnicalStatus: view.technicalStatus,
          originalGaps: view.gaps,
        });
    }
  }
  return cases;
}

export async function navigationSource(
  root,
  expectedSha,
  reportPath,
  expectedReportHash,
) {
  const git = (args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  if (
    !/^[a-f0-9]{40}$/u.test(expectedSha) ||
    git(['rev-parse', 'HEAD']) !== expectedSha ||
    git(['status', '--porcelain', '--untracked-files=no'])
  )
    throw new Error('NAVIGATION_FIXED_CLEAN_CHECKOUT_REQUIRED');
  const bytes = await readFile(reportPath),
    report = JSON.parse(bytes.toString('utf8'));
  if (
    !/^[a-f0-9]{64}$/u.test(expectedReportHash) ||
    digest(bytes) !== expectedReportHash
  )
    throw new Error('NAVIGATION_ORIGINAL_REPORT_HASH_MISMATCH');
  if (
    report.schemaVersion !== 'COUNTRY_ROLE_BROWSER_AUDIT_V1' ||
    report.runKind !== 'FULL_INTEGRATED' ||
    !/^[a-f0-9]{40}$/u.test(report.targetSha) ||
    !report.coverage?.full420Executed ||
    report.coverage.executed !== 420 ||
    report.coverage.notRun !== 0 ||
    report.matrix.length !== 420 ||
    new Set(report.matrix.map((row) => `${row.country}:${row.role}`)).size !==
      420 ||
    report.matrix.some(
      (row) =>
        row.technicalStatus === 'NOT_RUN' ||
        row.viewports.length !== 2 ||
        row.viewports.some((view) => view.technicalStatus === 'NOT_RUN'),
    )
  )
    throw new Error('NAVIGATION_COMPLETED_ORIGINAL_FULL_REPORT_REQUIRED');
  const trees = pageTrees.map((name) => {
    const original = git(['rev-parse', `${report.targetSha}:${name}`]);
    const candidate = git(['rev-parse', `${expectedSha}:${name}`]);
    if (original !== candidate)
      throw new Error(`NAVIGATION_PAGE_TREE_CHANGED:${name}`);
    return { path: name, original, candidate, identical: true };
  });
  return {
    reportPath,
    sha256: expectedReportHash,
    targetSha: report.targetSha,
    candidateSha: expectedSha,
    trees,
    cases: navigationCases(report),
  };
}

async function identity(page) {
  return page.evaluate(() => ({
    countryId: window.CountryGame?.country?.()?.id ?? null,
    number: document.querySelector('.country-game')?.dataset.country ?? null,
    office: document.querySelector('.country-game')?.dataset.office ?? null,
    role: window.GameTest?.role?.() ?? null,
    url: window.location.href,
  }));
}
const matches = (observed, expected, country, role) =>
  observed.countryId === expected.id &&
  observed.number === country &&
  observed.office === role &&
  observed.role === role;

export async function runCountryRoleNavigationRecheck({
  browser,
  inputs,
  baseUrl,
  source,
  evidenceDirectory = null,
}) {
  const base = localAuditUrl(baseUrl),
    startedAt = new Date().toISOString();
  const context = await browser.newContext({
    viewport: QA_VIEWPORTS.desktop,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });
  const cache = new Map(),
    cacheStats = { hits: 0, misses: 0, bytes: 0, evictions: 0 };
  const maxBytes = 256 * 1024 * 1024;
  let requests = [],
    errors = [],
    consoleErrors = [];
  await context.route('**/*', async (route) => {
    const q = route.request(),
      url = new URL(q.url());
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(q.method()) ||
      url.origin !== base.origin ||
      q.headers().authorization
    ) {
      requests.push({
        path: url.pathname,
        status: 'BLOCKED_NON_READ_ONLY_OR_EXTERNAL',
      });
      await route.abort();
      return;
    }
    const key = `${q.method()}:${url.href}`;
    try {
      let entry = cache.get(key);
      if (entry) {
        cacheStats.hits += 1;
        cache.delete(key);
        cache.set(key, entry);
      } else {
        cacheStats.misses += 1;
        const response = await route.fetch({ maxRedirects: 0, timeout: 15000 });
        const body = await response.body();
        entry = {
          status: response.status(),
          headers: response.headers(),
          body,
        };
        for (const name of ['set-cookie', 'content-encoding', 'content-length'])
          delete entry.headers[name];
        if (entry.status === 200 && body.length <= maxBytes) {
          while (cacheStats.bytes + body.length > maxBytes && cache.size) {
            const oldest = cache.keys().next().value;
            cacheStats.bytes -= cache.get(oldest).body.length;
            cache.delete(oldest);
            cacheStats.evictions += 1;
          }
          cache.set(key, entry);
          cacheStats.bytes += body.length;
        }
      }
      const number = /\/countries\/data\/(\d{2})\.json$/u.exec(
        url.pathname,
      )?.[1];
      if (
        entry.status >= 400 ||
        (number &&
          q.method() === 'GET' &&
          digest(entry.body) !== inputs.countries.get(number)?.sha256)
      )
        requests.push({
          path: url.pathname,
          status: 'READ_HTTP_OR_COUNTRY_BYTES_ERROR',
          httpStatus: entry.status,
        });
      await route.fulfill(entry);
    } catch (error) {
      requests.push({
        path: url.pathname,
        status: 'READ_FAILED',
        error: String(error),
      });
      await route.abort();
    }
  });
  if (context.routeWebSocket)
    await context.routeWebSocket('**/*', (socket) => socket.close());
  const page = await context.newPage(),
    rows = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  try {
    for (let index = 0; index < source.cases.length; index += 1) {
      const item = source.cases[index],
        expected = inputs.countries.get(item.country).data;
      requests = [];
      errors = [];
      consoleErrors = [];
      const row = {
        ...item,
        errors,
        consoleErrors,
        requests,
        status: 'NOT_RUN',
      };
      try {
        await page.setViewportSize(QA_VIEWPORTS[item.viewport]);
        await page.goto(
          new URL(
            `season1-immersive/?country=${item.country}&role=${item.role}#country`,
            base,
          ).href,
          { waitUntil: 'load', timeout: 20000 },
        );
        await page.locator('.country-game').waitFor({ timeout: 8000 });
        row.initial = await identity(page);
        if (!matches(row.initial, expected, item.country, item.role))
          throw new Error('NAVIGATION_INITIAL_IDENTITY');
        await page.locator('.national-atlas').click({ timeout: 2000 });
        row.atlasUrl = page.url();
        row.returnEvidence = await awaitCountryAtlasReturn(page, {
          path: new URL('season1-immersive/', base).pathname,
          country: item.country,
          role: item.role,
          countryId: expected.id,
        });
        if (row.returnEvidence.status === 'NOT_IMPLEMENTED')
          row.status = 'BLOCKED';
        else if (row.returnEvidence.status !== 'PASS') row.status = 'FAIL';
        else {
          if (
            evidenceDirectory &&
            (index === 0 || index === source.cases.length - 1)
          ) {
            await mkdir(evidenceDirectory, { recursive: true });
            row.screenshot = path.join(
              evidenceDirectory,
              `${item.country}-${item.role}-${item.viewport}-atlas-return.png`,
            );
            await page.screenshot({ path: row.screenshot, fullPage: true });
          }
          const nextRole =
            QA_ROLES[(QA_ROLES.indexOf(item.role) + 1) % QA_ROLES.length];
          const switcher = page.locator(
            'select[data-country-role-switch]:visible',
          );
          await switcher.selectOption(nextRole, { timeout: 2000 });
          await page.waitForFunction(
            (role) =>
              document.querySelector('.country-game')?.dataset.office === role,
            nextRole,
            { timeout: 8000 },
          );
          row.roleSwitch = await identity(page);
          row.nextRole = nextRole;
          row.status = matches(row.roleSwitch, expected, item.country, nextRole)
            ? 'PASS'
            : 'FAIL';
        }
        await page.waitForLoadState('networkidle', { timeout: 3000 });
        if (requests.length || errors.length || consoleErrors.length)
          row.status = 'FAIL';
      } catch (error) {
        row.status = 'FAIL';
        row.error = String(error);
      }
      rows.push(row);
      if ((index + 1) % 20 === 0 || index + 1 === source.cases.length)
        process.stderr.write(
          JSON.stringify({
            scope: 'NAVIGATION_ONLY_PROGRESS',
            completedViews: index + 1,
            targetViews: source.cases.length,
          }) + '\n',
        );
    }
    return {
      schemaVersion: 'COUNTRY_ROLE_NAVIGATION_RECHECK_V1',
      runKind: 'NAVIGATION_ONLY_RECHECK',
      startedAt,
      completedAt: new Date().toISOString(),
      targetSha: inputs.checkoutSha,
      originalReport: source,
      coverage: {
        requestedViews: source.cases.length,
        executedViews: rows.length,
        countryRoleCombinations: new Set(
          rows.map((row) => `${row.country}:${row.role}`),
        ).size,
      },
      resourceCache: cacheStats,
      rows,
      summary: Object.fromEntries(
        ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN'].map((status) => [
          status,
          rows.filter((row) => row.status === status).length,
        ]),
      ),
      fullBrowserAuditExecuted: false,
      originalMatrixOverwritten: false,
      metricsControlsMissingPerformanceRechecked: false,
      deploymentVerified: false,
      runtimeAuthority: false,
      economicCommandAndFinal: 'NOT_EXERCISED_READ_ONLY',
      fullPlayabilityAcceptance: 'NOT_GRANTED',
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
  for (const flag of [
    '--sha',
    '--source-report',
    '--source-report-sha256',
    '--output',
  ])
    if (!args.includes(flag) || !option(flag))
      throw new Error(`NAVIGATION_OPTION_REQUIRED:${flag}`);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sourcePath = path.resolve(option('--source-report')),
    output = path.resolve(option('--output'));
  if (sourcePath === output)
    throw new Error('NAVIGATION_ORIGINAL_REPORT_CANNOT_BE_OUTPUT');
  const source = await navigationSource(
    root,
    option('--sha'),
    sourcePath,
    option('--source-report-sha256'),
  );
  const inputs = await countryRoleInputs(root, option('--sha'));
  const preview = await countryRolePreview(root, inputs.checkoutSha);
  let runtime;
  try {
    runtime = await countryRoleBrowser();
    const result = await runCountryRoleNavigationRecheck({
      browser: runtime.browser,
      inputs,
      baseUrl: preview.baseUrl,
      source,
      evidenceDirectory: `${output}.evidence`,
    });
    if (digest(await readFile(sourcePath)) !== source.sha256)
      throw new Error('NAVIGATION_ORIGINAL_REPORT_CHANGED_DURING_RUN');
    result.browser = {
      version: runtime.version,
      modulePath: runtime.modulePath,
    };
    result.helperSha256 = digest(
      await readFile(fileURLToPath(import.meta.url)),
    );
    result.atlasWaitHarnessSha256 = digest(
      await readFile(path.join(root, 'scripts/country-role-qa.mjs')),
    );
    await writeFile(output, JSON.stringify(result, null, 2) + '\n', {
      flag: 'wx',
    });
    process.stdout.write(
      JSON.stringify({
        output,
        runKind: result.runKind,
        coverage: result.coverage,
        summary: result.summary,
      }) + '\n',
    );
  } finally {
    await runtime?.browser.close();
    await preview.close();
  }
}
