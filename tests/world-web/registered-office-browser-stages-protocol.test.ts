/** TEST_ONLY control-protocol doubles for the browser-stage adapter. No Node,
 * browser, World, JWT authentication, source or economic receipt is verified. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
vi.mock(
  '../../tools/office-connection/fixed-office-command-browser.mjs',
  () => ({ createFixedOfficeBrowserApplication: vi.fn() }),
);
vi.mock(
  '../../tools/office-connection/registered-office-browser-acceptance.mjs',
  () => ({ createRegisteredOfficeBrowserAcceptance: vi.fn() }),
);
import { createFixedOfficeBrowserApplication } from '../../tools/office-connection/fixed-office-command-browser.mjs';
import { createRegisteredOfficeBrowserAcceptance } from '../../tools/office-connection/registered-office-browser-acceptance.mjs';
import {
  createRegisteredOfficeBrowserStages,
  type RegisteredIndustryPowerFormSelection,
} from '../../tools/office-connection/registered-office-browser-stages.mjs';
const fp = 'sha256:' + 'a'.repeat(64),
  token = 'Bearer TEST_ONLY_HEADER.PAYLOAD.SIGNATURE',
  api = 'https://api.example.invalid',
  backend = 'http://127.0.0.1:33441',
  country = 'COUNTRY_TEST_ONLY',
  subject = '11111111-1111-4111-8111-111111111111';
const head = { worldVersion: '7', eventSequence: '9' };
const originalRow = (action: 'BOOK' | 'DELIVER') => ({
  planningRef: 'ACTUAL_WIRE_VECTOR_NOT_REAL_SOURCE_' + action,
  serviceKind: 'POWER',
  action,
  countryId: country,
  facilityId: 'FACILITY_TEST_ONLY',
  runId: 'RUN_TEST_ONLY',
  sourceRef: 'SOURCE_TEST_ONLY',
  sourceRawSha256: 'b'.repeat(64),
  parameters:
    action === 'BOOK'
      ? { purpose: 'INDUSTRY_SELF_USE' }
      : {
          operation: {
            action: 'DELIVER',
            bookingRef: 'BOOKING_TEST_ONLY',
            workEventFingerprint: fp,
            paymentEventFingerprint: 'sha256:' + 'c'.repeat(64),
          },
        },
});
type FakeRoute = {
  request(): {
    url(): string;
    method(): string;
    allHeaders(): Promise<Record<string, string>>;
    postDataBuffer(): Buffer;
  };
  fallback(): Promise<void>;
  fulfill(value: unknown): Promise<void>;
  abort(reason: string): Promise<void>;
};
const cleanups: (() => Promise<unknown>)[] = [];
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
async function setup(
  action: 'BOOK' | 'DELIVER' = 'BOOK',
  role: 'industry' | 'finance' = 'industry',
) {
  const dir = await mkdtemp(
    path.join(tmpdir(), 'test-only-browser-stage-protocol-'),
  );
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const row = originalRow(action),
    events: string[] = [],
    fields: Record<string, string> = {},
    forwarded: { url: string; options: Record<string, unknown> }[] = [],
    fulfilled: unknown[] = [];
  let routeHandler: ((route: FakeRoute) => Promise<void>) | undefined,
    ui: Record<string, unknown>,
    currentHead = { ...head },
    selected = '';
  const reset = () => {
    ui = {
      status: 'READY_TO_READ',
      intent: null,
      receipt: null,
      runtimePage: null,
      utilityPlanningPage: null,
      runParametersPage: null,
      model: null,
      acknowledgement: null,
      canStage: false,
      canConfirm: false,
      canRecover: false,
      currentHead: null,
    };
  };
  reset();
  const read = () => {
    ui = {
      ...ui,
      status: ui.receipt ? 'FINAL_VERIFIED' : 'CURRENT_AUTHORIZED_HEAD',
      runtimePage: {
        status: 'PAGE',
        dataset:
          role === 'industry' ? 'industry-labour-current' : 'ledger-balances',
        authority: {
          identity: {
            officeId: role.toUpperCase(),
            countryId: country,
            authSubjectId: subject,
          },
          readback: currentHead,
        },
        source: {
          dataNature: 'TEST_ONLY_WIRE',
          worldVersion: '0',
          eventSequence: '0',
        },
        page: { returned: 1, total: 1 },
        rows: [],
      },
      utilityPlanningPage: {
        status: 'PAGE',
        dataset: 'industry-utility-planning',
        authority: {
          identity: {
            officeId: 'INDUSTRY',
            countryId: country,
            authSubjectId: subject,
          },
          readback: { ...currentHead, worldId: 'WORLD_TEST_ONLY' },
        },
        source: { sourceVersion: fp, bindingVersion: fp },
        page: { returned: 1, total: 1 },
        rows: [row],
      },
      currentHead,
      canStage: !ui.intent,
    };
    return structuredClone(ui);
  };
  const response = { status: () => 202 };
  const context = {
    async route(_pattern: string, handler: typeof routeHandler) {
      routeHandler = handler;
    },
    request: {
      fetch: vi.fn(async (url: string, options: Record<string, unknown>) => {
        forwarded.push({ url, options });
        return response;
      }),
    },
  };
  const emit = async (routePath: string, body: unknown) => {
    if (!routeHandler) throw Error('ROUTE_NOT_INSTALLED');
    await routeHandler({
      request: () => ({
        url: () => api + routePath,
        method: () => 'POST',
        allHeaders: async () => ({
          host: 'api.example.invalid',
          cookie: 'TEST_ONLY_COOKIE',
          authorization: token,
        }),
        postDataBuffer: () => Buffer.from(JSON.stringify(body)),
      }),
      fallback: async () => {
        throw Error('FIXED_ROUTE_MUST_NOT_FALLBACK');
      },
      fulfill: async (value) => {
        fulfilled.push(value);
      },
      abort: async () => {
        throw Error('PROTOCOL_FORWARD_FAILED');
      },
    });
  };
  const browserWindow = {
    EconMindFixedOfficeProbe: {
      configure() {
        reset();
      },
      state: () => structuredClone(ui),
    },
    EconMindRegisteredStageToken: () => undefined,
  };
  const evaluate = (fn: (...args: unknown[]) => unknown, arg?: unknown) =>
    runInNewContext('(' + fn.toString() + ')(arg)', {
      window: browserWindow,
      arg,
    }) as unknown;
  const page = {
    context: () => context,
    evaluate,
    async reload() {
      events.push('reload');
      reset();
    },
    async waitForFunction(fn: (...args: unknown[]) => unknown) {
      if (!evaluate(fn)) throw Error('PROTOCOL_WAIT_FAILED');
    },
    locator(selector: string) {
      return {
        async selectOption(value: string) {
          events.push('select:' + value);
          selected = value;
          for (const key of ['quantity', 'startsAtSimTime', 'endsAtSimTime'])
            fields[key] = '';
        },
        async fill(value: string) {
          events.push('fill:' + selector);
          const match = /data-industry-utility-field="([^"]+)"/u.exec(selector);
          fields[match?.[1] ?? 'original'] = value;
        },
        async inputValue() {
          const key = /data-industry-utility-field="([^"]+)"/u.exec(
            selector,
          )?.[1];
          return fields[key ?? 'original'] ?? '';
        },
        async isDisabled() {
          return selector.includes('industry-utility-field')
            ? action === 'DELIVER'
            : !ui.canConfirm;
        },
        async allTextContents() {
          return [];
        },
        async click() {
          events.push('click:' + selector);
          if (selector.includes('data-industry-utility-action')) {
            expect(selected).toBe(row.planningRef);
            ui = {
              ...ui,
              status: 'REVIEW_REQUIRED',
              canConfirm: false,
              intent: {
                schemaVersion: 'world-authenticated-office-command-v1',
                requestId: subject,
                request: {
                  worldId: 'WORLD_TEST_ONLY',
                  countryId: country,
                  officeId: 'INDUSTRY',
                  commandType: 'INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1',
                  commandId: 'COMMAND_TEST_ONLY_FROM_FORM',
                  idempotencyKey: 'KEY_TEST_ONLY_FROM_FORM',
                  expectedWorldVersion: currentHead.worldVersion,
                  payload: {
                    schemaVersion: 'industry-first-day-utility-command-v1',
                    serviceKind: 'POWER',
                    operationRef: 'COMMAND_TEST_ONLY_FROM_FORM',
                    facilityId: row.facilityId,
                    runId: row.runId,
                    sourceRef: row.sourceRef,
                    sourceRawSha256: row.sourceRawSha256,
                    operation:
                      action === 'DELIVER'
                        ? row.parameters.operation
                        : {
                            action: 'BOOK',
                            bookingRef: 'BOOKING_NEW_FROM_FORM',
                            purpose: row.parameters.purpose,
                            outputMWh: fields.quantity,
                            fromSimTime: fields.startsAtSimTime,
                            throughSimTime: fields.endsAtSimTime,
                          },
                  },
                },
              },
            };
          } else if (selector.includes('"review"'))
            ui = { ...ui, status: 'REVIEWED', canConfirm: true };
          else if (selector.includes('"confirm"')) {
            await emit('/v1/office-command', ui.intent);
            ui = {
              ...ui,
              status: 'QUEUE_ACK',
              canStage: false,
              canConfirm: false,
              canRecover: true,
            };
          } else if (selector.includes('"restore"')) {
            ui = {
              ...ui,
              status: 'UNKNOWN',
              intent: JSON.parse(fields.original!),
              canStage: false,
              canConfirm: false,
              canRecover: true,
            };
          }
        },
      };
    },
  };
  const base = {
    page,
    read: async () => read(),
    state: async () => structuredClone(ui),
    submitOnce: async (dto: unknown) => {
      ui = { ...ui, intent: dto };
      await emit('/v1/office-command', dto);
      ui = { ...ui, status: 'QUEUE_ACK', canStage: false };
      return structuredClone(ui);
    },
    recover: async () => {
      await emit('/v1/command-recovery', { originalRequest: ui.intent });
      const dto = ui.intent as {
        request: { commandId: string; idempotencyKey: string };
      };
      currentHead = { worldVersion: '8', eventSequence: '10' };
      ui = {
        ...ui,
        status: 'FINAL_VERIFIED',
        receipt: {
          commandId: dto.request.commandId,
          idempotencyKey: dto.request.idempotencyKey,
          outcome: 'COMMITTED',
          worldVersionBefore: '7',
          worldVersionAfter: '8',
        },
      };
      return read();
    },
    close: vi.fn(async () => undefined),
  };
  const manager = {
    openOffice: vi.fn(async () => base),
    currentSeat: vi.fn(async () => ({
      bindings: Object.values({
        captain: 'CAPTAIN',
        finance: 'FINANCE',
        central_bank: 'CENTRAL_BANK',
        industry: 'INDUSTRY',
        trade: 'TRADE',
        social: 'SOCIAL',
      }).map((officeId) => ({
        identity: { officeId, countryId: country, authSubjectId: subject },
        seatRef: 'SEAT_TEST_ONLY',
      })),
    })),
    close: vi.fn(async () => undefined),
  };
  vi.mocked(createFixedOfficeBrowserApplication).mockResolvedValue({
    bundleSha256: 'TEST_ONLY_NOT_A_BROWSER_BUILD',
    close: async () => undefined,
  } as unknown as Awaited<
    ReturnType<typeof createFixedOfficeBrowserApplication>
  >);
  vi.mocked(createRegisteredOfficeBrowserAcceptance).mockResolvedValue(
    manager as unknown as Awaited<
      ReturnType<typeof createRegisteredOfficeBrowserAcceptance>
    >,
  );
  const stages = await createRegisteredOfficeBrowserStages({
    actualOrigin: backend,
    applicationOrigin: 'https://app.example.invalid',
    evidenceDir: dir,
    authSubject: subject,
    countryId: country,
    countryDisplayId: '01',
    readConfiguration: {
      admittedWorldPins: {
        worldId: 'WORLD_TEST_ONLY',
        seedRef: 'SEED_TEST_ONLY',
        contentHash: fp,
        admissionRef: 'ADMISSION_TEST_ONLY',
        minimumWorldVersion: '0',
      },
      endpointPins: {
        origin: api,
        projectionPath: '/v1/postwar-office-runtime',
        finalLookupPath: '/v1/final',
        deploymentRef: 'TEST_ONLY_PROTOCOL',
      },
      modelVersion: 'TEST_ONLY',
    },
    getAccessToken: () => token,
    browser: { browserType: () => ({ name: () => 'chromium' }) },
  });
  cleanups.push(() => stages.close());
  const session = await stages.open(role);
  const selection =
    action === 'BOOK'
      ? {
          planningRef: row.planningRef,
          sourceVersion: fp,
          expectedHead: { ...head, worldId: 'WORLD_TEST_ONLY' },
          action,
          quantity: '1',
          startsAtSimTime: '10',
          endsAtSimTime: '20',
        }
      : {
          planningRef: row.planningRef,
          sourceVersion: fp,
          expectedHead: head,
          action,
        };
  return {
    stages,
    session,
    selection,
    row,
    events,
    forwarded,
    fulfilled,
    context,
    read,
    get ui() {
      return ui;
    },
    setUi(value: Record<string, unknown>) {
      ui = value;
    },
  };
}
describe('registered browser POWER stages TEST_ONLY control protocol', () => {
  it('BOOK uses real-form selectors and forwards the exact reviewed original only to the selected Node', async () => {
    const f = await setup(),
      state = await f.session.submitIndustryPowerFromPlanning(
        f.selection as RegisteredIndustryPowerFormSelection,
      );
    expect(state.status).toBe('QUEUE_ACK');
    expect(state.receipt).toBeNull();
    expect(f.forwarded).toHaveLength(1);
    expect(f.forwarded[0]!.url).toBe(backend + '/v1/office-command');
    expect(f.forwarded[0]!.options.headers).toEqual({ authorization: token });
    expect(f.fulfilled[0]).toEqual({ response: expect.any(Object) });
    expect(f.events.some((x) => x.includes('"review"'))).toBe(true);
    expect(f.events.some((x) => x.includes('"confirm"'))).toBe(true);
    expect(JSON.stringify(f.stages.evidence)).not.toContain(token);
    expect(f.stages.evidence.syntheticResponses).toBe(false);
  });
  it('DELIVER never fills paid/delivered values and reload restoration queries without a second submit', async () => {
    const f = await setup('DELIVER'),
      state = await f.session.submitIndustryPowerFromPlanning(
        f.selection as RegisteredIndustryPowerFormSelection,
      );
    expect(f.events.filter((x) => x.startsWith('fill:'))).toHaveLength(0);
    expect(state.intent?.request.payload).toMatchObject({
      operation: f.row.parameters.operation,
    });
    const restored = await f.session.reloadRestore(state.intent!, {
      recover: false,
    });
    expect(restored.status).toBe('UNKNOWN');
    expect(restored.canConfirm).toBe(false);
    expect(
      f.forwarded.filter((x) => x.url.endsWith('/v1/office-command')),
    ).toHaveLength(1);
    const final = await f.session.recoverFinal({
      expectedHead: { worldVersion: '8', eventSequence: '10' },
    });
    expect(final.receipt?.outcome).toBe('COMMITTED');
    expect(
      f.forwarded.filter((x) => x.url.endsWith('/v1/office-command')),
    ).toHaveLength(1);
  });
  it('rejects a stale version or an unknown row before any command POST instead of choosing a default source', async () => {
    const f = await setup();
    await expect(
      f.session.submitIndustryPowerFromPlanning({
        ...f.selection,
        sourceVersion: 'sha256:' + 'b'.repeat(64),
      } as RegisteredIndustryPowerFormSelection),
    ).rejects.toThrow('ACTUAL_PLANNING_SELECTION_VERSION_CHANGED');
    await expect(
      f.session.submitIndustryPowerFromPlanning({
        ...f.selection,
        planningRef: 'NOT_IN_ACTUAL_PAGE',
      } as RegisteredIndustryPowerFormSelection),
    ).rejects.toThrow('ONE_ACTUAL_SELECTED_PLANNING_ROW_REQUIRED');
    expect(f.forwarded).toHaveLength(0);
  });
  it('rejects a different Office and extra claimed results before submit', async () => {
    const f = await setup('DELIVER');
    await expect(
      f.session.submitIndustryPowerFromPlanning({
        ...f.selection,
        paidAmount: '1',
      } as unknown as RegisteredIndustryPowerFormSelection),
    ).rejects.toThrow('EXACT_POWER_FORM_SELECTION_REQUIRED');
    expect(f.forwarded).toHaveLength(0);
    const other = await setup('DELIVER', 'finance');
    await expect(
      other.session.submitIndustryPowerFromPlanning(
        other.selection as RegisteredIndustryPowerFormSelection,
      ),
    ).rejects.toThrow('INDUSTRY_BROWSER_SESSION_REQUIRED');
    expect(other.forwarded).toHaveLength(0);
  });
  it('keeps generic submit/recovery and an owned child origin rebind compatible', async () => {
    const f = await setup(),
      dto = {
        schemaVersion: 'world-authenticated-office-command-v1' as const,
        requestId: subject,
        request: {
          worldId: 'WORLD_TEST_ONLY',
          countryId: country,
          officeId: 'INDUSTRY' as const,
          commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1' as const,
          commandId: 'COMMAND_GENERIC_TEST_ONLY',
          idempotencyKey: 'KEY_GENERIC_TEST_ONLY',
          expectedWorldVersion: '7',
          payload: { fixture: 'TEST_ONLY_PROTOCOL' },
        },
      };
    await f.stages.setActualOrigin('http://127.0.0.1:33442');
    await f.session.submitOnce(dto);
    expect(f.forwarded[0]!.url).toBe(
      'http://127.0.0.1:33442/v1/office-command',
    );
    await f.session.reloadRestore(dto);
    expect(f.forwarded).toHaveLength(1);
    expect(f.stages.evidence.backendStartedHere).toBe(false);
    expect(f.stages.evidence.clockStartedHere).toBe(false);
  });
});
