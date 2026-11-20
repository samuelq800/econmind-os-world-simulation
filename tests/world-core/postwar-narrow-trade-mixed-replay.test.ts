/** Full ordered TEST_ONLY Core economic frames, never a DB/source approval. */
import { describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  prepareFinanceSocialLedger,
  prepareFinanceSocialLedgerFromOpening,
  replayPreparedFinanceSocialFxLedger,
  type FinanceSocialFxOriginal,
  type FinanceSocialFxOpeningEncumbrance,
} from '../../packages/core/src/commands/finance-social-prepared-ledger.js';
import {
  prepareFinanceNativeBudgetTransition,
  prepareFinanceNativeBudgetFinancialReplay,
  type FinanceNativeBudgetPolicy,
  type FinanceNativeBudgetCanonicalFrame,
  type FinanceNativeBudgetSource,
} from '../../packages/core/src/commands/finance-budget-native.js';
import {
  mixedFinancialFixture,
  mixedSocialOriginal,
  mixedFxFrame,
  withMixedTestProof,
  mixedWorld as world,
  mixedSha as sha,
} from '../support/finance-social-fx-replay-fixture.js';
import { canonicalSerialize as distSerialize } from '@econmind/core';
import { createV10TwoCountryTestFixture } from '../support/v10-two-country-fixture.js';
import { createPostwarDayOneFxQuoteData } from '../../packages/core/src/finance/postwar-day-one-treasury-fx.js';
const at = '2026-10-29T00:00:00.000Z';
function combinedFixture() {
  const fx = mixedFinancialFixture(),
    trade = createV10TwoCountryTestFixture();
  const tradeSeed = C.parseOpeningSeed(
    JSON.parse(distSerialize(trade.openingSeed)),
    sha,
  );
  const account = (a: C.FinancialAccount) =>
    C.createFinancialAccount({ ...a, worldId: world });
  const inventoryAccount = (a: C.InventoryAccount) =>
    C.createInventoryAccount({ ...a, worldId: world });
  const seed = C.createOpeningSeed(
    {
      ...fx.seed,
      seedId: C.openingSeedId('SEED_GOODS_FX_TEST_ONLY'),
      sources: [...fx.seed.sources, ...tradeSeed.sources],
      inventoryEntries: tradeSeed.inventoryEntries.map((e) => ({
        ...e,
        account: inventoryAccount(e.account),
      })),
      financialBatches: [
        ...fx.seed.financialBatches,
        ...tradeSeed.financialBatches.map((b) => ({
          ...b,
          legs: b.legs.map((l) => ({ ...l, account: account(l.account) })),
        })),
      ],
    },
    sha,
  );
  const ledgers = C.rebuildV08LedgersFromLineage({ seed, sha256Hex: sha });
  const { quoteRef: oldRef, quoteSha256: oldHash, ...quoteIntent } = fx.quote;
  void oldRef;
  void oldHash;
  const quote = createPostwarDayOneFxQuoteData(
    { ...quoteIntent, seedFingerprint: seed.fingerprint },
    sha,
  );
  return {
    ...fx,
    seed,
    financial: ledgers.financial,
    inventory: ledgers.inventory,
    ledgers,
    quote,
    payload: {
      ...fx.payload,
      quoteRef: quote.quoteRef,
      expectedQuoteSha256: quote.quoteSha256,
    },
    trade,
    source: inventoryAccount(trade.inventoryAccounts.sellerAvailable),
  };
}
function setup() {
  const f = combinedFixture(),
    social = mixedSocialOriginal(),
    a = f.accounts;
  const fxOriginals: FinanceSocialFxOriginal[] = [
    {
      quote: f.quote,
      treasuryAsset: a.treasuryAsset,
      treasuryLiability: a.treasuryLiability,
      bankSettlementAsset: a.bankSettlementAsset,
      bankSettlementLiability: a.bankSettlementLiability,
      bankGcuAsset: a.bankGcuAsset,
    },
  ];
  const openingEncumbrances: FinanceSocialFxOpeningEncumbrance[] = [
    {
      reference: 'OPENING_TREASURY_TEST_ONLY',
      accountId: a.treasuryAsset.accountId,
      amount: '200',
      currency: 'XAA',
    },
    {
      reference: 'OPENING_BANK_GCU_TEST_ONLY',
      accountId: a.bankGcuAsset.accountId,
      amount: '10',
      currency: 'GCU',
    },
  ];
  const prepared = prepareFinanceSocialLedgerFromOpening(f.ledgers, sha);
  const replay = (frames: readonly FinanceNativeBudgetCanonicalFrame[]) =>
    replayPreparedFinanceSocialFxLedger({
      prepared,
      frames,
      socialCountries: [social],
      openingEncumbrances,
      fxOriginals,
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
    worldId: world,
    countryId: 'COUNTRY_01',
    governmentEntityId: a.treasuryAsset.ownerId,
    currency: 'XAA',
    envelopeRef: 'ENVELOPE_MIXED_FX_TEST_ONLY',
    effectivePeriodRef: 'PERIOD_TEST_ONLY',
    periodRevision: 'REV_TEST_ONLY',
    validFromSimTime: '0',
    validUntilSimTime: '86400000',
    requestingOfficeId: 'FINANCE',
    programmeOwnerOfficeId: 'FINANCE',
    classification: 'ORDINARY_DEPARTMENTAL',
    funding: 'FULL_UNCONDITIONAL',
    requiredApprovalOffices: ['FINANCE'],
  };
  const source = (
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
  ): FinanceNativeBudgetSource => {
    const current = replay(frames),
      opening = [openingEncumbrances[0]!];
    return {
      policy,
      binding: {
        seedRef: f.seed.seedId,
        seedFingerprint: f.seed.fingerprint,
        admissionRef: 'TEST_ONLY_ADMISSION',
        financialSourceId: f.seed.sources[0]!.sourceId,
        originalsSHA256: 'sha256:' + 'b'.repeat(64),
        policyHash: C.canonicalSha256(C.canonicalHashInput(policy), sha),
        treasuryAccountId: a.treasuryAsset.accountId,
        treasuryClaimId: a.treasuryAsset.claimId!,
        openingEncumbranceHash: C.canonicalSha256(
          C.canonicalHashInput(opening),
          sha,
        ),
      },
      openingEncumbrances: opening,
      financialState: current.financial,
      mixedPrefixEvidence: current.mixedPrefixEvidence,
      frames,
      worldVersion: current.budgetState.worldVersion,
      eventSequence: current.budgetState.eventSequence,
    };
  };
  const command = (
    operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
    identity: string,
    amount: string,
  ) =>
    C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        worldId: world,
        countryId: 'COUNTRY_01',
        officeId: 'FINANCE',
        actorId: 'ACTOR_TEST_ONLY_MIXED',
        authSubject: '11111111-1111-4111-8111-111111111111',
        commandId: 'COMMAND_MIXED_' + identity,
        idempotencyKey: 'KEY_MIXED_' + identity,
        commandType: 'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
        expectedWorldVersion:
          frames.at(-1)?.transition.worldVersionAfter ?? '0',
        simTime: '1',
        correlationId: 'CORRELATION_MIXED_' + identity,
        submittedAtReal: at,
        payload: {
          operation,
          scope: {
            worldId: world,
            countryId: 'COUNTRY_01',
            entityRef: policy.governmentEntityId,
            envelopeRef: policy.envelopeRef,
            effectivePeriodRef: policy.effectivePeriodRef,
          },
          currency: 'XAA',
          amount,
          envelopeRevisionRef: 'ENVELOPE_REV_MIXED',
          lineRef: operation === 'SET_ENVELOPE' ? null : 'LINE_MIXED_FX',
          revisionRef:
            operation === 'SET_ENVELOPE'
              ? 'ENVELOPE_REV_MIXED'
              : 'LINE_REV_MIXED',
          predecessorRevisionRef: null,
        },
      },
      sha,
    );
  const budgetFrame = async (
    operation: 'SET_ENVELOPE' | 'APPROVE_NEW_LINE',
    frames: readonly FinanceNativeBudgetCanonicalFrame[],
    identity: string,
    amount: string,
  ) => {
    const c = command(operation, frames, identity, amount),
      s = source(frames);
    const value = await withMixedTestProof(c, 'FINANCE_BUDGET', (proof) =>
      prepareFinanceNativeBudgetTransition({
        command: c,
        authorization: proof,
        source: s,
        recordedAtReal: at,
        sha256Hex: sha,
      }),
    );
    return {
      command: c,
      events: value.transition.events,
      transition: value.transition,
      receipt: value.receipt,
      financialPostingBatches: [],
      inventoryPostings: [],
    };
  };
  return {
    f,
    social,
    fxOriginals,
    openingEncumbrances,
    prepared,
    replay,
    policy,
    source,
    command,
    budgetFrame,
  };
}

function goodsFrame(
  f: ReturnType<typeof setup>,
  frames: readonly FinanceNativeBudgetCanonicalFrame[],
  kind: 'RESERVE' | 'SHIP' | 'DELIVER',
  transfer?: C.CanonicalCommand,
): FinanceNativeBudgetCanonicalFrame {
  const current = f.replay(frames),
    version = current.budgetState.worldVersion,
    after = String(BigInt(version) + 1n),
    source = f.f.source,
    trade = f.f.trade,
    id = 'COMMAND_GOODS_' + kind;
  const payload =
    kind === 'RESERVE'
      ? {
          schemaVersion: 'core-goods-transfer-v1',
          commodityId: 'GRAIN',
          sellerCountryId: trade.countries.seller,
          buyerCountryId: trade.countries.buyer,
          quantity: { amount: '2', unit: source.unit },
          price: { amount: '3', currency: 'GCU', perUnit: source.unit },
          assetSource: {
            batchId: source.batchId,
            physicalLocationId: source.physicalLocationId,
            titleHolderId: source.titleHolderId,
            riskBearerId: source.riskBearerId,
            economicRecognitionId: source.economicRecognitionId,
          },
          paymentSource: 'BUYER_TREASURY_GCU',
          policyVersion: 'V10_TREASURY_GCU_V1',
          threshold: {
            policyVersion: 'V10_TREASURY_GCU_THRESHOLD_V1',
            maxSettlement: { amount: '6', currency: 'GCU' },
          },
          expiresAtReal: '2026-10-29T00:10:00.000Z',
        }
      : {
          schemaVersion:
            kind === 'SHIP'
              ? 'core-goods-shipment-v1'
              : 'core-goods-delivery-v1',
          shipmentId: 'SHIPMENT_GOODS_TEST_ONLY',
          transferCommandId: transfer!.commandId,
          transferFingerprint: transfer!.fingerprint,
          ...(kind === 'DELIVER'
            ? {
                buyerTreasuryAccountId:
                  trade.financialAccounts.buyerTreasury.accountId,
                sellerSettlementAccountId:
                  trade.financialAccounts.sellerSettlement.accountId,
                destination: {
                  physicalLocationId:
                    trade.inventoryAccounts.buyerAvailable.physicalLocationId,
                  titleHolderId:
                    trade.inventoryAccounts.buyerAvailable.titleHolderId,
                  riskBearerId:
                    trade.inventoryAccounts.buyerAvailable.riskBearerId,
                  economicRecognitionId:
                    trade.inventoryAccounts.buyerAvailable
                      .economicRecognitionId,
                },
              }
            : {}),
        };
  const command = C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      worldId: world,
      countryId: trade.countries.seller,
      officeId: kind === 'RESERVE' ? 'TRADE' : null,
      actorId: 'ACTOR_GOODS_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: id,
      commandType:
        kind === 'RESERVE'
          ? 'CORE_GOODS_TRANSFER_V1'
          : kind === 'SHIP'
            ? 'CORE_GOODS_SHIPMENT_V1'
            : 'CORE_GOODS_DELIVERY_V1',
      expectedWorldVersion: version,
      idempotencyKey: 'KEY_' + id,
      simTime: '1',
      submittedAtReal: at,
      correlationId: 'CORRELATION_' + id,
      payload,
    },
    sha,
  );
  const event = C.parseAuthoritativeEvent(
    {
      schemaVersion: C.EVENT_SCHEMA_VERSION,
      eventId: 'EVENT_' + id,
      eventType:
        kind === 'RESERVE'
          ? 'NARROW_TREASURY_GCU_RESERVED_V1'
          : kind === 'SHIP'
            ? 'NARROW_TREASURY_GCU_SHIPPED_V1'
            : 'NARROW_TREASURY_GCU_DELIVERED_V1',
      worldId: world,
      causationCommandId: id,
      correlationId: command.correlationId,
      worldVersion: after,
      sequence: String(BigInt(current.budgetState.eventSequence) + 1n),
      simTime: '1',
      recordedAtReal: at,
      correctsEventId: null,
      payload:
        kind === 'RESERVE'
          ? {
              schemaVersion: 'narrow-treasury-gcu-reservation-event-v1',
              transferFingerprint: command.fingerprint,
            }
          : {
              schemaVersion:
                kind === 'SHIP'
                  ? 'narrow-treasury-gcu-shipment-event-v1'
                  : 'narrow-treasury-gcu-delivery-event-v1',
              shipmentId: 'SHIPMENT_GOODS_TEST_ONLY',
              transferCommandId: transfer!.commandId,
              transferFingerprint: transfer!.fingerprint,
            },
    },
    sha,
  );
  const transition = C.createAuthoritativeTransition({
      command,
      events: [event],
      worldVersionBefore: version,
      worldVersionAfter: after,
    }),
    receipt = C.createFinalCommandReceipt({
      command,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: command.simTime,
      recordedAtReal: at,
    }),
    inventory = current.inventory!;
  if (kind === 'RESERVE') {
    const posting = C.createReservationPosting(
      {
        schemaVersion: 'inventory-posting-v1',
        postingId: C.inventoryPostingId('POSTING_' + id),
        worldId: world,
        causationCommandId: command.commandId,
        causationEventIds: transition.eventIds,
        worldVersionBefore: version,
        worldVersionAfter: after,
        simTime: command.simTime,
        command,
        transition,
        quantity: C.Quantity.from('2', source.unit),
        source,
        destination: C.createInventoryAccount({
          ...source,
          bucket: 'RESERVED',
          reservationId: C.inventoryReservationId(
            'RESERVATION_GOODS_TEST_ONLY',
          ),
        }),
      },
      sha,
    );
    return {
      command,
      events: [event],
      transition,
      receipt,
      inventoryPostings: [posting],
      financialPostingBatches: [],
    };
  }
  if (kind === 'SHIP') {
    const result = C.shipNarrowTreasuryGcuTransfer({
      shipmentCommand: command,
      transferCommand: transfer!,
      inventoryState: inventory,
      postingId: C.inventoryPostingId('POSTING_' + id),
      source: inventory.balances.find((b) => b.account.bucket === 'RESERVED')!
        .account,
      transition,
      causationEventIds: transition.eventIds,
      sha256Hex: sha,
    });
    return {
      command,
      events: [event],
      transition,
      receipt,
      inventoryPostings: [result.posting],
      financialPostingBatches: [],
    };
  }
  const result = C.deliverNarrowTreasuryGcuTransfer({
    deliveryCommand: command,
    transferCommand: transfer!,
    inventoryState: inventory,
    financialState: current.financial,
    inventoryPostingId: C.inventoryPostingId('POSTING_' + id),
    financialBatchId: C.financialPostingBatchId('BATCH_GOODS_DELIVERY'),
    buyerTreasuryLegId: C.financialPostingLegId('LEG_GOODS_BUYER'),
    sellerSettlementLegId: C.financialPostingLegId('LEG_GOODS_SELLER'),
    buyerTreasury: current.financial.accounts.find(
      (a) => a.accountId === trade.financialAccounts.buyerTreasury.accountId,
    )!,
    sellerSettlement: current.financial.accounts.find(
      (a) => a.accountId === trade.financialAccounts.sellerSettlement.accountId,
    )!,
    source: inventory.balances.find((b) => b.account.bucket === 'IN_TRANSIT')!
      .account,
    transition,
    causationEventIds: transition.eventIds,
    sha256Hex: sha,
  });
  return {
    command,
    events: [event],
    transition,
    receipt,
    inventoryPostings: [result.posting],
    financialPostingBatches: [result.settlement],
  };
}
async function chain() {
  const f = setup(),
    frames: FinanceNativeBudgetCanonicalFrame[] = [];
  frames.push(await f.budgetFrame('SET_ENVELOPE', frames, 'SET', '100'));
  const fx = await mixedFxFrame({
    financial: f.replay(frames).financial,
    original: f.f,
    sequence: '2',
    identity: 'GOODS',
  });
  frames.push(fx);
  const reserve = goodsFrame(f, frames, 'RESERVE');
  frames.push(reserve);
  const shipment = goodsFrame(f, frames, 'SHIP', reserve.command);
  frames.push(shipment);
  const delivery = goodsFrame(f, frames, 'DELIVER', reserve.command);
  frames.push(delivery);
  return { f, frames, reserve, shipment, delivery };
}
describe('complete Budget/FX/Goods current ledger replay (TEST_ONLY economic originals)', () => {
  it('actually replays Budget→FX→Reserve→Ship→Deliver with exact current inventory and GCU balances', async () => {
    const { f, frames } = await chain(),
      current = f.replay(frames);
    expect(current.financial.worldVersion).toBe('5');
    expect(current.inventory!.worldVersion).toBe('5');
    expect(current.inventory!.appliedPostings).toHaveLength(3);
    expect(
      current.inventory!.balances.filter(
        (b) =>
          b.account.bucket === 'IN_TRANSIT' || b.account.bucket === 'RESERVED',
      ),
    ).toHaveLength(0);
    expect(
      current
        .inventory!.balances.find(
          (b) => b.account.countryId === f.f.trade.countries.buyer,
        )!
        .quantity.toCanonicalValue().amount,
    ).toBe('2');
    expect(
      current.financial.positions
        .find(
          (p) =>
            p.account.accountId ===
            f.f.trade.financialAccounts.buyerTreasury.accountId,
        )!
        .netDebitBalance.amount.toFixed(),
    ).toBe('2');
    expect(
      current.financial.positions
        .find(
          (p) =>
            p.account.accountId ===
            f.f.trade.financialAccounts.sellerSettlement.accountId,
        )!
        .netDebitBalance.amount.toFixed(),
    ).toBe('8');
    expect(current.financial.appliedBatches).toHaveLength(
      f.f.financial.appliedBatches.length + 3,
    );
    expect(current.budgetEncumbrances).toHaveLength(1);
    expect(f.replay(frames)).toEqual(current);
  });
  it('refuses missing/extra inventory, forged balance tuples and omitted settlement', async () => {
    const { f, frames, reserve, delivery } = await chain();
    expect(() =>
      f.replay(
        frames.map((x) =>
          x === reserve ? { ...x, inventoryPostings: [] } : x,
        ),
      ),
    ).toThrow('ONE_POSTING');
    expect(() =>
      f.replay(
        frames.map((x) =>
          x === delivery ? { ...x, financialPostingBatches: [] } : x,
        ),
      ),
    ).toThrow('ONE_TWO_LEG');
    expect(() =>
      f.replay(
        frames.map((x) =>
          x === reserve
            ? {
                ...x,
                inventoryPostings: [
                  ...x.inventoryPostings,
                  ...x.inventoryPostings,
                ],
              }
            : x,
        ),
      ),
    ).toThrow('ONE_POSTING');
    const posting = reserve.inventoryPostings[0] as C.InventoryPosting;
    expect(() =>
      f.replay(
        frames.map((x) =>
          x === reserve
            ? {
                ...x,
                inventoryPostings: [
                  {
                    ...posting,
                    entries: [
                      {
                        ...posting.entries[0]!,
                        account: {
                          ...posting.entries[0]!.account,
                          titleHolderId: C.legalEntityId('WRONG_OWNER'),
                        },
                      },
                      posting.entries[1]!,
                    ],
                  },
                ],
              }
            : x,
        ),
      ),
    ).toThrow('TRANSFER_STOCK');
  });
  it('refuses duplicate frames, wrong origin/unknown effects and inventory copied as a new genuine base', async () => {
    const { f, frames } = await chain();
    expect(() => f.replay([...frames, frames[2]!])).toThrow('ORDERED');
    expect(() =>
      prepareFinanceSocialLedgerFromOpening({ ...f.f.ledgers }, sha),
    ).toThrow('Reconciliation accepts');
    const child = C.createOpeningSeed(
      {
        ...f.f.seed,
        seedId: C.openingSeedId('SEED_GENUINE_DIFFERENT_CHILD'),
        sources: [
          ...f.f.seed.sources,
          C.createOpeningSource(
            {
              schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
              sourceId: C.openingSourceId('SOURCE_GENUINE_DIFFERENT_CHILD'),
              sourceKind: 'TEST_FIXTURE',
              sourceVersion: 'TEST_ONLY',
              locator: 'TEST_ONLY_CHILD_NOT_ADOPTED',
              payload: { classification: 'TEST_ONLY_DIFFERENT_SEED' },
            },
            sha,
          ),
        ],
      },
      sha,
    );
    const childPair = C.rebuildV08LedgersFromLineage({
      seed: child,
      sha256Hex: sha,
    });
    expect(child.fingerprint).not.toBe(f.f.seed.fingerprint);
    expect(() =>
      prepareFinanceNativeBudgetFinancialReplay(
        {
          financial: f.f.financial,
          opening: childPair,
          openingEncumbrances: [],
          fxOriginals: [],
        },
        sha,
      ),
    ).toThrow('EXACT_GENUINE_PAIRED_H0_LEDGER_BASE_REQUIRED');
    const withoutInventory = prepareFinanceSocialLedger(f.f.financial);
    expect(() =>
      replayPreparedFinanceSocialFxLedger({
        prepared: withoutInventory,
        frames,
        socialCountries: [f.social],
        openingEncumbrances: f.openingEncumbrances,
        fxOriginals: f.fxOriginals,
        expectedHead: { worldVersion: '5', eventSequence: '5' },
        sha256Hex: sha,
      }),
    ).toThrow('POSTING_EFFECT');
  });
});

describe('actual full Goods journal protocol reconstruction, no source capability', () => {
  it('decodes all five canonical groups and exact three inventory/three financial batches, and rejects a hidden or corrupted row', async () => {
    const { f, frames } = await chain();
    const { decodeBoundedPostwarJournal } =
      await import('../../apps/world-worker/src/persistence/bounded-postwar-fx-postings.js');
    const { decodeBoundedPostwarCanonicalPrefix } =
      await import('../../apps/world-worker/src/persistence/bounded-postwar-canonical-prefix.js');
    const intent = (v: object) => {
      const { fingerprint, ...body } = v as { fingerprint: string };
      void fingerprint;
      return C.canonicalSerialize(body);
    };
    const raw = {
      world_version: '5',
      event_sequence: '5',
      commands: frames.map(({ command: c }) => ({
        actor_id: c.actorId,
        auth_subject: c.authSubject,
        canonical_payload: c.canonicalPayload,
        country_id: c.countryId,
        expected_world_version: c.expectedWorldVersion,
        command_fingerprint: c.fingerprint,
        command_id: c.commandId,
        idempotency_key: c.idempotencyKey,
        office_id: c.officeId,
        payload_sha256: c.payloadHash,
        schema_version: c.schemaVersion,
        sim_time: c.simTime.toCanonicalValue(),
        submitted_at_real: c.submittedAtReal,
        command_type: c.commandType,
        world_id: c.worldId,
        correlation_id: c.correlationId,
      })),
      events: frames.flatMap((f) =>
        f.events.map((e) => ({
          schema_version: e.schemaVersion,
          event_id: e.eventId,
          event_type: e.eventType,
          world_id: e.worldId,
          causation_command_id: e.causationCommandId,
          correlation_id: e.correlationId,
          world_version: e.worldVersion,
          sequence: e.sequence,
          sim_time: e.simTime.toCanonicalValue(),
          recorded_at_real: e.recordedAtReal,
          corrects_event_id: e.correctsEventId,
          canonical_payload: e.canonicalPayload,
          payload_sha256: e.payloadHash,
          event_fingerprint: e.fingerprint,
        })),
      ),
      receipts: frames.map(({ receipt: r }) => ({
        schema_version: r.schemaVersion,
        world_id: r.worldId,
        command_id: r.commandId,
        idempotency_key: r.idempotencyKey,
        command_fingerprint: r.commandFingerprint,
        outcome: r.outcome,
        reason_code: r.reasonCode,
        transition_id: r.transitionId,
        world_version_before: r.worldVersionBefore,
        world_version_after: r.worldVersionAfter,
        sim_time: r.simTime.toCanonicalValue(),
        event_ids: r.eventIds,
        recorded_at_real: r.recordedAtReal,
      })),
      financial_batches: frames.flatMap((f) =>
        f.financialPostingBatches.map((v) => {
          const p = v as C.FinancialPostingBatch;
          return {
            causation_command_id: p.causationCommandId,
            canonical_payload: intent(p),
            fingerprint: p.fingerprint,
          };
        }),
      ),
      financial_batch_count: '3',
      inventory_postings: frames.flatMap((f) =>
        f.inventoryPostings.map((v) => {
          const p = v as C.InventoryPosting;
          return {
            causation_command_id: p.causationCommandId,
            canonical_payload: intent(p),
            fingerprint: p.fingerprint,
          };
        }),
      ),
      inventory_posting_count: '3',
    };
    const decode = (r: typeof raw) =>
      decodeBoundedPostwarCanonicalPrefix({
        worldId: f.f.seed.worldId,
        prefixRow: r,
        journal: decodeBoundedPostwarJournal(r),
      });
    const decoded = decode(raw);
    expect(decoded.frames).toHaveLength(5);
    expect(
      decoded.frames.reduce((n, f) => n + f.inventoryPostings.length, 0),
    ).toBe(3);
    expect(distSerialize(decoded.frames)).toBe(
      C.canonicalSerialize(
        frames.map(
          ({
            command,
            events,
            transition,
            receipt,
            inventoryPostings,
            financialPostingBatches,
          }) => ({
            command,
            events,
            transition,
            receipt,
            inventoryPostings,
            financialPostingBatches,
          }),
        ),
      ),
    );
    expect(() =>
      decode({ ...raw, inventory_postings: raw.inventory_postings.slice(1) }),
    ).toThrow('complete actual inventory set');
    expect(() =>
      decode({
        ...raw,
        inventory_postings: raw.inventory_postings.map((p, i) =>
          i === 0
            ? { ...p, fingerprint: `sha256:${'f'.repeat(64)}` as const }
            : p,
        ),
      }),
    ).toThrow('inventory hash');
    expect(() =>
      decode({
        ...raw,
        financial_batches: raw.financial_batches.slice(0, 2),
        financial_batch_count: '2',
      }),
    ).toThrow('one Goods delivery');
  });
});
