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
async function verifyBorrowedApplication(application) {
  const origin = ownedOrigin(application.baseURL);
  assert.match(
    application.bundleSha256,
    /^[a-f0-9]{64}$/u,
    'ACTUAL_APPLICATION_BUNDLE_SHA256_REQUIRED',
  );
  const response = await fetch(origin + '/bundle.mjs', {
    redirect: 'error',
    credentials: 'omit',
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200, 'ACTUAL_APPLICATION_BUNDLE_REQUIRED');
  assert.match(
    response.headers.get('content-type') ?? '',
    /(?:javascript|ecmascript)/iu,
  );
  assert.ok(
    Number(response.headers.get('content-length') ?? 0) <= 8388608,
    'BOUNDED_APPLICATION_BUNDLE_REQUIRED',
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(
    bytes.length > 0 && bytes.length <= 8388608,
    'BOUNDED_APPLICATION_BUNDLE_REQUIRED',
  );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    application.bundleSha256,
    'APPLICATION_BYTES_DIFFER_FROM_DECLARED_BUNDLE',
  );
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
    ownedApplication = false,
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
    application = input.application;
    if (!application) {
      application = await createFixedOfficeBrowserApplication();
      ownedApplication = true;
    } else await verifyBorrowedApplication(application);
    evidence.applicationOwnedHere = ownedApplication;
    evidence.borrowedApplicationBytesVerified = !ownedApplication;
    evidence.bundleSha256 = application.bundleSha256;
    manager = await makeManager();
  } catch (error) {
    const failures = [];
    try {
      if (ownedApplication) await application?.close();
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
      submissions = [],
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
        if (
          u.pathname === '/v1/office-command' &&
          request.method() === 'POST'
        ) {
          try {
            submissions.push(JSON.parse(body?.toString('utf8') ?? ''));
          } catch {
            submissions.push(null);
          } // Still forward the actual bytes.
        }
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
        utilityPlanning: s?.utilityPlanningPage
          ? {
              status: s.utilityPlanningPage.status,
              dataset: s.utilityPlanningPage.dataset,
              currentHead: head(s.utilityPlanningPage.authority.readback),
              sourceVersion: s.utilityPlanningPage.source.sourceVersion,
              bindingVersion: s.utilityPlanningPage.source.bindingVersion,
              rows: s.utilityPlanningPage.page.returned,
              total: s.utilityPlanningPage.page.total,
              observedRowsSha256: digest(s.utilityPlanningPage.rows),
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
    async function submitIndustryPowerFromPlanning(
      selection,
      { expectedStatus = 'QUEUE_ACK' } = {},
    ) {
      live();
      assert.equal(retired, false);
      assert.equal(role, 'industry', 'INDUSTRY_BROWSER_SESSION_REQUIRED');
      const common = ['planningRef', 'sourceVersion', 'expectedHead', 'action'];
      assert.ok(
        selection && typeof selection === 'object' && !Array.isArray(selection),
      );
      assert.ok(['BOOK', 'DELIVER'].includes(selection.action));
      const fields =
        selection.action === 'BOOK'
          ? [...common, 'quantity', 'startsAtSimTime', 'endsAtSimTime']
          : common;
      assert.deepEqual(
        Object.keys(selection).sort(),
        fields.sort(),
        'EXACT_POWER_FORM_SELECTION_REQUIRED',
      );
      assert.equal(typeof selection.planningRef, 'string');
      assert.match(selection.sourceVersion, /^sha256:[a-f0-9]{64}$/u);
      assert.ok(
        selection.expectedHead && typeof selection.expectedHead === 'object',
      );
      // A real readback may also carry seed/world metadata. Only its actual
      // two head counters participate in this selection assertion.
      for (const value of [
        selection.expectedHead.worldVersion,
        selection.expectedHead.eventSequence,
      ])
        assert.match(value, /^(0|[1-9][0-9]*)$/u);
      const current = await read({ expectedHead: selection.expectedHead });
      assert.equal(
        current.canStage,
        true,
        'CURRENT_UNUSED_BROWSER_INTENT_REQUIRED',
      );
      const planning = current.utilityPlanningPage;
      assert.ok(
        planning && planning.status === 'PAGE',
        'ACTUAL_UTILITY_PLANNING_PAGE_REQUIRED',
      );
      assert.equal(planning.dataset, 'industry-utility-planning');
      assert.equal(planning.authority.identity.officeId, 'INDUSTRY');
      assert.equal(planning.authority.identity.countryId, input.countryId);
      assert.equal(
        planning.authority.identity.authSubjectId,
        input.authSubject,
      );
      assert.deepEqual(
        head(planning.authority.readback),
        head(selection.expectedHead),
      );
      assert.equal(
        planning.source.sourceVersion,
        selection.sourceVersion,
        'ACTUAL_PLANNING_SELECTION_VERSION_CHANGED',
      );
      const rows = planning.rows.filter(
        (row) => row.planningRef === selection.planningRef,
      );
      assert.equal(rows.length, 1, 'ONE_ACTUAL_SELECTED_PLANNING_ROW_REQUIRED');
      const row = rows[0];
      assert.equal(row.serviceKind, 'POWER');
      assert.equal(row.action, selection.action);
      assert.equal(row.countryId, input.countryId);
      const before = count(requests, '/v1/office-command'),
        beforeCaptured = submissions.length;
      await page
        .locator('[data-industry-utility-field="planningRef"]')
        .selectOption(selection.planningRef);
      for (const [key, value] of [
        ['quantity', selection.quantity],
        ['startsAtSimTime', selection.startsAtSimTime],
        ['endsAtSimTime', selection.endsAtSimTime],
      ]) {
        const field = page.locator(`[data-industry-utility-field="${key}"]`);
        if (selection.action === 'BOOK') {
          assert.equal(typeof value, 'string');
          assert.notEqual(value, '');
          assert.equal(await field.isDisabled(), false);
          await field.fill(value);
        } else {
          assert.equal(await field.isDisabled(), true);
          assert.equal(await field.inputValue(), '');
        }
      }
      await page.locator('[data-industry-utility-action="stage"]').click();
      const staged = await state(),
        dto = staged.intent;
      assert.equal(
        staged.status,
        'REVIEW_REQUIRED',
        'ACTUAL_POWER_FORM_DID_NOT_STAGE',
      );
      assert.ok(dto);
      assert.equal(dto.request.officeId, 'INDUSTRY');
      assert.equal(
        dto.request.commandType,
        'INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1',
      );
      assert.equal(
        dto.request.worldId,
        input.readConfiguration.admittedWorldPins.worldId,
      );
      assert.equal(dto.request.countryId, input.countryId);
      assert.equal(
        dto.request.expectedWorldVersion,
        selection.expectedHead.worldVersion,
      );
      assert.equal(dto.request.payload.serviceKind, 'POWER');
      for (const key of ['facilityId', 'runId', 'sourceRef', 'sourceRawSha256'])
        assert.equal(dto.request.payload[key], row[key]);
      const operation = dto.request.payload.operation;
      assert.equal(operation.action, selection.action);
      if (selection.action === 'DELIVER') {
        assert.deepEqual(
          operation,
          row.parameters.operation,
          'PROTECTED_DELIVERY_REFERENCES_CHANGED',
        );
        assert.deepEqual(Object.keys(operation).sort(), [
          'action',
          'bookingRef',
          'paymentEventFingerprint',
          'workEventFingerprint',
        ]);
      } else {
        assert.equal(operation.outputMWh, selection.quantity);
        assert.equal(operation.fromSimTime, selection.startsAtSimTime);
        assert.equal(operation.throughSimTime, selection.endsAtSimTime);
        assert.equal(operation.purpose, row.parameters.purpose);
      }
      assert.equal(
        count(requests, '/v1/office-command'),
        before,
        'STAGING_MUST_NOT_SUBMIT',
      );
      await page.locator('[data-office-command-action="review"]').click();
      const reviewed = await state();
      assert.equal(reviewed.status, 'REVIEWED');
      assert.deepEqual(reviewed.intent, dto);
      assert.equal(
        count(requests, '/v1/office-command'),
        before,
        'REVIEW_MUST_NOT_SUBMIT',
      );
      original = dto;
      await page.locator('[data-office-command-action="confirm"]').click();
      await page.waitForFunction(
        () => window.EconMindFixedOfficeProbe.state().status !== 'SUBMITTING',
      );
      const result = await state();
      assert.deepEqual(networkFailures, []);
      assert.equal(
        count(requests, '/v1/office-command') - before,
        1,
        'ONE_EXPLICIT_POWER_FORM_SUBMIT_REQUIRED',
      );
      assert.equal(submissions.length - beforeCaptured, 1);
      assert.deepEqual(
        submissions.at(-1),
        dto,
        'ACTUAL_HTTP_ORIGINAL_DIFFERS_FROM_REVIEWED_FORM',
      );
      assert.equal(result.status, expectedStatus);
      assert.equal(
        result.receipt,
        null,
        'ACK_OR_UNKNOWN_IS_NOT_AN_ECONOMIC_FINAL',
      );
      return record('ONE_ACTUAL_POWER_FORM_SUBMIT', result, {
        commandType: dto.request.commandType,
        action: selection.action,
        selectedPlanningRefSha256: digest(selection.planningRef),
        originalPayloadSha256: digest(dto.request.payload),
      });
    }
    async function currentSocialPages(selection, withPositions) {
      live();
      assert.equal(retired, false);
      assert.equal(role, 'social', 'SOCIAL_BROWSER_SESSION_REQUIRED');
      for (const v of [
        selection.expectedHead?.worldVersion,
        selection.expectedHead?.eventSequence,
      ])
        assert.match(v, /^(0|[1-9][0-9]*)$/u);
      const offsets = [
        selection.poolPageOffset,
        ...(withPositions ? [selection.positionPageOffset] : []),
      ];
      assert.ok(
        offsets.every((v) => Number.isSafeInteger(v) && v >= 0),
        'ACTUAL_AUTHORIZED_PAGE_OFFSETS_REQUIRED',
      );
      let current = await read({ expectedHead: selection.expectedHead });
      assert.equal(
        current.canStage,
        true,
        'CURRENT_UNUSED_BROWSER_INTENT_REQUIRED',
      );
      for (const [field, offset, action] of [
        ...(withPositions
          ? [
              [
                'runtimePage',
                selection.positionPageOffset,
                'social-next-positions',
              ],
            ]
          : []),
        ['socialPoolsPage', selection.poolPageOffset, 'social-next-pools'],
      ]) {
        for (let n = 0; current[field]?.page.offset !== offset; n++) {
          assert.ok(n < 64, 'BOUNDED_SOCIAL_PAGE_SELECTION_EXCEEDED');
          const p = current[field];
          assert.ok(
            p &&
              p.page.offset < offset &&
              p.page.nextOffset !== null &&
              p.page.nextOffset <= offset,
            'ACTUAL_SOCIAL_PAGE_NOT_REACHABLE',
          );
          const next = page.locator(`[data-office-command-action="${action}"]`);
          assert.equal(await next.isDisabled(), false);
          await next.click();
          await page.waitForFunction(() => {
            const s = window.EconMindFixedOfficeProbe.state();
            return s.canRead || s.status === 'DENIED' || s.status === 'MISSING';
          });
          current = await state();
          assert.equal(
            current.canStage,
            true,
            'SOCIAL_PAGE_READ_FAILED_OR_RETIRED',
          );
        }
      }
      for (const p of [
        current.socialPoolsPage,
        ...(withPositions ? [current.runtimePage] : []),
      ]) {
        assert.ok(
          p && p.status === 'PAGE',
          'ACTUAL_SOCIAL_SELECTION_PAGE_REQUIRED',
        );
        assert.equal(p.authority.identity.officeId, 'SOCIAL');
        assert.equal(p.authority.identity.countryId, input.countryId);
        assert.equal(p.authority.identity.authSubjectId, input.authSubject);
        assert.deepEqual(
          head(p.authority.readback),
          head(selection.expectedHead),
        );
      }
      assert.equal(current.socialPoolsPage.dataset, 'service-pools');
      return current;
    }
    async function reviewAndSubmitSocial(
      dto,
      before,
      captured,
      operation,
      expectedStatus,
    ) {
      assert.equal(
        count(requests, '/v1/office-command'),
        before,
        'STAGING_MUST_NOT_SUBMIT',
      );
      await page.locator('[data-office-command-action="review"]').click();
      const reviewed = await state();
      assert.equal(reviewed.status, 'REVIEWED');
      assert.deepEqual(reviewed.intent, dto);
      assert.equal(
        count(requests, '/v1/office-command'),
        before,
        'REVIEW_MUST_NOT_SUBMIT',
      );
      original = dto;
      await page.locator('[data-office-command-action="confirm"]').click();
      await page.waitForFunction(
        () => window.EconMindFixedOfficeProbe.state().status !== 'SUBMITTING',
      );
      const result = await state();
      assert.deepEqual(networkFailures, []);
      assert.equal(
        count(requests, '/v1/office-command') - before,
        1,
        'ONE_EXPLICIT_SOCIAL_FORM_SUBMIT_REQUIRED',
      );
      assert.equal(submissions.length - captured, 1);
      assert.deepEqual(
        submissions.at(-1),
        dto,
        'ACTUAL_HTTP_ORIGINAL_DIFFERS_FROM_REVIEWED_FORM',
      );
      assert.equal(result.status, expectedStatus);
      assert.equal(
        result.receipt,
        null,
        'ACK_OR_UNKNOWN_IS_NOT_AN_ECONOMIC_FINAL',
      );
      return record(operation, result, {
        commandType: dto.request.commandType,
        originalPayloadSha256: digest(dto.request.payload),
      });
    }
    function socialOriginal(staged, selection, family) {
      assert.equal(
        staged.status,
        'REVIEW_REQUIRED',
        'ACTUAL_SOCIAL_FORM_DID_NOT_STAGE',
      );
      const dto = staged.intent;
      assert.ok(dto);
      assert.equal(dto.request.commandType, family);
      assert.equal(dto.request.officeId, 'SOCIAL');
      assert.equal(
        dto.request.worldId,
        input.readConfiguration.admittedWorldPins.worldId,
      );
      assert.equal(dto.request.countryId, input.countryId);
      assert.equal(
        dto.request.expectedWorldVersion,
        selection.expectedHead.worldVersion,
      );
      return dto;
    }
    async function submitSocialEmploymentServiceCreateFromCurrent(
      selection,
      { expectedStatus = 'QUEUE_ACK' } = {},
    ) {
      assert.ok(selection && typeof selection === 'object');
      assert.deepEqual(
        Object.keys(selection).sort(),
        [
          'servicePoolId',
          'capacity',
          'sourceVersion',
          'expectedHead',
          'poolPageOffset',
        ].sort(),
        'EXACT_SOCIAL_CREATE_SELECTION_REQUIRED',
      );
      assert.match(selection.capacity, /^[1-9][0-9]{0,77}$/u);
      assert.match(selection.sourceVersion, /^sha256:[a-f0-9]{64}$/u);
      const current = await currentSocialPages(selection, false),
        pool = current.socialPoolsPage;
      assert.equal(
        pool.source.sourceVersion,
        selection.sourceVersion,
        'ACTUAL_SOCIAL_POOL_VERSION_CHANGED',
      );
      const options = pool.source.currentEmploymentServiceCreationOptions;
      assert.equal(
        options?.status,
        'AVAILABLE',
        'ACTUAL_LICENSED_CREATION_OPTIONS_REQUIRED',
      );
      const data = options.data;
      assert.equal(
        data.classification,
        'CURRENT_T0_SERVICE_CREATION_PLANNING_DATA_NOT_AUTHORITY',
      );
      assert.equal(
        data.worldId,
        input.readConfiguration.admittedWorldPins.worldId,
      );
      assert.equal(data.countryId, input.countryId);
      assert.deepEqual(head(data.head), head(selection.expectedHead));
      assert.equal(data.dayIndex, '0');
      const targets = data.rootTargets.filter(
        (r) => r.poolId === selection.servicePoolId,
      );
      assert.equal(
        targets.length,
        1,
        'ONE_ACTUAL_LICENSED_ROOT_TARGET_REQUIRED',
      );
      const target = targets[0];
      assert.ok(
        data.usageLicences.some((l) => l.locationId === target.locationId),
        'ACTUAL_LICENCE_REQUIRED',
      );
      assert.ok(
        BigInt(selection.capacity) <=
          BigInt(target.capacitySlots) -
            BigInt(target.usedSlots) -
            BigInt(target.reservedSlots),
      );
      const before = count(requests, '/v1/office-command'),
        captured = submissions.length;
      await page
        .locator('[data-social-service-create-field="servicePoolId"]')
        .selectOption(selection.servicePoolId);
      await page
        .locator('[data-social-service-create-field="capacity"]')
        .fill(selection.capacity);
      await page.locator('[data-social-service-create-action="stage"]').click();
      const dto = socialOriginal(
          await state(),
          selection,
          'CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1',
        ),
        payload = dto.request.payload;
      assert.equal(
        payload.schemaVersion,
        'social-employment-service-create-v1',
      );
      assert.equal(typeof payload.programmeId, 'string');
      assert.notEqual(payload.programmeId, '');
      assert.deepEqual(
        Object.keys(payload).sort(),
        ['schemaVersion', 'programmeId', 'capacity', 'budget', 'target'].sort(),
      );
      assert.deepEqual(payload.capacity, {
        amount: selection.capacity,
        unit: 'person',
      });
      assert.deepEqual(payload.budget, {
        amount: '0',
        currency: data.localCurrency,
      });
      assert.deepEqual(payload.target, {
        servicePoolId: target.poolId,
        locationId: target.locationId,
        skill: target.skill,
      });
      return reviewAndSubmitSocial(
        dto,
        before,
        captured,
        'ONE_ACTUAL_SOCIAL_CREATE_FORM_SUBMIT',
        expectedStatus,
      );
    }
    async function submitSocialProgrammePlanFromCurrent(
      selection,
      { expectedStatus = 'QUEUE_ACK' } = {},
    ) {
      assert.ok(selection && typeof selection === 'object');
      assert.deepEqual(
        Object.keys(selection).sort(),
        [
          'programmeId',
          'servicePoolId',
          'positionId',
          'requestedMatches',
          'poolSourceVersion',
          'positionSourceVersion',
          'expectedHead',
          'poolPageOffset',
          'positionPageOffset',
        ].sort(),
        'EXACT_SOCIAL_PROGRAMME_PLAN_SELECTION_REQUIRED',
      );
      assert.match(selection.requestedMatches, /^[1-9][0-9]{0,77}$/u);
      for (const version of [
        selection.poolSourceVersion,
        selection.positionSourceVersion,
      ])
        assert.match(version, /^sha256:[a-f0-9]{64}$/u);
      const current = await currentSocialPages(selection, true),
        pools = current.socialPoolsPage,
        positions = current.runtimePage;
      assert.equal(positions.dataset, 'positions');
      assert.equal(pools.source.sourceVersion, selection.poolSourceVersion);
      assert.equal(
        positions.source.sourceVersion,
        selection.positionSourceVersion,
      );
      const options = pools.source.currentEmploymentServiceCreationOptions;
      assert.equal(
        options?.status,
        'AVAILABLE',
        'ACTUAL_PROGRAMME_CHILD_METADATA_REQUIRED',
      );
      assert.equal(
        options.data.classification,
        'CURRENT_T0_SERVICE_CREATION_PLANNING_DATA_NOT_AUTHORITY',
      );
      assert.equal(
        options.data.worldId,
        input.readConfiguration.admittedWorldPins.worldId,
      );
      assert.equal(options.data.countryId, input.countryId);
      assert.deepEqual(head(options.data.head), head(selection.expectedHead));
      const children = options.data.creations.filter(
        (c) =>
          c.programmeId === selection.programmeId &&
          c.childPoolId === selection.servicePoolId,
      );
      assert.equal(
        children.length,
        1,
        'ACTUAL_COMMITTED_PROGRAMME_CHILD_REQUIRED',
      );
      const child = pools.rows.filter(
          (r) => r.poolId === selection.servicePoolId,
        ),
        position = positions.rows.filter(
          (r) => r.positionId === selection.positionId,
        );
      assert.equal(child.length, 1);
      assert.equal(position.length, 1);
      const c = child[0],
        p = position[0];
      assert.equal(c.countryId, input.countryId);
      assert.equal(p.countryId, input.countryId);
      assert.equal(c.locationId, p.locationId);
      assert.equal(c.skill, p.skill);
      assert.equal(c.capacitySlots, children[0].capacitySlots);
      assert.ok(
        BigInt(selection.requestedMatches) <=
          BigInt(c.capacitySlots) -
            BigInt(c.usedSlots) -
            BigInt(c.reservedSlots),
      );
      const before = count(requests, '/v1/office-command'),
        captured = submissions.length;
      await page
        .locator('[data-social-plan-field="positionId"]')
        .selectOption(selection.positionId);
      await page
        .locator('[data-social-plan-field="servicePoolId"]')
        .selectOption(selection.servicePoolId);
      await page
        .locator('[data-social-plan-field="requestedMatches"]')
        .fill(selection.requestedMatches);
      await page.locator('[data-social-plan-action="stage"]').click();
      const dto = socialOriginal(
        await state(),
        selection,
        'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
      );
      assert.deepEqual(dto.request.payload, {
        schemaVersion: 'social-employment-service-plan-v1',
        locationId: c.locationId,
        skill: c.skill,
        positionId: p.positionId,
        servicePoolId: c.poolId,
        requestedMatches: selection.requestedMatches,
        dueDayIndex: c.dayIndex,
      });
      return reviewAndSubmitSocial(
        dto,
        before,
        captured,
        'ONE_ACTUAL_SOCIAL_PROGRAMME_PLAN_FORM_SUBMIT',
        expectedStatus,
      );
    }
    const session = Object.freeze({
      role,
      page,
      state,
      read,
      submitIndustryPowerFromPlanning,
      submitSocialEmploymentServiceCreateFromCurrent,
      submitSocialProgrammePlanFromCurrent,
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
          'utilityPlanningPage',
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
        original = null;
        submissions.length = 0;
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
        async () => {
          if (ownedApplication) await application.close();
        },
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
