import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import * as Dist from '@econmind/core';
import {
  reclassifyBeneficialHousingSeed,
  verifyBeneficialHousingReclassification,
  aggregateBeneficialHousingLiquidClaim,
  createBeneficialHousingRentState,
  synchronizeBeneficialHousingRentState,
  prepareBeneficialHousingRent,
  settleBeneficialHousingRent,
  replayBeneficialHousingRent,
  BENEFICIAL_HOUSING_RENT_COMMAND,
  BENEFICIAL_HOUSING_RENT_EVENT,
  type BeneficialHousingReclassificationInput,
  type BeneficialHousingReclassificationReceipt,
} from '../../packages/core/src/finance/beneficial-housing-rent.js';
import { loadOwnerNonHostSourceAdoption } from '../../apps/world-worker/src/preparation/owner-non-host-source-adoption.js';
import { createPostwarMonetaryGenesis } from '../../apps/world-worker/src/preparation/postwar-monetary-genesis.js';
import {
  createPostwarFinancialGenesis,
  readPostwarLiquidFundingAccountsFromSeed,
} from '../../apps/world-worker/src/preparation/postwar-financial-genesis.js';
const root = path.resolve(import.meta.dirname, '../..');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const YEAR = BigInt(C.SIMULATION_TICKS_PER_YEAR);
function baseSeed(scope: string, amount = '100.000003') {
  const worldId = C.worldId(`WORLD_TEST_ONLY_BENEFICIAL_${scope}`),
    countryId = C.countryId('COUNTRY_01'),
    ownerId = C.legalEntityId('ENTITY_HOUSEHOLDS_01'),
    bank = C.legalEntityId('ENTITY_BANK_01'),
    claimId = C.financialClaimId(`CLAIM_HH_${scope}`);
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId(`SOURCE_TEST_ONLY_${scope}`),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/world-core/beneficial-housing-rent.test.ts',
      sourceVersion: 'TEST_ONLY_V1',
      payload: { scope },
    },
    sha,
  );
  const asset = C.createFinancialAccount({
      worldId,
      countryId,
      ownerId,
      accountId: C.financialAccountId(`ACCOUNT_HH_${scope}`),
      accountClass: 'ASSET',
      currency: 'AAA',
      claimId,
      counterpartyEntityId: bank,
    }),
    liability = C.createFinancialAccount({
      ...asset,
      accountId: C.financialAccountId(`ACCOUNT_BANK_${scope}`),
      ownerId: bank,
      accountClass: 'LIABILITY',
      counterpartyEntityId: ownerId,
    });
  return C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId(`SEED_TEST_ONLY_BENEFICIAL_${scope}`),
      worldId,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [
        {
          batchId: C.financialOpeningBatchId(`BATCH_ORIGINAL_${scope}`),
          sourceId: source.sourceId,
          settlementCurrency: 'AAA',
          legs: [
            {
              legId: C.financialOpeningLegId('LEG_HH'),
              account: asset,
              direction: 'DEBIT',
              amount: C.Money.from(amount, 'AAA'),
              counterpartLegId: C.financialOpeningLegId('LEG_BANK'),
            },
            {
              legId: C.financialOpeningLegId('LEG_BANK'),
              account: liability,
              direction: 'CREDIT',
              amount: C.Money.from(amount, 'AAA'),
              counterpartLegId: C.financialOpeningLegId('LEG_HH'),
            },
          ],
        },
      ],
    },
    sha,
  );
}
function fixture(scope: string): BeneficialHousingReclassificationInput {
  const seed = baseSeed(scope),
    locationId = 'REGION_01_E1';
  return {
    seed,
    allocationId: `ALLOCATION_${scope}`,
    policyRef: 'GENERATED_POLICY_HOUSING_V1',
    sourcePopulationRef: 'TEST_ONLY_SIX_HOUSEHOLDS_EIGHTEEN_PEOPLE',
    countryId: 'COUNTRY_01',
    householdEntityId: 'ENTITY_HOUSEHOLDS_01',
    parentAccountId: `ACCOUNT_HH_${scope}`,
    regions: [{ locationId, households: '6', population: '18' }],
    groups: [
      {
        groupId: 'GROUP_OWNER',
        locationId,
        role: 'OWNER_OCCUPIER',
        firstHouseholdOrdinal: '0',
        households: '2',
        firstPersonOrdinal: '0',
        population: '6',
      },
      {
        groupId: 'GROUP_PRIVATE_RENTER',
        locationId,
        role: 'PRIVATE_RENTER',
        firstHouseholdOrdinal: '2',
        households: '2',
        firstPersonOrdinal: '6',
        population: '6',
      },
      {
        groupId: 'GROUP_PUBLIC_RENTER',
        locationId,
        role: 'PUBLIC_RENTER',
        firstHouseholdOrdinal: '4',
        households: '1',
        firstPersonOrdinal: '12',
        population: '3',
      },
      {
        groupId: 'GROUP_DISPLACED',
        locationId,
        role: 'DISPLACED',
        firstHouseholdOrdinal: '5',
        households: '1',
        firstPersonOrdinal: '15',
        population: '3',
      },
    ],
    pools: [
      {
        poolId: 'POOL_PRIVATE',
        locationId,
        landlordGroupId: 'GROUP_OWNER',
        totalUnits: '12',
        habitableUnits: '10',
        ownerOccupiedUnits: '2',
      },
    ],
    leases: [
      {
        leaseId: 'LEASE_PRIVATE',
        poolId: 'POOL_PRIVATE',
        landlordGroupId: 'GROUP_OWNER',
        tenantGroupId: 'GROUP_PRIVATE_RENTER',
        firstHouseholdOrdinal: '0',
        households: '1',
        startTick: '1',
        endTick: (1n + 2n * YEAR).toString(),
        periodTicks: YEAR.toString(),
        rentPerHouseholdPerPeriod: '5.000001',
        currency: 'AAA',
        genesisRightsRef: 'GENESIS_RIGHTS_PRIVATE_HOUSING_V1',
      },
    ],
  };
}
function transition(
  receipt: BeneficialHousingReclassificationReceipt,
  state: ReturnType<typeof createBeneficialHousingRentState>,
  financial: C.FinancialLedgerState,
  periodIndex = '0',
  identity = 'A',
) {
  const leaseId = receipt.leases[0]!.leaseId,
    simTime = C.SimTime.fromTicks(
      (1n + (BigInt(periodIndex) + 1n) * YEAR).toString(),
    );
  const draft = prepareBeneficialHousingRent(
    {
      receipt,
      state,
      financialBefore: financial,
      leaseId,
      periodIndex,
      simTime,
    },
    sha,
  );
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId: receipt.worldId,
      countryId: receipt.countryId,
      actorId: 'ACTOR_TEST_ONLY_POSTWAR_RENT_WORKER',
      authSubject: '00000000-0000-4000-8000-000000000001',
      commandId: `COMMAND_RENT_${identity}`,
      commandType: BENEFICIAL_HOUSING_RENT_COMMAND,
      correlationId: `CORRELATION_RENT_${identity}`,
      expectedWorldVersion: financial.worldVersion,
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
      worldId: receipt.worldId,
      eventId: `EVENT_RENT_${identity}`,
      eventType: BENEFICIAL_HOUSING_RENT_EVENT,
      sequence: (BigInt(financial.worldVersion) + 1n).toString(),
      worldVersion: (BigInt(financial.worldVersion) + 1n).toString(),
      simTime: simTime.toCanonicalValue(),
      causationCommandId: command.commandId,
      correlationId: `CORRELATION_RENT_${identity}`,
      correctsEventId: null,
      payload: draft.eventPayload,
      recordedAtReal: '2026-10-28T00:00:00.000Z',
    },
    sha,
  );
  return {
    command,
    transition: C.createAuthoritativeTransition({
      command,
      worldVersionBefore: financial.worldVersion,
      worldVersionAfter: (BigInt(financial.worldVersion) + 1n).toString(),
      events: [event],
    }),
    leaseId,
    periodIndex,
  };
}
describe('beneficial housing rights on real Core seed/ledger accounts', () => {
  it('follows real non-economic heads without moving money and refuses to hide a rent posting missing from rights history', () => {
    const result = reclassifyBeneficialHousingSeed(fixture('HEAD_REBIND'), sha),
      initial = C.rebuildV08LedgersFromLineage({
        seed: result.seed,
        sha256Hex: sha,
      }).financial,
      state = createBeneficialHousingRentState(result.receipt);
    const command = C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        worldId: result.seed.worldId,
        countryId: 'COUNTRY_01',
        actorId: 'ACTOR_TEST_ONLY_POSTWAR',
        authSubject: '00000000-0000-4000-8000-000000000001',
        commandId: 'COMMAND_OTHER_NON_ECONOMIC',
        commandType: 'TEST_OTHER_NON_ECONOMIC',
        correlationId: 'CORRELATION_OTHER',
        expectedWorldVersion: '0',
        idempotencyKey: 'IDEMPOTENCY_OTHER',
        officeId: null,
        payload: { purpose: 'NON_ECONOMIC_PROJECTION_HEAD' },
        simTime: '1',
        submittedAtReal: '2026-10-28T00:00:00.000Z',
      },
      sha,
    );
    const event = C.parseAuthoritativeEvent(
      {
        schemaVersion: C.EVENT_SCHEMA_VERSION,
        worldId: result.seed.worldId,
        eventId: 'EVENT_OTHER_NON_ECONOMIC',
        eventType: 'TEST_OTHER_NON_ECONOMIC',
        sequence: '1',
        worldVersion: '1',
        simTime: '1',
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        correctsEventId: null,
        payload: { purpose: 'NON_ECONOMIC_PROJECTION_HEAD' },
        recordedAtReal: '2026-10-28T00:00:00.000Z',
      },
      sha,
    );
    const other = C.createAuthoritativeTransition({
      command,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      events: [event],
    });
    const financial = C.rebuildV08LedgersFromLineage({
      seed: result.seed,
      transitions: [
        {
          command,
          transition: other,
          inventoryPostings: [],
          financialPostingBatches: [],
        },
      ],
      sha256Hex: sha,
    }).financial;
    const rebound = synchronizeBeneficialHousingRentState(
      { receipt: result.receipt, state, financial },
      sha,
    );
    expect(rebound.worldVersion).toBe('1');
    expect(rebound.paid).toEqual([]);
    expect(C.canonicalSerialize(financial.positions)).toBe(
      C.canonicalSerialize(initial.positions),
    );
    const step = transition(result.receipt, rebound, financial),
      paid = settleBeneficialHousingRent(
        {
          receipt: result.receipt,
          state: rebound,
          financialBefore: financial,
          ...step,
        },
        sha,
      );
    expect(paid.financial.worldVersion).toBe('2');
    expect(() =>
      synchronizeBeneficialHousingRentState(
        { receipt: result.receipt, state: rebound, financial: paid.financial },
        sha,
      ),
    ).toThrow('unrecorded actual rent');
    expect(() =>
      synchronizeBeneficialHousingRentState(
        { receipt: result.receipt, state: paid.state, financial: initial },
        sha,
      ),
    ).toThrow('non-regressing');
  });
  it('rejects wrong command/event/head/idempotency and conflicting retries while accepting an exact authoritative retry with new audit time', () => {
    const result = reclassifyBeneficialHousingSeed(fixture('INTENT'), sha),
      financial = C.rebuildV08LedgersFromLineage({
        seed: result.seed,
        sha256Hex: sha,
      }).financial,
      state = createBeneficialHousingRentState(result.receipt),
      step = transition(result.receipt, state, financial),
      before = C.canonicalSerialize(financial);
    const command = (overrides: Record<string, unknown>) =>
      C.parseCanonicalCommand(
        {
          schemaVersion: C.COMMAND_SCHEMA_VERSION,
          worldId: step.command.worldId,
          countryId: step.command.countryId,
          actorId: step.command.actorId,
          authSubject: step.command.authSubject,
          commandId: step.command.commandId,
          commandType: step.command.commandType,
          correlationId: step.command.correlationId,
          expectedWorldVersion: step.command.expectedWorldVersion,
          idempotencyKey: step.command.idempotencyKey,
          officeId: null,
          payload: JSON.parse(step.command.canonicalPayload),
          simTime: step.command.simTime.toCanonicalValue(),
          submittedAtReal: step.command.submittedAtReal,
          ...overrides,
        },
        sha,
      );
    const rebound = (c: C.CanonicalCommand, payload: unknown, before = '0') =>
      C.createAuthoritativeTransition({
        command: c,
        worldVersionBefore: before,
        worldVersionAfter: (BigInt(before) + 1n).toString(),
        events: [
          C.parseAuthoritativeEvent(
            {
              schemaVersion: C.EVENT_SCHEMA_VERSION,
              worldId: c.worldId,
              eventId: 'EVENT_RENT_REBOUND',
              eventType: BENEFICIAL_HOUSING_RENT_EVENT,
              sequence: '1',
              worldVersion: (BigInt(before) + 1n).toString(),
              simTime: c.simTime.toCanonicalValue(),
              causationCommandId: c.commandId,
              correlationId: c.correlationId,
              correctsEventId: null,
              payload,
              recordedAtReal: '2026-10-28T00:00:00.000Z',
            },
            sha,
          ),
        ],
      });
    const expected = JSON.parse(step.transition.events[0]!.canonicalPayload);
    for (const override of [
      { countryId: 'COUNTRY_02' },
      { idempotencyKey: 'WRONG_IDEMPOTENCY' },
      { expectedWorldVersion: '1' },
    ]) {
      const c = command(override);
      expect(() =>
        settleBeneficialHousingRent(
          {
            receipt: result.receipt,
            state,
            financialBefore: financial,
            ...step,
            command: c,
            transition: rebound(
              c,
              expected,
              override.expectedWorldVersion ?? '0',
            ),
          },
          sha,
        ),
      ).toThrow('wrong narrow rent command');
    }
    expect(() =>
      settleBeneficialHousingRent(
        {
          receipt: result.receipt,
          state,
          financialBefore: financial,
          ...step,
          transition: rebound(step.command, { ...expected, amount: '999' }),
        },
        sha,
      ),
    ).toThrow('rent event payload differs');
    expect(C.canonicalSerialize(financial)).toBe(before);
    const paid = settleBeneficialHousingRent(
        { receipt: result.receipt, state, financialBefore: financial, ...step },
        sha,
      ),
      different = command({ commandId: 'COMMAND_CONFLICTING_PERIOD' });
    expect(() =>
      settleBeneficialHousingRent(
        {
          receipt: result.receipt,
          state: paid.state,
          financialBefore: paid.financial,
          ...step,
          command: different,
          transition: rebound(different, expected),
        },
        sha,
      ),
    ).toThrow('period settlement conflict');
    expect(() =>
      settleBeneficialHousingRent(
        {
          receipt: result.receipt,
          state: paid.state,
          financialBefore: paid.financial,
          ...step,
          command: {
            ...step.command,
            canonicalPayload: C.canonicalSerialize({
              ...JSON.parse(step.command.canonicalPayload),
              periodIndex: '1',
            }),
          },
        },
        sha,
      ),
    ).toThrow();
    expect(
      settleBeneficialHousingRent(
        {
          receipt: result.receipt,
          state: paid.state,
          financialBefore: paid.financial,
          ...step,
          command: command({ submittedAtReal: '2026-10-28T00:00:00.001Z' }),
        },
        sha,
      ).outcome,
    ).toBe('EXACT_DUPLICATE');
  });
  it('reclassifies exactly without changing legal ownership, bank claims, total HH money, original batches or t0 rent history', () => {
    const i = fixture('PARTITION'),
      original = C.canonicalSerialize(i.seed),
      result = reclassifyBeneficialHousingSeed(i, sha),
      ledger = C.rebuildV08LedgersFromLineage({
        seed: result.seed,
        sha256Hex: sha,
      });
    expect(result.seed.financialBatches).toHaveLength(2);
    expect(
      C.canonicalSerialize(
        result.seed.financialBatches.filter(
          (b) => b.sourceId === i.seed.sources[0]!.sourceId,
        ),
      ),
    ).toBe(C.canonicalSerialize(i.seed.financialBatches));
    expect(C.canonicalSerialize(i.seed)).toBe(original);
    const total = aggregateBeneficialHousingLiquidClaim(
      ledger.financial,
      result.receipt,
    );
    expect(total.availableAmount).toBe('100.000003');
    expect(total.subaccounts).toHaveLength(4);
    expect(
      total.subaccounts.every(
        (s) =>
          s.account.ownerId === 'ENTITY_HOUSEHOLDS_01' &&
          s.account.claimId === result.receipt.claimId,
      ),
    ).toBe(true);
    expect(
      new Set(total.subaccounts.map((s) => s.account.accountId)).size,
    ).toBe(4);
    expect(
      ledger.financial.positions.some(
        (p) => p.account.accountId === i.parentAccountId,
      ),
    ).toBe(false);
    expect(ledger.financial.appliedBatches).toEqual([]);
    expect(result.receipt).toMatchObject({
      rentPaidAtOpening: '0',
      rentAccruedAtOpening: '0',
      newLegalClaims: false,
      parentSeedFingerprint: i.seed.fingerprint,
      childSeedFingerprint: result.seed.fingerprint,
    });
    expect(C.canonicalSerialize(reclassifyBeneficialHousingSeed(i, sha))).toBe(
      C.canonicalSerialize(result),
    );
    const restored = verifyBeneficialHousingReclassification(
      i.seed,
      result.seed,
      JSON.parse(C.canonicalSerialize(result.receipt)) as typeof result.receipt,
      sha,
    );
    expect(restored).toEqual(result.receipt);
    expect(() =>
      verifyBeneficialHousingReclassification(
        i.seed,
        result.seed,
        { ...result.receipt, originalAmount: '101' },
        sha,
      ),
    ).toThrow('receipt differs');
  });
  it('actually posts future rent to distinct beneficial accounts, preserves the HH total and independently replays joint V08 lineage', () => {
    const result = reclassifyBeneficialHousingSeed(fixture('PAYMENT'), sha),
      initial = C.rebuildV08LedgersFromLineage({
        seed: result.seed,
        sha256Hex: sha,
      }).financial,
      state = createBeneficialHousingRentState(result.receipt),
      step = transition(result.receipt, state, initial);
    const paid = settleBeneficialHousingRent(
      { receipt: result.receipt, state, financialBefore: initial, ...step },
      sha,
    );
    expect(paid.outcome).toBe('APPLIED');
    expect(paid.posting!.legs).toHaveLength(2);
    expect(paid.posting!.legs[0]!.account.accountId).not.toBe(
      paid.posting!.legs[1]!.account.accountId,
    );
    expect(
      paid.posting!.legs.every(
        (l) => l.account.ownerId === 'ENTITY_HOUSEHOLDS_01',
      ),
    ).toBe(true);
    const before = aggregateBeneficialHousingLiquidClaim(
        initial,
        result.receipt,
      ),
      after = aggregateBeneficialHousingLiquidClaim(
        paid.financial,
        result.receipt,
      );
    expect(after.availableAmount).toBe(before.availableAmount);
    const ownerBefore = before.subaccounts.find(
        (s) => s.groupId === 'GROUP_OWNER',
      )!,
      ownerAfter = after.subaccounts.find((s) => s.groupId === 'GROUP_OWNER')!,
      tenantBefore = before.subaccounts.find(
        (s) => s.groupId === 'GROUP_PRIVATE_RENTER',
      )!,
      tenantAfter = after.subaccounts.find(
        (s) => s.groupId === 'GROUP_PRIVATE_RENTER',
      )!;
    expect(
      C.Money.from(ownerAfter.availableAmount, 'AAA')
        .subtract(C.Money.from(ownerBefore.availableAmount, 'AAA'))
        .amount.toString(),
    ).toBe('5.000001');
    expect(
      C.Money.from(tenantBefore.availableAmount, 'AAA')
        .subtract(C.Money.from(tenantAfter.availableAmount, 'AAA'))
        .amount.toString(),
    ).toBe('5.000001');
    const replay = replayBeneficialHousingRent(
      {
        seed: result.seed,
        receipt: result.receipt,
        steps: [{ ...step, posting: paid.posting! }],
      },
      sha,
    );
    expect(C.canonicalSerialize(replay.financial)).toBe(
      C.canonicalSerialize(paid.financial),
    );
    expect(replay.state).toEqual(paid.state);
    const duplicate = settleBeneficialHousingRent(
      {
        receipt: result.receipt,
        state: paid.state,
        financialBefore: paid.financial,
        ...step,
      },
      sha,
    );
    expect(duplicate.outcome).toBe('EXACT_DUPLICATE');
    expect(duplicate.financial).toBe(paid.financial);
    expect(duplicate.posting).toBeNull();
    const next = transition(
        result.receipt,
        paid.state,
        paid.financial,
        '1',
        'B',
      ),
      second = settleBeneficialHousingRent(
        {
          receipt: result.receipt,
          state: paid.state,
          financialBefore: paid.financial,
          ...next,
        },
        sha,
      );
    expect(second.state.paid).toHaveLength(2);
    expect(second.financial.worldVersion).toBe('2');
    expect(
      replayBeneficialHousingRent(
        {
          seed: result.seed,
          receipt: result.receipt,
          steps: [
            { ...step, posting: paid.posting! },
            { ...next, posting: second.posting! },
          ],
        },
        sha,
      ).state,
    ).toEqual(second.state);
  });
  it('rejects self-rent, duplicated property pools, double household occupancy and aggregate overbooking', () => {
    const i = fixture('CAPACITY'),
      l = i.leases[0]!;
    expect(() =>
      reclassifyBeneficialHousingSeed(
        { ...i, leases: [{ ...l, tenantGroupId: 'GROUP_OWNER' }] },
        sha,
      ),
    ).toThrow('distinct real beneficial');
    expect(() =>
      reclassifyBeneficialHousingSeed(
        {
          ...i,
          pools: [...i.pools, { ...i.pools[0]!, poolId: 'POOL_DUPLICATE' }],
        },
        sha,
      ),
    ).toThrow('allocated twice');
    expect(() =>
      reclassifyBeneficialHousingSeed(
        { ...i, leases: [l, { ...l, leaseId: 'LEASE_DOUBLE' }] },
        sha,
      ),
    ).toThrow('two homes');
    expect(() =>
      reclassifyBeneficialHousingSeed(
        {
          ...i,
          pools: [{ ...i.pools[0]!, habitableUnits: '3' }],
          leases: [
            l,
            { ...l, leaseId: 'LEASE_EXTRA', firstHouseholdOrdinal: '1' },
          ],
        },
        sha,
      ),
    ).toThrow('finite habitable');
    expect(() =>
      reclassifyBeneficialHousingSeed(
        {
          ...i,
          groups: i.groups.map((g) =>
            g.groupId === 'GROUP_DISPLACED'
              ? { ...g, firstPersonOrdinal: '14' }
              : g,
          ),
        },
        sha,
      ),
    ).toThrow('overlap');
  });
  it('refuses t0/early/overdraft/skipped periods, wrong currency, stale rights and request-forged authority without changing balances', () => {
    const i = fixture('FAIL_CLOSED'),
      result = reclassifyBeneficialHousingSeed(i, sha),
      financial = C.rebuildV08LedgersFromLineage({
        seed: result.seed,
        sha256Hex: sha,
      }).financial,
      state = createBeneficialHousingRentState(result.receipt),
      before = C.canonicalSerialize(financial);
    const req = {
      receipt: result.receipt,
      state,
      financialBefore: financial,
      leaseId: 'LEASE_PRIVATE',
      periodIndex: '0',
    };
    expect(() =>
      prepareBeneficialHousingRent(
        { ...req, simTime: C.SimTime.fromTicks('0') },
        sha,
      ),
    ).toThrow('not yet due');
    expect(() =>
      prepareBeneficialHousingRent(
        {
          ...req,
          periodIndex: '1',
          simTime: C.SimTime.fromTicks((1n + 2n * YEAR).toString()),
        },
        sha,
      ),
    ).toThrow('skipped');
    const overdraft = reclassifyBeneficialHousingSeed(
      {
        ...i,
        allocationId: 'ALLOCATION_OVERDRAFT',
        leases: [{ ...i.leases[0]!, rentPerHouseholdPerPeriod: '1000000' }],
      },
      sha,
    );
    expect(() =>
      prepareBeneficialHousingRent(
        {
          receipt: overdraft.receipt,
          state: createBeneficialHousingRentState(overdraft.receipt),
          financialBefore: C.rebuildV08LedgersFromLineage({
            seed: overdraft.seed,
            sha256Hex: sha,
          }).financial,
          leaseId: 'LEASE_PRIVATE',
          periodIndex: '0',
          simTime: C.SimTime.fromTicks((1n + YEAR).toString()),
        },
        sha,
      ),
    ).toThrow('insufficient');
    expect(() =>
      reclassifyBeneficialHousingSeed(
        { ...i, leases: [{ ...i.leases[0]!, currency: 'BBB' }] },
        sha,
      ),
    ).toThrow('matching-currency');
    expect(() =>
      prepareBeneficialHousingRent(
        {
          ...req,
          state: JSON.parse(JSON.stringify(state)) as typeof state,
          simTime: C.SimTime.fromTicks((1n + YEAR).toString()),
        },
        sha,
      ),
    ).toThrow('genuine current');
    const step = transition(result.receipt, state, financial),
      paid = settleBeneficialHousingRent({ ...req, ...step }, sha);
    expect(() =>
      settleBeneficialHousingRent(
        { ...req, financialBefore: paid.financial, ...step },
        sha,
      ),
    ).toThrow('genuine current');
    expect(C.canonicalSerialize(financial)).toBe(before);
  });
});

let actualInput: BeneficialHousingReclassificationInput;
let actualFacts: {
  parentFingerprint: string;
  parentAmount: string;
  currency: string;
  countryHouseholds: string;
  countryPopulation: string;
};
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
  const countriesBytes = await readFile(
      path.join(
        root,
        'artifacts/world-balanced-candidate-v1/data/countries.json',
      ),
      'utf8',
    ),
    mappingBytes = await readFile(
      path.join(
        root,
        'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
      ),
      'utf8',
    );
  const monetary = createPostwarMonetaryGenesis({
    source: parent.source,
    countriesBytes,
    mappingBytes,
    valueDate: '2026-10-28',
  });
  const actual = createPostwarFinancialGenesis({
    adoption: parent,
    monetary,
    worldId: 'WORLD_TEST_ONLY_REAL_BENEFICIAL_COUNTRY',
    seedId: 'SEED_TEST_ONLY_REAL_BENEFICIAL_COUNTRY',
    sourceId: 'SOURCE_TEST_ONLY_REAL_FINANCIAL_GENESIS',
    genesisVersion: 'POSTWAR_OPERATING_20261028_V1',
  });
  // Reparse the actual producer transport using this directly tested Core module;
  // no source/claim bytes are replaced and no authority brand is fabricated.
  const seed = C.parseOpeningSeed(
    JSON.parse(Dist.canonicalSerialize(actual.baselineSeed)),
    sha,
  );
  const funding = readPostwarLiquidFundingAccountsFromSeed(
    JSON.parse(Dist.canonicalSerialize(actual.baselineSeed)),
  ).find(
    (a) => a.countryId === 'COUNTRY_01' && a.kind === 'HOUSEHOLD_BANK_DEPOSIT',
  )!;
  const services = JSON.parse(
    await readFile(
      path.join(
        root,
        'artifacts/world-balanced-candidate-v1/data/population-services.json',
      ),
      'utf8',
    ),
  ) as { countryId: string; population: number; households: number }[];
  const country = services.filter((r) => r.countryId === 'visual-territory-01');
  expect(country).toHaveLength(1);
  const population = BigInt(country[0]!.population),
    households = BigInt(country[0]!.households);
  // Actual selected REGION_01_E1 plus the accepted housing.v1 generated calibration:
  // owner/private/public/displaced counts independently pinned by the housing suite.
  const counts = [16505212n, 6157264n, 2808529n, 5948546n];
  expect(counts.reduce((a, b) => a + b, 0n)).toBe(households);
  const roles = [
    'OWNER_OCCUPIER',
    'PRIVATE_RENTER',
    'PUBLIC_RENTER',
    'DISPLACED',
  ] as const;
  let firstHH = 0n,
    firstPerson = 0n;
  const people = counts.map((n) => (population * n) / households);
  let remaining = population - people.reduce((a, b) => a + b, 0n);
  for (const i of counts
    .map((n, index) => ({ index, r: (population * n) % households }))
    .sort((a, b) => (a.r === b.r ? a.index - b.index : a.r > b.r ? -1 : 1)))
    if (remaining > 0n) {
      people[i.index] = people[i.index]! + 1n;
      remaining--;
    }
  const groups = counts.map((n, i) => {
    const value = {
      groupId: `REAL_COUNTRY01_${roles[i]}`,
      locationId: 'REGION_01_E1',
      role: roles[i]!,
      firstHouseholdOrdinal: firstHH.toString(),
      households: n.toString(),
      firstPersonOrdinal: firstPerson.toString(),
      population: people[i]!.toString(),
    };
    firstHH += n;
    firstPerson += people[i]!;
    return value;
  });
  actualInput = {
    seed,
    allocationId: 'ALLOCATION_REAL_COUNTRY01_BENEFICIAL',
    policyRef: `config/postwar-genesis/housing.v1.json#${sha(await readFile(path.join(root, 'config/postwar-genesis/housing.v1.json'), 'utf8'))}`,
    sourcePopulationRef:
      'artifacts/world-balanced-candidate-v1/data/population-services.json#/0',
    countryId: 'COUNTRY_01',
    householdEntityId: funding.ownerId,
    parentAccountId: funding.accountId,
    regions: [
      {
        locationId: 'REGION_01_E1',
        households: households.toString(),
        population: population.toString(),
      },
    ],
    groups,
    pools: [
      {
        poolId: 'REAL_COUNTRY01_PRIVATE_POOL',
        locationId: 'REGION_01_E1',
        landlordGroupId: groups[0]!.groupId,
        totalUnits: '29595220',
        habitableUnits: '23439415',
        ownerOccupiedUnits: counts[0]!.toString(),
      },
    ],
    leases: [
      {
        leaseId: 'REAL_COUNTRY01_SINGLE_HOUSEHOLD_RIGHT',
        poolId: 'REAL_COUNTRY01_PRIVATE_POOL',
        landlordGroupId: groups[0]!.groupId,
        tenantGroupId: groups[1]!.groupId,
        firstHouseholdOrdinal: '0',
        households: '1',
        startTick: '1',
        endTick: (1n + YEAR).toString(),
        periodTicks: YEAR.toString(),
        rentPerHouseholdPerPeriod: '1',
        currency: funding.currency,
        genesisRightsRef: 'GENESIS_RIGHTS_REAL_COUNTRY01_TEST_ONLY_ONE_UNIT',
      },
    ],
  };
  actualFacts = {
    parentFingerprint: seed.fingerprint,
    parentAmount: funding.availableAmount,
    currency: funding.currency,
    countryHouseholds: households.toString(),
    countryPopulation: population.toString(),
  };
}, 60_000);
describe('actual selected-country source → original financial producer → beneficial rent', () => {
  it('settles one explicitly TEST_ONLY future unit from real COUNTRY_01 HH deposits, retains all 70-country parent bytes and bank mirrors, and replays actual financial posting', async () => {
    const original = C.canonicalSerialize(actualInput.seed),
      result = reclassifyBeneficialHousingSeed(actualInput, sha),
      initial = C.rebuildV08LedgersFromLineage({
        seed: result.seed,
        sha256Hex: sha,
      }).financial,
      state = createBeneficialHousingRentState(result.receipt),
      step = transition(result.receipt, state, initial, '0', 'REAL_COUNTRY01'),
      paid = settleBeneficialHousingRent(
        { receipt: result.receipt, state, financialBefore: initial, ...step },
        sha,
      );
    expect(actualFacts.countryPopulation).toBe('105506849');
    expect(actualFacts.countryHouseholds).toBe('31419551');
    expect(paid.paidReceipt.amount).toBe('1');
    expect(paid.posting!.settlementCurrency).toBe(actualFacts.currency);
    expect(
      aggregateBeneficialHousingLiquidClaim(paid.financial, result.receipt)
        .availableAmount,
    ).toBe(actualFacts.parentAmount);
    expect(C.canonicalSerialize(actualInput.seed)).toBe(original);
    const originals = new Set(
      actualInput.seed.financialBatches.map((b) => b.batchId),
    );
    expect(
      C.canonicalSerialize(
        result.seed.financialBatches.filter((b) => originals.has(b.batchId)),
      ),
    ).toBe(C.canonicalSerialize(actualInput.seed.financialBatches));
    const parentLedger = C.rebuildV08LedgersFromLineage({
      seed: actualInput.seed,
      sha256Hex: sha,
    }).financial;
    const claim = result.receipt.claimId;
    expect(
      C.canonicalSerialize(
        paid.financial.positions.filter((p) => p.account.claimId !== claim),
      ),
    ).toBe(
      C.canonicalSerialize(
        parentLedger.positions.filter((p) => p.account.claimId !== claim),
      ),
    );
    expect(
      replayBeneficialHousingRent(
        {
          seed: result.seed,
          receipt: result.receipt,
          steps: [{ ...step, posting: paid.posting! }],
        },
        sha,
      ).state,
    ).toEqual(paid.state);
    const verified = verifyBeneficialHousingReclassification(
      actualInput.seed,
      result.seed,
      JSON.parse(C.canonicalSerialize(result.receipt)),
      sha,
    );
    expect(verified.childSeedFingerprint).toBe(result.seed.fingerprint);
    // The old strict 210-account reader is intentionally not bypassed; adoption
    // of this separate lineage needs the explicit verified-receipt-aware reader.
    expect(() =>
      readPostwarLiquidFundingAccountsFromSeed(
        JSON.parse(C.canonicalSerialize(result.seed)),
      ),
    ).toThrow('EXACT_CLAIM_MIRROR_REQUIRED');
    const directory = process.env.ECONMIND_BENEFICIAL_HOUSING_EVIDENCE_DIR;
    if (directory) {
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, 'actual-country-reclassification.json'),
        C.canonicalSerialize({
          classification:
            'TEST_ONLY_REAL_COUNTRY01_CLAIM_NOT_70_COUNTRY_RECLASSIFICATION_ADOPTION',
          facts: actualFacts,
          receipt: result.receipt,
          paidReceipt: paid.paidReceipt,
          posting: paid.posting,
          aggregate: aggregateBeneficialHousingLiquidClaim(
            paid.financial,
            result.receipt,
          ),
          originalSeedUnchanged: true,
          other69CountriesAndGovOpBalancesUnchanged: true,
          WorldClock: false,
        }) + '\n',
        { mode: 0o600 },
      );
    }
  });
});
