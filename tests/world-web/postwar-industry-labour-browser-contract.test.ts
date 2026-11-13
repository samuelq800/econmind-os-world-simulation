/** TEST_ONLY wire DTOs, not native source/work/payment evidence. Real shipped
 * browser parser consumes Core's strict headcount-only DATA contracts. */
import { describe, expect, it } from 'vitest';
import { officeProjectionFixture } from './office-projection-fixture.js';
import {
  createPostwarRuntimeClient,
  POSTWAR_RUNTIME_SCHEMA,
  POSTWAR_RUNTIME_PATH,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import {
  POSTWAR_INDUSTRY_LABOUR_CURRENT_NATURE,
  POSTWAR_INDUSTRY_LABOUR_OPENING_NATURE,
} from '@econmind/core/postwar-industry-labour-current-contract';
const requestId = '11111111-1111-4111-8111-111111111111',
  fp = 'sha256:' + 'a'.repeat(64),
  raw = 'b'.repeat(64);
function fixture(head = '2') {
  const base = officeProjectionFixture('industry'),
    identity = {
      ...base.config.identity,
      projectionVersion: POSTWAR_RUNTIME_SCHEMA,
    },
    world = { ...base.config.world, minimumWorldVersion: '0' },
    read = {
      ...base.config,
      identity,
      currentIdentity: () => identity,
      world,
      endpoints: {
        ...base.config.endpoints,
        projectionPath: POSTWAR_RUNTIME_PATH,
      },
    },
    seed = {
      worldId: world.worldId,
      seedRef: world.seedRef,
      contentHash: world.contentHash,
      admissionRef: world.admissionRef,
    };
  const row = {
    schemaVersion: 'postwar-industry-labour-current-row-v1',
    countryId: identity.countryId,
    facilityId: 'FACILITY_TEST_ONLY',
    locationId: 'LOCATION_TEST_ONLY',
    operatorId: 'OP_TEST_ONLY',
    positionId: 'POSITION_TEST_ONLY',
    skill: 'LOW',
    classificationId: 'SKILL_TEST_ONLY',
    requiredCount: '12',
    openingFilledCount: '10',
    currentEmployedCount: head === '0' ? '10' : '9',
    measurement: 'EMPLOYMENT_HEADCOUNT_NOT_ATTENDANCE_OR_PAYMENT',
    completedPersonDays: null,
    paidCost: null,
  };
  const coverage = {
    schemaVersion: 'postwar-industry-labour-current-coverage-v1',
    countryId: identity.countryId,
    prefixFingerprint: fp,
    knownEffectsFingerprint: fp,
    coveredThroughEventId: head === '0' ? null : 'EVENT_TEST_ONLY',
    coveredThroughEventFingerprint: head === '0' ? null : fp,
    financialPostingCount: '0',
    financialBatchCount: '0',
    financialPostingsFingerprint: fp,
    globalWorldVersion: head,
    globalEventSequence: head,
    rowsHash: fp,
    originalScopeSha256: raw,
  };
  const body = {
    schemaVersion: POSTWAR_RUNTIME_SCHEMA,
    requestId,
    ok: true,
    status: 'AVAILABLE',
    dataset: 'industry-labour-current',
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
      dataNature:
        head === '0'
          ? POSTWAR_INDUSTRY_LABOUR_OPENING_NATURE
          : POSTWAR_INDUSTRY_LABOUR_CURRENT_NATURE,
      sourceVersion: fp,
      bindingVersion: fp,
      sourceRevision: 'SOURCE_REV_TEST_ONLY',
      worldId: identity.worldId,
      countryId: identity.countryId,
      officeId: identity.officeId,
      authSubjectId: identity.authSubjectId,
      authorizationRevision: identity.authorizationRevision,
      scopeKey: identity.scopeKey,
      modelVersion: identity.modelVersion,
      seedRef: world.seedRef,
      contentHash: world.contentHash,
      admissionRef: world.admissionRef,
      worldVersion: head,
      eventSequence: head,
      originWorldVersion: '0',
      originEventSequence: '0',
      observedHead: { worldVersion: head, eventSequence: head },
      currentIndustryLabourCoverage: coverage,
      pageHash: raw,
      returnedRowsHash: raw,
      hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
      sourcePointer: {
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
    page: { offset: 0, limit: 25, returned: 1, total: 1, nextOffset: null },
    rows: [row],
  };
  return { read, body };
}
type Body = ReturnType<typeof fixture>['body'];
async function consume(body: Body, read = fixture().read) {
  const c = createPostwarRuntimeClient(read, {
    fetcher: async () => Response.json(body),
  });
  try {
    return await c.readPage('industry-labour-current', requestId);
  } finally {
    c.disconnect();
  }
}
describe('Industry browser bounded headcount coverage', () => {
  it.each(['0', '2'])(
    'accepts exact typed H%s employment without converting headcount into completed work/pay',
    async (head) => {
      const f = fixture(head),
        r = await consume(f.body, f.read);
      expect(r.status).toBe('PAGE');
      if (r.status === 'PAGE') {
        expect(r.rows[0]).toMatchObject({
          completedPersonDays: null,
          paidCost: null,
        });
        expect(r.source.originWorldVersion).toBe('0');
        expect(r.authority.readback.worldVersion).toBe(head);
      }
    },
  );
  const changes: readonly [string, (b: Body) => unknown][] = [
    [
      'foreign coverage',
      (b) => ({
        ...b,
        source: {
          ...b.source,
          currentIndustryLabourCoverage: {
            ...b.source.currentIndustryLabourCoverage,
            countryId: 'OTHER_COUNTRY',
          },
        },
      }),
    ],
    [
      'foreign rows',
      (b) => ({ ...b, rows: [{ ...b.rows[0], countryId: 'OTHER_COUNTRY' }] }),
    ],
    [
      'paid headcount fiction',
      (b) => ({ ...b, rows: [{ ...b.rows[0], paidCost: '1' }] }),
    ],
    [
      'completed-day fiction',
      (b) => ({ ...b, rows: [{ ...b.rows[0], completedPersonDays: '1' }] }),
    ],
    [
      'over-capacity',
      (b) => ({ ...b, rows: [{ ...b.rows[0], currentEmployedCount: '13' }] }),
    ],
    [
      'wrong known prefix',
      (b) => ({
        ...b,
        source: {
          ...b.source,
          currentIndustryLabourCoverage: {
            ...b.source.currentIndustryLabourCoverage,
            globalWorldVersion: '3',
          },
        },
      }),
    ],
    [
      'wrong source kind',
      (b) => ({
        ...b,
        source: {
          ...b.source,
          dataNature: 'ADMITTED_H0_DERIVED_PROJECTION_NOT_POST_H0_REPLAY',
        },
      }),
    ],
    [
      'government employment source',
      (b) => ({
        ...b,
        source: {
          ...b.source,
          sourcePointer: {
            ...b.source.sourcePointer,
            selection: {
              ...b.source.sourcePointer.selection,
              employerRole: 'GOV',
            },
          },
        },
      }),
    ],
    [
      'financial coverage smuggling',
      (b) => ({ ...b, source: { ...b.source, currentFinancialCoverage: {} } }),
    ],
    [
      'wrong original pointer',
      (b) => ({
        ...b,
        source: {
          ...b.source,
          sourcePointer: {
            ...b.source.sourcePointer,
            path: 'seed.financialBatches',
          },
        },
      }),
    ],
  ];
  it.each(changes)('rejects %s', async (_name, change) => {
    const f = fixture();
    expect((await consume(change(f.body) as Body, f.read)).status).toBe(
      'UNAVAILABLE',
    );
  });
  it('rejects a changed opening headcount and arbitrary extra datasets', async () => {
    const f = fixture('0');
    expect(
      (
        await consume(
          {
            ...f.body,
            rows: [{ ...f.body.rows[0]!, currentEmployedCount: '9' }],
          },
          f.read,
        )
      ).status,
    ).toBe('UNAVAILABLE');
    let calls = 0;
    const c = createPostwarRuntimeClient(f.read, {
      fetcher: async () => {
        calls++;
        return Response.json(f.body);
      },
    });
    expect(
      await c.readPage('attendance-as-paid-work', requestId),
    ).toMatchObject({ status: 'DENIED', code: 'INVALID_DATASET' });
    expect(calls).toBe(0);
    c.disconnect();
  });
});
