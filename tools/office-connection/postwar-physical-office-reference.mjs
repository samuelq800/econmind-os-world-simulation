/** Opt-in actual-source reference evidence. No DB, role/key creation or World. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseOpeningSeed,
  canonicalSerialize,
  canonicalDecimal,
  parseWorldDecimal,
} from '@econmind/core';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--seed' || !path.isAbsolute(args[1]))
  throw Error('Use --seed ABSOLUTE_VALIDATED_REFERENCE_SEED_JSON');
const sourcePath =
  'apps/world-worker/src/persistence/postwar-physical-office-runtime-source.ts';
const compiledPath =
  'apps/world-worker/dist/persistence/postwar-physical-office-runtime-source.js';
const [sourceStat, compiledStat] = await Promise.all([
  stat(path.join(root, sourcePath)),
  stat(path.join(root, compiledPath)),
]);
if (sourceStat.mtimeMs > compiledStat.mtimeMs)
  throw Error('ROOT_UNIFIED_WORKER_BUILD_REQUIRED');
const { createPostwarPhysicalOfficeFactsProjector } = await import(
  `../../${compiledPath}`
);
const { loadPostwarSourceContext } =
  await import('../../apps/world-worker/dist/preparation/postwar-source-context.js');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const seed = parseOpeningSeed(JSON.parse(await readFile(args[1], 'utf8')), sha);
assert.equal(
  seed.fingerprint,
  'sha256:c42757599f51fe7e21ff52c152387c1f6a27649ff0cd199dd39b7d2205386589',
  'EXACT_C427_REFERENCE_REQUIRED',
);
const context = await loadPostwarSourceContext(root);
const projector = createPostwarPhysicalOfficeFactsProjector({
  seed,
  sourceContext: context,
});
const commodityIds = new Set(
  context.source.commodities.map((row) => row.coreCommodityId),
);
const results = [];
for (const countryId of ['COUNTRY_01', 'COUNTRY_70']) {
  const industry = projector.project({ countryId, officeId: 'INDUSTRY' });
  assert.equal(industry.officeId, 'INDUSTRY');
  assert.equal(industry.countryId, countryId);
  const entries = seed.inventoryEntries.filter(
    (entry) =>
      entry.account.countryId === countryId &&
      commodityIds.has(entry.account.commodityId),
  );
  assert.ok(entries.length > 0);
  assert.equal(industry.inventory.length, entries.length);
  for (const row of industry.inventory) {
    const entry = entries.find(
      (entry) => entry.entryId === row.openingEntryReferences[0]?.entryId,
    );
    assert.ok(entry);
    assert.equal(row.countryId, countryId);
    assert.equal(row.quantity, canonicalDecimal(entry.quantity.amount));
    for (const key of [
      'titleHolderId',
      'riskBearerId',
      'bucket',
      'physicalLocationId',
    ])
      assert.equal(row[key], entry.account[key]);
    assert.equal(
      row.openingEntryReferences[0].sourcePayloadHash,
      seed.sources.find((source) => source.sourceId === entry.sourceId)
        .payloadHash,
    );
  }
  assert.ok(industry.facilities.length > 0);
  assert.ok(industry.waterRights.length > 0);
  assert.ok(
    industry.facilities.every(
      (facility) =>
        facility.countryId === countryId &&
        facility.actualOperatingPermitRef === null,
    ),
  );
  const trade = projector.project({ countryId, officeId: 'TRADE' });
  assert.equal(trade.officeId, 'TRADE');
  assert.equal(trade.countryId, countryId);
  assert.equal(trade.inventory.length, entries.length);
  const sourceCountry = context.source.legalEntityProposals.find(
    (row) => row.coreCountryId === countryId,
  ).sourceCountryId;
  const originalRoutes = JSON.parse(
    context.sourceBytes.datasets['data/transport-routes.json'],
  ).filter((route) =>
    [
      route.fromCountryId,
      route.toCountryId,
      ...route.transitCountryIds,
    ].includes(sourceCountry),
  );
  assert.equal(trade.routes.length, originalRoutes.length);
  assert.ok(
    trade.logisticsFacilities.every(
      (facility) => facility.countryId === countryId,
    ),
  );
  assert.ok(
    trade.routes.every(
      (route) =>
        !route.sourceEngineeringAndRightsApproved &&
        route.admittedTransportRightRef === null,
    ),
  );
  assert.equal(trade.tradeContractOriginals, null);
  assert.equal(trade.exportPermissions, null);
  const captain = projector.project({ countryId, officeId: 'CAPTAIN' });
  assert.equal(captain.officeId, 'CAPTAIN');
  assert.equal(captain.countryId, countryId);
  assert.ok(captain.inventoryTotals.length > 0);
  for (const total of captain.inventoryTotals) {
    const expected = industry.inventory
      .filter(
        (row) =>
          row.commodityId === total.commodityId &&
          row.unit === total.unit &&
          row.bucket === total.bucket,
      )
      .reduce((sum, row) => sum.add(row.quantity), parseWorldDecimal('0'));
    assert.equal(total.quantity, canonicalDecimal(expected));
  }
  assert.ok(captain.infrastructure.length > 0);
  assert.ok(captain.publicServices.length > 0);
  assert.ok(!Object.hasOwn(captain, 'inventory'));
  assert.ok(!Object.hasOwn(captain, 'facilities'));
  const encoded = canonicalSerialize(captain);
  for (const key of [
    'accountRef',
    'titleHolderId',
    'riskBearerId',
    'batchId',
    'financialPositions',
    'treasuryLiquidClaim',
    'centralBankRegister',
    'bankLoans',
    'payrollFundingRef',
    'canonicalPayload',
    'documents',
  ])
    assert.ok(!encoded.includes(`"${key}"`), key);
  for (const facts of [industry, trade, captain]) {
    const data = canonicalSerialize(facts);
    for (const key of [
      'financialPositions',
      'treasuryLiquidClaim',
      'centralBankRegister',
      'bankLoans',
      'fundingAccounts',
      'payrollFundingRef',
      'canonicalPayload',
      'documents',
    ])
      assert.ok(!data.includes(`"${key}"`), key);
  }
  results.push({
    countryId,
    inventoryRows: industry.inventory.length,
    industryFacilities: industry.facilities.length,
    tradeRoutes: trade.routes.length,
    captainAggregateRows: captain.inventoryTotals.length,
  });
}
assert.throws(
  () => projector.project({ countryId: 'COUNTRY_99', officeId: 'INDUSTRY' }),
  /outside pinned mapping/u,
);
process.stdout.write(
  JSON.stringify({
    schemaVersion: 'postwar-physical-office-reference-evidence-v1',
    classification: 'OFFLINE_ACTUAL_SOURCE_REFERENCE_NOT_API_ADMISSION',
    status: 'PASS',
    seedFingerprint: seed.fingerprint,
    physicalReceiptFingerprint: projector.physicalReceiptFingerprint,
    headWorldVersion: projector.headWorldVersion,
    headEventSequence: projector.headEventSequence,
    results,
    checks: {
      actualCoreParse: true,
      genuinePinnedContext: true,
      threeOfficeCountryCrop: true,
      exactInventoryQuantityAndOwner: true,
      planningRoutesNotPermits: true,
      captainNoPrivateStockOrFinancialOriginals: true,
      foreignCountryRejected: true,
    },
    databaseAccess: false,
    newKeysCreated: false,
    worldOrClockStarted: false,
  }) + '\n',
);
