import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { beforeAll, describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  inspectOfficialOpeningDecisionSource,
  type OfficialOpeningSourceBytes,
} from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import { createOfficialLabourSocialOpeningAdoption } from '../../apps/world-worker/src/preparation/official-labour-social-opening-adoption.js';
import { createPostwarWagePolicy } from '../../apps/world-worker/src/preparation/postwar-wage-policy.js';
import { preparePostwarSocialServiceGenesis } from '../../apps/world-worker/src/preparation/postwar-social-service-genesis.js';
import { createPostwarPublicSafetyGenesis } from '../../apps/world-worker/src/preparation/postwar-public-safety-genesis.js';
import { preparePostwarLabourGenesis } from '../../apps/world-worker/src/preparation/postwar-labour-genesis.js';
import { createPostwarMonetaryGenesis } from '../../apps/world-worker/src/preparation/postwar-monetary-genesis.js';
import { buildPostwarHousingGenesis } from '../../apps/world-worker/src/preparation/postwar-housing-genesis.js';
import { loadOwnerNonHostSourceAdoption } from '../../apps/world-worker/src/preparation/owner-non-host-source-adoption.js';
import {
  createPostwarFinancialGenesis,
  readPostwarLiquidFundingAccountsFromSeed,
  type PostwarFinancialGenesis,
} from '../../apps/world-worker/src/preparation/postwar-financial-genesis.js';
import {
  createPostwarHousingRentBindings,
  verifyPostwarHousingRentReclassificationFamily,
  isPostwarHousingRentBindings,
  type PostwarHousingRentBindings,
} from '../../apps/world-worker/src/preparation/postwar-housing-rent-bindings.js';
const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFile(path.join(root, file), 'utf8');
const mappingBytes = await read(
  'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
);
const mapping = JSON.parse(mappingBytes) as {
  source: { dataFiles: Record<string, unknown> };
};
const sourceBytes: OfficialOpeningSourceBytes = {
  mappingBytes,
  checksumsBytes: await read(
    'artifacts/world-balanced-candidate-v1/CHECKSUMS.json',
  ),
  coverageBytes: await read(
    'docs/reports/world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json',
  ),
  proposalBytes: await read(
    'artifacts/E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md',
  ),
  datasets: Object.fromEntries(
    await Promise.all(
      Object.keys(mapping.source.dataFiles).map(async (p) => [
        p,
        await read(`artifacts/world-balanced-candidate-v1/${p}`),
      ]),
    ),
  ),
};
const inspected = inspectOfficialOpeningDecisionSource(sourceBytes);
if (!inspected.source) throw new Error(JSON.stringify(inspected.blockers));
const ownerDecisionBytes = await read(
  'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
);
const adoption = createOfficialLabourSocialOpeningAdoption({
  source: inspected.source,
  mappingBytes,
  ownerOriginalBytes: ownerDecisionBytes,
  ownerReceiptBytes: await read(
    'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
  ),
  datasets: {
    employment: sourceBytes.datasets['data/employment.json']!,
    'population-services':
      sourceBytes.datasets['data/population-services.json']!,
    regions: sourceBytes.datasets['data/regions.json']!,
    facilities: sourceBytes.datasets['data/facilities.json']!,
  },
});
// Real pinned source + real generated service/police/labour/wage/FX constructors.
// The explicit world/seed scope is TEST_ONLY; no constructor writes financial history.
const worldId = 'WORLD_TEST_ONLY_POSTWAR_HOUSING';
const seedId = 'SEED_TEST_ONLY_POSTWAR_HOUSING';
const regionsBytes = sourceBytes.datasets['data/regions.json']!;
const countriesBytes = sourceBytes.datasets['data/countries.json']!;
const social = preparePostwarSocialServiceGenesis({
  adoption,
  mappingBytes,
  regionsBytes,
  worldId,
  seedId,
});
const safety = createPostwarPublicSafetyGenesis({
  worldId,
  seed: seedId,
  policyBytes: await read('config/postwar-genesis/public-safety.v1.json'),
  source: inspected.source,
  adoption,
  mappingBytes,
  countriesBytes,
  regionsBytes,
});
const labourPreparation = preparePostwarLabourGenesis({
  adoption,
  mappingBytes,
  regionsBytes,
  facilitiesBytes: sourceBytes.datasets['data/facilities.json']!,
  serviceDemands: [...social.demands, ...safety.demands],
});
const monetary = createPostwarMonetaryGenesis({
  source: inspected.source,
  countriesBytes,
  mappingBytes,
  valueDate: '2026-10-28',
});
const wagePolicy = createPostwarWagePolicy({
  policyBytes: await read('config/postwar-genesis/wage-policy.v1.json'),
  adoption,
  financeSource: inspected.source,
  monetaryBindings: monetary.bindings,
  labourPreparation,
});
const policyBytes = await read('config/postwar-genesis/housing.v1.json');
const input = { sourceBytes, ownerDecisionBytes, policyBytes, wagePolicy };
const genesis = buildPostwarHousingGenesis(input);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
let financial: PostwarFinancialGenesis;
let bindings: PostwarHousingRentBindings;
beforeAll(async () => {
  const parent = await loadOwnerNonHostSourceAdoption({
    repositoryRoot: root,
    ownerDocumentPath: path.join(
      root,
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
    ),
    rootReceiptPath: path.join(
      root,
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
    ),
    scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
  });
  financial = createPostwarFinancialGenesis({
    adoption: parent,
    monetary,
    worldId,
    seedId,
    sourceId: 'SOURCE_TEST_ONLY_HOUSING_RENT_FINANCIAL_PARENT',
    genesisVersion: 'POSTWAR_OPERATING_20261028_V1',
  });
  bindings = createPostwarHousingRentBindings({ financial, housing: genesis });
}, 120_000);
describe('separate actual 70-country beneficial housing rent source family', () => {
  it('retains the original producer/bridge parent, all source inventory, GOV/OP/bank balances and each country legal HH claim', () => {
    expect(bindings.countries).toHaveLength(70);
    expect(bindings.accounts).toHaveLength(488);
    expect(bindings.privateRentTerms).toHaveLength(122);
    expect(bindings.publicRentRules).toHaveLength(122);
    expect(bindings.leaseSegmentCount).toBe('244');
    expect(bindings.householdCount).toBe('4449317385');
    expect(bindings.population).toBe('14712146434');
    expect(bindings.parentSeed.fingerprint).toBe(
      financial.baselineSeed.fingerprint,
    );
    expect(bindings.seed.sources).toHaveLength(
      financial.baselineSeed.sources.length + 70,
    );
    expect(bindings.seed.financialBatches).toHaveLength(
      financial.baselineSeed.financialBatches.length + 70,
    );
    expect(C.canonicalSerialize(bindings.seed.inventoryEntries)).toBe(
      C.canonicalSerialize(financial.baselineSeed.inventoryEntries),
    );
    const original = readPostwarLiquidFundingAccountsFromSeed(
      financial.baselineSeed,
    );
    for (const claim of bindings.aggregateHouseholdClaims) {
      const baseline = original.find(
        (a) =>
          a.kind === 'HOUSEHOLD_BANK_DEPOSIT' &&
          a.countryId === claim.countryId,
      )!;
      expect(claim.amount).toBe(baseline.availableAmount);
      expect(claim.originAccountId).toBe(baseline.accountId);
      expect(claim.spendable).toBe(false);
      const subgroupTotal = bindings.accounts
        .filter((a) => a.countryId === claim.countryId)
        .reduce(
          (m, a) => m.add(C.Money.from(a.availableAmount, claim.currency)),
          C.Money.from('0', claim.currency),
        );
      expect(C.canonicalDecimal(subgroupTotal.amount)).toBe(claim.amount);
    }
    const ledger = C.rebuildV08LedgersFromLineage({
      seed: bindings.seed,
      sha256Hex: sha,
    }).financial;
    for (const a of bindings.accounts) {
      expect(a.kind).toBe('HOUSEHOLD_BENEFICIAL_GROUP_DEPOSIT');
      expect(a.accountId).not.toBe(a.originAccountId);
      expect(a.account.accountId).toBe(a.accountId);
      expect(a.ownerId).toBe(`ENTITY_HOUSEHOLDS_${a.countryId.slice(-2)}`);
      expect(a.claimId).toBe(a.account.claimId);
      expect(ledger.accounts.some((p) => p.accountId === a.accountId)).toBe(
        true,
      );
    }
    expect(
      bindings.countries.every(
        (c) =>
          c.receipt.parentSeedFingerprint === bindings.parentSeed.fingerprint &&
          c.receipt.childSeedFingerprint !== bindings.seed.fingerprint,
      ),
    ).toBe(true);
    expect(
      bindings.countries.every(
        (c) =>
          c.receipt.rentPaidAtOpening === '0' &&
          c.receipt.rentAccruedAtOpening === '0' &&
          c.initialRentState.paid.length === 0,
      ),
    ).toBe(true);
  });
  it('preserves real annual LC rent/FX exactly through 359 regular days plus one precise final-day remainder', () => {
    for (const term of bindings.privateRentTerms) {
      const source = genesis.regions.find(
          (r) => r.locationId === term.locationId,
        )!,
        annual = source.rentObligations.find(
          (o) => o.payerEntityId === o.beneficiaryEntityId,
        )!;
      expect(term.annualAmountPerHousehold).toBe(annual.perHousehold.amount);
      expect(term.currency).toBe(annual.perHousehold.currency);
      expect(term.fxVersion).toBe(source.monetary.fxVersion);
      expect(
        C.Money.from(term.dailyAmountPerHousehold, term.currency)
          .amount.times('359')
          .plus(
            C.Money.from(term.finalDayAmountPerHousehold, term.currency).amount,
          )
          .equals(
            C.Money.from(term.annualAmountPerHousehold, term.currency).amount,
          ),
      ).toBe(true);
      expect(term.landlordGroupRef).not.toBe(term.tenantGroupRef);
      expect(term.initialCashCoversFirstDay).toBe(true);
      const leases = bindings.countries
        .find((c) => c.countryId === term.countryId)!
        .receipt.leases.filter((l) => term.leaseIds.includes(l.leaseId));
      expect(leases).toHaveLength(2);
      expect(leases[0]!.endTick).toBe(leases[1]!.startTick);
      expect(
        leases.every(
          (l) =>
            l.households === source.cohorts[1]!.households &&
            l.firstHouseholdOrdinal === '0' &&
            l.periodTicks === C.SIMULATION_TICKS_PER_DAY,
        ),
      ).toBe(true);
    }
  });
  it('actually pays the full real COUNTRY_01 private renter cohort at its non-1LC day rate and independently replays the composed seed financial lineage', () => {
    const country = bindings.countries.find(
        (c) => c.countryId === 'COUNTRY_01',
      )!,
      term = bindings.privateRentTerms.find(
        (t) => t.locationId === 'REGION_01_E1',
      )!,
      leaseId = term.leaseIds[0]!,
      before = C.rebuildV08LedgersFromLineage({
        seed: bindings.seed,
        sha256Hex: sha,
      }).financial,
      simTime = C.SimTime.fromTicks(
        (1n + BigInt(C.SIMULATION_TICKS_PER_DAY)).toString(),
      );
    const draft = C.prepareBeneficialHousingRent(
      {
        receipt: country.receipt,
        state: country.initialRentState,
        financialBefore: before,
        leaseId,
        periodIndex: '0',
        simTime,
      },
      sha,
    );
    expect(C.canonicalDecimal(draft.amount.amount)).toBe(term.firstDayDue);
    expect(draft.amount.amount.equals('1')).toBe(false);
    const command = C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        worldId,
        countryId: 'COUNTRY_01',
        actorId: 'ACTOR_TEST_ONLY_POSTWAR_RENT',
        authSubject: '00000000-0000-4000-8000-000000000001',
        commandId: 'COMMAND_ACTUAL_COUNTRY01_FIRST_DAY_RENT',
        commandType: C.BENEFICIAL_HOUSING_RENT_COMMAND,
        correlationId: 'CORRELATION_ACTUAL_COUNTRY01_RENT',
        expectedWorldVersion: '0',
        idempotencyKey: draft.idempotencyKey,
        officeId: null,
        payload: draft.commandPayload,
        simTime: simTime.toCanonicalValue(),
        submittedAtReal: '2026-10-28T00:00:00.000Z',
      },
      sha,
    );
    const event = C.parseAuthoritativeEvent(
      {
        schemaVersion: C.EVENT_SCHEMA_VERSION,
        worldId,
        eventId: 'EVENT_ACTUAL_COUNTRY01_FIRST_DAY_RENT',
        eventType: C.BENEFICIAL_HOUSING_RENT_EVENT,
        sequence: '1',
        worldVersion: '1',
        simTime: simTime.toCanonicalValue(),
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        correctsEventId: null,
        payload: draft.eventPayload,
        recordedAtReal: '2026-10-28T00:00:00.000Z',
      },
      sha,
    );
    const transition = C.createAuthoritativeTransition({
        command,
        worldVersionBefore: '0',
        worldVersionAfter: '1',
        events: [event],
      }),
      paid = C.settleBeneficialHousingRent(
        {
          receipt: country.receipt,
          state: country.initialRentState,
          financialBefore: before,
          command,
          transition,
          leaseId,
          periodIndex: '0',
        },
        sha,
      );
    expect(paid.outcome).toBe('APPLIED');
    const after = C.aggregateBeneficialHousingLiquidClaim(
        paid.financial,
        country.receipt,
      ),
      prior = C.aggregateBeneficialHousingLiquidClaim(before, country.receipt);
    expect(after.availableAmount).toBe(prior.availableAmount);
    const oldTenant = prior.subaccounts.find(
        (a) => a.groupId === term.tenantGroupRef,
      )!,
      newTenant = after.subaccounts.find(
        (a) => a.groupId === term.tenantGroupRef,
      )!;
    expect(
      C.Money.from(oldTenant.availableAmount, term.currency)
        .subtract(C.Money.from(newTenant.availableAmount, term.currency))
        .amount.equals(draft.amount.amount),
    ).toBe(true);
    const replay = C.rebuildV08LedgersFromLineage({
      seed: bindings.seed,
      transitions: [
        {
          command,
          transition,
          financialPostingBatches: [paid.posting!],
          inventoryPostings: [],
        },
      ],
      sha256Hex: sha,
    });
    expect(C.canonicalSerialize(replay.financial)).toBe(
      C.canonicalSerialize(paid.financial),
    );
    expect(
      C.settleBeneficialHousingRent(
        {
          receipt: country.receipt,
          state: paid.state,
          financialBefore: paid.financial,
          command,
          transition,
          leaseId,
          periodIndex: '0',
        },
        sha,
      ).outcome,
    ).toBe('EXACT_DUPLICATE');
  });
  it('independently verifies all 70 receipt source/batch families and refuses missing, changed or differently scoped evidence', () => {
    const receipts = bindings.countries.map(
      (c) => JSON.parse(C.canonicalSerialize(c.receipt)) as typeof c.receipt,
    );
    const verified = verifyPostwarHousingRentReclassificationFamily({
      parentSeed: bindings.parentSeed,
      seed: bindings.seed,
      receipts,
    });
    expect(verified).toHaveLength(70);
    for (const c of verified)
      expect(c.aggregate.availableAmount).toBe(c.receipt.originalAmount);
    expect(() =>
      verifyPostwarHousingRentReclassificationFamily({
        parentSeed: bindings.parentSeed,
        seed: bindings.seed,
        receipts: receipts.slice(1),
      }),
    ).toThrow('complete unique');
    expect(() =>
      verifyPostwarHousingRentReclassificationFamily({
        parentSeed: bindings.parentSeed,
        seed: bindings.seed,
        receipts: [
          {
            ...receipts[0]!,
            parentSeedFingerprint: ('sha256:' +
              'a'.repeat(64)) as C.CanonicalSha256,
          },
          ...receipts.slice(1),
        ],
      }),
    ).toThrow('wrong financial parent');
    const changed = C.createOpeningSeed(
      {
        ...bindings.seed,
        seedId: C.openingSeedId('SEED_WRONG_BENEFICIAL_FAMILY'),
      },
      sha,
    );
    expect(() =>
      verifyPostwarHousingRentReclassificationFamily({
        parentSeed: bindings.parentSeed,
        seed: changed,
        receipts,
      }),
    ).toThrow('seed/world scope');
  }, 120_000);
  it('replays bytes deterministically without claiming default host registration, overriding CURRENT_REPLAY_BINDING or updating the three-source candidate', async () => {
    expect(
      createPostwarHousingRentBindings({ financial, housing: genesis }),
    ).toBe(bindings);
    expect(
      isPostwarHousingRentBindings(JSON.parse(C.canonicalSerialize(bindings))),
    ).toBe(false);
    expect(() =>
      createPostwarHousingRentBindings({
        financial,
        housing: JSON.parse(C.canonicalSerialize(genesis)),
      }),
    ).toThrow('genuine source-bound housing');
    expect(bindings.defaultHostCommandFamily).toBe('NOT_REGISTERED');
    expect(bindings.defaultHostReducer).toBe('NOT_REGISTERED');
    expect(bindings.productionAdmission).toBe(false);
    expect(bindings.WorldClock).toBe(false);
    expect(bindings.seed.replayBinding).toEqual(C.CURRENT_REPLAY_BINDING);
    expect(financial.baselineSeed.sources).toHaveLength(1);
    expect(
      readPostwarLiquidFundingAccountsFromSeed(financial.baselineSeed),
    ).toHaveLength(210);
    expect(() =>
      readPostwarLiquidFundingAccountsFromSeed(bindings.seed),
    ).toThrow('EXACT_CLAIM_MIRROR_REQUIRED');
    const directory = process.env.ECONMIND_HOUSING_RENT_BINDINGS_EVIDENCE_DIR;
    if (directory) {
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, 'housing-rent-bindings.json'),
        C.canonicalSerialize(bindings) + '\n',
        { mode: 0o600 },
      );
    }
  });
});
