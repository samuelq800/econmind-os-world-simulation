import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const { loadOwnerNonHostSourceAdoption, CENTRAL_BANK_OPENING_CATEGORIES } =
  await import(
    path.join(
      repositoryRoot,
      'apps/world-worker/dist/preparation/owner-non-host-source-adoption.js',
    )
  );
const ownerRoot = path.join(
  repositoryRoot,
  'docs/governance/owner-inputs/2026-10-07',
);
const adoption = await loadOwnerNonHostSourceAdoption({
  repositoryRoot,
  ownerDocumentPath: path.join(
    ownerRoot,
    'OWNER_NON_HOST_DECISIONS.original.md',
  ),
  rootReceiptPath: path.join(ownerRoot, 'OWNER_NON_HOST_DECISION_RECEIPT.json'),
  scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
});
const m = adoption.manifest;
const first = m.countries[0];
assert.ok(first);
const sharedCategories = first.cbInput.filter(
  (r) => r.gcuEquivalentAmount === null,
);
for (const country of m.countries) {
  assert.deepEqual(
    country.cbInput.filter((r) => r.gcuEquivalentAmount === null),
    sharedCategories.map((r) => ({ ...r, countryId: country.countryId })),
  );
}
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const gapCounts = Object.fromEntries(
  [...new Set(m.gaps.map((r) => r.code))].map((code) => [
    code,
    String(m.gaps.filter((r) => r.code === code).length),
  ]),
);
const result = {
  schemaVersion: 'E_OWNER_NON_HOST_REVIEW_PROJECTION_V1',
  status: 'IMPLEMENTED_UNVERIFIED',
  purpose:
    'Deterministic review projection generated from the real branded filesystem loader, not an opening seed or authority record.',
  fullManifestFingerprint: adoption.manifestFingerprint,
  state: adoption.state,
  scope: m.scope,
  ownerRecord: m.ownerRecord,
  sourcePins: m.sourcePins,
  counts: {
    countries: m.countryCount,
    entities: String(m.entities.length),
    stockRights: String(m.stockRights.length),
    positiveStocks: m.positiveStockCount,
    zeroSourceCells: m.zeroSourceCellCount,
    cbCategoriesPerCountry: m.centralBankCategoryCount,
    inventoryEntriesInNonActivatedScope: String(
      adoption.inventoryEntries.length,
    ),
    sourceGaps: String(m.gaps.length),
  },
  provenance: {
    entitiesJsonSha256: hash(m.entities),
    stockRightsJsonSha256: hash(m.stockRights),
    denominationSourcePath:
      first.denominations.treasuryCentralBankBalance.sourcePath,
    denominationSourceSha256:
      first.denominations.treasuryCentralBankBalance.sourceSha256,
    rawUnit: 'GCU_SCENARIO_ACCOUNTING_UNIT',
    denominationDecisionId: 'D03.1',
    denominationState: 'SOURCE_RECONCILED_GCU_LC_MISSING',
    denominationFxAuthority: 'SOURCE_MISSING',
    rawValuesNeverRewritten: true,
  },
  centralBankCategoryCatalog: CENTRAL_BANK_OPENING_CATEGORIES,
  sharedUnadoptedCentralBankInputs: sharedCategories.map(
    ({ countryId, ...r }) => {
      assert.equal(countryId, first.countryId);
      return r;
    },
  ),
  countries: m.countries.map((c) => ({
    countryId: c.countryId,
    sourceRowPointer: c.sourceRowPointer,
    rawFinance: c.rawFinance,
    holderRoster: c.holderRoster,
    denominations: Object.fromEntries(
      Object.entries(c.denominations).map(([field, d]) => [
        field,
        {
          rawLexeme: d.rawLexeme,
          sourcePointer: d.sourcePointer,
          gcuEquivalent: d.gcuEquivalent,
          localBookValue: d.localBookValue,
          openingFx: d.openingFx,
        },
      ]),
    ),
    bankOpening: c.bankOpening,
    treasury: c.treasury,
    reserve: c.reserve,
    knownCentralBankInputs: c.cbInput.filter(
      (r) => r.gcuEquivalentAmount !== null,
    ),
    centralBankNetWorth: c.centralBankNetWorth,
  })),
  prohibitedBackingSubstitutions: first.prohibitedBackingSubstitutions,
  gapCounts,
  gapRule:
    'For each country and each of seven finance fields: localCurrency and openingFx missing. Each country: complete CB asset/liability holding register not established. Formal worldId unbound. Full exact gap list remains available on branded adoption.manifest.gaps.',
  legacyInspection: {
    status: adoption.legacyInspection.status,
    ownerRecordsCount: String(adoption.legacyOwnerRecords.length),
    wholeLegacyProposalAdopted: false,
  },
  seedAdmissionAllowed: adoption.seedAdmissionAllowed,
  productionAuthorized: adoption.productionAuthorized,
};
process.stdout.write(
  await format(JSON.stringify(result, null, 2), {
    ...(await resolveConfig(path.join(repositoryRoot, 'REVIEW_MANIFEST.json'))),
    parser: 'json',
  }),
);
