/** TEST_ONLY browser-control doubles. No real browser, Node/JWT, licence,
 * source, SQL commit or economic FINAL is verified by these protocol cases. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
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
  type RegisteredSocialServiceCreateSelection,
  type RegisteredSocialProgrammePlanSelection,
} from '../../tools/office-connection/registered-office-browser-stages.mjs';
const fp = 'sha256:' + 'a'.repeat(64),
  laterFp = 'sha256:' + 'b'.repeat(64),
  country = 'COUNTRY_TEST_ONLY',
  subject = '11111111-1111-4111-8111-111111111111';
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(
  role: 'social' | 'finance' = 'social',
  borrowApplication = false,
  wrongBundle = false,
) {
  const dir = await mkdtemp(
    path.join(tmpdir(), 'social-browser-stage-protocol-'),
  );
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  let committed = false,
    optionsAvailable = true;
  const programme = 'PROGRAMME_FROM_TEST_ONLY_FORM';
  const head = () => ({
    worldVersion: committed ? '4' : '3',
    eventSequence: committed ? '4' : '3',
  });
  const version = () => (committed ? laterFp : fp);
  const events: string[] = [],
    posts: Record<string, unknown>[] = [];
  const sources = () => ({
    classification: 'CURRENT_T0_SERVICE_CREATION_PLANNING_DATA_NOT_AUTHORITY',
    worldId: 'WORLD_TEST_ONLY',
    countryId: country,
    head: head(),
    dayIndex: '0',
    localCurrency: 'XAA',
    rootTargets: [
      {
        poolId: 'ROOT_TEST_ONLY',
        locationId: 'LOCATION_TEST_ONLY',
        skill: 'MEDIUM',
        dayIndex: '0',
        capacitySlots: committed ? '4' : '8',
        usedSlots: '0',
        reservedSlots: '2',
        actualUnemployedCount: '9',
      },
    ],
    usageLicences: [{ locationId: 'LOCATION_TEST_ONLY' }],
    creations: [
      {
        programmeId: programme,
        parentPoolId: 'ROOT_TEST_ONLY',
        childPoolId: 'CHILD_TEST_ONLY',
        capacitySlots: '4',
      },
    ],
  });
  const manager = {
    currentSeat: async () => ({
      bindings: [
        'CAPTAIN',
        'FINANCE',
        'CENTRAL_BANK',
        'INDUSTRY',
        'TRADE',
        'SOCIAL',
      ].map((officeId) => ({
        identity: { officeId, countryId: country, authSubjectId: subject },
        seatRef: 'SEAT_TEST_ONLY',
      })),
    }),
    close: vi.fn(async () => undefined),
    openOffice: async () => {
      let ui: Record<string, unknown>,
        poolOffset = 0,
        positionOffset = 0,
        route: ((r: unknown) => Promise<void>) | undefined;
      const fields: Record<string, string> = {};
      const reset = () => {
        poolOffset = positionOffset = 0;
        ui = {
          status: 'READY_TO_READ',
          intent: null,
          receipt: null,
          runtimePage: null,
          socialPoolsPage: null,
          canStage: false,
          canRead: true,
          canConfirm: false,
          canRecover: false,
          utilityPlanningPage: null,
          runParametersPage: null,
        };
      };
      reset();
      const authority = () => ({
        identity: {
          officeId: role.toUpperCase(),
          countryId: country,
          authSubjectId: subject,
        },
        readback: head(),
      });
      const read = () => {
        const child = poolOffset === 1;
        ui = {
          ...ui,
          status: ui.receipt ? 'FINAL_VERIFIED' : 'CURRENT_AUTHORIZED_HEAD',
          canStage: !ui.intent,
          canRead: true,
          currentHead: head(),
          runtimePage: {
            status: 'PAGE',
            dataset: 'positions',
            authority: authority(),
            source: { sourceVersion: version(), bindingVersion: version() },
            page: {
              offset: positionOffset,
              returned: 1,
              total: 2,
              nextOffset: positionOffset ? null : 1,
            },
            rows: [
              {
                positionId: positionOffset
                  ? 'POSITION_TEST_ONLY'
                  : 'OTHER_POSITION_TEST_ONLY',
                countryId: country,
                locationId: positionOffset
                  ? 'LOCATION_TEST_ONLY'
                  : 'OTHER_LOCATION_TEST_ONLY',
                skill: 'MEDIUM',
                requiredCount: '8',
                employedCount: '0',
              },
            ],
          },
          socialPoolsPage: {
            status: 'PAGE',
            dataset: 'service-pools',
            authority: authority(),
            source: {
              sourceVersion: version(),
              bindingVersion: version(),
              currentEmploymentServiceCreationOptions: optionsAvailable
                ? {
                    status: 'AVAILABLE',
                    data: {
                      ...sources(),
                      rootTargets: child ? [] : sources().rootTargets,
                      creations: child && committed ? sources().creations : [],
                    },
                  }
                : { status: 'UNAVAILABLE', code: 'ACTUAL_SOURCE_MISSING' },
            },
            page: {
              offset: poolOffset,
              returned: 1,
              total: committed ? 2 : 1,
              nextOffset: committed && !poolOffset ? 1 : null,
            },
            rows: [
              {
                poolId: child ? 'CHILD_TEST_ONLY' : 'ROOT_TEST_ONLY',
                countryId: country,
                locationId: 'LOCATION_TEST_ONLY',
                skill: 'MEDIUM',
                dayIndex: '0',
                capacitySlots: child || committed ? '4' : '8',
                usedSlots: '0',
                reservedSlots: child ? '0' : '2',
              },
            ],
          },
        };
        return structuredClone(ui);
      };
      const context = {
        route: async (_p: string, handler: typeof route) => {
          route = handler;
        },
        request: {
          fetch: async (_url: string, options: Record<string, unknown>) => {
            posts.push(JSON.parse((options.data as Buffer).toString('utf8')));
            return { status: () => 202 };
          },
        },
      };
      const emit = async (dto: unknown) => {
        await route!({
          request: () => ({
            url: () => 'https://api.example.invalid/v1/office-command',
            method: () => 'POST',
            allHeaders: async () => ({
              authorization: 'Bearer TEST_ONLY_UNSIGNED',
            }),
            postDataBuffer: () => Buffer.from(JSON.stringify(dto)),
          }),
          fulfill: async () => undefined,
          fallback: async () => {
            throw Error('NO_FALLBACK');
          },
          abort: async () => {
            throw Error('NO_ABORT');
          },
        });
      };
      const win = {
        EconMindFixedOfficeProbe: {
          configure: () => reset(),
          state: () => structuredClone(ui),
        },
        EconMindRegisteredStageToken: () => undefined,
      };
      const evaluate = (fn: unknown, arg?: unknown) =>
        runInNewContext('(' + String(fn) + ')(arg)', { window: win, arg });
      const page = {
        context: () => context,
        evaluate,
        reload: async () => {
          events.push('reload');
          reset();
        },
        waitForFunction: async (fn: unknown) => {
          if (!evaluate(fn)) throw Error('TEST_ONLY_WAIT_FAILED');
        },
        locator: (selector: string) => ({
          isDisabled: async () =>
            selector.includes('"confirm"') ? !ui.canConfirm : false,
          selectOption: async (value: string) => {
            const key =
              /data-social-(?:service-create|plan)-field="([^"]+)"/u.exec(
                selector,
              )?.[1];
            fields[key!] = value;
            events.push('select:' + key + ':' + value);
          },
          fill: async (value: string) => {
            const key =
              /data-social-(?:service-create|plan)-field="([^"]+)"/u.exec(
                selector,
              )?.[1];
            fields[key ?? 'original'] = value;
            events.push('fill:' + (key ?? 'original'));
          },
          allTextContents: async () => [],
          click: async () => {
            if (selector.includes('social-next-positions')) {
              positionOffset++;
              poolOffset = 0;
              read();
              return;
            }
            if (selector.includes('social-next-pools')) {
              poolOffset++;
              read();
              return;
            }
            const create = selector.includes(
                'data-social-service-create-action',
              ),
              plan = selector.includes('data-social-plan-action');
            if (create || plan) {
              events.push(create ? 'stage:create' : 'stage:plan');
              const payload = create
                ? {
                    schemaVersion: 'social-employment-service-create-v1',
                    programmeId: programme,
                    capacity: { amount: fields.capacity, unit: 'person' },
                    budget: { amount: '0', currency: 'XAA' },
                    target: {
                      servicePoolId: fields.servicePoolId,
                      locationId: 'LOCATION_TEST_ONLY',
                      skill: 'MEDIUM',
                    },
                  }
                : {
                    schemaVersion: 'social-employment-service-plan-v1',
                    locationId: 'LOCATION_TEST_ONLY',
                    skill: 'MEDIUM',
                    positionId: fields.positionId,
                    servicePoolId: fields.servicePoolId,
                    requestedMatches: fields.requestedMatches,
                    dueDayIndex: '0',
                  };
              ui = {
                ...ui,
                status: 'REVIEW_REQUIRED',
                intent: {
                  schemaVersion: 'world-authenticated-office-command-v1',
                  requestId: subject,
                  request: {
                    worldId: 'WORLD_TEST_ONLY',
                    countryId: country,
                    officeId: 'SOCIAL',
                    commandType: create
                      ? 'CORE_SOCIAL_EMPLOYMENT_SERVICE_CREATE_V1'
                      : 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
                    commandId: create
                      ? 'COMMAND_CREATE_TEST_ONLY'
                      : 'COMMAND_PLAN_TEST_ONLY',
                    idempotencyKey: create
                      ? 'KEY_CREATE_TEST_ONLY'
                      : 'KEY_PLAN_TEST_ONLY',
                    expectedWorldVersion: head().worldVersion,
                    payload,
                  },
                },
              };
            } else if (selector.includes('"review"')) {
              events.push('review');
              ui = { ...ui, status: 'REVIEWED', canConfirm: true };
            } else if (selector.includes('"confirm"')) {
              events.push('confirm');
              await emit(ui.intent);
              ui = {
                ...ui,
                status: 'QUEUE_ACK',
                receipt: null,
                canStage: false,
                canConfirm: false,
                canRecover: true,
              };
            } else if (selector.includes('"restore"')) {
              events.push('restore');
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
        }),
      };
      return {
        page,
        read: async () => read(),
        state: async () => structuredClone(ui),
        close: vi.fn(async () => undefined),
        recover: async () => {
          if (!committed) throw Error('TEST_ONLY_NOT_COMMITTED');
          const dto = ui.intent as {
            request: { commandId: string; idempotencyKey: string };
          };
          ui = {
            ...ui,
            receipt: {
              outcome: 'COMMITTED',
              commandId: dto.request.commandId,
              idempotencyKey: dto.request.idempotencyKey,
              worldVersionAfter: '4',
            },
          };
          return read();
        },
      };
    },
  };
  vi.mocked(createFixedOfficeBrowserApplication).mockResolvedValue({
    bundleSha256: 'TEST_ONLY_NO_BUILD',
    close: async () => undefined,
  } as unknown as Awaited<
    ReturnType<typeof createFixedOfficeBrowserApplication>
  >);
  vi.mocked(createRegisteredOfficeBrowserAcceptance).mockResolvedValue(
    manager as unknown as Awaited<
      ReturnType<typeof createRegisteredOfficeBrowserAcceptance>
    >,
  );
  const borrowedApplication = {
    baseURL: 'http://127.0.0.1:33442',
    bundleSha256: createHash('sha256')
      .update('TEST_ONLY_BUNDLE_BYTES')
      .digest('hex'),
    close: vi.fn(async () => undefined),
  };
  if (borrowApplication)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(url).toBe(borrowedApplication.baseURL + '/bundle.mjs');
        return new Response(
          wrongBundle ? 'WRONG_BYTES' : 'TEST_ONLY_BUNDLE_BYTES',
          { headers: { 'content-type': 'text/javascript' } },
        );
      }),
    );
  const stages = await createRegisteredOfficeBrowserStages({
    actualOrigin: 'http://127.0.0.1:33441',
    applicationOrigin: 'https://app.example.invalid',
    evidenceDir: dir,
    authSubject: subject,
    countryId: country,
    countryDisplayId: '01',
    browser: { browserType: () => ({ name: () => 'chromium' }) },
    ...(borrowApplication ? { application: borrowedApplication } : {}),
    getAccessToken: () => 'Bearer TEST_ONLY_UNSIGNED',
    readConfiguration: {
      modelVersion: 'TEST_ONLY',
      admittedWorldPins: {
        worldId: 'WORLD_TEST_ONLY',
        seedRef: 'SEED_TEST_ONLY',
        contentHash: fp,
        admissionRef: 'ADMISSION_TEST_ONLY',
        minimumWorldVersion: '0',
      },
      endpointPins: {
        origin: 'https://api.example.invalid',
        projectionPath: '/v1/postwar-office-runtime',
        finalLookupPath: '/v1/final',
        deploymentRef: 'DEPLOYMENT_TEST_ONLY',
      },
    },
  });
  cleanups.push(() => stages.close());
  const session = await stages.open(role);
  const create: RegisteredSocialServiceCreateSelection = {
    servicePoolId: 'ROOT_TEST_ONLY',
    capacity: '4',
    sourceVersion: fp,
    expectedHead: { worldVersion: '3', eventSequence: '3' },
    poolPageOffset: 0,
  };
  const childPlan = (): RegisteredSocialProgrammePlanSelection => ({
    programmeId: programme,
    servicePoolId: 'CHILD_TEST_ONLY',
    positionId: 'POSITION_TEST_ONLY',
    requestedMatches: '2',
    poolSourceVersion: laterFp,
    positionSourceVersion: laterFp,
    expectedHead: { worldVersion: '4', eventSequence: '4' },
    poolPageOffset: 1,
    positionPageOffset: 1,
  });
  return {
    stages,
    session,
    create,
    childPlan,
    events,
    posts,
    borrowedApplication,
    commit: () => {
      committed = true;
    },
    noSource: () => {
      optionsAvailable = false;
    },
  };
}
describe('Social CREATE/child PLAN finite browser stages (protocol only)', () => {
  it('borrows the existing shipped application without a second build or closing its owner resource', async () => {
    const f = await fixture('social', true);
    expect(createFixedOfficeBrowserApplication).not.toHaveBeenCalled();
    expect(f.stages.evidence.borrowedApplicationBytesVerified).toBe(true);
    await f.stages.close();
    expect(f.borrowedApplication.close).not.toHaveBeenCalled();
  });
  it('does not accept a caller-declared bundle hash without matching actual asset bytes', async () => {
    await expect(fixture('social', true, true)).rejects.toThrow(
      'APPLICATION_BYTES_DIFFER_FROM_DECLARED_BUNDLE',
    );
    expect(createFixedOfficeBrowserApplication).not.toHaveBeenCalled();
  });
  it('operates actual-shaped form controls, reviews and posts once; ACK is not FINAL', async () => {
    const f = await fixture(),
      s = await f.session.submitSocialEmploymentServiceCreateFromCurrent(
        f.create,
      );
    expect(f.events.slice(-3)).toEqual(['stage:create', 'review', 'confirm']);
    expect(f.posts).toHaveLength(1);
    expect(s.receipt).toBeNull();
    expect(s.intent?.request.payload).toMatchObject({
      capacity: { amount: '4', unit: 'person' },
      budget: { amount: '0', currency: 'XAA' },
      target: { servicePoolId: 'ROOT_TEST_ONLY' },
    });
    await expect(f.session.recoverFinal()).rejects.toThrow(
      'TEST_ONLY_NOT_COMMITTED',
    );
  });
  it('leaves consumption to the caller, then reuses FINAL/readback and F5 original query-only recovery', async () => {
    const f = await fixture(),
      queued = await f.session.submitSocialEmploymentServiceCreateFromCurrent(
        f.create,
      );
    const original = queued.intent!;
    f.commit();
    await f.session.recoverFinal({
      expectedHead: { worldVersion: '4', eventSequence: '4' },
    });
    const restored = await f.session.reloadRestore(original, {
      recover: false,
    });
    expect(restored.status).toBe('UNKNOWN');
    expect(restored.canConfirm).toBe(false);
    await f.session.recoverFinal({
      expectedHead: { worldVersion: '4', eventSequence: '4' },
    });
    expect(f.posts).toHaveLength(1);
    expect(f.events).toContain('restore');
  });
  it('requires a fresh session and selects the actual programme child/position pages for one PLAN', async () => {
    const f = await fixture();
    await f.session.submitSocialEmploymentServiceCreateFromCurrent(f.create);
    f.commit();
    await f.session.recoverFinal();
    await expect(
      f.session.submitSocialProgrammePlanFromCurrent(f.childPlan()),
    ).rejects.toThrow('CURRENT_UNUSED_BROWSER_INTENT_REQUIRED');
    const child = await f.stages.open('social'),
      s = await child.submitSocialProgrammePlanFromCurrent(f.childPlan());
    expect(f.posts).toHaveLength(2);
    expect(s.intent?.request.payload).toMatchObject({
      servicePoolId: 'CHILD_TEST_ONLY',
      positionId: 'POSITION_TEST_ONLY',
      requestedMatches: '2',
      dueDayIndex: '0',
    });
  });
  it('refuses absent source and does not manufacture a licence or submit a command', async () => {
    const f = await fixture();
    f.noSource();
    await expect(
      f.session.submitSocialEmploymentServiceCreateFromCurrent(f.create),
    ).rejects.toThrow('ACTUAL_LICENSED_CREATION_OPTIONS_REQUIRED');
    expect(f.posts).toHaveLength(0);
  });
  it('refuses a wrong role, stale source version, extra ready flag and guessed child origin before posting', async () => {
    const other = await fixture('finance');
    await expect(
      other.session.submitSocialEmploymentServiceCreateFromCurrent(
        other.create,
      ),
    ).rejects.toThrow('SOCIAL_BROWSER_SESSION_REQUIRED');
    const f = await fixture();
    await expect(
      f.session.submitSocialEmploymentServiceCreateFromCurrent({
        ...f.create,
        sourceVersion: laterFp,
      }),
    ).rejects.toThrow('ACTUAL_SOCIAL_POOL_VERSION_CHANGED');
    await expect(
      f.session.submitSocialEmploymentServiceCreateFromCurrent({
        ...f.create,
        ready: true,
      } as RegisteredSocialServiceCreateSelection),
    ).rejects.toThrow('EXACT_SOCIAL_CREATE_SELECTION_REQUIRED');
    f.commit();
    const child = await f.stages.open('social');
    await expect(
      child.submitSocialProgrammePlanFromCurrent({
        ...f.childPlan(),
        programmeId: 'GUESSED_PROGRAMME',
      }),
    ).rejects.toThrow('ACTUAL_COMMITTED_PROGRAMME_CHILD_REQUIRED');
    expect(f.posts).toHaveLength(0);
  });
});
