import { describe, expect, it } from 'vitest';

import {
  TRADE_CONTRACT_READ_PROJECTION_STATUS,
  buildTradeContractReadProjection,
  queryTradeContractReadProjection,
  type FinalCommittedReceiptEvidence,
  type TradeContractLedgerChangeFact,
} from '../../apps/world-api/src/index.js';

const receipt = (): FinalCommittedReceiptEvidence => ({
  receiptRef: 'RECEIPT.WORLD.1.41',
  commandRef: 'COMMAND.TRADE.41',
  worldRef: 'WORLD.1',
  outcome: 'COMMITTED',
  worldVersionBefore: '40',
  worldVersionAfter: '41',
  orderedEventRefs: ['EVENT.TRADE.DELIVERED.41', 'EVENT.CONTRACT.SETTLED.41'],
});

const changes = (): readonly TradeContractLedgerChangeFact[] => [
  {
    changeRef: 'CHANGE.TRADE.TRANSIT.41',
    domain: 'V21_TRADE_LOGISTICS',
    worldRef: 'WORLD.1',
    receiptRef: 'RECEIPT.WORLD.1.41',
    eventRef: 'EVENT.TRADE.DELIVERED.41',
    ledgerPostingRef: 'POSTING.INVENTORY.41',
    sourceFactRef: 'FACT.SHIPMENT.OUTCOME.41',
    subjectRef: 'SHIPMENT.COPPER.41',
    metricRef: 'METRIC.IN_TRANSIT_QUANTITY',
    numericChange: {
      kind: 'QUANTITY',
      before: { amount: '12.5', unit: 'tonne' },
      delta: { amount: '-2.5', unit: 'tonne' },
      after: { amount: '10', unit: 'tonne' },
    },
  },
  {
    changeRef: 'CHANGE.CONTRACT.CASH.41',
    domain: 'V22_CONTRACT_RESULT',
    worldRef: 'WORLD.1',
    receiptRef: 'RECEIPT.WORLD.1.41',
    eventRef: 'EVENT.CONTRACT.SETTLED.41',
    ledgerPostingRef: 'POSTING.FINANCIAL.41',
    sourceFactRef: 'FACT.CONTRACT.SETTLEMENT.41',
    subjectRef: 'CONTRACT.COPPER.41',
    metricRef: 'METRIC.SETTLEMENT_CASH',
    numericChange: {
      kind: 'MONEY',
      before: { amount: '100.25', currency: 'GCU' },
      delta: { amount: '-25.25', currency: 'GCU' },
      after: { amount: '75', currency: 'GCU' },
    },
  },
];

describe('V21.3/V22 trade-contract read-projection preparation', () => {
  it('fails closed with no numeric rows while final receipt or ledger evidence is unavailable', () => {
    const missingReceipt = buildTradeContractReadProjection({
      finalReceipt: null,
      ledgerChanges: changes(),
    });
    const missingLedger = buildTradeContractReadProjection({
      finalReceipt: receipt(),
      ledgerChanges: [],
    });

    expect(missingReceipt).toEqual({
      status: TRADE_CONTRACT_READ_PROJECTION_STATUS,
      kind: 'EVIDENCE_UNAVAILABLE',
      reason: 'MISSING_FINAL_RECEIPT',
      watermark: null,
      rows: [],
    });
    expect(missingLedger).toMatchObject({
      status: TRADE_CONTRACT_READ_PROJECTION_STATUS,
      kind: 'EVIDENCE_UNAVAILABLE',
      reason: 'MISSING_LEDGER_FACTS',
      rows: [],
    });
    expect(
      queryTradeContractReadProjection(missingReceipt, { worldRef: 'WORLD.1' }),
    ).toEqual([]);
  });

  it('preserves exact V21 logistics and V22 contract values with fact, event, receipt and posting provenance', () => {
    const projection = buildTradeContractReadProjection({
      finalReceipt: receipt(),
      ledgerChanges: changes(),
    });

    expect(projection).toMatchObject({
      status: 'PREPARATION_ONLY',
      kind: 'EVIDENCE_BACKED',
      watermark: {
        worldRef: 'WORLD.1',
        receiptRef: 'RECEIPT.WORLD.1.41',
        worldVersionBefore: '40',
        worldVersionAfter: '41',
      },
    });
    if (projection.kind !== 'EVIDENCE_BACKED')
      throw new Error('expected evidence');
    expect(projection.rows).toEqual([
      expect.objectContaining({
        domain: 'V21_TRADE_LOGISTICS',
        sourceFactRef: 'FACT.SHIPMENT.OUTCOME.41',
        eventRef: 'EVENT.TRADE.DELIVERED.41',
        receiptRef: 'RECEIPT.WORLD.1.41',
        ledgerPostingRef: 'POSTING.INVENTORY.41',
        numericChange: expect.objectContaining({
          before: { amount: '12.5', unit: 'tonne' },
          delta: { amount: '-2.5', unit: 'tonne' },
          after: { amount: '10', unit: 'tonne' },
        }),
      }),
      expect.objectContaining({
        domain: 'V22_CONTRACT_RESULT',
        sourceFactRef: 'FACT.CONTRACT.SETTLEMENT.41',
        eventRef: 'EVENT.CONTRACT.SETTLED.41',
        receiptRef: 'RECEIPT.WORLD.1.41',
        ledgerPostingRef: 'POSTING.FINANCIAL.41',
        numericChange: expect.objectContaining({
          before: { amount: '100.25', currency: 'GCU' },
          delta: { amount: '-25.25', currency: 'GCU' },
          after: { amount: '75', currency: 'GCU' },
        }),
      }),
    ]);
  });

  it('makes the derived rows queryable without broadening their receipt or World scope', () => {
    const projection = buildTradeContractReadProjection({
      finalReceipt: receipt(),
      ledgerChanges: changes(),
    });

    expect(
      queryTradeContractReadProjection(projection, {
        worldRef: 'WORLD.1',
        receiptRef: 'RECEIPT.WORLD.1.41',
        domain: 'V22_CONTRACT_RESULT',
        subjectRef: 'CONTRACT.COPPER.41',
      }),
    ).toHaveLength(1);
    expect(
      queryTradeContractReadProjection(projection, { worldRef: 'WORLD.OTHER' }),
    ).toEqual([]);
    expect(
      queryTradeContractReadProjection(projection, {
        worldRef: 'WORLD.1',
        receiptRef: 'RECEIPT.WORLD.1.42',
      }),
    ).toEqual([]);
  });

  it('rejects evidence that is not bound to the final receipt or exact ledger arithmetic', () => {
    expect(() =>
      buildTradeContractReadProjection({
        finalReceipt: { ...receipt(), outcome: 'REJECTED' as 'COMMITTED' },
        ledgerChanges: changes(),
      }),
    ).toThrow('only a COMMITTED final receipt');
    expect(() =>
      buildTradeContractReadProjection({
        finalReceipt: receipt(),
        ledgerChanges: [{ ...changes()[0]!, receiptRef: 'RECEIPT.OTHER.41' }],
      }),
    ).toThrow('ledger change receipt must match');
    expect(() =>
      buildTradeContractReadProjection({
        finalReceipt: receipt(),
        ledgerChanges: [
          {
            ...changes()[1]!,
            numericChange: {
              kind: 'MONEY',
              before: { amount: '100.25', currency: 'GCU' },
              delta: { amount: '-25.25', currency: 'GCU' },
              after: { amount: '74', currency: 'GCU' },
            },
          },
        ],
      }),
    ).toThrow('must satisfy exact before + delta = after');
  });
});
