import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
// Match the Worker's package instance; the writer stays internal, never a public export.
import { applyInventoryPosting } from '../../packages/core/dist/inventory/inventory-ledger.js';
import { assertInventoryPersistenceSchemaAdmitted as originalIndustryGuard } from '../../packages/core/dist/inventory/production-consumption-posting.js';
import { prepareAtomicTransitionCandidate } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => C.canonicalSha256(C.canonicalHashInput(v), digest);
const WORLD = C.worldId('WORLD_SOCIAL_POSTING_TEST'),
  COUNTRY = C.countryId('COUNTRY_01'),
  GOV = C.legalEntityId('GOV_TEST'),
  SUPPLIER = C.legalEntityId('SUPPLIER_TEST');
const LOCATION = 'REGION_01_E1',
  NOW = '2026-10-26T00:00:00.000Z';
const cash = (amount: string) => ({ amount, currency: 'XAA' });
/** Complete explicit TEST_ONLY stock/claim fixture, never actual opening/adoption. */
function fixture(
  options: {
    newExpenseClass?: C.FinancialAccountClass;
    assetOpeningAmount?: string;
    redefineAssetOwner?: boolean;
  } = {},
) {
  const account = (
    name: string,
    accountClass: C.FinancialAccountClass,
    owner = GOV,
    claim: string | null = null,
    other: C.LegalEntityId | null = null,
  ) =>
    C.createFinancialAccount({
      worldId: WORLD,
      countryId: COUNTRY,
      accountId: C.financialAccountId(name),
      ownerId: owner,
      accountClass,
      currency: 'XAA',
      claimId: claim === null ? null : C.financialClaimId(claim),
      counterpartyEntityId: other,
    });
  const asset = account('MEDICINE_ASSET', 'ASSET'),
    purchasePayable = account(
      'PURCHASE_PAYABLE',
      'PAYABLE',
      GOV,
      'PURCHASE_CLAIM',
      SUPPLIER,
    ),
    purchaseReceivable = account(
      'PURCHASE_RECEIVABLE',
      'RECEIVABLE',
      SUPPLIER,
      'PURCHASE_CLAIM',
      GOV,
    ),
    sales = account('MEDICINE_REVENUE', 'REVENUE', SUPPLIER);
  const medicineExpense = account(
      'MEDICINE_EXPENSE',
      options.newExpenseClass ?? 'EXPENSE',
    ),
    opExpense = account('OPERATING_EXPENSE', 'EXPENSE'),
    opPayable = account(
      'OPERATING_PAYABLE',
      'PAYABLE',
      GOV,
      'OPERATING_CLAIM',
      SUPPLIER,
    ),
    opReceivable = account(
      'OPERATING_RECEIVABLE',
      'RECEIVABLE',
      SUPPLIER,
      'OPERATING_CLAIM',
      GOV,
    ),
    opRevenue = account('OPERATING_REVENUE', 'REVENUE', SUPPLIER);
  const medicine = C.createInventoryAccount({
    worldId: WORLD,
    countryId: COUNTRY,
    commodityId: C.commodityId('MEDICINE_TEST'),
    batchId: C.inventoryBatchId('MEDICINE_BATCH'),
    unit: 'medical_dose',
    physicalLocationId: C.inventoryLocationId('CLINIC_STORE'),
    bucket: 'AVAILABLE',
    reservationId: null,
    shipmentId: null,
    titleHolderId: GOV,
    riskBearerId: GOV,
    economicRecognitionId: null,
  });
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_TEST'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/world-core/c-social-service-consumption-posting.test.ts',
      sourceVersion: 'TEST_ONLY_V1',
      payload: {
        classification: 'TEST_ONLY',
        medicineUnitCarryingValue: cash('20'),
      },
    },
    digest,
  );
  const openingAccounts = [asset, purchasePayable, purchaseReceivable, sales],
    directions = ['DEBIT', 'CREDIT', 'DEBIT', 'CREDIT'] as const;
  const seed = C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      seedId: C.openingSeedId('SEED_TEST'),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [
        {
          entryId: C.openingInventoryEntryId('MEDICINE_OPENING'),
          sourceId: source.sourceId,
          account: medicine,
          quantity: C.Quantity.from('5', 'medical_dose'),
        },
      ],
      financialBatches: [
        {
          batchId: C.financialOpeningBatchId('PURCHASE_OPENING'),
          sourceId: source.sourceId,
          settlementCurrency: 'XAA',
          legs: openingAccounts.map((account, i) => ({
            legId: C.financialOpeningLegId(`OPENING_LEG_${i}`),
            account,
            direction: directions[i]!,
            amount: C.Money.from(options.assetOpeningAmount ?? '100', 'XAA'),
            counterpartLegId: C.financialOpeningLegId(
              `OPENING_LEG_${i % 2 === 0 ? i + 1 : i - 1}`,
            ),
          })),
        },
      ],
    },
    digest,
  );
  const ledgers = C.rebuildV08LedgersFromLineage({ seed, sha256Hex: digest }),
    availability = [
      { countryId: COUNTRY, locationId: LOCATION, workingAgeAvailable: '4' },
    ];
  const staff = [
    ['DOCTOR', 'HIGH'],
    ['NURSE', 'MEDIUM'],
    ['MEDICAL_TECHNICIAN', 'MEDIUM'],
    ['SUPPORT', 'LOW'],
  ] as const;
  const labour = C.applyLabourFacts({
    state: {
      aggregates: [
        {
          countryId: COUNTRY,
          locationId: LOCATION,
          skill: 'LOW',
          status: 'EMPLOYED',
          count: '1',
        },
        {
          countryId: COUNTRY,
          locationId: LOCATION,
          skill: 'MEDIUM',
          status: 'EMPLOYED',
          count: '2',
        },
        {
          countryId: COUNTRY,
          locationId: LOCATION,
          skill: 'HIGH',
          status: 'EMPLOYED',
          count: '1',
        },
      ],
      positions: staff.map(([name, skill]) => ({
        positionId: `POSITION_${name}`,
        countryId: COUNTRY,
        locationId: LOCATION,
        skill,
        owner: 'PUBLIC_SERVICE',
        classificationId: 'HEALTHCARE',
        requiredCount: '1',
        employedCount: '1',
      })),
      wageAssertions: [],
      appliedFactBindings: [],
    },
    boundary: C.createE01DailyBoundary('0'),
    populationAvailability: availability,
    facts: [],
  }).state;
  const resources: C.SocialOfficeResourceV1[] = [
    ...staff.map(([name]) => ({
      resourceId: `RESOURCE_${name}`,
      canonicalPhysicalResourceId: `PERSON_${name}`,
      canonicalOriginId: `ORIGIN_${name}`,
      originalSourceRecordId: 'SOURCE_RESOURCES',
      worldId: WORLD,
      countryId: COUNTRY,
      locationId: LOCATION,
      windowId: 'DAY_0',
      dayIndex: '0',
      startSimTime: '0',
      endSimTime: '86400000',
      unit: 'staff_minute' as const,
      capacity: '360',
      eligibilityRuleVersion: 'QUALIFIED_V1',
      positionId: `POSITION_${name}`,
      qualification: name,
      assignedPeople: '1',
    })),
    {
      resourceId: 'RESOURCE_ROOM',
      canonicalPhysicalResourceId: 'ROOM',
      canonicalOriginId: 'ORIGIN_ROOM',
      originalSourceRecordId: 'SOURCE_RESOURCES',
      worldId: WORLD,
      countryId: COUNTRY,
      locationId: LOCATION,
      windowId: 'DAY_0',
      dayIndex: '0',
      startSimTime: '0',
      endSimTime: '86400000',
      unit: 'facility_minute',
      capacity: '360',
      eligibilityRuleVersion: 'FACILITY_V1',
      positionId: null,
      qualification: 'PRIMARY_CARE',
      assignedPeople: '0',
    },
  ];
  const leg = (
    account: C.FinancialAccount,
    direction: C.FinancialPostingDirection,
    other: C.FinancialAccount,
  ): C.SocialOfficeFinancialLegRuleV1 => ({
    account,
    direction,
    amountPerUnit: cash('20'),
    counterpartyAccountId: other.accountId,
  });
  const cost: C.SocialOfficeCostRuleV1 = {
    mode: 'ACCRUED_COST_WITH_ACTUAL_BATCH',
    budgetId: 'CLINIC_BUDGET',
    budgetPerUnit: cash('40'),
    financialLegs: [
      leg(medicineExpense, 'DEBIT', asset),
      leg(
        options.redefineAssetOwner
          ? C.createFinancialAccount({ ...asset, ownerId: SUPPLIER })
          : asset,
        'CREDIT',
        medicineExpense,
      ),
      leg(opExpense, 'DEBIT', opPayable),
      leg(opPayable, 'CREDIT', opExpense),
      leg(opReceivable, 'DEBIT', opRevenue),
      leg(opRevenue, 'CREDIT', opReceivable),
    ],
    recognitionRuleVersion: 'TEST_CONSUMPTION_AND_OPERATING_ACCRUAL_V1',
  };
  const rule: C.SocialOfficeClinicRuleV1 = {
    clinicId: 'CLINIC_TEST',
    ruleVersion: 'CLINIC_V1',
    ruleSourceRecordId: 'SOURCE_CLINIC',
    careType: 'PRIMARY',
    staffRecipe: staff.map(([n], i) => ({
      resourceId: `RESOURCE_${n}`,
      amountPerUnit: ['30', '20', '15', '10'][i]!,
    })),
    facilityRecipe: [{ resourceId: 'RESOURCE_ROOM', amountPerUnit: '20' }],
    medicineAccount: medicine,
    medicineSourceRecordId: 'SOURCE_MEDICINE',
    dosesPerCase: '1',
    cost,
    demandAdmissionPolicy: 'ONCE_PER_ORIGINAL_DEMAND',
    serviceOrderingPolicy: 'BACKLOG_THEN_SOURCE_ORDER',
    attemptAccountingMode: 'SIMULATED_ATOMIC_COMPLETED_SERVICE_V1',
  };
  const facts: C.SocialOfficeReadFactsV1 = {
    schemaVersion: 'social-office-read-facts-v1',
    sourceBinding: {
      sourceClass: 'SIMULATED_OPENING',
      sourceAdmitted: false,
      sourceGeneration: '1',
      manifestHash: hash({ TEST_ONLY: true }),
      selectedRecordIds: [
        'SOURCE_RESOURCES',
        'SOURCE_CLINIC',
        'SOURCE_MEDICINE',
        'SOURCE_DEMAND',
        'SOURCE_BUDGET',
      ],
      worldId: WORLD,
      countryId: COUNTRY,
      locationId: LOCATION,
      purpose: 'SERVE',
    },
    simTime: '0',
    dayBoundary: C.createE01DailyBoundary('0'),
    populationAvailability: availability,
    employmentReadFacts: null,
    programmeRules: [],
    applicantPools: [],
    clinicRules: [rule],
    demandWindows: [
      {
        clinicId: 'CLINIC_TEST',
        careWindowId: 'DAY_0',
        demandId: 'DEMAND_DAY_0',
        canonicalOriginId: 'ORIGIN_DEMAND_DAY_0',
        dayIndex: '0',
        newCases: '10',
        sourceRecordId: 'SOURCE_DEMAND',
      },
    ],
    resourceAllocations: resources,
    approvedBudgets: [
      {
        budgetId: 'CLINIC_BUDGET',
        approvedAmount: cash('400'),
        sourceRecordId: 'SOURCE_BUDGET',
      },
    ],
    employmentRecipes: [],
  };
  const state: C.SocialOfficeStateV1 = {
    schemaVersion: 'social-office-state-v1',
    worldId: WORLD,
    countryId: COUNTRY,
    locationId: LOCATION,
    employment: {
      schemaVersion: 'social-employment-service-state-v1',
      worldId: WORLD,
      labour,
      servicePools: [],
      plans: [],
      appliedOperations: [],
    },
    programmes: [],
    cohorts: [],
    applicantAssignments: [],
    clinic: {
      clinicId: 'CLINIC_TEST',
      backlog: '4',
      admittedDemandOrigins: [],
    },
    resourceWindows: [],
    budgetCommitments: [],
    appliedOperations: [],
  };
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      actorId: 'ACTOR_SOCIAL',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: 'SERVE_TEST',
      commandType: C.SOCIAL_CLINIC_SERVE_COMMAND,
      correlationId: 'TRACE_TEST',
      countryId: COUNTRY,
      worldId: WORLD,
      officeId: 'SOCIAL',
      expectedWorldVersion: '0',
      idempotencyKey: 'IDEM_SERVE',
      simTime: '0',
      submittedAtReal: NOW,
      payload: {
        schemaVersion: 'social-clinic-serve-v1',
        clinicId: 'CLINIC_TEST',
        careWindowId: 'DAY_0',
        clinicRuleVersion: 'CLINIC_V1',
      },
    },
    digest,
  );
  const prepared = C.prepareSocialOfficeOperation({
    command,
    state,
    readFacts: facts,
    inventoryBefore: ledgers.inventory,
    financialBefore: ledgers.financial,
    sha256Hex: digest,
  });
  const event = C.parseAuthoritativeEvent(
    {
      schemaVersion: C.EVENT_SCHEMA_VERSION,
      eventId: 'SOCIAL_EVENT_TEST',
      eventType: C.SOCIAL_OFFICE_ACTION_EVENT,
      worldId: WORLD,
      worldVersion: '1',
      sequence: '1',
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      correctsEventId: null,
      simTime: '0',
      recordedAtReal: NOW,
      payload: prepared.eventPayload,
    },
    digest,
  );
  const transition = C.createAuthoritativeTransition({
    command,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
  const batches = [
    C.createFinancialPostingBatch(
      {
        schemaVersion: C.FINANCIAL_POSTING_SCHEMA_VERSION,
        batchId: C.financialPostingBatchId('CARE_BATCH'),
        worldId: WORLD,
        causationCommandId: command.commandId,
        causationEventIds: transition.eventIds,
        worldVersionBefore: '0',
        worldVersionAfter: '1',
        simTime: command.simTime,
        settlementCurrency: 'XAA',
        command,
        transition,
        legs: prepared.outcome.financialRequirement!.legs.map((l, n) => ({
          legId: C.financialPostingLegId(`CARE_LEG_${n}`),
          account: l.account,
          direction: l.direction,
          amount: C.Money.from(l.amount.amount, l.amount.currency),
          counterpartyAccountId:
            l.counterpartyAccountId === null
              ? null
              : C.financialAccountId(l.counterpartyAccountId),
        })),
      },
      digest,
    ),
  ];
  const construct = (
    financialPostingBatches = batches,
    postingId = 'CARE_POSTING',
  ) =>
    C.createSocialServiceConsumptionPosting(
      {
        postingId: C.inventoryPostingId(postingId),
        command,
        transition,
        inventoryBefore: ledgers.inventory,
        financialBefore: ledgers.financial,
        financialPostingBatches,
        socialBefore: state,
        readFacts: facts,
        socialOutcome: prepared.outcome,
      },
      digest,
    );
  return {
    seed,
    ledgers,
    state,
    facts,
    command,
    prepared,
    event,
    transition,
    batches,
    construct,
    asset,
    medicineExpense,
  };
}
describe('actual Social consumption through the unique Core ledgers (TEST_ONLY)', () => {
  it('keeps the joint public type additive and the public Industry guard the original function', () => {
    const posting: C.InventoryLedgerPosting = fixture().construct();
    type LegacyPosting = Parameters<typeof originalIndustryGuard>[0][number];
    const legacyExcludesService: Extract<
      LegacyPosting,
      C.SocialServiceConsumptionPostingV1
    > extends never
      ? true
      : false = true;
    expect(legacyExcludesService).toBe(true);
    expect(posting.operation).toBe('SERVICE_CONSUME');
    expect(C.assertInventoryPersistenceSchemaAdmitted).toBe(
      originalIndustryGuard,
    );
  });
  it('consumes real medicine, recognizes cost once and retains unpaid opening purchase liability', () => {
    const f = fixture(),
      posting = f.construct();
    const after = C.rebuildV08LedgersFromLineage({
      seed: f.seed,
      transitions: [
        {
          command: f.command,
          transition: f.transition,
          inventoryPostings: [posting],
          financialPostingBatches: f.batches,
        },
      ],
      sha256Hex: digest,
    });
    expect(after.worldVersion).toBe('1');
    expect(after.inventory.balances).toHaveLength(0);
    expect(
      after.financial.accounts.some((a) => a.accountId === 'MEDICINE_EXPENSE'),
    ).toBe(true);
    expect(
      after.financial.positions
        .find((p) => p.account.accountId === 'MEDICINE_EXPENSE')
        ?.netDebitBalance.toCanonicalValue().amount,
    ).toBe('100');
    expect(
      after.financial.positions
        .find((p) => p.account.accountId === 'OPERATING_PAYABLE')
        ?.netDebitBalance.toCanonicalValue().amount,
    ).toBe('-100');
    expect(
      after.financial.positions
        .find((p) => p.account.accountId === 'PURCHASE_PAYABLE')
        ?.netDebitBalance.toCanonicalValue().amount,
    ).toBe('-100');
    expect(
      after.financial.positions.some((p) => p.account.accountClass === 'CASH'),
    ).toBe(false);
  });
  it('refuses construction and public joint rebuild when required finance is missing', () => {
    const f = fixture();
    expect(() => f.construct([])).toThrow('financial batch');
    const posting = f.construct();
    expect(() =>
      C.rebuildV08LedgersFromLineage({
        seed: f.seed,
        transitions: [
          {
            command: f.command,
            transition: f.transition,
            inventoryPostings: [posting],
            financialPostingBatches: [],
          },
        ],
        sha256Hex: digest,
      }),
    ).toThrow('financial group');
  });
  it.each(['CASH', 'DEPOSIT', 'ASSET', 'LIABILITY', 'EQUITY'] as const)(
    'refuses first-use %s despite a balanced proposed batch',
    (accountClass) => {
      const f = fixture({ newExpenseClass: accountClass });
      expect(() => f.construct()).toThrow('first-register');
    },
  );
  it('refuses a changed existing tuple and an underfunded original medicine asset', () => {
    const changed = fixture({ redefineAssetOwner: true });
    expect(() => changed.construct()).toThrow('tuple');
    const underfunded = fixture({ assetOpeningAmount: '25' });
    expect(() => underfunded.construct()).toThrow('original stock');
  });
  it('does not re-admit original demand, reset minutes or spend medicine again under a new command ID', () => {
    const f = fixture(),
      posting = f.construct();
    const after = C.rebuildV08LedgersFromLineage({
      seed: f.seed,
      transitions: [
        {
          command: f.command,
          transition: f.transition,
          inventoryPostings: [posting],
          financialPostingBatches: f.batches,
        },
      ],
      sha256Hex: digest,
    });
    const wire = f.prepared.eventPayload!.command as Record<string, unknown>;
    const nextCommand = C.parseCanonicalCommand(
      {
        ...wire,
        commandId: 'SERVE_AGAIN',
        expectedWorldVersion: '1',
        idempotencyKey: 'SERVE_AGAIN',
      },
      digest,
    );
    const next = C.prepareSocialOfficeOperation({
      command: nextCommand,
      state: f.prepared.state,
      readFacts: f.facts,
      inventoryBefore: after.inventory,
      financialBefore: after.financial,
      sha256Hex: digest,
    });
    expect(next.outcome.units).toBe('0');
    expect(next.state.clinic.backlog).toBe('9');
    expect(next.outcome.inventoryRequirement).toBeNull();
    expect(next.state.budgetCommitments[0]?.committedAmount.amount).toBe('200');
    expect(
      next.state.resourceWindows.find(
        (w) => w.allocation.resourceId === 'RESOURCE_DOCTOR',
      )?.used,
    ).toBe('150');
  });
  it('refuses sole Inventory apply with missing or unapplied real financial context', () => {
    const f = fixture(),
      posting = f.construct();
    expect(() => applyInventoryPosting(f.ledgers.inventory, posting)).toThrow(
      'context',
    );
    expect(() =>
      applyInventoryPosting(f.ledgers.inventory, posting, {
        settledBatches: f.batches,
        financial: f.ledgers.financial,
        sha256Hex: digest,
      }),
    ).toThrow('after-state');
  });
  it('rejects a second posting identity for the same semantic completed service Event', () => {
    const f = fixture(),
      a = f.construct(),
      b = f.construct(f.batches, 'SECOND_POSTING');
    expect(() =>
      C.rebuildV08LedgersFromLineage({
        seed: f.seed,
        transitions: [
          {
            command: f.command,
            transition: f.transition,
            inventoryPostings: [a, b],
            financialPostingBatches: f.batches,
          },
        ],
        sha256Hex: digest,
      }),
    ).toThrow();
  });
  it('reconstructs exact raw service wire using real joined predecessors with no resolver', () => {
    const f = fixture(),
      p = f.construct(),
      row: C.SocialOfficeJoinedLineageRowV1 = {
        command: f.command,
        transition: f.transition,
        financialPostingBatches: f.batches,
        inventoryPostings: [],
        serviceConsumptionWire: C.canonicalSerialize(p),
        readFacts: f.facts,
      };
    const result = C.replaySocialOfficeJoinedLineage({
      seed: f.seed,
      socialOpening: f.state,
      openingReadFacts: f.facts,
      transitions: [row],
      sha256Hex: digest,
    });
    expect(result.ledgers.inventory.balances).toHaveLength(0);
    expect(result.social.clinic.backlog).toBe('9');
    expect(result.decodedTransitions[0]?.inventoryPostings).toHaveLength(1);
    expect(() =>
      C.replaySocialOfficeJoinedLineage({
        seed: f.seed,
        socialOpening: f.state,
        openingReadFacts: f.facts,
        transitions: [
          {
            ...row,
            serviceConsumptionWire: row.serviceConsumptionWire!.replace(
              'CARE_POSTING',
              'FORGED_POSTING',
            ),
          },
        ],
        sha256Hex: digest,
      }),
    ).toThrow('wire');
    expect(() =>
      C.replaySocialOfficeJoinedLineage({
        seed: f.seed,
        socialOpening: f.state,
        openingReadFacts: f.facts,
        transitions: [{ ...row, financialPostingBatches: [] }],
        sha256Hex: digest,
      }),
    ).toThrow();
  });
  it('refuses the legacy persistence candidate before SQL without changing old admission', () => {
    const f = fixture(),
      posting = f.construct();
    const lease = C.acquireWorldWriterLease(
      null,
      C.worldWriterLeaseRequest(
        WORLD,
        C.workerId('WORKER_TEST'),
        NOW,
        '2026-10-26T00:05:00.000Z',
      ),
    ).lease;
    // VERSIONED_AUTOMATIC is only a candidate-shape control here; no publisher grant is asserted.
    expect(() =>
      prepareAtomicTransitionCandidate({
        command: f.command,
        commitAuthorization: null,
        sha256Hex: digest,
        draft: {
          transition: f.transition,
          inventoryPostings: [posting],
          financialPostingBatches: f.batches,
          receipt: C.createFinalCommandReceipt({
            command: f.command,
            outcome: 'COMMITTED',
            reasonCode: null,
            transition: f.transition,
            simTime: f.command.simTime,
            recordedAtReal: NOW,
          }),
          outboxMessages: [],
          currentMaterializations: [],
          authorityKind: 'VERSIONED_AUTOMATIC',
          commitAssertion: C.createWorldWriterCommitAssertion(lease, '0'),
          observedAtReal: NOW,
        },
      }),
    ).toThrow('SOCIAL_SERVICE_PERSISTENCE_SCHEMA_NOT_ADMITTED');
    expect(() => C.assertInventoryPersistenceSchemaAdmitted([])).not.toThrow();
  });
  it('keeps the full original prefix and refuses missing effects, changed source facts and unknown siblings', () => {
    const f = fixture(),
      p = f.construct(),
      row: C.SocialOfficeJoinedLineageRowV1 = {
        command: f.command,
        transition: f.transition,
        financialPostingBatches: f.batches,
        inventoryPostings: [],
        serviceConsumptionWire: C.canonicalSerialize(p),
        readFacts: f.facts,
      };
    const input = {
      seed: f.seed,
      socialOpening: f.state,
      openingReadFacts: f.facts,
      sha256Hex: digest,
    };
    expect(
      C.replaySocialOfficeJoinedLineage({ ...input, transitions: [] }).ledgers
        .worldVersion,
    ).toBe('0');
    expect(() =>
      C.replaySocialOfficeJoinedLineage({
        ...input,
        transitions: [{ ...row, serviceConsumptionWire: null }],
      }),
    ).toThrow('retained service wire');
    expect(() =>
      C.replaySocialOfficeJoinedLineage({
        ...input,
        transitions: [
          {
            ...row,
            readFacts: {
              ...f.facts,
              sourceBinding: {
                ...f.facts.sourceBinding,
                sourceGeneration: '2',
              },
            },
          },
        ],
      }),
    ).toThrow('Retained source');
    expect(() =>
      C.replaySocialOfficeJoinedLineage({
        ...input,
        socialOpening: {
          ...f.state,
          clinic: { ...f.state.clinic, backlog: '5' },
        },
        transitions: [row],
      }),
    ).toThrow('Replay');
    const other = C.parseAuthoritativeEvent(
      {
        schemaVersion: C.EVENT_SCHEMA_VERSION,
        eventId: 'UNKNOWN_EVENT',
        eventType: 'UNKNOWN_ECONOMIC_SIBLING',
        worldId: WORLD,
        worldVersion: '1',
        sequence: '2',
        causationCommandId: f.command.commandId,
        correlationId: f.command.correlationId,
        correctsEventId: null,
        simTime: '0',
        recordedAtReal: NOW,
        payload: { source: 'TEST_ONLY' },
      },
      digest,
    );
    const mixed = C.createAuthoritativeTransition({
      command: f.command,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      events: [f.event, other],
    });
    expect(() =>
      C.replaySocialOfficeJoinedLineage({
        ...input,
        transitions: [{ ...row, transition: mixed }],
      }),
    ).toThrow('sibling');
  });
});
