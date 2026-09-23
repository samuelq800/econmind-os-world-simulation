import { describe, expect, it } from 'vitest';

import {
  createFoundationFact,
  type FoundationFact,
} from '../../packages/core/src/engine-kernels/foundation-provenance.js';
import {
  NationalAccountsReconciliationError,
  assertProductionGdpReplay,
  compareExpenditureGdp,
  prepareProductionGdp,
  type ExpenditureStatement,
  type NationalAccountsBasis,
  type NationalAccountsProductionInput,
  type PeriodCompletenessStatement,
  type ProductFiscalStatement,
  type SectorProductionStatement,
} from '../../packages/core/src/engine-kernels/national-accounts-production-foundation.js';

const trace = {
  traceRef: 'TRACE.V23.1',
  calculationVersion: 'GDP.PRODUCTION.1',
  snapshot: {
    lineageRef: 'LINEAGE.WORLD.23',
    sourceVersion: 'WORLD_VERSION.23',
    snapshotRef: 'SNAPSHOT.WORLD.23',
    snapshotHash: 'a'.repeat(64),
    predecessorSnapshotHash: 'b'.repeat(64),
  },
  snapshotAt: { amount: '1000', unit: 'sim_millisecond' },
} as const;
const amount = (value: string, currency = 'GCU') => ({
  amount: value,
  currency,
});
const basis: NationalAccountsBasis = {
  countryRef: 'COUNTRY.A',
  periodRef: 'PERIOD.1',
  startInclusive: { amount: '0', unit: 'sim_millisecond' },
  endExclusive: { amount: '1000', unit: 'sim_millisecond' },
  currency: 'GCU',
  accountingVersionRef: 'ACCOUNTING.1',
};

function fact<T>(factRef: string, payload: T): FoundationFact<T> {
  return createFoundationFact({
    trace,
    factRef,
    sourceRef: `SOURCE.${factRef}`,
    predecessorFactRefs: ['GENESIS.WORLD.23'],
    payload,
  });
}

function refact<T>(prior: FoundationFact<T>, payload: T): FoundationFact<T> {
  return createFoundationFact({
    trace,
    factRef: prior.factRef,
    sourceRef: prior.sourceRef,
    predecessorFactRefs: prior.predecessorFactRefs,
    payload,
  });
}

const sectorA: SectorProductionStatement = {
  kind: 'SETTLED_REAL_PRODUCTION',
  basis,
  sectorRef: 'SECTOR.A',
  grossOutputValue: amount('120.25'),
  intermediateConsumptionValue: amount('40.25'),
  grossOutputReceiptRef: 'RECEIPT.A.OUTPUT',
  intermediateConsumptionReceiptRef: 'RECEIPT.A.INPUT',
};
const sectorB: SectorProductionStatement = {
  kind: 'SETTLED_REAL_PRODUCTION',
  basis,
  sectorRef: 'SECTOR.B',
  grossOutputValue: amount('80.1'),
  intermediateConsumptionValue: amount('20.1'),
  grossOutputReceiptRef: 'RECEIPT.B.OUTPUT',
  intermediateConsumptionReceiptRef: 'RECEIPT.A.OUTPUT',
};
const tax: ProductFiscalStatement = {
  kind: 'SETTLED_PRODUCT_TAX',
  basis,
  amount: amount('10.5'),
  receiptRef: 'RECEIPT.TAX.1',
};
const subsidy: ProductFiscalStatement = {
  kind: 'SETTLED_PRODUCT_SUBSIDY',
  basis,
  amount: amount('5.5'),
  receiptRef: 'RECEIPT.SUBSIDY.1',
};

function production(): NationalAccountsProductionInput {
  const sectorFacts = [
    fact('FACT.SECTOR.A', sectorA),
    fact('FACT.SECTOR.B', sectorB),
  ];
  const productTaxFacts = [fact('FACT.TAX.1', tax)];
  const productSubsidyFacts = [fact('FACT.SUBSIDY.1', subsidy)];
  const closure: PeriodCompletenessStatement = {
    kind: 'PERIOD_SOURCES_COMPLETE',
    basis,
    closureReceiptRef: 'RECEIPT.CLOSURE.1',
    sectorFactRefs: sectorFacts.map((item) => item.factRef),
    productTaxFactRefs: productTaxFacts.map((item) => item.factRef),
    productSubsidyFactRefs: productSubsidyFacts.map((item) => item.factRef),
  };
  return {
    trace,
    completenessFact: createFoundationFact({
      trace,
      factRef: 'FACT.CLOSURE.1',
      sourceRef: 'SOURCE.FACT.CLOSURE.1',
      predecessorFactRefs: [
        ...closure.sectorFactRefs,
        ...closure.productTaxFactRefs,
        ...closure.productSubsidyFactRefs,
      ],
      payload: closure,
    }),
    sectorFacts,
    productTaxFacts,
    productSubsidyFacts,
  };
}

function expenditure(): FoundationFact<ExpenditureStatement> {
  return fact('FACT.EXPENDITURE.1', {
    kind: 'SETTLED_EXPENDITURE_RECONCILIATION',
    basis,
    components: [
      {
        category: 'C',
        amount: amount('100'),
        receiptRef: 'RECEIPT.C',
        realization: 'FINAL_USE_SETTLED',
      },
      {
        category: 'I',
        amount: amount('25'),
        receiptRef: 'RECEIPT.I',
        realization: 'FINAL_USE_SETTLED',
      },
      {
        category: 'G',
        amount: amount('10'),
        receiptRef: 'RECEIPT.G',
        realization: 'FINAL_USE_SETTLED',
      },
      {
        category: 'X',
        amount: amount('30'),
        receiptRef: 'RECEIPT.A.OUTPUT',
        realization: 'DELIVERED_OWNERSHIP_TRANSFER',
      },
      {
        category: 'M',
        amount: amount('20'),
        receiptRef: 'RECEIPT.M',
        realization: 'DELIVERED_OWNERSHIP_TRANSFER',
      },
    ],
  });
}

describe('V23.1 production GDP pure Core preparation', () => {
  it('computes exact sector value added plus taxes minus subsidies from period-bound facts', () => {
    const input = production();
    const result = prepareProductionGdp(input);
    expect(result.status).toBe('PREPARATION_ONLY');
    expect(result.sectorValueAdded.map((row) => row.valueAdded)).toEqual([
      amount('80'),
      amount('60'),
    ]);
    expect(result.totalSectorValueAdded).toEqual(amount('140'));
    expect(result.totalProductTaxes).toEqual(amount('10.5'));
    expect(result.totalProductSubsidies).toEqual(amount('5.5'));
    expect(result.productionGdp).toEqual(amount('145'));
    expect(result.sectorValueAdded[0]).toMatchObject({
      sourceFactRef: 'FACT.SECTOR.A',
      grossOutputReceiptRef: 'RECEIPT.A.OUTPUT',
      intermediateConsumptionReceiptRef: 'RECEIPT.A.INPUT',
    });
    assertProductionGdpReplay(input, result.proof);
    expect(
      prepareProductionGdp({
        ...input,
        sectorFacts: [...input.sectorFacts].reverse(),
      }),
    ).toEqual(result);
  });

  it('compares all five expenditure components without making a second GDP value', () => {
    const result = compareExpenditureGdp({
      ...production(),
      expenditureFact: expenditure(),
    });
    expect(result.status).toBe('RECONCILED');
    expect(result.productionGdp).toEqual(amount('145'));
    expect(result.expenditureGdp).toEqual(amount('145'));
    expect(result.difference).toEqual(amount('0'));
    expect(result.componentReceipts[3]).toBe('RECEIPT.A.OUTPUT');
  });

  it('reports exact mismatch with both values and no averaging or overwrite', () => {
    const original = expenditure();
    const components = original.payload.components.map((item) =>
      item.category === 'C' ? { ...item, amount: amount('101') } : item,
    );
    const changed = refact(original, { ...original.payload, components });
    try {
      compareExpenditureGdp({ ...production(), expenditureFact: changed });
      throw new Error('Expected mismatch');
    } catch (error) {
      expect(error).toBeInstanceOf(NationalAccountsReconciliationError);
      const mismatch = error as NationalAccountsReconciliationError;
      expect(mismatch.productionGdp).toEqual(amount('145'));
      expect(mismatch.expenditureGdp).toEqual(amount('146'));
      expect(mismatch.difference).toEqual(amount('-1'));
    }
  });

  it('rejects missing source sets and duplicate sector contribution receipts', () => {
    const input = production();
    expect(() =>
      prepareProductionGdp({
        ...input,
        sectorFacts: input.sectorFacts.slice(0, 1),
      }),
    ).toThrow();
    const duplicate = refact(input.sectorFacts[1]!, {
      ...sectorB,
      grossOutputReceiptRef: sectorA.grossOutputReceiptRef,
    });
    expect(() =>
      prepareProductionGdp({
        ...input,
        sectorFacts: [input.sectorFacts[0]!, duplicate],
      }),
    ).toThrow();
    expect(() =>
      prepareProductionGdp({ ...input, productTaxFacts: [] }),
    ).toThrow();
  });

  it('rejects transfers, approvals and commissioning as production sources', () => {
    const input = production();
    for (const kind of ['TRANSFER', 'PROJECT_APPROVAL', 'PROJECT_COMMISSION']) {
      const changed = refact(input.sectorFacts[0]!, {
        ...sectorA,
        kind,
      } as unknown as SectorProductionStatement);
      expect(() =>
        prepareProductionGdp({
          ...input,
          sectorFacts: [changed, input.sectorFacts[1]!],
        }),
      ).toThrow();
    }
  });

  it('rejects mixed period, currency, accounting version and non-canonical amounts', () => {
    const input = production();
    for (const changedBasis of [
      { ...basis, periodRef: 'PERIOD.OTHER' },
      { ...basis, currency: 'USD' },
      { ...basis, accountingVersionRef: 'ACCOUNTING.OLD' },
    ]) {
      const changed = refact(input.sectorFacts[0]!, {
        ...sectorA,
        basis: changedBasis,
      });
      expect(() =>
        prepareProductionGdp({
          ...input,
          sectorFacts: [changed, input.sectorFacts[1]!],
        }),
      ).toThrow();
    }
    const changed = refact(input.sectorFacts[0]!, {
      ...sectorA,
      grossOutputValue: amount('01'),
    });
    expect(() =>
      prepareProductionGdp({
        ...input,
        sectorFacts: [changed, input.sectorFacts[1]!],
      }),
    ).toThrow();
    const futureClosure = refact(input.completenessFact, {
      ...input.completenessFact.payload,
      basis: {
        ...basis,
        endExclusive: { amount: '1001', unit: 'sim_millisecond' },
      },
    });
    expect(() =>
      prepareProductionGdp({ ...input, completenessFact: futureClosure }),
    ).toThrow();
  });

  it('rejects missing, repeated, negative and pre-delivery expenditure inputs', () => {
    const original = expenditure();
    const base = production();
    for (const components of [
      original.payload.components.slice(0, 4),
      [
        ...original.payload.components.slice(0, 4),
        original.payload.components[0]!,
      ],
      original.payload.components.map((item) =>
        item.category === 'M' ? { ...item, amount: amount('-1') } : item,
      ),
      original.payload.components.map((item) =>
        item.category === 'X'
          ? { ...item, realization: 'FINAL_USE_SETTLED' as const }
          : item,
      ),
    ]) {
      expect(() =>
        compareExpenditureGdp({
          ...base,
          expenditureFact: refact(original, {
            ...original.payload,
            components,
          }),
        }),
      ).toThrow();
    }
  });

  it('rejects forged payload, mixed snapshot and proof rewrite', () => {
    const input = production();
    const result = prepareProductionGdp(input);
    const forged = {
      ...input.sectorFacts[0]!,
      payload: { ...sectorA, grossOutputValue: amount('999') },
    };
    expect(() =>
      prepareProductionGdp({
        ...input,
        sectorFacts: [forged, input.sectorFacts[1]!],
      }),
    ).toThrow();
    const mixed = {
      ...input.sectorFacts[0]!,
      snapshot: { ...trace.snapshot, snapshotHash: 'c'.repeat(64) },
    };
    expect(() =>
      prepareProductionGdp({
        ...input,
        sectorFacts: [mixed, input.sectorFacts[1]!],
      }),
    ).toThrow();
    expect(() =>
      assertProductionGdpReplay(input, {
        ...result.proof,
        canonicalOutput: 'forged',
      }),
    ).toThrow();
  });
});
