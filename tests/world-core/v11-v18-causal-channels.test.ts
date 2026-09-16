import { describe, expect, it } from 'vitest';

import {
  CAUSAL_CHAINS,
  assertCausalCatalogueIntegrity,
  getCausalChain,
  partitionCausalEffects,
  scheduleCausalTransmission,
} from '../../packages/core/src/index.js';

describe('V11–V18 causal-channel preparation', () => {
  it('records every requested pathway with no implicit economic parameter', () => {
    expect(() => assertCausalCatalogueIntegrity()).not.toThrow();
    expect(CAUSAL_CHAINS).toHaveLength(50);
    expect(new Set(CAUSAL_CHAINS.map((definition) => definition.id)).size).toBe(
      50,
    );
    expect(
      CAUSAL_CHAINS.filter(
        (definition) => definition.readiness === 'PARAMETERIZED_KERNEL_READY',
      ),
    ).toHaveLength(24);
    expect(
      CAUSAL_CHAINS.filter(
        (definition) => definition.readiness === 'FUTURE_INTERFACE_ONLY',
      ),
    ).toHaveLength(26);
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
  });

  it('turns only explicit, versioned inputs into a future inert effect', () => {
    expect(
      scheduleCausalTransmission({
        effectId: 'education-skill-v1',
        chainId: 'C1',
        edgeIndex: 0,
        sourcePeriod: 12,
        delayPeriods: 3,
        sourceMagnitude: '8',
        responsePerSourceUnit: '0.25',
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
      delta: '2',
    });
    expect(
      scheduleCausalTransmission({
        effectId: 'automation-displacement-v1',
        chainId: 'C1',
        edgeIndex: 6,
        sourcePeriod: 12,
        delayPeriods: 1,
        sourceMagnitude: '8',
        responsePerSourceUnit: '0.25',
        parameterVersion: 'automation-2026.1',
      }).delta,
    ).toBe('-2');
  });

  it('fails closed when timing, coefficient, version, or graph selection is invalid', () => {
    const valid = {
      effectId: 'valid-effect',
      chainId: 'C15' as const,
      edgeIndex: 0,
      sourcePeriod: 0,
      delayPeriods: 1,
      sourceMagnitude: '1',
      responsePerSourceUnit: '1',
      parameterVersion: 'test-v1',
    };
    expect(() =>
      scheduleCausalTransmission({ ...valid, delayPeriods: 0 }),
    ).toThrow('delayPeriods must be a positive safe integer');
    expect(() =>
      scheduleCausalTransmission({ ...valid, sourceMagnitude: '-1' }),
    ).toThrow('sourceMagnitude must be non-negative');
    expect(() =>
      scheduleCausalTransmission({ ...valid, parameterVersion: '' }),
    ).toThrow('parameterVersion must be a stable identifier');
    expect(() =>
      scheduleCausalTransmission({ ...valid, edgeIndex: 99 }),
    ).toThrow('Unknown causal edge');
  });

  it('partitions effects deterministically without applying or dropping one', () => {
    const pending = scheduleCausalTransmission({
      effectId: 'future-route-delay',
      chainId: 'C50',
      edgeIndex: 0,
      sourcePeriod: 4,
      delayPeriods: 2,
      sourceMagnitude: '3',
      responsePerSourceUnit: '0.5',
      parameterVersion: 'route-contract-v1',
    });
    const due = scheduleCausalTransmission({
      effectId: 'due-health-availability',
      chainId: 'C6',
      edgeIndex: 0,
      sourcePeriod: 4,
      delayPeriods: 1,
      sourceMagnitude: '6',
      responsePerSourceUnit: '0.5',
      parameterVersion: 'health-contract-v1',
    });
    expect(partitionCausalEffects(5, [pending, due])).toEqual({
      due: [due],
      pending: [pending],
    });
    expect(() => partitionCausalEffects(5, [due, due])).toThrow(
      'Causal effect IDs must be unique',
    );
  });
});
