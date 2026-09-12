import { createHash } from 'node:crypto';

import {
  COMMAND_SCHEMA_VERSION,
  COMMODITY_REGISTRY,
  CURRENT_REPLAY_BINDING,
  Money,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  Quantity,
  assertV08LedgerReconciled,
  authSubject,
  authorizeOfficeCapability,
  commandId,
  commodityId,
  countryId,
  createFinancialAccount,
  createInventoryAccount,
  createOpeningSeed,
  createOpeningSource,
  economicRecognitionId,
  financialAccountId,
  financialOpeningBatchId,
  financialOpeningLegId,
  idempotencyKey,
  inventoryBatchId,
  inventoryLocationId,
  inventoryReservationId,
  inventoryShipmentId,
  legalEntityId,
  officeId,
  openingInventoryEntryId,
  openingSeedId,
  openingSourceId,
  parseCanonicalCommand,
  reconcileV08LedgerSnapshots,
  rebuildV08LedgersFromLineage,
  teamId,
  worldId,
  type ActorId,
  type AuthenticatedPrincipal,
  type AuthorizationCapability,
  type AuthorizationResolver,
  type AuthorizedOfficeContext,
  type CanonicalCommand,
  type CountryId,
  type FinancialAccount,
  type InventoryAccount,
  type MembershipSnapshot,
  type OfficeId,
  type OpeningSeed,
  type RebuiltV08Ledgers,
  type V08LedgerReconciliation,
  type WorldId,
} from '../../packages/core/src/index.js';
import { actorId } from '../../packages/core/src/ids.js';

export const V10_TWO_COUNTRY_TEST_FIXTURE_VERSION =
  'v10.1-two-country-test-fixture-preparation-v1' as const;
export const V10_TWO_COUNTRY_TEST_FIXTURE_STATUS =
  'TEST_ONLY_NON_AUTHORITATIVE' as const;

const sha256 = (preimage: string): string =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');

export type V10FixtureActorKey = 'sellerTrade' | 'buyerTrade' | 'buyerFinance';

export interface V10OfficeActorFixture {
  readonly actorId: ActorId;
  readonly principal: AuthenticatedPrincipal;
  readonly membership: MembershipSnapshot;
  readonly resolver: AuthorizationResolver;
  readonly officeId: OfficeId;
  readonly capability: AuthorizationCapability;
}

export interface V10AuthorizationCase {
  readonly caseId: string;
  readonly actorKey: V10FixtureActorKey;
  readonly requestedCountryId: CountryId;
  readonly requestedOfficeId: OfficeId;
  readonly capability: AuthorizationCapability;
  readonly expected: 'ALLOW' | 'DENY';
}

export interface V10AtomicCommandFixture {
  readonly worldId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly commandFingerprint: string;
  readonly expectedWorldVersion: string;
  readonly holderId: string;
  readonly fencingToken: string;
  readonly observedAtReal: string;
  readonly authorizationContext: AuthorizedOfficeContext;
  readonly expectedAuthorizationRevision: string;
  readonly requiredCountryId: CountryId;
  readonly requiredOfficeId: OfficeId;
  readonly requiredCapability: AuthorizationCapability;
  readonly inventoryAmount: string;
  readonly financialAmount: string;
}

export interface V10TwoCountryTestFixture {
  readonly fixtureVersion: typeof V10_TWO_COUNTRY_TEST_FIXTURE_VERSION;
  readonly status: typeof V10_TWO_COUNTRY_TEST_FIXTURE_STATUS;
  readonly productionFallback: false;
  readonly calibrationCountryValuesUsed: false;
  readonly worldId: WorldId;
  readonly openingWorldVersion: '0';
  readonly countries: Readonly<{
    seller: CountryId;
    buyer: CountryId;
  }>;
  readonly commodity: Readonly<{
    id: ReturnType<typeof commodityId>;
    unit: 'tonne';
    registrySourceDocument: 'MASTER';
  }>;
  readonly entities: Readonly<{
    sellerTreasury: ReturnType<typeof legalEntityId>;
    buyerTreasury: ReturnType<typeof legalEntityId>;
  }>;
  readonly inventoryAccounts: Readonly<{
    sellerAvailable: Readonly<InventoryAccount>;
    sellerReserved: Readonly<InventoryAccount>;
    sellerInTransit: Readonly<InventoryAccount>;
    buyerAvailable: Readonly<InventoryAccount>;
  }>;
  readonly financialAccounts: Readonly<{
    sellerSettlement: Readonly<FinancialAccount>;
    sellerOpeningEquity: Readonly<FinancialAccount>;
    buyerTreasury: Readonly<FinancialAccount>;
    buyerOpeningEquity: Readonly<FinancialAccount>;
  }>;
  readonly transferIntent: Readonly<{
    quantity: Quantity;
    settlementAmount: Money;
    nonStrategic: true;
    belowThreshold: true;
    usesOfficialReserves: false;
    titleAndRiskTransferAt: 'DELIVERY';
  }>;
  readonly movementPlan: Readonly<{
    reserve: readonly [
      Readonly<{ account: Readonly<InventoryAccount>; delta: Quantity }>,
      Readonly<{ account: Readonly<InventoryAccount>; delta: Quantity }>,
    ];
    ship: readonly [
      Readonly<{ account: Readonly<InventoryAccount>; delta: Quantity }>,
      Readonly<{ account: Readonly<InventoryAccount>; delta: Quantity }>,
    ];
    deliver: readonly [
      Readonly<{ account: Readonly<InventoryAccount>; delta: Quantity }>,
      Readonly<{ account: Readonly<InventoryAccount>; delta: Quantity }>,
    ];
  }>;
  readonly paymentPlan: readonly [
    Readonly<{
      account: Readonly<FinancialAccount>;
      direction: 'CREDIT';
      amount: Money;
      counterpartyAccountId: ReturnType<typeof financialAccountId>;
    }>,
    Readonly<{
      account: Readonly<FinancialAccount>;
      direction: 'DEBIT';
      amount: Money;
      counterpartyAccountId: ReturnType<typeof financialAccountId>;
    }>,
  ];
  readonly officeActors: Readonly<
    Record<V10FixtureActorKey, Readonly<V10OfficeActorFixture>>
  >;
  readonly authorizationCases: readonly Readonly<V10AuthorizationCase>[];
  readonly command: Readonly<CanonicalCommand>;
  readonly openingSeed: Readonly<OpeningSeed>;
  readonly rebuiltLedgers: Readonly<RebuiltV08Ledgers>;
  readonly reconciliation: Readonly<V08LedgerReconciliation>;
}

function principal(
  subject: string,
  displayName: string,
): AuthenticatedPrincipal {
  const canonicalSubject = authSubject(subject);
  return Object.freeze({
    authSubject: canonicalSubject,
    facts: Object.freeze({
      user_id: canonicalSubject,
      display_name: displayName,
      school_id: null,
    }),
    token: Object.freeze({
      subject: canonicalSubject,
      issuer: 'v10-test-fixture',
      audience: 'world-v2-test',
      issuedAt: '2026-09-12T00:00:00.000Z',
      expiresAt: '2026-09-13T00:00:00.000Z',
    }),
  });
}

function officeActor(input: {
  readonly subject: string;
  readonly displayName: string;
  readonly actor: string;
  readonly world: WorldId;
  readonly country: CountryId;
  readonly team: string;
  readonly office: OfficeId;
  readonly capability: AuthorizationCapability;
  readonly authorizationVersion: string;
  readonly negotiationPartyIds: readonly string[];
}): Readonly<V10OfficeActorFixture> {
  const authenticated = principal(input.subject, input.displayName);
  const membership: MembershipSnapshot = Object.freeze({
    authorizationVersion: input.authorizationVersion,
    authSubject: authenticated.authSubject,
    worldId: input.world,
    teamId: teamId(input.team),
    countryId: input.country,
    officeAssignments: Object.freeze([input.office]),
    active: true,
    suspended: false,
    isWorldAdmin: false,
    negotiationPartyIds: Object.freeze([...input.negotiationPartyIds]),
  });
  const resolver: AuthorizationResolver = Object.freeze({
    async resolveCurrentIdentity(candidate: AuthenticatedPrincipal) {
      return candidate.authSubject === authenticated.authSubject
        ? authenticated.authSubject
        : null;
    },
    async resolveCurrentMembership(
      candidate: AuthenticatedPrincipal,
      requestedWorldId: WorldId,
    ) {
      return candidate.authSubject === authenticated.authSubject &&
        requestedWorldId === input.world
        ? membership
        : null;
    },
  });
  return Object.freeze({
    actorId: actorId(input.actor),
    principal: authenticated,
    membership,
    resolver,
    officeId: input.office,
    capability: input.capability,
  });
}

function financialAccount(input: {
  readonly worldId: WorldId;
  readonly accountId: string;
  readonly ownerId: ReturnType<typeof legalEntityId>;
  readonly countryId: CountryId;
  readonly accountClass: 'CASH' | 'EQUITY';
}): Readonly<FinancialAccount> {
  return createFinancialAccount({
    worldId: input.worldId,
    accountId: financialAccountId(input.accountId),
    ownerId: input.ownerId,
    countryId: input.countryId,
    accountClass: input.accountClass,
    currency: 'GCU',
    claimId: null,
    counterpartyEntityId: null,
  });
}

export function createV10TwoCountryTestFixture(): Readonly<V10TwoCountryTestFixture> {
  const world = worldId('WORLD_V10_TEST_ONLY');
  const seller = countryId('COUNTRY_V10_ALPHA');
  const buyer = countryId('COUNTRY_V10_BETA');
  const sellerTreasury = legalEntityId('ENTITY_V10_ALPHA_TREASURY');
  const buyerTreasuryEntity = legalEntityId('ENTITY_V10_BETA_TREASURY');
  const registeredCommodity = COMMODITY_REGISTRY.get('GRAIN');
  if (
    registeredCommodity.unit !== 'tonne' ||
    registeredCommodity.sourceDocument !== 'MASTER'
  ) {
    throw new Error('V10_TEST_FIXTURE_REGISTERED_COMMODITY_MISMATCH');
  }
  const grain = commodityId(registeredCommodity.id);
  const batch = inventoryBatchId('BATCH_V10_TEST_GRAIN');
  const sellerAvailable = createInventoryAccount({
    worldId: world,
    countryId: seller,
    commodityId: grain,
    batchId: batch,
    unit: registeredCommodity.unit,
    physicalLocationId: inventoryLocationId('LOCATION_V10_ALPHA_PORT'),
    bucket: 'AVAILABLE',
    reservationId: null,
    shipmentId: null,
    titleHolderId: sellerTreasury,
    riskBearerId: sellerTreasury,
    economicRecognitionId: null,
  });
  const sellerReserved = createInventoryAccount({
    ...sellerAvailable,
    bucket: 'RESERVED',
    reservationId: inventoryReservationId('RESERVATION_V10_TEST_TRANSFER'),
  });
  const sellerInTransit = createInventoryAccount({
    ...sellerAvailable,
    physicalLocationId: inventoryLocationId('LOCATION_V10_TEST_CORRIDOR'),
    bucket: 'IN_TRANSIT',
    shipmentId: inventoryShipmentId('SHIPMENT_V10_TEST_TRANSFER'),
  });
  const buyerAvailable = createInventoryAccount({
    ...sellerAvailable,
    countryId: buyer,
    physicalLocationId: inventoryLocationId('LOCATION_V10_BETA_PORT'),
    titleHolderId: buyerTreasuryEntity,
    riskBearerId: buyerTreasuryEntity,
    economicRecognitionId: economicRecognitionId('RECOGNITION_V10_TEST_IMPORT'),
  });
  const sellerSettlement = financialAccount({
    worldId: world,
    accountId: 'ACCOUNT_V10_ALPHA_SETTLEMENT',
    ownerId: sellerTreasury,
    countryId: seller,
    accountClass: 'CASH',
  });
  const sellerOpeningEquity = financialAccount({
    worldId: world,
    accountId: 'ACCOUNT_V10_ALPHA_OPENING_EQUITY',
    ownerId: sellerTreasury,
    countryId: seller,
    accountClass: 'EQUITY',
  });
  const buyerTreasury = financialAccount({
    worldId: world,
    accountId: 'ACCOUNT_V10_BETA_TREASURY_GCU',
    ownerId: buyerTreasuryEntity,
    countryId: buyer,
    accountClass: 'CASH',
  });
  const buyerOpeningEquity = financialAccount({
    worldId: world,
    accountId: 'ACCOUNT_V10_BETA_OPENING_EQUITY',
    ownerId: buyerTreasuryEntity,
    countryId: buyer,
    accountClass: 'EQUITY',
  });
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_V10_TWO_COUNTRY_TEST_ONLY'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'tests/support/v10-two-country-fixture.ts',
      sourceVersion: V10_TWO_COUNTRY_TEST_FIXTURE_VERSION,
      payload: {
        status: V10_TWO_COUNTRY_TEST_FIXTURE_STATUS,
        productionFallback: false,
        calibrationCountryValuesUsed: false,
        worldId: world,
        openingWorldVersion: '0',
        countryIds: [seller, buyer],
        commodityId: grain,
      },
    },
    sha256,
  );
  const openingSeed = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_V10_TWO_COUNTRY_TEST_ONLY'),
      worldId: world,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [
        {
          entryId: openingInventoryEntryId('OPENING_V10_ALPHA_GRAIN'),
          sourceId: source.sourceId,
          account: sellerAvailable,
          quantity: Quantity.from('12', 'tonne'),
        },
      ],
      financialBatches: [
        {
          batchId: financialOpeningBatchId('OPENING_V10_ALPHA_FINANCE'),
          sourceId: source.sourceId,
          settlementCurrency: 'GCU',
          legs: [
            {
              legId: financialOpeningLegId('OPENING_V10_ALPHA_CASH'),
              account: sellerSettlement,
              direction: 'DEBIT',
              amount: Money.from('20', 'GCU'),
              counterpartLegId: financialOpeningLegId(
                'OPENING_V10_ALPHA_EQUITY',
              ),
            },
            {
              legId: financialOpeningLegId('OPENING_V10_ALPHA_EQUITY'),
              account: sellerOpeningEquity,
              direction: 'CREDIT',
              amount: Money.from('20', 'GCU'),
              counterpartLegId: financialOpeningLegId('OPENING_V10_ALPHA_CASH'),
            },
          ],
        },
        {
          batchId: financialOpeningBatchId('OPENING_V10_BETA_FINANCE'),
          sourceId: source.sourceId,
          settlementCurrency: 'GCU',
          legs: [
            {
              legId: financialOpeningLegId('OPENING_V10_BETA_TREASURY'),
              account: buyerTreasury,
              direction: 'DEBIT',
              amount: Money.from('100', 'GCU'),
              counterpartLegId: financialOpeningLegId(
                'OPENING_V10_BETA_EQUITY',
              ),
            },
            {
              legId: financialOpeningLegId('OPENING_V10_BETA_EQUITY'),
              account: buyerOpeningEquity,
              direction: 'CREDIT',
              amount: Money.from('100', 'GCU'),
              counterpartLegId: financialOpeningLegId(
                'OPENING_V10_BETA_TREASURY',
              ),
            },
          ],
        },
      ],
    },
    sha256,
  );
  const rebuiltLedgers = rebuildV08LedgersFromLineage({
    seed: openingSeed,
    sha256Hex: sha256,
  });
  const reconciliation = reconcileV08LedgerSnapshots({
    reconstructed: rebuiltLedgers,
    inventorySnapshot: rebuiltLedgers.inventory,
    financialSnapshot: rebuiltLedgers.financial,
    sha256Hex: sha256,
  });
  assertV08LedgerReconciled(reconciliation);
  const transferQuantity = Quantity.from('4', 'tonne');
  const settlementAmount = Money.from('8', 'GCU');
  const sellerTrade = officeActor({
    subject: '10000000-0000-4000-8000-000000000001',
    displayName: 'V10 test seller Trade',
    actor: 'ACTOR_V10_ALPHA_TRADE',
    world,
    country: seller,
    team: 'TEAM_V10_ALPHA',
    office: officeId('TRADE'),
    capability: 'TRADE_CONTRACTS',
    authorizationVersion: 'AUTH_V10_ALPHA_TRADE_1',
    negotiationPartyIds: ['PARTY_V10_ALPHA'],
  });
  const buyerTrade = officeActor({
    subject: '20000000-0000-4000-8000-000000000002',
    displayName: 'V10 test buyer Trade',
    actor: 'ACTOR_V10_BETA_TRADE',
    world,
    country: buyer,
    team: 'TEAM_V10_BETA',
    office: officeId('TRADE'),
    capability: 'TRADE_CONTRACTS',
    authorizationVersion: 'AUTH_V10_BETA_TRADE_1',
    negotiationPartyIds: ['PARTY_V10_BETA'],
  });
  const buyerFinance = officeActor({
    subject: '30000000-0000-4000-8000-000000000003',
    displayName: 'V10 test buyer Finance',
    actor: 'ACTOR_V10_BETA_FINANCE',
    world,
    country: buyer,
    team: 'TEAM_V10_BETA',
    office: officeId('FINANCE'),
    capability: 'FINANCE_TREASURY',
    authorizationVersion: 'AUTH_V10_BETA_FINANCE_1',
    negotiationPartyIds: [],
  });
  const command = parseCanonicalCommand(
    {
      actorId: sellerTrade.actorId,
      authSubject: sellerTrade.principal.authSubject,
      commandId: commandId('COMMAND_V10_TEST_TRANSFER'),
      commandType: 'V10_TEST_TRANSFER_PREPARATION',
      correlationId: 'CORRELATION_V10_TEST_TRANSFER',
      countryId: seller,
      expectedWorldVersion: '0',
      idempotencyKey: idempotencyKey('IDEMPOTENCY_V10_TEST_TRANSFER'),
      officeId: sellerTrade.officeId,
      payload: {
        status: V10_TWO_COUNTRY_TEST_FIXTURE_STATUS,
        sellerCountryId: seller,
        buyerCountryId: buyer,
        commodityId: grain,
        quantity: transferQuantity.toCanonicalValue(),
        settlementAmount: settlementAmount.toCanonicalValue(),
        nonStrategic: true,
        belowThreshold: true,
        usesOfficialReserves: false,
        titleAndRiskTransferAt: 'DELIVERY',
      },
      schemaVersion: COMMAND_SCHEMA_VERSION,
      simTime: '0',
      submittedAtReal: '2026-09-12T00:00:00.000Z',
      worldId: world,
    },
    sha256,
  );
  const movement = (
    sourceAccount: InventoryAccount,
    target: InventoryAccount,
  ) =>
    Object.freeze([
      Object.freeze({
        account: sourceAccount,
        delta: Quantity.from('-4', 'tonne'),
      }),
      Object.freeze({
        account: target,
        delta: Quantity.from('4', 'tonne'),
      }),
    ] as const);
  return Object.freeze({
    fixtureVersion: V10_TWO_COUNTRY_TEST_FIXTURE_VERSION,
    status: V10_TWO_COUNTRY_TEST_FIXTURE_STATUS,
    productionFallback: false,
    calibrationCountryValuesUsed: false,
    worldId: world,
    openingWorldVersion: '0',
    countries: Object.freeze({ seller, buyer }),
    commodity: Object.freeze({
      id: grain,
      unit: 'tonne',
      registrySourceDocument: 'MASTER',
    }),
    entities: Object.freeze({
      sellerTreasury,
      buyerTreasury: buyerTreasuryEntity,
    }),
    inventoryAccounts: Object.freeze({
      sellerAvailable,
      sellerReserved,
      sellerInTransit,
      buyerAvailable,
    }),
    financialAccounts: Object.freeze({
      sellerSettlement,
      sellerOpeningEquity,
      buyerTreasury,
      buyerOpeningEquity,
    }),
    transferIntent: Object.freeze({
      quantity: transferQuantity,
      settlementAmount,
      nonStrategic: true,
      belowThreshold: true,
      usesOfficialReserves: false,
      titleAndRiskTransferAt: 'DELIVERY',
    }),
    movementPlan: Object.freeze({
      reserve: movement(sellerAvailable, sellerReserved),
      ship: movement(sellerReserved, sellerInTransit),
      deliver: movement(sellerInTransit, buyerAvailable),
    }),
    paymentPlan: Object.freeze([
      Object.freeze({
        account: buyerTreasury,
        direction: 'CREDIT',
        amount: settlementAmount,
        counterpartyAccountId: sellerSettlement.accountId,
      }),
      Object.freeze({
        account: sellerSettlement,
        direction: 'DEBIT',
        amount: settlementAmount,
        counterpartyAccountId: buyerTreasury.accountId,
      }),
    ] as const),
    officeActors: Object.freeze({ sellerTrade, buyerTrade, buyerFinance }),
    authorizationCases: Object.freeze([
      Object.freeze({
        caseId: 'ALLOW_SELLER_TRADE_OWN_COUNTRY',
        actorKey: 'sellerTrade',
        requestedCountryId: seller,
        requestedOfficeId: officeId('TRADE'),
        capability: 'TRADE_CONTRACTS',
        expected: 'ALLOW',
      }),
      Object.freeze({
        caseId: 'ALLOW_BUYER_TRADE_OWN_COUNTRY',
        actorKey: 'buyerTrade',
        requestedCountryId: buyer,
        requestedOfficeId: officeId('TRADE'),
        capability: 'TRADE_CONTRACTS',
        expected: 'ALLOW',
      }),
      Object.freeze({
        caseId: 'ALLOW_BUYER_FINANCE_OWN_TREASURY',
        actorKey: 'buyerFinance',
        requestedCountryId: buyer,
        requestedOfficeId: officeId('FINANCE'),
        capability: 'FINANCE_TREASURY',
        expected: 'ALLOW',
      }),
      Object.freeze({
        caseId: 'DENY_SELLER_TRADE_AS_BUYER_COUNTRY',
        actorKey: 'sellerTrade',
        requestedCountryId: buyer,
        requestedOfficeId: officeId('TRADE'),
        capability: 'TRADE_CONTRACTS',
        expected: 'DENY',
      }),
      Object.freeze({
        caseId: 'DENY_BUYER_FINANCE_AS_TRADE',
        actorKey: 'buyerFinance',
        requestedCountryId: buyer,
        requestedOfficeId: officeId('TRADE'),
        capability: 'TRADE_CONTRACTS',
        expected: 'DENY',
      }),
    ] satisfies readonly V10AuthorizationCase[]),
    command,
    openingSeed,
    rebuiltLedgers,
    reconciliation,
  });
}

export async function createV10AtomicCommandFixture(
  fixture: Readonly<V10TwoCountryTestFixture> = createV10TwoCountryTestFixture(),
): Promise<Readonly<V10AtomicCommandFixture>> {
  const actor = fixture.officeActors.sellerTrade;
  const authorizationContext = await authorizeOfficeCapability({
    principal: actor.principal,
    resolver: actor.resolver,
    worldId: fixture.worldId,
    requestedCountryId: fixture.countries.seller,
    requestedOfficeId: actor.officeId,
    capability: actor.capability,
  });
  if (fixture.command.idempotencyKey === null) {
    throw new Error('V10_TEST_FIXTURE_IDEMPOTENCY_KEY_REQUIRED');
  }
  return Object.freeze({
    worldId: fixture.worldId,
    commandId: fixture.command.commandId,
    idempotencyKey: fixture.command.idempotencyKey,
    commandFingerprint: fixture.command.fingerprint,
    expectedWorldVersion: fixture.openingWorldVersion,
    holderId: 'WORKER_V10_TEST_ONLY',
    fencingToken: '1',
    observedAtReal: '2026-09-12T00:00:00.000Z',
    authorizationContext,
    expectedAuthorizationRevision: actor.membership.authorizationVersion,
    requiredCountryId: fixture.countries.seller,
    requiredOfficeId: actor.officeId,
    requiredCapability: actor.capability,
    inventoryAmount: fixture.transferIntent.quantity.toCanonicalValue().amount,
    financialAmount:
      fixture.transferIntent.settlementAmount.toCanonicalValue().amount,
  });
}
