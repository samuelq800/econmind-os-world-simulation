import { describe, expect, it } from 'vitest';
import { canonicalSerialize, SimTime } from '@econmind/core';
import { serializePostwarSocialPrefixEvidence } from '../support/postwar-social-prefix-evidence-json.js';

describe('Postwar Social prefix diagnostic evidence serialization', () => {
  it('uses the genuine SimTime canonical scalar without changing the receipt', () => {
    const simTime = SimTime.fromTicks('900719925474099312345'),
      receipt = Object.freeze({ outcome: 'COMMITTED', simTime });
    const output = serializePostwarSocialPrefixEvidence({ receipt });
    expect(JSON.parse(output)).toEqual({
      receipt: { outcome: 'COMMITTED', simTime: '900719925474099312345' },
    });
    expect(JSON.stringify(JSON.parse(output).receipt.simTime)).toBe(
      canonicalSerialize(simTime),
    );
    expect(receipt.simTime).toBe(simTime);
    expect(receipt.simTime.ticks).toBe(900719925474099312345n);
  });

  it('preserves nested SQL bigint exactly alongside ordinary diagnostic fields', () => {
    const value = Object.freeze({
      publication: [{ sqlSequence: 900719925474099312345n, count: 4 }],
      stages: ['ACTUAL_COMMIT'],
      production: false,
      failure: null,
    });
    const output = serializePostwarSocialPrefixEvidence(value);
    expect(JSON.parse(output)).toEqual({
      publication: [{ sqlSequence: '900719925474099312345', count: 4 }],
      stages: ['ACTUAL_COMMIT'],
      production: false,
      failure: null,
    });
    expect(value.publication[0]!.sqlSequence).toBe(900719925474099312345n);
    expect(output.endsWith('\n')).toBe(true);
    expect(output).toBe(serializePostwarSocialPrefixEvidence(value));
  });

  it('retains unsupported/cyclic output failures instead of silently losing evidence', () => {
    const value: { self?: unknown } = {};
    value.self = value;
    expect(() => serializePostwarSocialPrefixEvidence(value)).toThrow();
    expect(() => serializePostwarSocialPrefixEvidence(undefined)).toThrow(
      'POSTWAR_SOCIAL_PREFIX_EVIDENCE_JSON_REQUIRED',
    );
  });
});
