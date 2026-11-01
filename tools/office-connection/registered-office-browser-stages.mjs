/* global window -- actual Chromium evaluation context, never server globals. */
/** Finite live-backend Chromium stages. No backend, World, consumer, clock,
 * source facts, DTO builder, fixture responses or credentials are created here. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { createFixedOfficeBrowserApplication } from './fixed-office-command-browser.mjs';
import { createRegisteredOfficeBrowserAcceptance } from './registered-office-browser-acceptance.mjs';
const ROLES = Object.freeze({
  captain: 'CAPTAIN',
  finance: 'FINANCE',
  central_bank: 'CENTRAL_BANK',
  industry: 'INDUSTRY',
  trade: 'TRADE',
  social: 'SOCIAL',
});
const API_PATHS = new Set([
  '/v1/postwar-office-runtime',
  '/v1/office-command',
  '/v1/command-recovery',
]);
function ownedOrigin(value) {
  const u = new URL(value);
  assert.equal(u.protocol, 'http:');
  assert.equal(u.hostname, '127.0.0.1');
  assert.equal(u.pathname, '/');
  assert.equal(u.username + u.password + u.search + u.hash, '');
  return u.origin;
}
const head = (value) =>
  value
    ? { worldVersion: value.worldVersion, eventSequence: value.eventSequence }
    : null;
const count = (rows, key) =>
  rows.filter((r) => r.method === 'POST' && r.path === key).length;
const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Tokens stay only in process/page memory. The caller owns its existing child,
 * actual command builders/RPC/DB permissions; this adapter never invokes them. */
export async function createRegisteredOfficeBrowserStages(input) {
  assert.ok(path.isAbsolute(input.evidenceDir));
  let backend = ownedOrigin(input.actualOrigin),
    ownedBrowser = false,
    browser = input.browser,
    application,
    closed = false;
  const sessions = new Set(),
    managers = [],
    records = [];
  const evidence = {
    classification:
      'ACTUAL_REGISTERED_BACKEND_CHROMIUM_SHIPPED_OFFICE_DRAWER_NOT_FULL_MAIN_SITE',
    backendStartedHere: false,
    worldCreatedHere: false,
    consumerStartedHere: false,
    clockStartedHere: false,
    syntheticResponses: false,
    platformTls: 'NOT_VERIFIED_BY_OWNED_LOOPBACK_PROXY',
    notRun: [
      {
        office: 'INDUSTRY',
        family: 'CORE_INDUSTRY_PRODUCTION_V1',
        reason:
          'ACTUAL_UTILITY_AND_COMPLETE_QUALIFIED_INPUT_CHAIN_NOT_ESTABLISHED_BY_BROWSER_STAGE',
      },
    ],
    records,
  };
  let manager;
  const options = {
    readConfiguration: input.readConfiguration,
    authSubject: input.authSubject,
    countryId: input.countryId,
    countryDisplayId: input.countryDisplayId,
    applicationOrigin: input.applicationOrigin,
    getAccessToken: input.getAccessToken,
  };
  function live() {
    assert.equal(closed, false, 'BROWSER_STAGE_RETIRED');
  }
  async function makeManager() {
    const m = await createRegisteredOfficeBrowserAcceptance({
      browser,
      application,
      apiBaseURL: backend,
      ...options,
    });
    managers.push(m);
    return m;
  }
  async function save() {
    await mkdir(input.evidenceDir, { recursive: true });
    await writeFile(
      path.join(input.evidenceDir, 'browser-stages.json'),
      JSON.stringify(evidence, null, 2) + '\n',
    );
  }
  async function accessToken() {
    const token = await input.getAccessToken();
    assert.match(token, /^Bearer [A-Za-z0-9._-]+$/u);
    return token.slice(7);
  }
  try {
    if (!browser) {
      const module =
          input.playwrightModule ??
          process.env.OFFICE_BROWSER_PLAYWRIGHT_MODULE ??
          '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',
        executable =
          input.chromiumExecutable ??
          process.env.OFFICE_BROWSER_EXECUTABLE ??
          '/usr/bin/chromium';
      assert.ok(path.isAbsolute(module) && path.isAbsolute(executable));
      const { chromium } = await import(pathToFileURL(module).href);
      browser = await chromium.launch({
        headless: true,
        executablePath: executable,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      ownedBrowser = true;
    }
    assert.equal(browser.browserType().name(), 'chromium');
    application = await createFixedOfficeBrowserApplication();
    evidence.bundleSha256 = application.bundleSha256;
    manager = await makeManager();
  } catch (error) {
    const failures = [];
    try {
      await application?.close();
    } catch (e) {
      failures.push(e);
    }
    try {
      if (ownedBrowser) await browser?.close();
    } catch (e) {
      failures.push(e);
    }
    if (failures.length)
      throw new AggregateError(
        [error, ...failures],
        'BROWSER_STAGE_CONSTRUCTION_AND_CLEANUP_FAILED',
        { cause: error },
      );
    throw error;
  }
  async function open(role) {
    live();
    assert.ok(Object.hasOwn(ROLES, role));
    const base = await manager.openOffice(role),
      page = base.page,
      requests = [],
      responses = [],
      networkFailures = [];
    const apiOrigin = input.readConfiguration.endpointPins.origin;
    // Fixed passthrough only, including after an owned child restarts on a new
    // ephemeral port. Never synthesize a backend response or retry a command.
    await page.context().route('**/*', async (route) => {
      const request = route.request(),
        u = new URL(request.url());
      if (u.origin !== apiOrigin || !API_PATHS.has(u.pathname)) {
        await route.fallback();
        return;
      }
      requests.push({ method: request.method(), path: u.pathname });
      try {
        const headers = await request.allHeaders();
        delete headers.host;
        delete headers.cookie;
        const body = request.postDataBuffer();
        const response = await page
          .context()
          .request.fetch(backend + u.pathname + u.search, {
            method: request.method(),
            headers,
            ...(body ? { data: body } : {}),
            maxRedirects: 0,
            timeout: 12000,
          });
        responses.push({
          method: request.method(),
          path: u.pathname,
          status: response.status(),
        });
        await route.fulfill({ response });
      } catch {
        networkFailures.push('ACTUAL_OWNED_BACKEND_REQUEST_FAILED');
        await route.abort('failed').catch(() => undefined);
      }
    });
    async function configureActual() {
      const current = await manager.currentSeat(),
        authority = current.bindings.find(
          (a) => a.identity.officeId === ROLES[role],
        );
      assert.ok(authority);
      const binding = {
        read: {
          identity: authority.identity,
          world: input.readConfiguration.admittedWorldPins,
          endpoints: input.readConfiguration.endpointPins,
          seatRef: authority.seatRef,
          session: { sessionRef: 'ACTUAL_BROWSER_STAGE_' + randomUUID() },
        },
        view: { role, countryDisplayId: input.countryDisplayId },
        endpoint: {
          origin: apiOrigin,
          path: '/v1/office-command',
          deploymentRef: input.readConfiguration.endpointPins.deploymentRef,
        },
      };
      const token = await accessToken();
      await page.evaluate(
        ({ binding, token }) => {
          let jwt = token;
          const supplied = {
            ...binding,
            get accessToken() {
              return jwt;
            },
          };
          window.EconMindFixedOfficeProbe.configure(supplied);
          window.EconMindRegisteredStageToken = (next) => {
            jwt = next;
          };
        },
        { binding, token },
      );
      return authority;
    }
    await configureActual();
    // Reconfiguration removes the previous private shell and creates a fresh one.
    await page.locator('[data-office-command-action="open"]').click();
    let retired = false,
      original = null;
    const state = () =>
      page.evaluate(() => window.EconMindFixedOfficeProbe.state());
    async function record(operation, s, extra = {}) {
      const p = s?.runtimePage;
      const entry = {
        role,
        operation,
        status: s?.status ?? 'MISSING',
        code: s?.code ?? null,
        receipt: s?.receipt
          ? {
              outcome: s.receipt.outcome,
              commandId: s.receipt.commandId,
              worldVersionBefore: s.receipt.worldVersionBefore,
              worldVersionAfter: s.receipt.worldVersionAfter,
            }
          : null,
        projection: p
          ? {
              status: p.status,
              dataset: p.dataset,
              dataNature: p.source.dataNature,
              currentHead: head(p.authority.readback),
              originHead: {
                worldVersion:
                  p.source.originWorldVersion ?? p.source.worldVersion,
                eventSequence:
                  p.source.originEventSequence ?? p.source.eventSequence,
              },
              rows: p.page.returned,
              total: p.page.total,
              observedRowsSha256: digest(p.rows),
            }
          : null,
        requestCounts: {
          submit: count(requests, '/v1/office-command'),
          recover: count(requests, '/v1/command-recovery'),
          read: count(requests, '/v1/postwar-office-runtime'),
        },
        responses: responses.map((r) => ({ ...r })),
        networkFailures: [...networkFailures],
        ...extra,
      };
      records.push(entry);
      await save();
      return s;
    }
    async function read(expectation = {}) {
      live();
      assert.equal(retired, false);
      const s = await base.read();
      assert.deepEqual(networkFailures, []);
      if (expectation.status) {
        assert.equal(s.status, expectation.status);
        if (s.status === 'UNAVAILABLE') assert.equal(s.runtimePage, null);
      } else {
        assert.ok(
          ['CURRENT_AUTHORIZED_HEAD', 'CURRENT', 'FINAL_VERIFIED'].includes(
            s.status,
          ),
          'ACTUAL_OFFICE_CURRENT_READ_UNAVAILABLE:' +
            role +
            ':' +
            s.status +
            ':' +
            s.code,
        );
        assert.ok(s.runtimePage);
        assert.ok(['PAGE', 'EMPTY'].includes(s.runtimePage.status));
        assert.equal(s.runtimePage.authority.identity.officeId, ROLES[role]);
        assert.equal(
          s.runtimePage.authority.identity.countryId,
          input.countryId,
        );
        assert.equal(
          s.runtimePage.authority.identity.authSubjectId,
          input.authSubject,
        );
        if (expectation.expectedHead)
          assert.deepEqual(
            head(s.runtimePage.authority.readback),
            head(expectation.expectedHead),
          );
      }
      return record('ACTUAL_DOM_READ', s);
    }
    const session = Object.freeze({
      role,
      page,
      state,
      read,
      async submitOnce(dto, { expectedStatus = 'QUEUE_ACK' } = {}) {
        live();
        assert.equal(retired, false);
        assert.notEqual(
          dto.request.commandType,
          'CORE_INDUSTRY_PRODUCTION_V1',
          'INDUSTRY_PRODUCTION_WITHOUT_UTILITIES_IS_NOT_A_BROWSER_POSITIVE',
        );
        assert.equal(dto.request.officeId, ROLES[role]);
        assert.equal(
          dto.request.worldId,
          input.readConfiguration.admittedWorldPins.worldId,
        );
        assert.equal(dto.request.countryId, input.countryId);
        const before = count(requests, '/v1/office-command');
        const s = await base.submitOnce(dto);
        assert.equal(
          count(requests, '/v1/office-command') - before,
          1,
          'ONE_EXPLICIT_BROWSER_SUBMIT_REQUIRED',
        );
        assert.equal(s.status, expectedStatus);
        original = dto;
        return record('ONE_ACTUAL_DOM_SUBMIT', s, {
          commandType: dto.request.commandType,
        });
      },
      async recoverFinal({
        expectedOutcome = 'COMMITTED',
        requireCurrent = true,
        expectedHead,
      } = {}) {
        live();
        assert.equal(retired, false);
        const before = count(requests, '/v1/office-command'),
          s = await base.recover();
        assert.equal(
          count(requests, '/v1/office-command'),
          before,
          'RECOVERY_MUST_NOT_RESUBMIT',
        );
        assert.ok(s.receipt, 'ACTUAL_SERVER_FINAL_NOT_READ');
        assert.equal(s.receipt.outcome, expectedOutcome);
        if (original) {
          assert.equal(s.receipt.commandId, original.request.commandId);
          assert.equal(
            s.receipt.idempotencyKey,
            original.request.idempotencyKey,
          );
        }
        if (requireCurrent) {
          assert.equal(s.status, 'FINAL_VERIFIED');
          assert.ok(s.runtimePage);
          if (expectedHead)
            assert.deepEqual(
              head(s.runtimePage.authority.readback),
              head(expectedHead),
            );
        } else assert.ok(['FINAL_VERIFIED', 'UNAVAILABLE'].includes(s.status));
        return record('ACTUAL_FINAL_AND_READBACK', s);
      },
      async reloadRestore(dto, { recover = false } = {}) {
        live();
        assert.equal(retired, false);
        const before = count(requests, '/v1/office-command');
        await page.reload();
        await page.waitForFunction(() => !!window.EconMindFixedOfficeProbe);
        await configureActual();
        await page.locator('[data-office-command-action="open"]').click();
        assert.equal(
          (await state()).intent,
          null,
          'RELOAD_MUST_NOT_PERSIST_PRIVATE_ORIGINAL',
        );
        await page
          .locator('[data-office-command-draft]')
          .fill(JSON.stringify(dto));
        await page.locator('[data-office-command-action="restore"]').click();
        let s = await state();
        assert.equal(s.status, 'UNKNOWN');
        assert.equal(s.canConfirm, false);
        assert.equal(s.canStage, false);
        assert.equal(
          s.intent.request.expectedWorldVersion,
          dto.request.expectedWorldVersion,
        );
        assert.equal(
          await page
            .locator('[data-office-command-action="confirm"]')
            .isDisabled(),
          true,
        );
        assert.equal(count(requests, '/v1/office-command'), before);
        original = dto;
        if (recover) {
          s = await base.recover();
          assert.equal(count(requests, '/v1/office-command'), before);
        }
        return record('ACTUAL_PAGE_RELOAD_ORIGINAL_QUERY_ONLY', s);
      },
      async setAccessTokenForNextRequest(bearer) {
        live();
        assert.match(bearer, /^Bearer [A-Za-z0-9._-]+$/u);
        await page.evaluate(
          (token) => window.EconMindRegisteredStageToken(token),
          bearer.slice(7),
        );
      },
      async assertDeniedCleared() {
        live();
        const before = responses.length,
          s = await base.read();
        assert.ok(
          responses.slice(before).some((r) => r.status === 403),
          'ACTUAL_BACKEND_403_REQUIRED',
        );
        assert.equal(s.status, 'DENIED');
        for (const k of [
          'intent',
          'receipt',
          'acknowledgement',
          'runtimePage',
          'runParametersPage',
          'model',
        ])
          assert.equal(s[k], null, k + '_MUST_BE_CLEARED');
        assert.equal(s.canConfirm, false);
        assert.equal(s.canRecover, false);
        const content = await page
          .locator('[data-office-command-dialog]')
          .allTextContents();
        if (original)
          assert.equal(
            content.join('').includes(original.request.commandId),
            false,
          );
        return record('ACTUAL_403_PRIVATE_STATE_CLEARED', s);
      },
      async close() {
        if (retired) return;
        retired = true;
        await base.close();
        sessions.delete(session);
      },
    });
    sessions.add(session);
    return session;
  }
  return Object.freeze({
    evidence,
    open,
    async readAll({ expectedHead, expectedByRole = {} } = {}) {
      const results = [];
      for (const role of Object.keys(ROLES)) {
        const session = await open(role);
        try {
          results.push({
            role,
            state: await session.read({
              ...(expectedHead ? { expectedHead } : {}),
              ...(expectedByRole[role] ? { status: expectedByRole[role] } : {}),
            }),
          });
        } finally {
          await session.close();
        }
      }
      return results;
    },
    async setActualOrigin(value) {
      live();
      backend = ownedOrigin(value);
      manager = await makeManager();
      records.push({
        operation: 'OWNED_CHILD_ORIGIN_REBOUND_NO_BACKEND_STARTED',
      });
      await save();
    },
    async close() {
      if (closed) return;
      closed = true;
      const failures = [];
      for (const task of [
        async () => {
          const out = await Promise.allSettled(
            [...sessions].map((s) => s.close()),
          );
          for (const r of out)
            if (r.status === 'rejected') failures.push(r.reason);
        },
        async () => {
          for (const m of managers) await m.close();
        },
        async () => application.close(),
        async () => {
          if (ownedBrowser) await browser.close();
        },
      ])
        try {
          await task();
        } catch (error) {
          failures.push(error);
        }
      await save();
      if (failures.length)
        throw new AggregateError(
          failures,
          'ACTUAL_BROWSER_STAGE_CLEANUP_FAILED',
        );
    },
  });
}
