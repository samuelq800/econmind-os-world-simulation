import { describe, expect, it } from 'vitest';

import { prepareV29ParameterProvenance } from '../../tools/v29/parameter-provenance-preparation.js';

interface MutableSource {
  sourceId: string;
  status: 'AVAILABLE' | 'MISSING';
  sourceHash: string | null;
  locator: string | null;
  timeRange: { startRef: string; endRef: string } | null;
  missingReason: string | null;
}

interface MutableParameter {
  parameterId: string;
  status: 'AVAILABLE' | 'MISSING';
  value: unknown;
  unit: string;
  sourceIds: string[];
  transformation: { transformationId: string; formula: string } | null;
  economicEventTypes: string[];
  missingReason: string | null;
}

function input(): {
  sources: MutableSource[];
  parameters: MutableParameter[];
} {
  return {
    sources: [
      {
        sourceId: 'SOURCE_A',
        status: 'AVAILABLE',
        sourceHash: 'a'.repeat(64),
        locator: 'frozen/source-a.json',
        timeRange: { startRef: '2021', endRef: '2023' },
        missingReason: null,
      },
      {
        sourceId: 'SOURCE_B',
        status: 'AVAILABLE',
        sourceHash: 'b'.repeat(64),
        locator: 'frozen/source-b.json',
        timeRange: { startRef: '2022-Q1', endRef: '2022-Q4' },
        missingReason: null,
      },
    ],
    parameters: [
      {
        parameterId: 'PRICE_RESPONSE_COEFFICIENT',
        status: 'AVAILABLE',
        value: '0.25',
        unit: 'ratio',
        sourceIds: ['SOURCE_B', 'SOURCE_A'],
        transformation: {
          transformationId: 'MEAN_OBSERVED_RATIO_V1',
          formula: '(SOURCE_A + SOURCE_B) / 2',
        },
        economicEventTypes: ['PRICE_UPDATED', 'SUPPLY_REBALANCED'],
        missingReason: null,
      },
    ],
  };
}

describe('V29.3 numeric-parameter provenance preparation', () => {
  it('emits deterministic source-to-parameter-to-Event chains without authority', () => {
    const result = prepareV29ParameterProvenance(input());
    expect(result).toMatchObject({
      status: 'PREPARATION_ONLY_TRACEABLE',
      formallyVerified: false,
      eventAuthorized: false,
      parameterApplicationAuthorized: false,
      counts: { sources: 2, parameters: 1, chains: 4, issues: 0 },
    });
    expect(result.chains[0]).toEqual({
      chainRef: 'SOURCE_A->PRICE_RESPONSE_COEFFICIENT->PRICE_UPDATED',
      sourceId: 'SOURCE_A',
      sourceHash: 'a'.repeat(64),
      sourceLocator: 'frozen/source-a.json',
      timeRange: { startRef: '2021', endRef: '2023' },
      parameterId: 'PRICE_RESPONSE_COEFFICIENT',
      parameterValue: '0.25',
      parameterUnit: 'ratio',
      transformationId: 'MEAN_OBSERVED_RATIO_V1',
      formula: '(SOURCE_A + SOURCE_B) / 2',
      economicEventType: 'PRICE_UPDATED',
      sourceBytesVerified: false,
      causalEffectVerified: false,
    });
  });

  it('is invariant to source, source-reference and Event input order', () => {
    const first = prepareV29ParameterProvenance(input());
    const reversed = input();
    reversed.sources.reverse();
    reversed.parameters[0]!.sourceIds.reverse();
    reversed.parameters[0]!.economicEventTypes.reverse();
    expect(prepareV29ParameterProvenance(reversed)).toEqual(first);
  });

  it('keeps a missing source and all dependent parameters unavailable', () => {
    const value = input();
    Object.assign(value.sources[0]!, {
      status: 'MISSING',
      sourceHash: null,
      locator: null,
      timeRange: null,
      missingReason: 'SOURCE_BYTES_NOT_AVAILABLE',
    });
    const result = prepareV29ParameterProvenance(value);
    expect(result.status).toBe('PREPARATION_ONLY_UNAVAILABLE');
    expect(result.chains).toHaveLength(0);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SOURCE_MISSING',
          sourceId: 'SOURCE_A',
        }),
        expect.objectContaining({
          code: 'PARAMETER_SOURCE_UNAVAILABLE',
          sourceId: 'SOURCE_A',
          parameterId: 'PRICE_RESPONSE_COEFFICIENT',
        }),
      ]),
    );
  });

  it('keeps an explicitly missing parameter out of the causal-chain inventory', () => {
    const value = input();
    Object.assign(value.parameters[0]!, {
      status: 'MISSING',
      value: null,
      transformation: null,
      missingReason: 'FORMULA_NOT_APPROVED',
    });
    const result = prepareV29ParameterProvenance(value);
    expect(result).toMatchObject({
      status: 'PREPARATION_ONLY_UNAVAILABLE',
      counts: { sources: 2, parameters: 1, chains: 0, issues: 1 },
    });
    expect(result.issues[0]).toMatchObject({
      code: 'PARAMETER_MISSING',
      parameterId: 'PRICE_RESPONSE_COEFFICIENT',
    });
  });

  it('fails closed for missing source hash, missing unit and non-finite values', () => {
    const missingHash = input();
    missingHash.sources[0]!.sourceHash = null;
    expect(() => prepareV29ParameterProvenance(missingHash)).toThrow(
      'requires SHA-256, locator, time range',
    );

    const missingUnit = input();
    missingUnit.parameters[0]!.unit = '';
    expect(() => prepareV29ParameterProvenance(missingUnit)).toThrow(
      'parameter unit must be a non-empty canonical string',
    );

    for (const nonFinite of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      'Infinity',
    ]) {
      const value = input();
      value.parameters[0]!.value = nonFinite;
      expect(() => prepareV29ParameterProvenance(value)).toThrow();
    }
  });

  it('rejects unknown or duplicate identities rather than inventing bindings', () => {
    const unknown = input();
    unknown.parameters[0]!.sourceIds = ['SOURCE_UNKNOWN'];
    expect(() => prepareV29ParameterProvenance(unknown)).toThrow(
      'references unknown source SOURCE_UNKNOWN',
    );

    const duplicate = input();
    duplicate.sources.push({ ...duplicate.sources[0]! });
    expect(() => prepareV29ParameterProvenance(duplicate)).toThrow(
      'source identities must be unique',
    );
  });
});
