import { parsePostwarTradeInventoryRow as parseSourceInventoryRow } from '../../packages/core/src/read-models/postwar-trade-current-contract.js';
/** Protocol/DOM evidence only; actual SQL/Atomic is tested separately. */
import { it, expect } from 'vitest';
import {
  parsePostwarTradeInventoryRow,
  POSTWAR_TRADE_CURRENT_NATURE,
} from '@econmind/core/postwar-trade-current-contract';
import {
  createPostwarRuntimeClient,
  POSTWAR_RUNTIME_SCHEMA,
  officeDatasets,
} from '../../apps/world-web/src/postwar-office-runtime/client.js';
import { officeProjectionFixture } from './office-projection-fixture.js';
const fingerprint = 'sha256:' + 'a'.repeat(64),
  requestId = '11111111-1111-4111-8111-111111111111';
const stock = {
  schemaVersion: 'postwar-trade-current-inventory-row-v1',
  countryId: 'COUNTRY_01',
  commodityId: 'GRAIN',
  batchId: 'BATCH_TEST',
  unit: 'tonne',
  physicalLocationId: 'LOCATION_TEST',
  bucket: 'IN_TRANSIT',
  reservationId: null,
  shipmentId: 'SHIPMENT_TEST',
  titleHolderId: 'ENTITY_TEST_SELLER',
  riskBearerId: 'ENTITY_TEST_SELLER',
  economicRecognitionId: null,
  quantity: '0.000001',
};
function fixture(
  transform: (body: Record<string, unknown>) => unknown = (x) => x,
) {
  const base = officeProjectionFixture('trade'),
    identity = {
      ...base.config.identity,
      countryId: 'COUNTRY_01',
      scopeKey: 'OFFICE_434F554E5452595F3031_5452414445',
      projectionVersion: POSTWAR_RUNTIME_SCHEMA,
    },
    config = {
      ...base.config,
      identity,
      currentIdentity: () => identity,
      endpoints: {
        ...base.config.endpoints,
        projectionPath: '/v1/postwar-office-runtime',
      },
      world: { ...base.config.world, minimumWorldVersion: '0' },
    };
  const seed = {
    worldId: config.world.worldId,
    seedRef: config.world.seedRef,
    contentHash: config.world.contentHash,
    admissionRef: config.world.admissionRef,
  };
  const fetcher: typeof fetch = async (_url, init) => {
    const req = JSON.parse(String(init?.body)) as {
      requestId: string;
      dataset: string;
    };
    const body = {
      schemaVersion: POSTWAR_RUNTIME_SCHEMA,
      requestId: req.requestId,
      ok: true,
      status: 'AVAILABLE',
      dataset: req.dataset,
      authority: {
        source: 'SERVER_VERIFIED_READ_BINDING',
        capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
        identity,
        seatRef: config.seatRef,
        seatState: 'ACTIVE',
        seed,
        readback: {
          ...seed,
          worldVersion: '2',
          eventSequence: '2',
          readbackRef: 'READBACK_TEST',
        },
      },
      source: {
        dataNature: POSTWAR_TRADE_CURRENT_NATURE,
        sourceVersion: fingerprint,
        bindingVersion: fingerprint,
        sourceRevision: 'TEST_REV',
        worldId: identity.worldId,
        countryId: identity.countryId,
        officeId: 'TRADE',
        authSubjectId: identity.authSubjectId,
        authorizationRevision: identity.authorizationRevision,
        scopeKey: identity.scopeKey,
        modelVersion: identity.modelVersion,
        seedRef: seed.seedRef,
        contentHash: seed.contentHash,
        admissionRef: seed.admissionRef,
        worldVersion: '2',
        eventSequence: '2',
        originWorldVersion: '2',
        originEventSequence: '2',
        observedHead: { worldVersion: '2', eventSequence: '2' },
        currentTradeCoverage: {
          schemaVersion: 'postwar-trade-current-page-chain-coverage-v1',
          reducerVersion: 'POSTWAR_COMPLETE_MIXED_PAGED_PREFIX_V1',
          countryId: identity.countryId,
          coverageRef: 'COVERAGE_TEST',
          globalWorldVersion: '2',
          globalEventSequence: '2',
          prefixFingerprint: fingerprint,
          knownEffectsFingerprint: fingerprint,
          coveredThroughEventId: 'EVENT_TEST_LAST',
          coveredThroughEventFingerprint: fingerprint,
          financialPostingCount: '0',
          financialBatchCount: '0',
          financialPostingsFingerprint: fingerprint,
          pageProof: {
            schemaVersion: 'postwar-complete-page-proof-v1',
            hashAlgorithm: 'COMPLETE_CANONICAL_PAGE_CHAINS_SHA256_V1',
            pageCount: '1',
            frameCount: '2',
          },
          inventoryRowsHash: fingerprint,
          transferRowsHash: fingerprint,
        },
        pageHash: 'b'.repeat(64),
        returnedRowsHash: 'b'.repeat(64),
        hashAlgorithm: 'POSTGRES_JSONB_TEXT_UTF8_SHA256',
        sourcePointer: {
          schemaVersion: 'postwar-trade-current-source-pointer-v1',
        },
      },
      page: { offset: 0, limit: 25, returned: 1, total: 1, nextOffset: null },
      rows: [stock],
    };
    return Response.json(transform(body));
  };
  return { config, fetcher };
}
it('uses existing canonical account bucket semantics and keeps exact decimal/title/location fields', () => {
  expect(parsePostwarTradeInventoryRow(stock)).toEqual(stock);
  expect(parseSourceInventoryRow({ ...stock, unit: 'tonne km' })).toMatchObject(
    { unit: 'tonne km' },
  );
  expect(() =>
    parsePostwarTradeInventoryRow({
      ...stock,
      reservationId: 'RESERVATION_WRONG',
    }),
  ).toThrow();
  expect(() =>
    parsePostwarTradeInventoryRow({ ...stock, quantity: '0' }),
  ).toThrow();
  expect(
    parsePostwarTradeInventoryRow({
      ...stock,
      bucket: 'RESERVED',
      reservationId: 'RESERVATION_TEST',
      shipmentId: null,
    }),
  ).toMatchObject({ bucket: 'RESERVED' });
});
it('reads current inventory separately from immutable opening stock', async () => {
  const f = fixture(),
    client = createPostwarRuntimeClient(f.config, { fetcher: f.fetcher });
  try {
    expect(officeDatasets.TRADE).toContain('opening-inventory-entries');
    const page = await client.readPage('inventory-current', requestId);
    expect(page).toMatchObject({ status: 'PAGE', rows: [stock] });
  } finally {
    client.disconnect();
  }
});
it.each(['wrongCountry', 'openingAsCurrent', 'staleCoverage', 'foreignOffice'])(
  'rejects %s instead of falling back to opening/empty',
  async (kind) => {
    const f = fixture((body) => {
        const source = body.source as Record<string, unknown>,
          coverage = source.currentTradeCoverage as Record<string, unknown>;
        if (kind === 'wrongCountry')
          body.rows = [{ ...stock, countryId: 'COUNTRY_02' }];
        if (kind === 'openingAsCurrent')
          source.dataNature = 'ADMITTED_IMMUTABLE_OPENING_FACTS';
        if (kind === 'staleCoverage') coverage.globalWorldVersion = '1';
        if (kind === 'foreignOffice') source.officeId = 'INDUSTRY';
        return body;
      }),
      client = createPostwarRuntimeClient(f.config, { fetcher: f.fetcher });
    try {
      expect(
        (await client.readPage('inventory-current', requestId)).status,
      ).toBe('UNAVAILABLE');
    } finally {
      client.disconnect();
    }
  },
);
