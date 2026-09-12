import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  INVENTORY_AUTHORITATIVE_WRITER,
  INVENTORY_POSTING_SCHEMA_VERSION,
  Quantity,
  SimTime,
  commandId,
  commodityId,
  countryId,
  createDeliveryPosting,
  createInventoryAccount,
  createInventoryPosting,
  createReleasePosting,
  createReservationPosting,
  createShipmentPosting,
  economicRecognitionId,
  eventId,
  inventoryBatchId,
  inventoryLocationId,
  inventoryPostingId,
  inventoryReservationId,
  inventoryShipmentId,
  legalEntityId,
  worldId,
  type InventoryAccount,
  type InventoryLedgerState,
  type InventoryMovementInput,
} from '../../packages/core/src/index.js';
import { applyInventoryPosting } from '../../packages/core/src/inventory/inventory-ledger.js';
import {
  openingLedgers,
  testAuthoritativeTransition,
} from '../helpers/v08-ledgers.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');

const WORLD = worldId('WORLD_1');
const SELLER_COUNTRY = countryId('COUNTRY_SELLER');
const BUYER_COUNTRY = countryId('COUNTRY_BUYER');
const COMMODITY = commodityId('WHEAT');
const BATCH = inventoryBatchId('BATCH_1');
const OWNER = legalEntityId('ENTITY_SELLER');
const BUYER = legalEntityId('ENTITY_BUYER');
const ORIGIN = inventoryLocationId('WAREHOUSE_ORIGIN');
const TRANSIT = inventoryLocationId('TRANSIT_ROUTE_1');
const DESTINATION = inventoryLocationId('WAREHOUSE_DESTINATION');
const RESERVATION = inventoryReservationId('RESERVATION_1');
const SHIPMENT = inventoryShipmentId('SHIPMENT_1');

function account(
  bucket: InventoryAccount['bucket'],
  overrides: Partial<InventoryAccount> = {},
) {
  return createInventoryAccount({
    worldId: WORLD,
    countryId: SELLER_COUNTRY,
    commodityId: COMMODITY,
    batchId: BATCH,
    unit: 'kg',
    physicalLocationId: ORIGIN,
    bucket,
    reservationId: bucket === 'RESERVED' ? RESERVATION : null,
    shipmentId: bucket === 'IN_TRANSIT' ? SHIPMENT : null,
    titleHolderId: OWNER,
    riskBearerId: OWNER,
    economicRecognitionId: null,
    ...overrides,
  });
}

const available = account('AVAILABLE');
const reserved = account('RESERVED');
const inTransit = account('IN_TRANSIT', { physicalLocationId: TRANSIT });
const delivered = account('AVAILABLE', {
  countryId: BUYER_COUNTRY,
  physicalLocationId: DESTINATION,
  titleHolderId: BUYER,
  riskBearerId: BUYER,
  economicRecognitionId: economicRecognitionId('TRADE_RECOGNITION_1'),
});

function state(quantity = '100'): Readonly<InventoryLedgerState> {
  return openingLedgers({
    worldId: WORLD,
    sha256Hex: sha256,
    inventory: { account: available, quantity: Quantity.from(quantity, 'kg') },
  }).inventory;
}

function movement(
  postingNumber: number,
  versionBefore: number,
  quantity: string,
  source: InventoryAccount,
  destination: InventoryAccount,
  commandPayloadVariant = 'a',
): InventoryMovementInput {
  const causationCommandId = commandId(`COMMAND_${postingNumber}`);
  const causationEventIds = [eventId(`EVENT_${postingNumber}`)];
  const simTime = SimTime.fromTicks(String(postingNumber * 10_000));
  const evidence = testAuthoritativeTransition({
    worldId: WORLD,
    commandId: causationCommandId,
    eventIds: causationEventIds,
    worldVersionBefore: String(versionBefore),
    worldVersionAfter: String(versionBefore + 1),
    simTime,
    sha256Hex: sha256,
    firstEventSequence: String(postingNumber),
    commandPayload: { commandPayloadVariant },
  });
  return {
    schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
    postingId: inventoryPostingId(`POSTING_${postingNumber}`),
    worldId: WORLD,
    causationCommandId,
    causationEventIds,
    worldVersionBefore: String(versionBefore),
    worldVersionAfter: String(versionBefore + 1),
    simTime,
    command: evidence.command,
    transition: evidence.transition,
    quantity: Quantity.from(quantity, 'kg'),
    source,
    destination,
  };
}

function quantityAt(
  ledger: InventoryLedgerState,
  target: InventoryAccount,
): string {
  return (
    ledger.balances
      .find(
        (balance) => JSON.stringify(balance.account) === JSON.stringify(target),
      )
      ?.quantity.toCanonicalValue().amount ?? '0'
  );
}

describe('V08.1 authoritative inventory posting ledger', () => {
  it('owns authoritative inventory mutation through one posting boundary', () => {
    expect(INVENTORY_AUTHORITATIVE_WRITER).toBe('WORLD_INVENTORY_POSTING');
    const posting = createReservationPosting(
      movement(1, 0, '40', available, reserved),
      sha256,
    );
    const result = applyInventoryPosting(state(), posting);

    expect(result.receipt).toMatchObject({
      outcome: 'APPLIED',
      causationCommandId: commandId('COMMAND_1'),
      causationEventIds: [eventId('EVENT_1')],
      worldVersionBefore: '0',
      worldVersionAfter: '1',
    });
    expect(quantityAt(result.state, available)).toBe('60');
    expect(quantityAt(result.state, reserved)).toBe('40');
  });

  it('executes reserve, release, shipment and delivery with exact batch conservation', () => {
    let ledger = state();
    ledger = applyInventoryPosting(
      ledger,
      createReservationPosting(
        movement(1, 0, '40.125', available, reserved),
        sha256,
      ),
    ).state;
    ledger = applyInventoryPosting(
      ledger,
      createReleasePosting(
        movement(2, 1, '10.005', reserved, available),
        sha256,
      ),
    ).state;
    ledger = applyInventoryPosting(
      ledger,
      createShipmentPosting(
        movement(3, 2, '30.12', reserved, inTransit),
        sha256,
      ),
    ).state;
    ledger = applyInventoryPosting(
      ledger,
      createDeliveryPosting(
        movement(4, 3, '30.12', inTransit, delivered),
        sha256,
      ),
    ).state;

    expect(quantityAt(ledger, available)).toBe('69.88');
    expect(quantityAt(ledger, reserved)).toBe('0');
    expect(quantityAt(ledger, inTransit)).toBe('0');
    expect(quantityAt(ledger, delivered)).toBe('30.12');
    const total = ledger.balances.reduce(
      (sum, balance) => sum.add(balance.quantity),
      Quantity.from('0', 'kg'),
    );
    expect(total.toCanonicalValue().amount).toBe('100');
  });

  it.each([
    [
      'reserve',
      () =>
        createReservationPosting(
          movement(1, 0, '101', available, reserved),
          sha256,
        ),
    ],
    [
      'shipment',
      () =>
        createShipmentPosting(movement(1, 0, '1', reserved, inTransit), sha256),
    ],
    [
      'delivery',
      () =>
        createDeliveryPosting(
          movement(1, 0, '1', inTransit, delivered),
          sha256,
        ),
    ],
  ])(
    'rejects over-%s without changing the input state',
    (_label, buildPosting) => {
      const original = state();
      expect(() =>
        applyInventoryPosting(original, buildPosting()),
      ).toThrowError(
        expect.objectContaining({
          code: DOMAIN_ERROR_CODES.INVENTORY_NEGATIVE_STOCK,
        }),
      );
      expect(quantityAt(original, available)).toBe('100');
      expect(original.worldVersion).toBe('0');
    },
  );

  it('rejects non-conserving and unit-inconsistent posting intent', () => {
    const badCommandId = commandId('COMMAND_BAD');
    const badEventIds = [eventId('EVENT_BAD')];
    const badSimTime = SimTime.fromTicks('0');
    const badEvidence = testAuthoritativeTransition({
      worldId: WORLD,
      commandId: badCommandId,
      eventIds: badEventIds,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: badSimTime,
      sha256Hex: sha256,
    });
    expect(() =>
      createInventoryPosting(
        {
          schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
          postingId: inventoryPostingId('POSTING_BAD'),
          worldId: WORLD,
          causationCommandId: badCommandId,
          causationEventIds: badEventIds,
          worldVersionBefore: '0',
          worldVersionAfter: '1',
          simTime: badSimTime,
          command: badEvidence.command,
          transition: badEvidence.transition,
          operation: 'RESERVE',
          entries: [
            { account: available, delta: Quantity.from('-10', 'kg') },
            { account: reserved, delta: Quantity.from('9.999', 'kg') },
          ],
        },
        sha256,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVENTORY_CONSERVATION_VIOLATION,
      }),
    );
    expect(() =>
      createReservationPosting(
        {
          ...movement(1, 0, '1', available, reserved),
          quantity: Quantity.from('1', 'tonne'),
        },
        sha256,
      ),
    ).toThrow();
  });

  it('prevents reserve, release and shipment from changing ownership semantics', () => {
    const retitledReservation = account('RESERVED', {
      titleHolderId: BUYER,
    });
    expect(() =>
      createReservationPosting(
        movement(1, 0, '1', available, retitledReservation),
        sha256,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVENTORY_INPUT_INVALID,
      }),
    );
  });

  it('rejects forged state or posting objects at the authoritative writer', () => {
    const posting = createReservationPosting(
      movement(1, 0, '1', available, reserved),
      sha256,
    );
    expect(() => applyInventoryPosting({ ...state() }, posting)).toThrowError(
      expect.objectContaining({ code: 'VERSION_MISMATCH' }),
    );
    expect(() => applyInventoryPosting(state(), { ...posting })).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVENTORY_INPUT_INVALID,
      }),
    );
  });

  it('returns the same result for an exact duplicate and rejects identity conflicts', () => {
    const original = state();
    const posting = createReservationPosting(
      movement(1, 0, '25', available, reserved),
      sha256,
    );
    const first = applyInventoryPosting(original, posting);
    const duplicate = applyInventoryPosting(first.state, posting);
    expect(duplicate.state).toBe(first.state);
    expect(duplicate.receipt.outcome).toBe('EXACT_DUPLICATE');

    const conflict = createReservationPosting(
      movement(1, 0, '24', available, reserved),
      sha256,
    );
    expect(() => applyInventoryPosting(first.state, conflict)).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVENTORY_POSTING_CONFLICT,
      }),
    );

    const transitionConflict = createReservationPosting(
      movement(1, 0, '25', available, reserved, 'b'),
      sha256,
    );
    expect(() =>
      applyInventoryPosting(first.state, transitionConflict),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.INVENTORY_POSTING_CONFLICT,
      }),
    );
  });

  it('canonicalizes entry order to one deterministic posting fingerprint', () => {
    const movementInput = movement(1, 0, '12.345', available, reserved);
    const base = createReservationPosting(movementInput, sha256);
    const reversed = createInventoryPosting(
      {
        ...base,
        command: movementInput.command,
        transition: movementInput.transition,
        entries: [...base.entries].reverse(),
      },
      sha256,
    );
    expect(reversed.fingerprint).toBe(base.fingerprint);
    expect(reversed.entries).toEqual(base.entries);
  });

  it('keeps title, risk and economic recognition explicit at delivery', () => {
    const posting = createDeliveryPosting(
      movement(1, 0, '5', inTransit, delivered),
      sha256,
    );
    const destinationEntry = posting.entries.find((entry) =>
      entry.delta.amount.isPositive(),
    );
    expect(destinationEntry?.account).toMatchObject({
      physicalLocationId: DESTINATION,
      countryId: BUYER_COUNTRY,
      titleHolderId: BUYER,
      riskBearerId: BUYER,
      economicRecognitionId: economicRecognitionId('TRADE_RECOGNITION_1'),
    });
  });
});
