/** Tiny genuine Core rights/ledger fixture; no SQL, source admission or Clock. */
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  createBeneficialHousingRentMixedReplayOrigins,
  synchronizeBeneficialHousingRentMixedReplayOrigins,
  replayBeneficialHousingRentMixedFrame,
} from '../../packages/core/src/commands/beneficial-housing-rent-mixed-replay.js';
import {
  prepareFinanceNativeBudgetTransition,
  type FinanceNativeBudgetSource,
  type FinanceNativeBudgetPolicy,
  type FinanceNativeBudgetCanonicalFrame,
} from '../../packages/core/src/commands/finance-budget-native.js';
import {
  prepareFinanceSocialLedger,
  replayPreparedFinanceSocialFxLedger,
} from '../../packages/core/src/commands/finance-social-prepared-ledger.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const at = '2026-10-30T00:00:00.000Z';
function fixture() {
  const world = C.worldId('WORLD_TEST_ONLY_RENT_MIXED'),
    country = C.countryId('COUNTRY_01'),
    hh = C.legalEntityId('ENTITY_HOUSEHOLDS_01'),
    bank = C.legalEntityId('ENTITY_BANK_01');
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST_ONLY_RENT_MIXED'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'TEST_ONLY_CORE_REPLAY_NOT_ADMISSION',
      sourceVersion: 'TEST_ONLY_V1',
      payload: { classification: 'CORE_MECHANISM_ONLY' },
    },
    sha,
  );
  const account = C.createFinancialAccount({
    worldId: world,
    countryId: country,
    ownerId: hh,
    accountId: C.financialAccountId('ACCOUNT_TEST_ONLY_HH'),
    accountClass: 'ASSET',
    currency: 'XAA',
    claimId: C.financialClaimId('CLAIM_TEST_ONLY_HH'),
    counterpartyEntityId: bank,
  });
  const mirror = C.createFinancialAccount({
    ...account,
    accountId: C.financialAccountId('ACCOUNT_TEST_ONLY_HH_MIRROR'),
    accountClass: 'LIABILITY',
    ownerId: bank,
    counterpartyEntityId: hh,
  });
  const gov = C.createFinancialAccount({
    ...account,
    accountId: C.financialAccountId('ACCOUNT_TEST_ONLY_GOV_TGA'),
    ownerId: C.legalEntityId('ENTITY_GOVERNMENT_01'),
    claimId: C.financialClaimId('CLAIM_TEST_ONLY_GOV_TGA'),
    counterpartyEntityId: C.legalEntityId('ENTITY_CENTRAL_BANK_01'),
  });
  const govMirror = C.createFinancialAccount({
    ...gov,
    accountId: C.financialAccountId('ACCOUNT_TEST_ONLY_CB_TGA'),
    accountClass: 'LIABILITY',
    ownerId: C.legalEntityId('ENTITY_CENTRAL_BANK_01'),
    counterpartyEntityId: gov.ownerId,
  });
  const parent = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST_ONLY_RENT_MIXED'),
      worldId: world,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [
        {
          batchId: C.financialOpeningBatchId('OPENING_TEST_ONLY_GOV'),
          sourceId: source.sourceId,
          settlementCurrency: 'XAA',
          legs: [
            {
              legId: C.financialOpeningLegId('GOV_DEBIT'),
              account: gov,
              direction: 'DEBIT',
              amount: C.Money.from('1000', 'XAA'),
              counterpartLegId: C.financialOpeningLegId('GOV_CREDIT'),
            },
            {
              legId: C.financialOpeningLegId('GOV_CREDIT'),
              account: govMirror,
              direction: 'CREDIT',
              amount: C.Money.from('1000', 'XAA'),
              counterpartLegId: C.financialOpeningLegId('GOV_DEBIT'),
            },
          ],
        },
        {
          batchId: C.financialOpeningBatchId('OPENING_TEST_ONLY_HH'),
          sourceId: source.sourceId,
          settlementCurrency: 'XAA',
          legs: [
            {
              legId: C.financialOpeningLegId('LEG_HH_DEBIT'),
              account,
              direction: 'DEBIT',
              amount: C.Money.from('100.000003', 'XAA'),
              counterpartLegId: C.financialOpeningLegId('LEG_BANK_CREDIT'),
            },
            {
              legId: C.financialOpeningLegId('LEG_BANK_CREDIT'),
              account: mirror,
              direction: 'CREDIT',
              amount: C.Money.from('100.000003', 'XAA'),
              counterpartLegId: C.financialOpeningLegId('LEG_HH_DEBIT'),
            },
          ],
        },
      ],
    },
    sha,
  );
  const child = C.reclassifyBeneficialHousingSeed(
    {
      seed: parent,
      allocationId: 'ALLOCATION_TEST_ONLY_RENT_MIXED',
      policyRef: 'TEST_ONLY_EXISTING_RENT_POLICY',
      sourcePopulationRef: 'TEST_ONLY_POPULATION_ORIGINAL',
      countryId: country,
      householdEntityId: hh,
      parentAccountId: account.accountId,
      regions: [
        { locationId: 'REGION_01_E1', households: '6', population: '18' },
      ],
      groups: [
        {
          groupId: 'GROUP_OWNER',
          locationId: 'REGION_01_E1',
          role: 'OWNER_OCCUPIER',
          firstHouseholdOrdinal: '0',
          households: '2',
          firstPersonOrdinal: '0',
          population: '6',
        },
        {
          groupId: 'GROUP_RENTER',
          locationId: 'REGION_01_E1',
          role: 'PRIVATE_RENTER',
          firstHouseholdOrdinal: '2',
          households: '2',
          firstPersonOrdinal: '6',
          population: '6',
        },
        {
          groupId: 'GROUP_PUBLIC',
          locationId: 'REGION_01_E1',
          role: 'PUBLIC_RENTER',
          firstHouseholdOrdinal: '4',
          households: '1',
          firstPersonOrdinal: '12',
          population: '3',
        },
        {
          groupId: 'GROUP_DISPLACED',
          locationId: 'REGION_01_E1',
          role: 'DISPLACED',
          firstHouseholdOrdinal: '5',
          households: '1',
          firstPersonOrdinal: '15',
          population: '3',
        },
      ],
      pools: [
        {
          poolId: 'POOL_TEST_ONLY',
          locationId: 'REGION_01_E1',
          landlordGroupId: 'GROUP_OWNER',
          totalUnits: '12',
          habitableUnits: '10',
          ownerOccupiedUnits: '2',
        },
      ],
      leases: [
        {
          leaseId: 'LEASE_TEST_ONLY',
          poolId: 'POOL_TEST_ONLY',
          landlordGroupId: 'GROUP_OWNER',
          tenantGroupId: 'GROUP_RENTER',
          firstHouseholdOrdinal: '0',
          households: '1',
          startTick: '1',
          endTick: '31',
          periodTicks: '10',
          rentPerHouseholdPerPeriod: '5.000001',
          currency: 'XAA',
          genesisRightsRef: 'TEST_ONLY_EXISTING_LEASE_RIGHT',
        },
      ],
    },
    sha,
  );
  const financial = C.rebuildV08LedgersFromLineage({
    seed: child.seed,
    sha256Hex: sha,
  }).financial;
  const origins = createBeneficialHousingRentMixedReplayOrigins({
    financial,
    receipts: [child.receipt],
  });
  return {
    parent,
    seed: child.seed,
    receipt: child.receipt,
    financial,
    origins,
    mirror,
    gov,
  };
}
function frame(
  f: ReturnType<typeof fixture>,
  sequence = '1',
): FinanceNativeBudgetCanonicalFrame & {
  readonly financialPostingBatches: readonly C.FinancialPostingBatch[];
} {
  const quote = C.prepareBeneficialHousingRent(
    {
      receipt: f.receipt,
      state: f.origins[0]!.state,
      financialBefore: f.financial,
      leaseId: 'LEASE_TEST_ONLY',
      periodIndex: '0',
      simTime: C.SimTime.fromTicks('11'),
    },
    sha,
  );
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId: f.seed.worldId,
      countryId: 'COUNTRY_01',
      officeId: null,
      commandType: C.BENEFICIAL_HOUSING_RENT_COMMAND,
      commandId: 'COMMAND_TEST_ONLY_RENT',
      idempotencyKey: quote.idempotencyKey,
      actorId: 'ACTOR_TEST_ONLY_AUTOMATIC',
      authSubject: '11111111-1111-4111-8111-111111111111',
      correlationId: 'CORRELATION_TEST_ONLY_RENT',
      expectedWorldVersion: f.financial.worldVersion,
      simTime: '11',
      submittedAtReal: at,
      payload: quote.commandPayload,
    },
    sha,
  );
  const event = C.parseAuthoritativeEvent(
    {
      schemaVersion: C.EVENT_SCHEMA_VERSION,
      eventId: 'EVENT_TEST_ONLY_RENT',
      eventType: C.BENEFICIAL_HOUSING_RENT_EVENT,
      worldId: f.seed.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: (BigInt(f.financial.worldVersion) + 1n).toString(),
      sequence,
      simTime: '11',
      recordedAtReal: at,
      correctsEventId: null,
      payload: quote.eventPayload,
    },
    sha,
  );
  const transition = C.createAuthoritativeTransition({
    command,
    events: [event],
    worldVersionBefore: f.financial.worldVersion,
    worldVersionAfter: (BigInt(f.financial.worldVersion) + 1n).toString(),
  });
  const applied = C.settleBeneficialHousingRent(
    {
      receipt: f.receipt,
      state: f.origins[0]!.state,
      financialBefore: f.financial,
      command,
      transition,
      leaseId: 'LEASE_TEST_ONLY',
      periodIndex: '0',
    },
    sha,
  );
  if (!applied.posting) throw Error('actual Core rent posting required');
  return {
    command,
    transition,
    events: [event],
    receipt: C.createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: at,
    }),
    financialPostingBatches: [applied.posting],
    inventoryPostings: [],
  };
}
describe('fixed rent reducer for a complete mixed orchestrator (not mixed-prefix authority itself)', () => {
  it('rederives actual exact rent effects, preserving legal HH claim and bank mirror', () => {
    const f = fixture(),
      actual = frame(f),
      result = replayBeneficialHousingRentMixedFrame({
        origins: f.origins,
        financial: f.financial,
        frame: actual,
        sha256Hex: sha,
      });
    expect(result.financial.worldVersion).toBe('1');
    expect(result.origins[0]!.state.paid).toHaveLength(1);
    expect(result.origins[0]!.state.paid[0]).toMatchObject({
      leaseId: 'LEASE_TEST_ONLY',
      periodIndex: '0',
      amount: '5.000001',
    });
    expect(
      C.aggregateBeneficialHousingLiquidClaim(result.financial, f.receipt)
        .availableAmount,
    ).toBe('100.000003');
    expect(
      result.financial.positions
        .find((p) => p.account.accountId === f.mirror.accountId)
        ?.netDebitBalance.toCanonicalValue(),
    ).toEqual(
      f.financial.positions
        .find((p) => p.account.accountId === f.mirror.accountId)
        ?.netDebitBalance.toCanonicalValue(),
    );
    expect(
      synchronizeBeneficialHousingRentMixedReplayOrigins({
        origins: result.origins,
        financial: result.financial,
        sha256Hex: sha,
      })[0]!.state.paid,
    ).toEqual(result.origins[0]!.state.paid);
  });
  it('refuses copied receipt/origin, duplicate countries and an already consumed frame', () => {
    const f = fixture(),
      actual = frame(f);
    expect(() =>
      createBeneficialHousingRentMixedReplayOrigins({
        financial: f.financial,
        receipts: [{ ...f.receipt }],
      }),
    ).toThrow('genuine genesis receipt');
    expect(() =>
      createBeneficialHousingRentMixedReplayOrigins({
        financial: f.financial,
        receipts: [f.receipt, f.receipt],
      }),
    ).toThrow('FINITE_UNIQUE');
    expect(() =>
      replayBeneficialHousingRentMixedFrame({
        origins: [{ ...f.origins[0]! }],
        financial: f.financial,
        frame: actual,
        sha256Hex: sha,
      }),
    ).toThrow('GENUINE_SAME_WORLD');
    const current = replayBeneficialHousingRentMixedFrame({
      origins: f.origins,
      financial: f.financial,
      frame: actual,
      sha256Hex: sha,
    });
    expect(() =>
      replayBeneficialHousingRentMixedFrame({
        origins: current.origins,
        financial: current.financial,
        frame: actual,
        sha256Hex: sha,
      }),
    ).toThrow('EXACT_AUTOMATIC_RENT_FRAME');
  });
  it('refuses substituted balanced batches and altered FINAL evidence', () => {
    const f = fixture(),
      actual = frame(f),
      batch = actual.financialPostingBatches[0]!;
    const { fingerprint: _fp, transitionBinding: _binding, ...intent } = batch;
    void _fp;
    void _binding;
    const altered = C.createFinancialPostingBatch(
      {
        ...intent,
        command: actual.command,
        transition: actual.transition,
        legs: batch.legs.map((l) => ({
          ...l,
          amount: C.Money.from('6', l.amount.currency),
        })),
      },
      sha,
    );
    expect(() =>
      replayBeneficialHousingRentMixedFrame({
        origins: f.origins,
        financial: f.financial,
        frame: { ...actual, financialPostingBatches: [altered] },
        sha256Hex: sha,
      }),
    ).toThrow('EXACT_CORE_RENT_POSTING');
    expect(() =>
      replayBeneficialHousingRentMixedFrame({
        origins: f.origins,
        financial: f.financial,
        frame: {
          ...actual,
          receipt: { ...actual.receipt, reasonCode: 'TEST_ONLY_TAMPER' },
        },
        sha256Hex: sha,
      }),
    ).toThrow('EXACT_CANONICAL_TRANSITION_AND_FINAL');
  });
  it('refuses unknown or discretionary families rather than treating their effects as rent', () => {
    const f = fixture(),
      actual = frame(f);
    for (const patch of [
      { officeId: 'SOCIAL' },
      { commandType: 'TEST_ONLY_UNKNOWN_FAMILY' },
    ]) {
      const c = actual.command;
      const command = C.parseCanonicalCommand(
        {
          schemaVersion: c.schemaVersion,
          worldId: c.worldId,
          countryId: c.countryId,
          officeId: c.officeId,
          commandType: c.commandType,
          commandId: c.commandId,
          idempotencyKey: c.idempotencyKey,
          actorId: c.actorId,
          authSubject: c.authSubject,
          correlationId: c.correlationId,
          expectedWorldVersion: c.expectedWorldVersion,
          simTime: c.simTime.toCanonicalValue(),
          submittedAtReal: c.submittedAtReal,
          payload: JSON.parse(c.canonicalPayload),
          ...patch,
        },
        sha,
      );
      expect(() =>
        replayBeneficialHousingRentMixedFrame({
          origins: f.origins,
          financial: f.financial,
          frame: { ...actual, command },
          sha256Hex: sha,
        }),
      ).toThrow('EXACT_AUTOMATIC_RENT_FRAME');
    }
  });
});

function mixedSetup() {
  const f = fixture(),
    prepared = prepareFinanceSocialLedger(f.financial);
  const replay = (frames: readonly FinanceNativeBudgetCanonicalFrame[]) =>
    replayPreparedFinanceSocialFxLedger({
      prepared,
      frames,
      socialCountries: [],
      openingEncumbrances: [],
      fxOriginals: [],
      beneficialHousingRentReceipts: [f.receipt],
      expectedHead: {
        worldVersion: frames.at(-1)?.transition.worldVersionAfter ?? '0',
        eventSequence: frames.at(-1)?.events.at(-1)?.sequence ?? '0',
      },
      sha256Hex: sha,
    });
  const policy: FinanceNativeBudgetPolicy = {
    schemaVersion: 'finance-native-budget-policy-v1',
    ruleRef: 'FINANCE_ORDINARY_SELF_ADMINISTRATION_FULL_V1',
    ruleRevision: 'TEST_ONLY_RULE',
    sourceDocumentSHA256: 'sha256:' + 'a'.repeat(64),
    normativeUnits: [
      'FINANCE-U0247',
      'FINANCE-U0252',
      'FINANCE-U0265',
      'FINANCE-U0295',
    ],
    worldId: f.seed.worldId,
    countryId: 'COUNTRY_01',
    governmentEntityId: f.gov.ownerId,
    currency: 'XAA',
    envelopeRef: 'ENVELOPE_TEST_ONLY_RENT',
    effectivePeriodRef: 'PERIOD_TEST_ONLY',
    periodRevision: 'REV_TEST_ONLY',
    validFromSimTime: '0',
    validUntilSimTime: '1000',
    requestingOfficeId: 'FINANCE',
    programmeOwnerOfficeId: 'FINANCE',
    classification: 'ORDINARY_DEPARTMENTAL',
    funding: 'FULL_UNCONDITIONAL',
    requiredApprovalOffices: ['FINANCE'],
  };
  const source = (
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
  ): FinanceNativeBudgetSource => {
    const r = replay(frames);
    return {
      policy,
      binding: {
        seedRef: f.seed.seedId,
        seedFingerprint: f.seed.fingerprint,
        admissionRef: 'TEST_ONLY_NOT_ADMISSION',
        financialSourceId: f.parent.sources[0]!.sourceId,
        originalsSHA256: 'sha256:' + 'b'.repeat(64),
        policyHash: C.canonicalSha256(C.canonicalHashInput(policy), sha),
        treasuryAccountId: f.gov.accountId,
        treasuryClaimId: f.gov.claimId!,
        openingEncumbranceHash: C.canonicalSha256(
          C.canonicalHashInput([]),
          sha,
        ),
      },
      openingEncumbrances: [],
      financialState: r.financial,
      mixedPrefixEvidence: r.mixedPrefixEvidence,
      frames,
      worldVersion: r.budgetState.worldVersion,
      eventSequence: r.budgetState.eventSequence,
    };
  };
  const budgetFrame = async (
    operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
  ) => {
    const current = replay(frames),
      command = C.parseCanonicalCommand(
        {
          schemaVersion: C.COMMAND_SCHEMA_VERSION,
          worldId: f.seed.worldId,
          countryId: 'COUNTRY_01',
          officeId: 'FINANCE',
          commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
          commandId: 'COMMAND_TEST_ONLY_' + operation,
          idempotencyKey: 'KEY_TEST_ONLY_' + operation,
          actorId: 'ACTOR_TEST_ONLY_FINANCE',
          authSubject: '11111111-1111-4111-8111-111111111111',
          correlationId: 'CORRELATION_TEST_ONLY_' + operation,
          expectedWorldVersion: current.budgetState.worldVersion,
          simTime: '11',
          submittedAtReal: at,
          payload: {
            operation,
            scope: {
              worldId: f.seed.worldId,
              countryId: 'COUNTRY_01',
              entityRef: policy.governmentEntityId,
              envelopeRef: policy.envelopeRef,
              effectivePeriodRef: policy.effectivePeriodRef,
            },
            currency: 'XAA',
            amount: operation === 'SET_ENVELOPE' ? '100' : '20',
            envelopeRevisionRef: 'ENVELOPE_REV_TEST_ONLY',
            lineRef: operation === 'SET_ENVELOPE' ? null : 'LINE_TEST_ONLY',
            revisionRef:
              operation === 'SET_ENVELOPE'
                ? 'ENVELOPE_REV_TEST_ONLY'
                : 'LINE_REV_TEST_ONLY',
            predecessorRevisionRef: null,
          },
        },
        sha,
      );
    const subject = command.authSubject;
    const authorization = await C.authorizeOfficeCapability({
      principal: {
        authSubject: subject,
        facts: { user_id: subject, display_name: 'TEST_ONLY', school_id: null },
        token: {
          subject,
          issuer: 'TEST_ONLY',
          audience: 'TEST_ONLY',
          issuedAt: at,
          expiresAt: '2026-10-31T00:00:00.000Z',
        },
      },
      resolver: {
        resolveCurrentIdentity: async () => subject,
        resolveCurrentMembership: async () => ({
          authSubject: subject,
          worldId: command.worldId,
          countryId: command.countryId,
          teamId: C.teamId('TEAM_TEST_ONLY_RENT'),
          authorizationVersion: 'REV_1',
          officeAssignments: [C.officeId('FINANCE')],
          active: true,
          suspended: false,
          isWorldAdmin: false,
          negotiationPartyIds: [],
        }),
      },
      worldId: command.worldId,
      requestedCountryId: command.countryId,
      requestedOfficeId: C.officeId('FINANCE'),
      capability: 'FINANCE_BUDGET',
    });
    let result: FinanceNativeBudgetCanonicalFrame | undefined;
    await C.processQueuedCommand({
      command,
      authorityKind: 'DISCRETIONARY_USER',
      requiredCapability: 'FINANCE_BUDGET',
      intakeAuthorization: authorization,
      commitSimTime: command.simTime,
      recordedAtReal: at,
      persistence: {
        readFinalReceipt: async () => null,
        recordZeroEffectReceipt: async (r) => {
          throw Error('Unexpected TEST_ONLY budget rejection ' + r.reasonCode);
        },
        commitAuthorizedCommand: async (input) => {
          const next = await prepareFinanceNativeBudgetTransition({
            command,
            authorization: input.commitAuthorization!,
            source: source(frames),
            recordedAtReal: at,
            sha256Hex: sha,
          });
          result = {
            command,
            events: next.transition.events,
            transition: next.transition,
            receipt: next.receipt,
            financialPostingBatches: [],
            inventoryPostings: [],
          };
          return { transition: next.transition, receipt: next.receipt };
        },
      },
    });
    if (!result) throw Error('Genuine Core Budget result required');
    return result;
  };
  const rentFrame = (frames: readonly FinanceNativeBudgetCanonicalFrame[]) => {
    const r = replay(frames);
    if (!r.beneficialHousingRentOrigins)
      throw Error('Core rent origins required');
    return frame(
      { ...f, financial: r.financial, origins: r.beneficialHousingRentOrigins },
      (BigInt(r.budgetState.eventSequence) + 1n).toString(),
    );
  };
  return { f, prepared, replay, source, budgetFrame, rentFrame };
}
describe('actual complete Core Budget/Rent ordered financial replay', () => {
  it('reduces Budget→Rent→Budget and Rent→Budget with real one-batch payment and independent World/event cursors', async () => {
    for (const rentFirst of [false, true]) {
      const f = mixedSetup(),
        frames: FinanceNativeBudgetCanonicalFrame[] = [];
      if (rentFirst) frames.push(f.rentFrame(frames));
      frames.push(await f.budgetFrame('SET_ENVELOPE', frames));
      if (!rentFirst) frames.push(f.rentFrame(frames));
      frames.push(await f.budgetFrame('APPROVE_NEW_LINE', frames));
      const r = f.replay(frames);
      expect(r.financial.worldVersion).toBe('3');
      expect(r.budgetState).toMatchObject({
        worldVersion: '3',
        eventSequence: '5',
      });
      expect(r.budgetEncumbrances).toHaveLength(1);
      expect(r.budgetEncumbrances[0]!.amount).toBe('100');
      expect(r.beneficialHousingRentOrigins?.[0]?.state.paid).toHaveLength(1);
      expect(r.beneficialHousingRentOrigins?.[0]?.state.worldVersion).toBe('3');
      expect(
        C.aggregateBeneficialHousingLiquidClaim(r.financial, f.f.receipt)
          .availableAmount,
      ).toBe('100.000003');
      expect(
        C.canonicalDecimal(
          r.financial.positions.find(
            (p) => p.account.accountId === f.f.gov.accountId,
          )!.netDebitBalance.amount,
        ),
      ).toBe('1000');
      const direct = C.rebuildV08LedgersFromLineage({
        seed: f.f.seed,
        transitions: frames.map((x) => ({
          command: x.command,
          transition: x.transition,
          financialPostingBatches:
            x.financialPostingBatches as C.FinancialPostingBatch[],
          inventoryPostings: [],
        })),
        sha256Hex: sha,
      });
      expect(C.canonicalSerialize(direct.financial)).toBe(
        C.canonicalSerialize(r.financial),
      );
    }
  });
  it('requires the exact genuine rent origins and refuses omitted or reordered real frames', async () => {
    const f = mixedSetup(),
      frames: FinanceNativeBudgetCanonicalFrame[] = [];
    frames.push(await f.budgetFrame('SET_ENVELOPE', frames));
    frames.push(f.rentFrame(frames));
    frames.push(await f.budgetFrame('APPROVE_NEW_LINE', frames));
    expect(() =>
      replayPreparedFinanceSocialFxLedger({
        prepared: f.prepared,
        frames,
        socialCountries: [],
        openingEncumbrances: [],
        fxOriginals: [],
        expectedHead: { worldVersion: '3', eventSequence: '5' },
        sha256Hex: sha,
      }),
    ).toThrow('UNSUPPORTED_MIXED_PREFIX_POSTING_EFFECT');
    expect(() => f.replay([frames[0]!, frames[2]!])).toThrow(
      'COMPLETE_UNIQUE_ORDERED_MIXED_PREFIX',
    );
    expect(() => f.replay([frames[1]!, frames[0]!, frames[2]!])).toThrow(
      'COMPLETE_UNIQUE_ORDERED_MIXED_PREFIX',
    );
  });
});
