/** Actual shipped clients/controller with explicit TEST_ONLY intercepted wire
 * DTOs. No server source, queue, receipt or economic acceptance is asserted. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createOfficeCommandController } from '../../apps/world-web/src/office-command/controller.js';
import { installOfficeCommand } from '../../apps/world-web/src/office-command/view.js';
import { HostDocument, HostElement } from './trusted-host-dom.js';
import { officeProjectionFixture } from './office-projection-fixture.js';
import {
  POSTWAR_RUNTIME_SCHEMA,
  POSTWAR_RUNTIME_PATH,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
const fp = 'sha256:' + 'a'.repeat(64),
  raw = 'b'.repeat(64),
  requestId = '11111111-1111-4111-8111-111111111111';
function setup(mode: 'OK' | 'MISSING' | 'FOREIGN' = 'OK') {
  const base = officeProjectionFixture('industry'),
    identity = {
      ...base.config.identity,
      projectionVersion: POSTWAR_RUNTIME_SCHEMA,
    },
    read = {
      ...base.config,
      identity,
      currentIdentity: () =>
        base.config.session.isCurrent() ? identity : null,
      endpoints: {
        ...base.config.endpoints,
        projectionPath: POSTWAR_RUNTIME_PATH,
      },
    },
    view = { role: 'industry' as const, countryDisplayId: '01' };
  const row = {
    schemaVersion: 'postwar-industry-run-parameter-row-v1',
    countryId: mode === 'FOREIGN' ? 'OTHER_COUNTRY' : identity.countryId,
    facilityId: 'FACILITY_FROM_SOURCE',
    locationId: 'LOCATION_TEST_ONLY',
    operatorId: 'OP_TEST_ONLY',
    sourceRef: 'INDUSTRY_FIRST_DAY_' + 'B'.repeat(64),
    sourceRawSha256: raw,
    policyVersion: 'POLICY_FROM_SOURCE',
    policyRawSha256: 'c'.repeat(64),
    userAdoptionRawSha256: 'd'.repeat(64),
    outputUnit: 'tonne',
    expenseCurrency: 'XBB',
    windowStartsAtSimTime: '0',
    windowEndsAtSimTime: '86400000',
    maximumMinutesPerWorkerFirstSimDay: '480',
    measurement: 'ADOPTED_PARAMETERS_NOT_RUN_WORK_PAYMENT_OR_OUTPUT_AUTHORITY',
  };
  let head = '7',
    submitted: Record<string, unknown> | undefined;
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname,
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ path, body });
    if (path === POSTWAR_RUNTIME_PATH) {
      const parameter = body.dataset === 'industry-run-parameters';
      if (mode === 'MISSING' && parameter)
        return Response.json(
          {
            schemaVersion: POSTWAR_RUNTIME_SCHEMA,
            requestId: body.requestId,
            ok: false,
            error: {
              code: 'INDUSTRY_RUN_PARAMETERS_UNAVAILABLE',
              retryable: false,
            },
          },
          { status: 503 },
        );
      const seed = {
        worldId: read.world.worldId,
        seedRef: read.world.seedRef,
        contentHash: read.world.contentHash,
        admissionRef: read.world.admissionRef,
      };
      return Response.json({
        schemaVersion: POSTWAR_RUNTIME_SCHEMA,
        requestId: body.requestId,
        ok: true,
        status: 'AVAILABLE',
        dataset: body.dataset,
        authority: {
          source: 'SERVER_VERIFIED_READ_BINDING',
          capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
          identity,
          seatRef: read.seatRef,
          seatState: 'ACTIVE',
          seed,
          readback: {
            ...seed,
            worldVersion: head,
            eventSequence: head,
            readbackRef: 'READBACK_TEST_ONLY',
          },
        },
        source: {
          ...identity,
          authSubjectId: identity.authSubjectId,
          authorizationRevision: identity.authorizationRevision,
          seedRef: seed.seedRef,
          contentHash: seed.contentHash,
          admissionRef: seed.admissionRef,
          dataNature: parameter
            ? 'ADMITTED_IMMUTABLE_OPENING_FACTS'
            : 'ADMITTED_CURRENT_INDUSTRY_EMPLOYMENT_HEADCOUNT',
          sourceVersion: fp,
          bindingVersion: fp,
          sourceRevision: 'PARAMETERS_TEST_ONLY',
          worldVersion: parameter ? '0' : head,
          eventSequence: parameter ? '0' : head,
          originWorldVersion: '0',
          originEventSequence: '0',
          observedHead: { worldVersion: head, eventSequence: head },
          pageHash: raw,
          returnedRowsHash: raw,
          hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
          ...(!parameter
            ? {
                currentIndustryLabourCoverage: {
                  schemaVersion: 'postwar-industry-labour-current-coverage-v1',
                  countryId: identity.countryId,
                  prefixFingerprint: fp,
                  knownEffectsFingerprint: fp,
                  coveredThroughEventId: 'EVENT_TEST_ONLY',
                  coveredThroughEventFingerprint: fp,
                  financialPostingCount: '0',
                  financialBatchCount: '0',
                  financialPostingsFingerprint: fp,
                  globalWorldVersion: head,
                  globalEventSequence: head,
                  rowsHash: fp,
                  originalScopeSha256: raw,
                },
              }
            : {}),
          sourcePointer: parameter
            ? {
                rowOrigin:
                  'world_v2.postwar_industry_first_day_source.source_text',
                rowBinding: 'sourceRef+sourceRawSha256',
              }
            : {
                sourceId: 'SOURCE_TEST_ONLY',
                sourcePayloadHash: fp,
                canonicalSeedSha256: raw,
                path: '/carrier/socialEmployment/inputs/sourcePositions',
                selection: {
                  countryId: identity.countryId,
                  sourceBucket: 'INDUSTRY',
                  employerRole: 'OP',
                },
              },
        },
        rows: parameter
          ? [row]
          : [
              {
                schemaVersion: 'postwar-industry-labour-current-row-v1',
                countryId: identity.countryId,
                facilityId: row.facilityId,
                locationId: row.locationId,
                operatorId: row.operatorId,
                positionId: 'POSITION_TEST_ONLY',
                skill: 'LOW',
                classificationId: 'SKILL_TEST_ONLY',
                requiredCount: '2',
                openingFilledCount: '1',
                currentEmployedCount: '1',
                measurement: 'EMPLOYMENT_HEADCOUNT_NOT_ATTENDANCE_OR_PAYMENT',
                completedPersonDays: null,
                paidCost: null,
              },
            ],
        page: { offset: 0, limit: 25, returned: 1, total: 1, nextOffset: null },
      });
    }
    if (path === '/v1/office-command') {
      submitted = body.request as Record<string, unknown>;
      return Response.json({
        schemaVersion: body.schemaVersion,
        requestId: body.requestId,
        ok: true,
        state: {
          status: 'QUEUED',
          source: 'NEW',
          submitted: true,
          queued: true,
          commandId: submitted.commandId,
          commandType: submitted.commandType,
          commandFingerprint: fp,
        },
      });
    }
    if (path === '/v1/command-recovery') {
      head = '8';
      return Response.json({
        schemaVersion: body.schemaVersion,
        requestId: body.requestId,
        ok: true,
        state: {
          status: 'FINAL',
          commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
          receipt: {
            source: 'DURABLE_FINAL_COMMAND_RECEIPT',
            schemaVersion: 'command-receipt-v2',
            worldId: identity.worldId,
            commandId: submitted!.commandId,
            idempotencyKey: submitted!.idempotencyKey,
            commandFingerprint: fp,
            outcome: 'COMMITTED',
            reasonCode: null,
            transitionId: 'TRANSITION_TEST_ONLY',
            worldVersionBefore: '7',
            worldVersionAfter: '8',
            simTime: '0',
            eventIds: ['EVENT_TEST_ONLY_RUN'],
            recordedAtReal: '2026-11-01T00:00:00.000Z',
          },
        },
      });
    }
    throw Error('UNEXPECTED_TEST_TRANSPORT');
  };
  const binding = {
      read,
      view,
      endpoint: {
        origin: read.endpoints.origin,
        path: '/v1/office-command' as const,
        deploymentRef: read.endpoints.deploymentRef,
      },
    },
    controller = createOfficeCommandController(binding, () => view, {
      fetcher,
      requestId: () => requestId,
    });
  return {
    controller,
    calls,
    invalidate: base.invalidate,
    row,
    binding,
    fetcher,
  };
}
afterEach(() => vi.unstubAllGlobals());
const draft = {
  facilityId: 'FACILITY_FROM_SOURCE',
  quantity: '2',
  startsAtSimTime: '10',
  endsAtSimTime: '20',
  maximumExpense: '3',
};
describe('Industry typed RUN plan lifecycle', () => {
  it.each([
    { entry: 'country-module', mode: 'OK' },
    { entry: 'country-room', mode: 'OK' },
    { entry: 'country-module', mode: 'MISSING' },
  ] as const)(
    'opens source-bound RUN from actual $entry attributes ($mode), blocks legacy continuation and stages only explicit user terms',
    async ({ entry, mode }) => {
      vi.stubGlobal(
        'MutationObserver',
        class {
          observe() {}
        },
      );
      vi.stubGlobal('Element', HostElement);
      class CatalogDocument extends HostDocument {
        capture: ((event: MouseEvent) => void) | null = null;
        addEventListener(key: string, fn: (event: MouseEvent) => void) {
          if (key === 'click') this.capture = fn;
        }
      }
      const f = setup(mode),
        doc = new CatalogDocument('industry'),
        ui = installOfficeCommand(
          doc as unknown as Document,
          { addEventListener() {} } as unknown as Window,
          (binding, view) =>
            createOfficeCommandController(binding, view, {
              fetcher: f.fetcher,
              requestId: () => requestId,
            }),
        );
      try {
        const source = readFileSync(
            new URL(
              '../../apps/world-web/public/season1-immersive/country-game.js',
              import.meta.url,
            ),
            'utf8',
          ),
          template =
            entry === 'country-module'
              ? source.match(
                  /<button data-cmd="country-module" data-module="\$\{m\.id\}"/u,
                )?.[0]
              : source.match(
                  /<button data-cmd="country-room" data-id="\$\{i\}" data-module="\$\{module\}"/u,
                )?.[0];
        expect(template).toBeDefined();
        const markup = template!
            .replace('${m.id}', 'industry-13')
            .replace('${module}', 'industry-13')
            .replace('${i}', '0'),
          module = doc.createElement('button') as HostElement & {
            closest(selector: string): HostElement | null;
          };
        const key = (name: string) =>
          name.replace(/-([a-z])/gu, (_, c: string) => c.toUpperCase());
        for (const match of markup.matchAll(/data-([a-z-]+)="([^"]*)"/gu))
          module.dataset[key(match[1]!)] = match[2]!;
        module.closest = (selector) =>
          selector
            .split(',')
            .some((s) =>
              [...s.matchAll(/\[data-([a-z-]+)="([^"]*)"\]/gu)].every(
                (m) => module.dataset[key(m[1]!)] === m[2],
              ),
            )
            ? module
            : null;
        doc.root.append(module);
        let prevented = 0,
          stopped = 0;
        const click = () =>
          doc.capture?.({
            target: module,
            preventDefault() {
              prevented++;
            },
            stopImmediatePropagation() {
              stopped++;
            },
          } as unknown as MouseEvent);
        click();
        expect(prevented).toBe(0);
        ui.connect(f.binding);
        module.dataset.module = 'industry-14';
        click();
        expect(prevented).toBe(0);
        module.dataset.module = 'industry-13';
        click();
        await expect
          .poll(() => ui.getState().status)
          .toBe('CURRENT_AUTHORIZED_HEAD');
        expect(prevented).toBe(1);
        expect(stopped).toBe(1);
        const dialog = doc.root
          .all()
          .find((e) => Object.hasOwn(e.dataset, 'officeCommandDialog'))!;
        expect(dialog.open).toBe(true);
        const form = dialog
          .all()
          .find((e) => Object.hasOwn(e.dataset, 'industryRunForm'))!;
        expect(form.textContent).toContain(
          '利用率目标、设施与资源优先级尚未接通',
        );
        if (mode === 'MISSING') {
          expect(ui.getState().runParametersPage).toBeNull();
          expect(form.textContent).toContain('排产参数当前不可用');
          expect(
            form.all().some((e) => e.dataset.industryRunAction === 'stage'),
          ).toBe(false);
          expect(
            f.calls.filter((c) => c.path === '/v1/office-command'),
          ).toHaveLength(0);
          return;
        }
        expect(ui.getState().runParametersPage?.dataset).toBe(
          'industry-run-parameters',
        );
        expect(form.textContent).toContain('tonne · XBB');
        const values: Record<string, string> = {
          facilityId: f.row.facilityId,
          quantity: '2',
          startsAtSimTime: '10',
          endsAtSimTime: '20',
          maximumExpense: '3',
        };
        for (const el of form.all())
          if (el.dataset.industryRunField) {
            if (el.dataset.industryRunField !== 'facilityId')
              expect((el as unknown as HTMLInputElement).value).toBe('');
            (el as unknown as HTMLInputElement).value =
              values[el.dataset.industryRunField]!;
          }
        form
          .all()
          .find((e) => e.dataset.industryRunAction === 'stage')!
          .click();
        expect(ui.getState().status).toBe('REVIEW_REQUIRED');
        expect(ui.getState().intent?.request.payload).toMatchObject({
          facilityId: f.row.facilityId,
          quantity: { amount: '2', unit: 'tonne' },
          maximumExpense: { amount: '3', currency: 'XBB' },
          sourceRef: f.row.sourceRef,
          sourceRawSha256: f.row.sourceRawSha256,
          policyVersion: f.row.policyVersion,
        });
        expect(
          f.calls.filter((c) => c.path === '/v1/office-command'),
        ).toHaveLength(0);
        expect(
          dialog.all().find((e) => e.dataset.officeCommandAction === 'confirm')
            ?.disabled,
        ).toBe(true);
        doc.root.dataset.office = 'captain';
        click();
        expect(prevented).toBe(1);
      } finally {
        f.invalidate();
        f.controller.disconnect();
      }
    },
  );
  it('stages actual source references with explicit user inputs then uses the original request recovery, without exposing automatic authority', async () => {
    const f = setup();
    try {
      await f.controller.refresh();
      expect(f.controller.getState().canStage).toBe(true);
      expect(f.controller.stageIndustryRun(draft)).toBe(true);
      expect(f.controller.getState().intent?.request.payload).toMatchObject({
        sourceRef: f.row.sourceRef,
        sourceRawSha256: f.row.sourceRawSha256,
        policyVersion: f.row.policyVersion,
        quantity: { amount: '2', unit: 'tonne' },
        maximumExpense: { amount: '3', currency: 'XBB' },
      });
      expect(f.controller.review()).toBe(true);
      await f.controller.confirm();
      expect(f.controller.getState().status).toBe('QUEUE_ACK');
      await f.controller.recoverOriginal();
      expect(f.controller.getState()).toMatchObject({
        status: 'FINAL_VERIFIED',
        receipt: { outcome: 'COMMITTED' },
        completion: false,
        currentHead: { worldVersion: '8' },
      });
      expect(
        f.calls.filter((c) => c.path === '/v1/office-command'),
      ).toHaveLength(1);
      expect(
        f.calls.some((c) =>
          JSON.stringify(c.body).includes('CORE_INDUSTRY_FIRST_DAY_WORK_V1'),
        ),
      ).toBe(false);
      f.invalidate();
      expect(f.controller.getState()).toMatchObject({
        runtimePage: null,
        intent: null,
        receipt: null,
        canStage: false,
      });
    } finally {
      f.controller.disconnect();
    }
  });
  it.each(['MISSING', 'FOREIGN'] as const)(
    'clears private source/does not submit when %s',
    async (mode) => {
      const f = setup(mode);
      try {
        await f.controller.refresh();
        expect(f.controller.getState()).toMatchObject({
          runParametersPage: null,
          runtimePage: { dataset: 'industry-labour-current' },
        });
        expect(f.controller.stageIndustryRun(draft)).toBe(false);
        await f.controller.confirm();
        expect(
          f.calls.filter((c) => c.path === '/v1/office-command'),
        ).toHaveLength(0);
      } finally {
        f.controller.disconnect();
      }
    },
  );
});
