import { describe, expect, it } from 'vitest';

import {
  assertFoundationReplayEvidence,
  assessCustomsTariff,
  applyShipmentLogisticsOutcome,
  createFoundationFact,
  deriveTradeEligibilityRequestFromOrderBookFill,
  resolveTradeEligibility,
  type FoundationTraceRequest,
} from '../../packages/core/src/index.js';

const q = (amount: string, unit = 'tonne') => ({ amount, unit }) as const;
const money = (amount: string) => ({ amount, currency: 'GCU' }) as const;
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const TRACE: FoundationTraceRequest = {
  traceRef: 'TRACE.V21.2',
  calculationVersion: 'V21_FOUNDATION.1',
  snapshot: {
    lineageRef: 'LINEAGE.V21',
    sourceVersion: 'WORLD.V21',
    snapshotRef: 'SNAPSHOT.V21',
    snapshotHash: HASH_A,
    predecessorSnapshotHash: HASH_B,
  },
  snapshotAt: q('21000', 'sim_millisecond'),
};
function fact<T>(factRef: string, payload: T) {
  return createFoundationFact({
    trace: TRACE,
    factRef,
    sourceRef: `SOURCE.${factRef}`,
    predecessorFactRefs: ['GENESIS.V21'],
    payload,
  });
}
function request() {
  return fact('FACT.REQUEST.1', {
    requestRef: 'REQUEST.1',
    importerCountryRef: 'COUNTRY.A',
    exporterCountryRef: 'COUNTRY.B',
    commodityRef: 'COMMODITY.COPPER',
    direction: 'IMPORT' as const,
    requestedQuantity: q('5'),
    evaluatedAt: q('21000', 'sim_millisecond'),
  });
}
function general() {
  return fact('FACT.GENERAL.1', {
    policyRef: 'TARIFF.GENERAL.1',
    importerCountryRef: 'COUNTRY.A',
    exporterCountryRef: null,
    commodityRef: 'COMMODITY.COPPER',
    rate: { amount: '0.1', unit: 'ratio' as const },
    effectiveAt: q('1', 'sim_millisecond'),
    expiryAt: null,
  });
}

describe('V21.2 tariff, controls, and customs foundation', () => {
  it('bridges the explicit V21.1 BookFill contract without importing its module', () => {
    const fill = fact('FACT.ORDER_BOOK_FILL.1', {
      fillRef: 'FILL.1',
      buyerCountryRef: 'COUNTRY.A',
      sellerCountryRef: 'COUNTRY.B',
      commodityId: 'GRAIN',
      quantity: q('5'),
      matchedAt: q('20000', 'sim_millisecond'),
    });
    const bridge = deriveTradeEligibilityRequestFromOrderBookFill({
      trace: TRACE,
      orderBookFillFact: fill,
      requestRef: 'REQUEST.FROM.FILL.1',
      evaluatedAt: q('21000', 'sim_millisecond'),
      outputRef: 'OUTCOME.BRIDGE.1',
    });
    expect(bridge.request).toMatchObject({
      importerCountryRef: 'COUNTRY.A',
      exporterCountryRef: 'COUNTRY.B',
      commodityRef: 'GRAIN',
      direction: 'IMPORT',
      requestedQuantity: q('5'),
    });
    assertFoundationReplayEvidence(bridge.replayProof, [fill]);
  });

  it('resolves treaty/bilateral/general priority and concrete quotas/bans without reserving state', () => {
    const req = request();
    const controls = fact('FACT.CONTROLS.1', [
      {
        controlRef: 'QUOTA.1',
        kind: 'QUOTA' as const,
        direction: 'IMPORT' as const,
        enforcingCountryRef: 'COUNTRY.A',
        counterpartyCountryRef: 'COUNTRY.B',
        commodityRef: 'COMMODITY.COPPER',
        effectiveAt: q('1', 'sim_millisecond'),
        expiryAt: null,
        quantityLimit: q('10'),
        deliveredQuantity: q('3'),
        reservedQuantity: q('2'),
      },
    ]);
    const treaty = fact('FACT.TREATY.1', {
      policyRef: 'TARIFF.TREATY.1',
      importerCountryRef: 'COUNTRY.A',
      exporterCountryRef: 'COUNTRY.B',
      commodityRef: 'COMMODITY.COPPER',
      rate: { amount: '0.05', unit: 'ratio' as const },
      effectiveAt: q('1', 'sim_millisecond'),
      expiryAt: null,
    });
    const result = resolveTradeEligibility({
      trace: TRACE,
      requestFact: req,
      generalTariffFact: general(),
      bilateralTariffFact: null,
      treatyTariffFact: treaty,
      controlsFact: controls,
      outputRef: 'OUTCOME.ELIGIBILITY.1',
    });
    expect(result).toMatchObject({
      decision: 'ALLOWED',
      tariffSource: 'TREATY',
      effectiveTariffRate: { amount: '0.05', unit: 'ratio' },
      permittedQuantity: q('5'),
    });
    assertFoundationReplayEvidence(result.replayProof, [
      req,
      general(),
      controls,
      treaty,
    ]);
    const blocked = resolveTradeEligibility({
      trace: TRACE,
      requestFact: req,
      generalTariffFact: general(),
      bilateralTariffFact: null,
      treatyTariffFact: null,
      controlsFact: fact('FACT.BAN.1', [
        {
          controlRef: 'SANCTION.1',
          kind: 'SANCTION_BAN' as const,
          direction: 'IMPORT' as const,
          enforcingCountryRef: 'COUNTRY.A',
          counterpartyCountryRef: 'COUNTRY.B',
          commodityRef: 'COMMODITY.COPPER',
          effectiveAt: q('1', 'sim_millisecond'),
          expiryAt: null,
          quantityLimit: null,
          deliveredQuantity: null,
          reservedQuantity: null,
        },
      ]),
      outputRef: 'OUTCOME.ELIGIBILITY.2',
    });
    expect(blocked).toMatchObject({
      decision: 'BLOCKED',
      blockReason: 'BAN_OR_SANCTION',
      effectiveTariffRate: null,
      permittedQuantity: q('0'),
    });
  });

  it('computes tariff once from the resolved rate and refuses a repeated assessment ref', () => {
    const eligibility = resolveTradeEligibility({
      trace: TRACE,
      requestFact: request(),
      generalTariffFact: general(),
      bilateralTariffFact: null,
      treatyTariffFact: null,
      controlsFact: fact('FACT.CONTROLS.EMPTY', []),
      outputRef: 'OUTCOME.ELIGIBILITY.CUSTOMS',
    });
    const assessment = assessCustomsTariff({
      trace: TRACE,
      eligibilityFact: fact('FACT.ELIGIBILITY.1', eligibility),
      collectionWitnessFact: fact('FACT.COLLECTION.WITNESS.1', {
        witnessRef: 'WITNESS.1',
        previouslyAssessedRefs: [],
      }),
      declarationFact: fact('FACT.DECLARATION.1', {
        declarationRef: 'DECLARATION.1',
        contractRef: 'CONTRACT.1',
        shipmentRef: 'SHIPMENT.1',
        importerCountryRef: 'COUNTRY.A',
        exporterCountryRef: 'COUNTRY.B',
        commodityRef: 'COMMODITY.COPPER',
        customsValue: money('100'),
        transportCost: money('5'),
        insuranceCost: money('1'),
        borderFees: money('0'),
        declaredAt: q('21000', 'sim_millisecond'),
      }),
      assessmentRef: 'ASSESSMENT.1',
    });
    expect(assessment).toMatchObject({
      tariffDue: money('10'),
      landedCost: money('116'),
      collectionEligible: true,
    });
    expect(() =>
      assessCustomsTariff({
        trace: TRACE,
        eligibilityFact: fact('FACT.ELIGIBILITY.2', eligibility),
        collectionWitnessFact: fact('FACT.COLLECTION.WITNESS.2', {
          witnessRef: 'WITNESS.2',
          previouslyAssessedRefs: ['ASSESSMENT.1'],
        }),
        declarationFact: fact('FACT.DECLARATION.2', {
          declarationRef: 'DECLARATION.2',
          contractRef: 'CONTRACT.1',
          shipmentRef: 'SHIPMENT.1',
          importerCountryRef: 'COUNTRY.A',
          exporterCountryRef: 'COUNTRY.B',
          commodityRef: 'COMMODITY.COPPER',
          customsValue: money('100'),
          transportCost: money('0'),
          insuranceCost: money('0'),
          borderFees: money('0'),
          declaredAt: q('21000', 'sim_millisecond'),
        }),
        assessmentRef: 'ASSESSMENT.1',
      }),
    ).toThrow('already been collected');
  });
});

describe('V21.3 logistics capacity and replay foundation', () => {
  it('keeps goods unavailable in transit and caps partial delivery/loss by port, rail, and storage', () => {
    const shipment = fact('FACT.SHIPMENT.1', {
      shipmentRef: 'SHIPMENT.1',
      contractRef: 'CONTRACT.1',
      commodityRef: 'COMMODITY.COPPER',
      totalQuantity: q('10'),
      inTransitQuantity: q('10'),
      deliveredQuantity: q('0'),
      lostQuantity: q('0'),
      status: 'IN_TRANSIT' as const,
      dispatchedAt: q('10', 'sim_millisecond'),
      expiryAt: q('200', 'sim_millisecond'),
    });
    const capacity = fact('FACT.CAPACITY.1', {
      capacityRef: 'CAPACITY.1',
      portRemaining: q('7'),
      railRemaining: q('7'),
      storageRemaining: q('7'),
      measuredAt: q('100', 'sim_millisecond'),
    });
    const outcome = fact('FACT.OUTCOME.1', {
      reportRef: 'REPORT.1',
      shipmentRef: 'SHIPMENT.1',
      deliveredQuantity: q('5'),
      lostQuantity: q('2'),
      reportedAt: q('100', 'sim_millisecond'),
    });
    const result = applyShipmentLogisticsOutcome({
      trace: TRACE,
      shipmentFact: shipment,
      capacityFact: capacity,
      outcomeFact: outcome,
      outputRef: 'OUTCOME.SHIPMENT.1',
    });
    expect(result).toMatchObject({
      shipment: {
        inTransitQuantity: q('3'),
        deliveredQuantity: q('5'),
        lostQuantity: q('2'),
        status: 'IN_TRANSIT',
      },
      destinationAvailableIncrease: q('5'),
      portConsumed: q('7'),
    });
    assertFoundationReplayEvidence(result.replayProof, [
      shipment,
      capacity,
      outcome,
    ]);
    expect(() =>
      assertFoundationReplayEvidence(result.replayProof, [
        shipment,
        capacity,
        {
          ...outcome,
          payload: { ...outcome.payload, deliveredQuantity: q('6') },
        },
      ]),
    ).toThrow('canonical payload evidence');
    expect(() =>
      applyShipmentLogisticsOutcome({
        trace: TRACE,
        shipmentFact: shipment,
        capacityFact: fact('FACT.CAPACITY.2', {
          capacityRef: 'CAPACITY.2',
          portRemaining: q('6'),
          railRemaining: q('7'),
          storageRemaining: q('7'),
          measuredAt: q('100', 'sim_millisecond'),
        }),
        outcomeFact: outcome,
        outputRef: 'OUTCOME.SHIPMENT.2',
      }),
    ).toThrow('cannot bypass port rail or storage capacity');
  });
});
