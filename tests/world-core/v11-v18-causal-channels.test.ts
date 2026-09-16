import { describe, expect, it } from 'vitest';

import {
  CAUSAL_CHAINS,
  assertCausalCatalogueIntegrity,
  calculateExactCausalStateAfterEffects,
  getCausalChain,
  partitionCausalSignals,
  scheduleExactCausalTransmission,
  scheduleCausalSignal,
} from '../../packages/core/src/index.js';

describe('V11–V18 causal-channel preparation', () => {
  it('records every requested pathway with no implicit economic parameter', () => {
    expect(() => assertCausalCatalogueIntegrity()).not.toThrow();
    expect(CAUSAL_CHAINS).toHaveLength(105);
    expect(new Set(CAUSAL_CHAINS.map((definition) => definition.id)).size).toBe(
      105,
    );
    expect(
      CAUSAL_CHAINS.filter(
        (definition) => definition.readiness === 'PARAMETERIZED_KERNEL_READY',
      ),
    ).toHaveLength(37);
    expect(
      CAUSAL_CHAINS.filter(
        (definition) => definition.readiness === 'FUTURE_INTERFACE_ONLY',
      ),
    ).toHaveLength(68);
    expect(getCausalChain('C1').edges).toContainEqual({
      source: 'AUTOMATED_LOGISTICS_SMART_PORT',
      target: 'LOW_MEDIUM_SKILL_DEMAND',
      direction: 'DECREASES',
    });
    expect(getCausalChain('C50').edges).toContainEqual({
      source: 'SHIPMENT_DELAY',
      target: 'ALTERNATIVE_SUPPLIER_SEARCH',
      direction: 'INCREASES',
    });
    expect(getCausalChain('C100').edges).toContainEqual({
      source: 'DISASTER_CIVIL_EMERGENCY',
      target: 'DISPLACEMENT',
      direction: 'INCREASES',
    });
    expect(getCausalChain('C105').edges).toContainEqual({
      source: 'GOVERNMENT_GUARANTEE',
      target: 'FUTURE_FISCAL_LIABILITY',
      direction: 'INCREASES',
    });
  });

  it('schedules topology without allowing bare numerical values', () => {
    expect(
      scheduleCausalSignal({
        effectId: 'education-skill-v1',
        chainId: 'C1',
        edgeIndex: 0,
        sourcePeriod: 12,
        delayPeriods: 3,
        parameterVersion: 'human-capital-2026.1',
      }),
    ).toEqual({
      effectId: 'education-skill-v1',
      chainId: 'C1',
      edgeIndex: 0,
      source: 'EDUCATION_INVESTMENT',
      target: 'HIGHER_VOCATIONAL_GRADUATES',
      direction: 'INCREASES',
      sourcePeriod: 12,
      duePeriod: 15,
      parameterVersion: 'human-capital-2026.1',
    });
    expect(
      scheduleCausalSignal({
        effectId: 'automation-displacement-v1',
        chainId: 'C1',
        edgeIndex: 6,
        sourcePeriod: 12,
        delayPeriods: 1,
        parameterVersion: 'automation-2026.1',
      }).direction,
    ).toBe('DECREASES');
  });

  it('fails closed when timing, version, or graph selection is invalid', () => {
    const valid = {
      effectId: 'valid-effect',
      chainId: 'C15' as const,
      edgeIndex: 0,
      sourcePeriod: 0,
      delayPeriods: 1,
      parameterVersion: 'test-v1',
    };
    expect(() => scheduleCausalSignal({ ...valid, delayPeriods: 0 })).toThrow(
      'delayPeriods must be a positive safe integer',
    );
    expect(() =>
      scheduleCausalSignal({ ...valid, parameterVersion: '' }),
    ).toThrow('parameterVersion must be a stable identifier');
    expect(() => scheduleCausalSignal({ ...valid, edgeIndex: 99 })).toThrow(
      'Unknown causal edge',
    );
  });

  it('partitions effects deterministically without applying or dropping one', () => {
    const pending = scheduleCausalSignal({
      effectId: 'future-route-delay',
      chainId: 'C50',
      edgeIndex: 0,
      sourcePeriod: 4,
      delayPeriods: 2,
      parameterVersion: 'route-contract-v1',
    });
    const due = scheduleCausalSignal({
      effectId: 'due-health-availability',
      chainId: 'C6',
      edgeIndex: 0,
      sourcePeriod: 4,
      delayPeriods: 1,
      parameterVersion: 'health-contract-v1',
    });
    expect(partitionCausalSignals(5, [pending, due])).toEqual({
      due: [due],
      pending: [pending],
    });
    expect(() => partitionCausalSignals(5, [due, due])).toThrow(
      'Causal signal IDs must be unique',
    );
  });

  it('calculates population and money pathways in exact, distinct units', () => {
    const immigration = scheduleExactCausalTransmission({
      effectId: 'immigration-labour-v1',
      chainId: 'C97',
      edgeIndex: 0,
      sourcePeriod: 10,
      delayPeriods: 1,
      source: {
        node: 'IMMIGRATION',
        amount: '125',
        unit: { kind: 'QUANTITY', unit: 'person' },
        sign: 'NON_NEGATIVE',
      },
      targetBefore: {
        node: 'LABOUR_SUPPLY',
        amount: '1000',
        unit: { kind: 'QUANTITY', unit: 'person' },
        sign: 'NON_NEGATIVE',
      },
      response: {
        sourceUnit: { kind: 'QUANTITY', unit: 'person' },
        targetUnit: { kind: 'QUANTITY', unit: 'person' },
        targetAmountPerSourceUnit: '0.8',
        parameterVersion: 'demography-v1',
      },
    });
    expect(immigration.targetDelta).toEqual({
      node: 'LABOUR_SUPPLY',
      amount: '100',
      unit: { kind: 'QUANTITY', unit: 'person' },
      sign: 'SIGNED',
    });
    expect(immigration.targetAfter.amount).toBe('1100');

    const mortgage = scheduleExactCausalTransmission({
      effectId: 'mortgage-debt-service-v1',
      chainId: 'C64',
      edgeIndex: 0,
      sourcePeriod: 10,
      delayPeriods: 1,
      source: {
        node: 'MORTGAGE_RATE',
        amount: '1',
        unit: { kind: 'QUANTITY', unit: 'percentage_point' },
        sign: 'NON_NEGATIVE',
      },
      targetBefore: {
        node: 'DEBT_SERVICE',
        amount: '500',
        unit: { kind: 'MONEY', currency: 'GCU' },
        sign: 'NON_NEGATIVE',
      },
      response: {
        sourceUnit: { kind: 'QUANTITY', unit: 'percentage_point' },
        targetUnit: { kind: 'MONEY', currency: 'GCU' },
        targetAmountPerSourceUnit: '12.5',
        parameterVersion: 'mortgage-pass-through-v1',
      },
    });
    expect(mortgage.targetDelta.amount).toBe('12.5');
    expect(mortgage.targetAfter).toMatchObject({ amount: '512.5' });

    const supplyPrice = scheduleExactCausalTransmission({
      effectId: 'firm-supply-price-v1',
      chainId: 'C101',
      edgeIndex: 9,
      sourcePeriod: 10,
      delayPeriods: 1,
      source: {
        node: 'MARKET_SUPPLY',
        amount: '5',
        unit: { kind: 'QUANTITY', unit: 'tonne_per_period' },
        sign: 'NON_NEGATIVE',
      },
      targetBefore: {
        node: 'UNIT_PRICE',
        amount: '10',
        unit: { kind: 'UNIT_PRICE', currency: 'GCU', perUnit: 'tonne' },
        sign: 'NON_NEGATIVE',
      },
      response: {
        sourceUnit: { kind: 'QUANTITY', unit: 'tonne_per_period' },
        targetUnit: { kind: 'UNIT_PRICE', currency: 'GCU', perUnit: 'tonne' },
        targetAmountPerSourceUnit: '0.2',
        parameterVersion: 'sector-supply-price-v1',
      },
    });
    expect(supplyPrice.targetDelta.amount).toBe('-1');
    expect(supplyPrice.targetAfter).toMatchObject({ amount: '9' });
  });

  it('rejects wrong dimensions, impossible stock reductions, and undued application', () => {
    const valid = {
      effectId: 'emigration-population-v1',
      chainId: 'C98' as const,
      edgeIndex: 1,
      sourcePeriod: 4,
      delayPeriods: 1,
      source: {
        node: 'EMIGRATION',
        amount: '11',
        unit: { kind: 'QUANTITY' as const, unit: 'person' },
        sign: 'NON_NEGATIVE' as const,
      },
      targetBefore: {
        node: 'POPULATION_TAX_BASE_CONSUMPTION',
        amount: '10',
        unit: { kind: 'QUANTITY' as const, unit: 'person' },
        sign: 'NON_NEGATIVE' as const,
      },
      response: {
        sourceUnit: { kind: 'QUANTITY' as const, unit: 'person' },
        targetUnit: { kind: 'QUANTITY' as const, unit: 'person' },
        targetAmountPerSourceUnit: '1',
        parameterVersion: 'demography-v1',
      },
    };
    expect(() => scheduleExactCausalTransmission(valid)).toThrow(
      'POPULATION_TAX_BASE_CONSUMPTION cannot become negative',
    );
    expect(() =>
      scheduleExactCausalTransmission({
        ...valid,
        targetBefore: {
          ...valid.targetBefore,
          amount: '100',
          unit: { kind: 'MONEY', currency: 'GCU' },
        },
      }),
    ).toThrow('Exact target unit does not match response targetUnit');

    const due = scheduleExactCausalTransmission({
      ...valid,
      targetBefore: { ...valid.targetBefore, amount: '100' },
    });
    expect(() =>
      calculateExactCausalStateAfterEffects({
        currentPeriod: 4,
        current: due.targetBefore,
        effects: [due],
      }),
    ).toThrow('Causal effect is not due at currentPeriod');
  });

  it('recomputes an exact state from due effects without persisting it', () => {
    const first = scheduleExactCausalTransmission({
      effectId: 'immigration-labour-a',
      chainId: 'C97',
      edgeIndex: 0,
      sourcePeriod: 1,
      delayPeriods: 1,
      source: {
        node: 'IMMIGRATION',
        amount: '10',
        unit: { kind: 'QUANTITY', unit: 'person' },
        sign: 'NON_NEGATIVE',
      },
      targetBefore: {
        node: 'LABOUR_SUPPLY',
        amount: '100',
        unit: { kind: 'QUANTITY', unit: 'person' },
        sign: 'NON_NEGATIVE',
      },
      response: {
        sourceUnit: { kind: 'QUANTITY', unit: 'person' },
        targetUnit: { kind: 'QUANTITY', unit: 'person' },
        targetAmountPerSourceUnit: '0.5',
        parameterVersion: 'demography-v1',
      },
    });
    const second = scheduleExactCausalTransmission({
      effectId: 'immigration-labour-b',
      chainId: 'C97',
      edgeIndex: 0,
      sourcePeriod: 1,
      delayPeriods: 1,
      source: {
        node: 'IMMIGRATION',
        amount: '6',
        unit: { kind: 'QUANTITY', unit: 'person' },
        sign: 'NON_NEGATIVE',
      },
      targetBefore: first.targetBefore,
      response: {
        sourceUnit: { kind: 'QUANTITY', unit: 'person' },
        targetUnit: { kind: 'QUANTITY', unit: 'person' },
        targetAmountPerSourceUnit: '0.5',
        parameterVersion: 'demography-v1',
      },
    });
    expect(
      calculateExactCausalStateAfterEffects({
        currentPeriod: 2,
        current: first.targetBefore,
        effects: [second, first],
      }),
    ).toMatchObject({
      before: { amount: '100' },
      delta: { amount: '8' },
      after: { amount: '108' },
    });
  });
});
