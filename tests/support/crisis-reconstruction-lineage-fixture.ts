import { createHash } from 'node:crypto';

import {
  canonicalSerialize,
  canonicalSha256,
  canonicalHashInput,
  createOpeningSource,
  createOpeningSeed,
  createInventoryAccount,
  createFinancialAccount,
  CURRENT_REPLAY_BINDING,
  Quantity,
  Money,
  worldId,
  countryId,
  commodityId,
  inventoryBatchId,
  inventoryLocationId,
  legalEntityId,
  financialAccountId,
  financialOpeningBatchId,
  financialOpeningLegId,
  openingInventoryEntryId,
  openingSourceId,
  openingSeedId,
  inventoryPostingId,
  financialPostingBatchId,
  financialPostingLegId,
  inventoryReservationId,
  parseCanonicalCommand,
  parseAuthoritativeEvent,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createReservationPosting,
  shipNarrowTreasuryGcuTransfer,
  deliverNarrowTreasuryGcuTransfer,
  rebuildV08LedgersFromLineage,
  type CanonicalCommand,
  type OpeningSeed,
} from '@econmind/core';
import type {
  IsolatedCrisisSnapshot,
  IsolatedCrisisSnapshotBody,
  HeldIdentity,
  CrisisSelection,
  CanonicalPrefixRecord,
  LotAllocation,
  CanonicalSourceDocument,
  SnapshotSourcePin,
  AdjustmentSlice,
  ActualCommitEligibilityFixture,
} from '../../apps/world-worker/src/projections/crisis-reconstruction-contribution.js';

export const fixtureSha = (bytes: string): string =>
  createHash('sha256').update(bytes, 'utf8').digest('hex');
export const fixtureDigest = (value: unknown): string =>
  `sha256:${fixtureSha(canonicalSerialize(value))}`;
const stamp = '2026-10-01T00:00:00.000Z';
export const fixtureSelection: CrisisSelection = {
  worldId: 'WORLD_CRISIS_MECHANISM',
  genesisRef: 'GENESIS_CRISIS_MECHANISM',
  countryId: 'COUNTRY_02',
  officeId: 'TRADE',
  teamId: 'TEAM_CRISIS_02',
  authorizationRevision: 'AUTH_CRISIS_1',
  crisisId: 'CRISIS_INPUT_1',
  taskId: 'TASK_INPUT_1',
  metricId: 'METRIC_GRAIN_INPUT',
  metricVersion: 'INPUT_1',
};

function isolation(): void {
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.VITEST !== 'true' ||
    !['local', 'ci'].includes(process.env.ECONMIND_ENV ?? '')
  )
    throw new Error('CRISIS_FIXTURE_ISOLATED_ENVIRONMENT_REQUIRED');
}
function stripped(
  value: object,
  fingerprint?: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => key !== 'pin' && key !== fingerprint,
    ),
  );
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Rebind content hashes after deliberate finite test edits. This is not a
 * production issuer, authorization factory or adoption source. */
export function sealCrisisFixture(
  input: IsolatedCrisisSnapshotBody,
): IsolatedCrisisSnapshot {
  isolation();
  const body = JSON.parse(
    canonicalSerialize(input),
  ) as IsolatedCrisisSnapshotBody;
  const mutable = body as unknown as Record<string, unknown>;
  const documents: CanonicalSourceDocument[] = [];
  function bind(
    sourceId: string,
    sourceVersion: string,
    payload: unknown,
  ): SnapshotSourcePin {
    const canonicalBytes = canonicalSerialize({
      sourceId,
      sourceVersion,
      held: body.held,
      payload,
    });
    const canonicalFingerprint = `sha256:${fixtureSha(canonicalBytes)}`;
    documents.push({
      sourceId,
      sourceVersion,
      held: body.held,
      canonicalBytes,
      canonicalFingerprint,
    });
    return { sourceId, sourceVersion, held: body.held, canonicalFingerprint };
  }
  if (body.opening)
    bind(
      body.held.openingSourceId,
      body.held.openingSourceVersion,
      stripped(body.opening, 'fingerprint'),
    );
  for (const key of [
    'rule',
    'prefix',
    'currentAuthorization',
    'activityWindow',
    'openingAllocations',
    'deliveryAllocations',
    'eligibility',
    'adjustments',
  ] as const) {
    const component = body[key];
    if (!component) continue;
    const row = component as unknown as Record<string, unknown>;
    if (key === 'openingAllocations' || key === 'deliveryAllocations')
      for (const lot of row.lots as LotAllocation[]) {
        (lot as unknown as Record<string, unknown>).allocationFingerprint =
          fixtureDigest(stripped(lot, 'allocationFingerprint'));
      }
    if (key === 'eligibility')
      for (const w of row.witnesses as Record<string, unknown>[])
        w.witnessCanonicalFingerprint = fixtureDigest(
          stripped(w, 'witnessCanonicalFingerprint'),
        );
    if (key === 'activityWindow')
      row.observationCanonicalFingerprint = fixtureDigest({
        observationSourceRef: row.observationSourceRef,
        held: body.held,
        currentObservedAtReal: row.currentObservedAtReal,
      });
    if (key === 'rule')
      row.ruleFingerprint = fixtureDigest(stripped(row, 'ruleFingerprint'));
    row.pin = bind(
      `SOURCE_CRISIS_${key.toUpperCase()}`,
      'CRISIS_FIXTURE_V2',
      stripped(row, key === 'rule' ? 'ruleFingerprint' : undefined),
    );
  }
  mutable.sourceDocuments = documents;
  return freeze({
    schemaVersion: 'isolated-crisis-snapshot-envelope-v2',
    admission: 'ISOLATED_TEST_ONLY_NOT_ADMITTED',
    canonicalFingerprint: fixtureDigest(body),
    body,
  });
}
export function mutateCrisisFixture(
  snapshot: IsolatedCrisisSnapshot,
  edit: (body: IsolatedCrisisSnapshotBody) => void,
): IsolatedCrisisSnapshot {
  isolation();
  const body = JSON.parse(
    canonicalSerialize(snapshot.body),
  ) as IsolatedCrisisSnapshotBody;
  edit(body);
  return sealCrisisFixture(body);
}

function seedFor(baseline: string, sellerQuantity = '2'): OpeningSeed {
  const world = worldId(fixtureSelection.worldId);
  const source = createOpeningSource(
    {
      schemaVersion: 'opening-source-v1',
      sourceId: openingSourceId('SOURCE_CRISIS_OPENING'),
      sourceKind: 'TEST_FIXTURE',
      locator: 'ISOLATED_CRISIS_LINEAGE_FIXTURE',
      sourceVersion: 'CRISIS_FIXTURE_V2',
      payload: {
        fixtureVersion: 'CRISIS_FIXTURE_V2',
        productionFallback: false,
      },
    },
    fixtureSha,
  );
  const account = (country: string, owner: string, location: string) =>
    createInventoryAccount({
      worldId: world,
      countryId: countryId(country),
      commodityId: commodityId('GRAIN'),
      batchId: inventoryBatchId(`BATCH_${country}`),
      unit: 'tonne',
      physicalLocationId: inventoryLocationId(location),
      bucket: 'AVAILABLE',
      reservationId: null,
      shipmentId: null,
      titleHolderId: legalEntityId(owner),
      riskBearerId: legalEntityId(owner),
      economicRecognitionId: null,
    });
  const financial = (
    id: string,
    owner: string,
    country: string,
    kind: 'CASH' | 'EQUITY',
  ) =>
    createFinancialAccount({
      worldId: world,
      accountId: financialAccountId(id),
      ownerId: legalEntityId(owner),
      countryId: countryId(country),
      accountClass: kind,
      currency: 'GCU',
      claimId: null,
      counterpartyEntityId: null,
    });
  return createOpeningSeed(
    {
      schemaVersion: 'opening-seed-v1',
      seedId: openingSeedId('SEED_CRISIS_MECHANISM'),
      worldId: world,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [
        {
          entryId: openingInventoryEntryId('OPENING_CRISIS_BUYER'),
          sourceId: source.sourceId,
          account: account(
            'COUNTRY_02',
            'ENTITY_GOVERNMENT_02',
            'LOCATION_CRISIS_INPUT',
          ),
          quantity: Quantity.from(baseline, 'tonne'),
        },
        {
          entryId: openingInventoryEntryId('OPENING_CRISIS_SELLER'),
          sourceId: source.sourceId,
          account: account(
            'COUNTRY_01',
            'ENTITY_OPERATOR_01',
            'LOCATION_SELLER',
          ),
          quantity: Quantity.from(sellerQuantity, 'tonne'),
        },
      ],
      financialBatches: [
        {
          batchId: financialOpeningBatchId('OPENING_CRISIS_CASH'),
          sourceId: source.sourceId,
          settlementCurrency: 'GCU',
          legs: [
            {
              legId: financialOpeningLegId('OPENING_BUYER_CASH_LEG'),
              account: financial(
                'ACCOUNT_CRISIS_BUYER_CASH',
                'ENTITY_GOVERNMENT_02',
                'COUNTRY_02',
                'CASH',
              ),
              direction: 'DEBIT',
              amount: Money.from('8', 'GCU'),
              counterpartLegId: financialOpeningLegId(
                'OPENING_BUYER_EQUITY_LEG',
              ),
            },
            {
              legId: financialOpeningLegId('OPENING_BUYER_EQUITY_LEG'),
              account: financial(
                'ACCOUNT_CRISIS_BUYER_EQUITY',
                'ENTITY_GOVERNMENT_02',
                'COUNTRY_02',
                'EQUITY',
              ),
              direction: 'CREDIT',
              amount: Money.from('8', 'GCU'),
              counterpartLegId: financialOpeningLegId('OPENING_BUYER_CASH_LEG'),
            },
          ],
        },
      ],
    },
    fixtureSha,
  );
}
function command(
  type: string,
  id: string,
  version: string,
  payload: unknown,
): CanonicalCommand {
  return parseCanonicalCommand(
    {
      schemaVersion: 'command-v1',
      commandType: type,
      commandId: id,
      idempotencyKey: `IDEMPOTENCY_${id}`,
      worldId: fixtureSelection.worldId,
      actorId: 'ACTOR_CRISIS_TEST',
      authSubject: '00000000-0000-4000-8000-000000000002',
      countryId: 'COUNTRY_01',
      officeId: type === 'CORE_GOODS_TRANSFER_V1' ? 'TRADE' : null,
      expectedWorldVersion: version,
      simTime: (BigInt(version) * 10000n).toString(),
      submittedAtReal: stamp,
      correlationId: `CORRELATION_${id}`,
      payload,
    },
    fixtureSha,
  );
}
function transition(cmd: CanonicalCommand, before: string) {
  const after = (BigInt(before) + 1n).toString();
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: 'event-v1',
      eventId: `EVENT_${cmd.commandId}`,
      eventType: cmd.commandType,
      worldId: cmd.worldId,
      causationCommandId: cmd.commandId,
      correlationId: cmd.correlationId,
      worldVersion: after,
      sequence: after,
      simTime: cmd.simTime.toCanonicalValue(),
      recordedAtReal: stamp,
      correctsEventId: null,
      payload: { commandFingerprint: cmd.fingerprint },
    },
    fixtureSha,
  );
  const state = createAuthoritativeTransition({
    command: cmd,
    worldVersionBefore: before,
    worldVersionAfter: after,
    events: [event],
  });
  const receipt = createFinalCommandReceipt({
    command: cmd,
    transition: state,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: cmd.simTime,
    recordedAtReal: stamp,
  });
  return { command: cmd, transition: state, receipt };
}
export function createCrisisLineageFixture(
  options: {
    baseline?: string;
    target?: string;
    actualEligibilityAtReal?: string;
    openingAllocationAmount?: string;
    unsupportedCorrectionAmounts?: readonly string[];
    secondFullDelivery?: boolean;
    inertV14Handoff?: boolean;
  } = {},
): IsolatedCrisisSnapshot {
  isolation();
  const seed = seedFor(
    options.baseline ?? '3.25',
    options.secondFullDelivery ? '4' : '2',
  );
  const seller = seed.inventoryEntries.find(
    (e) => e.entryId === 'OPENING_CRISIS_SELLER',
  )!.account;
  const buyer = seed.inventoryEntries.find(
    (e) => e.entryId === 'OPENING_CRISIS_BUYER',
  )!.account;
  const buyerCash = seed.financialBatches[0]!.legs.find(
    (l) => l.account.accountClass === 'CASH',
  )!.account;
  const sellerCash = createFinancialAccount({
    ...buyerCash,
    accountId: financialAccountId('ACCOUNT_CRISIS_SELLER_CASH'),
    countryId: countryId('COUNTRY_01'),
    ownerId: seller.titleHolderId,
  });
  const transfer = command(
    'CORE_GOODS_TRANSFER_V1',
    'COMMAND_CRISIS_RESERVE',
    '0',
    {
      schemaVersion: 'core-goods-transfer-v1',
      commodityId: 'GRAIN',
      sellerCountryId: 'COUNTRY_01',
      buyerCountryId: 'COUNTRY_02',
      quantity: { amount: '2', unit: 'tonne' },
      price: { amount: '3', currency: 'GCU', perUnit: 'tonne' },
      threshold: {
        policyVersion: 'V10_TREASURY_GCU_THRESHOLD_V1',
        maxSettlement: { amount: '6', currency: 'GCU' },
      },
      assetSource: {
        batchId: seller.batchId,
        physicalLocationId: seller.physicalLocationId,
        titleHolderId: seller.titleHolderId,
        riskBearerId: seller.riskBearerId,
        economicRecognitionId: null,
      },
      paymentSource: 'BUYER_TREASURY_GCU',
      policyVersion: 'V10_TREASURY_GCU_V1',
      expiresAtReal: '2026-10-01T01:00:00.000Z',
    },
  );
  const r = transition(transfer, '0');
  const reserved = createInventoryAccount({
    ...seller,
    bucket: 'RESERVED',
    reservationId: inventoryReservationId('RESERVATION_CRISIS'),
    shipmentId: null,
  });
  const reserve = createReservationPosting(
    {
      schemaVersion: 'inventory-posting-v1',
      postingId: inventoryPostingId('POSTING_CRISIS_RESERVE'),
      worldId: seed.worldId,
      causationCommandId: transfer.commandId,
      causationEventIds: r.transition.eventIds,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: transfer.simTime,
      command: transfer,
      transition: r.transition,
      quantity: Quantity.from('2', 'tonne'),
      source: seller,
      destination: reserved,
    },
    fixtureSha,
  );
  const records: CanonicalPrefixRecord[] = [
    { ...r, inventoryPostings: [reserve], financialPostingBatches: [] },
  ];
  const shipment = command(
    'CORE_GOODS_SHIPMENT_V1',
    'COMMAND_CRISIS_SHIP',
    '1',
    {
      schemaVersion: 'core-goods-shipment-v1',
      shipmentId: 'SHIPMENT_CRISIS',
      transferCommandId: transfer.commandId,
      transferFingerprint: transfer.fingerprint,
    },
  );
  const s = transition(shipment, '1');
  const shipped = shipNarrowTreasuryGcuTransfer({
    causationEventIds: s.transition.eventIds,
    inventoryState: rebuildV08LedgersFromLineage({
      seed,
      transitions: records,
      sha256Hex: fixtureSha,
    }).inventory,
    postingId: inventoryPostingId('POSTING_CRISIS_SHIP'),
    shipmentCommand: shipment,
    source: reserved,
    transferCommand: transfer,
    transition: s.transition,
    sha256Hex: fixtureSha,
  });
  records.push({
    ...s,
    inventoryPostings: [shipped.posting],
    financialPostingBatches: [],
  });
  const delivery = command(
    'CORE_GOODS_DELIVERY_V1',
    'COMMAND_CRISIS_DELIVER',
    '2',
    {
      schemaVersion: 'core-goods-delivery-v1',
      transferCommandId: transfer.commandId,
      transferFingerprint: transfer.fingerprint,
      shipmentId: 'SHIPMENT_CRISIS',
      destination: {
        physicalLocationId: buyer.physicalLocationId,
        titleHolderId: buyer.titleHolderId,
        riskBearerId: buyer.riskBearerId,
        economicRecognitionId: null,
      },
      buyerTreasuryAccountId: buyerCash.accountId,
      sellerSettlementAccountId: sellerCash.accountId,
    },
  );
  const d = transition(delivery, '2');
  const before = rebuildV08LedgersFromLineage({
    seed,
    transitions: records,
    sha256Hex: fixtureSha,
  });
  const transit = before.inventory.balances.find(
    (b) => b.account.bucket === 'IN_TRANSIT',
  )!.account;
  const delivered = deliverNarrowTreasuryGcuTransfer({
    buyerTreasury: buyerCash,
    sellerSettlement: sellerCash,
    causationEventIds: d.transition.eventIds,
    deliveryCommand: delivery,
    financialBatchId: financialPostingBatchId('BATCH_CRISIS_DELIVERY_CASH'),
    financialState: before.financial,
    inventoryState: before.inventory,
    inventoryPostingId: inventoryPostingId('POSTING_CRISIS_DELIVER'),
    sellerSettlementLegId: financialPostingLegId('LEG_CRISIS_SELLER_CREDIT'),
    buyerTreasuryLegId: financialPostingLegId('LEG_CRISIS_BUYER_DEBIT'),
    source: transit,
    transferCommand: transfer,
    transition: d.transition,
    sha256Hex: fixtureSha,
  });
  records.push({
    ...d,
    inventoryPostings: [delivered.posting],
    financialPostingBatches: [delivered.settlement],
  });
  let secondary: {
    record: CanonicalPrefixRecord;
    transfer: CanonicalCommand;
    posting: typeof delivered.posting;
    batch: typeof delivered.settlement;
  } | null = null;
  if (options.secondFullDelivery) {
    const version = records.at(-1)!.transition.worldVersionAfter;
    const secondTransfer = command(
      'CORE_GOODS_TRANSFER_V1',
      'COMMAND_CRISIS_RESERVE_SECOND',
      version,
      {
        ...JSON.parse(transfer.canonicalPayload),
        price: { amount: '1', currency: 'GCU', perUnit: 'tonne' },
      },
    );
    const secondReserveTransition = transition(secondTransfer, version);
    const secondReserved = createInventoryAccount({
      ...seller,
      bucket: 'RESERVED',
      reservationId: inventoryReservationId('RESERVATION_CRISIS_SECOND'),
    });
    const secondReserve = createReservationPosting(
      {
        schemaVersion: 'inventory-posting-v1',
        postingId: inventoryPostingId('POSTING_CRISIS_RESERVE_SECOND'),
        worldId: seed.worldId,
        causationCommandId: secondTransfer.commandId,
        causationEventIds: secondReserveTransition.transition.eventIds,
        worldVersionBefore: version,
        worldVersionAfter: secondReserveTransition.transition.worldVersionAfter,
        simTime: secondTransfer.simTime,
        command: secondTransfer,
        transition: secondReserveTransition.transition,
        quantity: Quantity.from('2', 'tonne'),
        source: seller,
        destination: secondReserved,
      },
      fixtureSha,
    );
    records.push({
      ...secondReserveTransition,
      inventoryPostings: [secondReserve],
      financialPostingBatches: [],
    });
    const secondShipCommand = command(
      'CORE_GOODS_SHIPMENT_V1',
      'COMMAND_CRISIS_SHIP_SECOND',
      records.at(-1)!.transition.worldVersionAfter,
      {
        schemaVersion: 'core-goods-shipment-v1',
        shipmentId: 'SHIPMENT_CRISIS_SECOND',
        transferCommandId: secondTransfer.commandId,
        transferFingerprint: secondTransfer.fingerprint,
      },
    );
    const secondShipTransition = transition(
      secondShipCommand,
      records.at(-1)!.transition.worldVersionAfter,
    );
    const secondShipped = shipNarrowTreasuryGcuTransfer({
      causationEventIds: secondShipTransition.transition.eventIds,
      inventoryState: rebuildV08LedgersFromLineage({
        seed,
        transitions: records,
        sha256Hex: fixtureSha,
      }).inventory,
      postingId: inventoryPostingId('POSTING_CRISIS_SHIP_SECOND'),
      shipmentCommand: secondShipCommand,
      source: secondReserved,
      transferCommand: secondTransfer,
      transition: secondShipTransition.transition,
      sha256Hex: fixtureSha,
    });
    records.push({
      ...secondShipTransition,
      inventoryPostings: [secondShipped.posting],
      financialPostingBatches: [],
    });
    const secondDeliveryCommand = command(
      'CORE_GOODS_DELIVERY_V1',
      'COMMAND_CRISIS_DELIVER_SECOND',
      records.at(-1)!.transition.worldVersionAfter,
      {
        ...JSON.parse(delivery.canonicalPayload),
        transferCommandId: secondTransfer.commandId,
        transferFingerprint: secondTransfer.fingerprint,
        shipmentId: 'SHIPMENT_CRISIS_SECOND',
      },
    );
    const secondDeliveryTransition = transition(
      secondDeliveryCommand,
      records.at(-1)!.transition.worldVersionAfter,
    );
    const secondBefore = rebuildV08LedgersFromLineage({
      seed,
      transitions: records,
      sha256Hex: fixtureSha,
    });
    const secondActual = deliverNarrowTreasuryGcuTransfer({
      buyerTreasury: buyerCash,
      sellerSettlement: sellerCash,
      causationEventIds: secondDeliveryTransition.transition.eventIds,
      deliveryCommand: secondDeliveryCommand,
      financialBatchId: financialPostingBatchId(
        'BATCH_CRISIS_SECOND_DELIVERY_CASH',
      ),
      financialState: secondBefore.financial,
      inventoryState: secondBefore.inventory,
      inventoryPostingId: inventoryPostingId('POSTING_CRISIS_DELIVER_SECOND'),
      sellerSettlementLegId: financialPostingLegId('LEG_CRISIS_SECOND_SELLER'),
      buyerTreasuryLegId: financialPostingLegId('LEG_CRISIS_SECOND_BUYER'),
      source: secondBefore.inventory.balances.find(
        (b) => b.account.shipmentId === 'SHIPMENT_CRISIS_SECOND',
      )!.account,
      transferCommand: secondTransfer,
      transition: secondDeliveryTransition.transition,
      sha256Hex: fixtureSha,
    });
    const secondRecord = {
      ...secondDeliveryTransition,
      inventoryPostings: [secondActual.posting],
      financialPostingBatches: [secondActual.settlement],
    };
    records.push(secondRecord);
    secondary = {
      record: secondRecord,
      transfer: secondTransfer,
      posting: secondActual.posting,
      batch: secondActual.settlement,
    };
  }
  if (options.inertV14Handoff) {
    const version = records.at(-1)!.transition.worldVersionAfter;
    const cmd = command(
      'ISOLATED_V14_HANDOFF_FOUNDATION',
      'COMMAND_CRISIS_INERT_HANDOFF',
      version,
      {
        foundationStatus: 'FOUNDATION_IMPLEMENTED_UNVERIFIED',
        facilityHandoff: 'INERT_NOT_ADMITTED',
        capacity: '1000000',
      },
    );
    records.push({
      ...transition(cmd, version),
      inventoryPostings: [],
      financialPostingBatches: [],
    });
  }
  // Real generic Core movements with NO adopted crisis correction contract.
  // They test integrity bounds before an unavailable whole measurement only.
  const adjustmentRefs: AdjustmentSlice['sourceRefs'][number][] = [];
  for (const [index, amount] of (
    options.unsupportedCorrectionAmounts ?? []
  ).entries()) {
    const version = records.at(-1)!.transition.worldVersionAfter;
    const cmd = command(
      'ISOLATED_UNSUPPORTED_CREDIT_ADJUSTMENT',
      `COMMAND_CRISIS_CORRECTION_${index}`,
      version,
      { originalContributionLotRef: 'LOT_OPENING' },
    );
    const correction = transition(cmd, version);
    const post = createReservationPosting(
      {
        schemaVersion: 'inventory-posting-v1',
        postingId: inventoryPostingId(`POSTING_CRISIS_CORRECTION_${index}`),
        worldId: seed.worldId,
        causationCommandId: cmd.commandId,
        causationEventIds: correction.transition.eventIds,
        worldVersionBefore: version,
        worldVersionAfter: correction.transition.worldVersionAfter,
        simTime: cmd.simTime,
        command: cmd,
        transition: correction.transition,
        quantity: Quantity.from(amount, 'tonne'),
        source: buyer,
        destination: createInventoryAccount({
          ...buyer,
          bucket: 'RESERVED',
          reservationId: inventoryReservationId(
            `RESERVATION_CORRECTION_${index}`,
          ),
        }),
      },
      fixtureSha,
    );
    records.push({
      ...correction,
      inventoryPostings: [post],
      financialPostingBatches: [],
    });
    adjustmentRefs.push({
      adjustmentEventId: correction.transition.events[0]!.eventId,
      originalContributionLotRef: 'LOT_OPENING',
      inventoryPostingId: post.postingId,
      financialBatchId: null,
      receiptCanonicalFingerprint: fixtureDigest(correction.receipt),
    });
  }
  const held: HeldIdentity = {
    worldId: seed.worldId,
    genesisRef: fixtureSelection.genesisRef,
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
    openingSourceId: seed.sources[0]!.sourceId,
    openingSourceVersion: seed.sources[0]!.sourceVersion,
    worldVersion: records.at(-1)!.transition.worldVersionAfter,
    eventSequence: records.at(-1)!.transition.events.at(-1)!.sequence,
  };
  const pin: SnapshotSourcePin = {
    sourceId: 'UNSEALED',
    sourceVersion: 'UNSEALED',
    canonicalFingerprint: 'UNSEALED',
    held,
  };
  const allocation = (
    id: string,
    quantity: string,
    source: LotAllocation['source'],
  ): LotAllocation => ({
    allocationRef: `ALLOCATION_${id}`,
    allocationFingerprint: 'UNSEALED',
    contributionLotRef: `LOT_${id}`,
    crisisId: fixtureSelection.crisisId,
    taskId: fixtureSelection.taskId,
    metricId: fixtureSelection.metricId,
    metricVersion: fixtureSelection.metricVersion,
    ruleId: 'RULE_CRISIS_INPUT',
    ruleVersion: 'RULE_INPUT_1',
    countryId: fixtureSelection.countryId,
    destinationId: buyer.physicalLocationId,
    commodityId: 'GRAIN',
    quantity: { amount: quantity, unit: 'tonne' },
    disposition: 'ALLOCATED',
    source,
  });
  const time = options.actualEligibilityAtReal ?? '2026-10-02T12:00:00.000Z';
  const committedEligibility: ActualCommitEligibilityFixture['committedEligibility'] =
    time < '2026-10-02T00:00:00.000Z'
      ? 'COMMITTED_BEFORE_START'
      : time >= '2026-10-16T00:00:00.000Z'
        ? 'COMMITTED_AT_OR_AFTER_END'
        : 'COMMITTED_WITHIN_WINDOW';
  return sealCrisisFixture({
    schemaVersion: 'isolated-crisis-snapshot-v2',
    sourceClass: 'FINITE_CANONICAL_MECHANISM_FIXTURE',
    held,
    selection: fixtureSelection,
    sourceDocuments: [],
    opening: seed,
    rule: {
      pin,
      ruleId: 'RULE_CRISIS_INPUT',
      ruleVersion: 'RULE_INPUT_1',
      ruleFingerprint: 'UNSEALED',
      selection: fixtureSelection,
      metricMode: 'DELIVERED_INPUT',
      commodityId: 'GRAIN',
      target: { amount: options.target ?? '10', unit: 'tonne' },
      eligibleDestinationIds: [buyer.physicalLocationId],
      openingAllocationSliceRef: 'OPENING_ALLOCATION_SLICE',
      deliveryAllocationSliceRef: 'DELIVERY_ALLOCATION_SLICE',
      activityWindowRef: 'ACTIVITY_WINDOW_CRISIS',
      disclosureRuleRef: 'DISCLOSURE_CRISIS_INPUT',
    },
    prefix: {
      pin,
      fromOpeningWorldVersion: '0',
      completeness: 'COMPLETE_MECHANISM_PREFIX',
      records,
    },
    currentAuthorization: {
      pin,
      authSubject: '00000000-0000-4000-8000-000000000002',
      seatRef: 'SEAT_CRISIS_02',
      entitlementRef: 'READ_CRISIS_02',
      countryId: fixtureSelection.countryId,
      officeId: fixtureSelection.officeId,
      teamId: fixtureSelection.teamId,
      authorizationRevision: fixtureSelection.authorizationRevision,
      capabilities: ['TRADE_CONTRACTS'],
      membershipState: 'CURRENT_MECHANISM_ONLY',
      entitlementState: 'ACTIVE_MECHANISM_ONLY',
      disclosureRuleRef: 'DISCLOSURE_CRISIS_INPUT',
      readableMetricIds: [fixtureSelection.metricId],
    },
    activityWindow: {
      pin,
      windowRef: 'ACTIVITY_WINDOW_CRISIS',
      policyVersion: 'ACTUAL_COMMIT_WINDOW_FIXTURE_V1',
      basis: 'ACTUAL_REAL_ACTIVITY_COMMIT_CUTOFF',
      startInclusiveAtReal: '2026-10-02T00:00:00.000Z',
      endExclusiveAtReal: '2026-10-16T00:00:00.000Z',
      observationSourceRef: 'ISOLATED_CURRENT_OBSERVATION',
      observationCanonicalFingerprint: 'UNSEALED',
      currentObservedAtReal: '2026-10-17T00:00:00.000Z',
    },
    openingAllocations: {
      pin,
      sliceRef: 'OPENING_ALLOCATION_SLICE',
      completeness: 'COMPLETE_MECHANISM_ALLOCATION',
      lots: [
        allocation(
          'OPENING',
          options.openingAllocationAmount ?? options.baseline ?? '3.25',
          {
            kind: 'OPENING',
            openingEntryId: 'OPENING_CRISIS_BUYER',
          },
        ),
      ],
    },
    deliveryAllocations: {
      pin,
      sliceRef: 'DELIVERY_ALLOCATION_SLICE',
      completeness: 'COMPLETE_MECHANISM_ALLOCATION',
      lots: [
        allocation('DELIVERY', '2', {
          kind: 'DELIVERY',
          commandId: delivery.commandId,
          commandFingerprint: delivery.fingerprint,
          eventId: d.transition.events[0]!.eventId,
          eventFingerprint: d.transition.events[0]!.fingerprint,
          inventoryPostingId: delivered.posting.postingId,
          inventoryPostingFingerprint: delivered.posting.fingerprint,
          financialBatchId: delivered.settlement.batchId,
          financialBatchFingerprint: delivered.settlement.fingerprint,
          receiptCanonicalFingerprint: fixtureDigest(d.receipt),
          transferCommandId: transfer.commandId,
          transferFingerprint: transfer.fingerprint,
          shipmentId: 'SHIPMENT_CRISIS',
        }),
        ...(secondary
          ? [
              allocation('DELIVERY_SECOND', '2', {
                kind: 'DELIVERY',
                commandId: secondary.record.command.commandId,
                commandFingerprint: secondary.record.command.fingerprint,
                eventId: secondary.record.transition.events[0]!.eventId,
                eventFingerprint:
                  secondary.record.transition.events[0]!.fingerprint,
                inventoryPostingId: secondary.posting.postingId,
                inventoryPostingFingerprint: secondary.posting.fingerprint,
                financialBatchId: secondary.batch.batchId,
                financialBatchFingerprint: secondary.batch.fingerprint,
                receiptCanonicalFingerprint: fixtureDigest(
                  secondary.record.receipt,
                ),
                transferCommandId: secondary.transfer.commandId,
                transferFingerprint: secondary.transfer.fingerprint,
                shipmentId: 'SHIPMENT_CRISIS_SECOND',
              }),
            ]
          : []),
      ],
    },
    eligibility: {
      pin,
      completeness: 'COMPLETE_MECHANISM_CUTOFFS',
      witnesses: [
        {
          witnessRef: 'WITNESS_ACTUAL_CRISIS_DELIVERY',
          witnessCanonicalFingerprint: 'UNSEALED',
          sourceProtocol: 'ISOLATED_ACTUAL_COMMITTED_CUTOFF_FIXTURE_V1',
          actualSourceRef: 'ISOLATED_COMMITTED_CONJUNCTION_SOURCE',
          windowRef: 'ACTIVITY_WINDOW_CRISIS',
          commandId: delivery.commandId,
          commandFingerprint: delivery.fingerprint,
          transitionId: d.transition.transitionId,
          worldVersionAfter: '3',
          eventIds: d.transition.eventIds,
          receiptCanonicalFingerprint: fixtureDigest(d.receipt),
          eligibilityObservedAtReal: time,
          committedEligibility,
        },
        ...(secondary
          ? [
              {
                witnessRef: 'WITNESS_ACTUAL_CRISIS_DELIVERY_SECOND',
                witnessCanonicalFingerprint: 'UNSEALED',
                sourceProtocol:
                  'ISOLATED_ACTUAL_COMMITTED_CUTOFF_FIXTURE_V1' as const,
                actualSourceRef: 'ISOLATED_COMMITTED_CONJUNCTION_SOURCE_SECOND',
                windowRef: 'ACTIVITY_WINDOW_CRISIS',
                commandId: secondary.record.command.commandId,
                commandFingerprint: secondary.record.command.fingerprint,
                transitionId: secondary.record.transition.transitionId,
                worldVersionAfter:
                  secondary.record.transition.worldVersionAfter,
                eventIds: secondary.record.transition.eventIds,
                receiptCanonicalFingerprint: fixtureDigest(
                  secondary.record.receipt,
                ),
                eligibilityObservedAtReal: time,
                committedEligibility,
              },
            ]
          : []),
      ],
    },
    adjustments: {
      pin,
      semantics: adjustmentRefs.length
        ? 'UNSUPPORTED_OR_UNKNOWN'
        : 'NO_ADJUSTMENTS_IN_COMPLETE_PREFIX',
      sourceRefs: adjustmentRefs,
    },
  });
}

/** Canonical hashing used in fixtures stays identical to existing Core. */
export function fixtureCoreFingerprint(value: unknown): string {
  return canonicalSha256(canonicalHashInput(value), fixtureSha);
}
