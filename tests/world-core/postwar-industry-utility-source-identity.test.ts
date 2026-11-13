import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import { derivePostwarIndustryUtilityScenarioRef } from '../../apps/world-worker/src/persistence/postwar-industry-utility-source.js';

const pins = Object.freeze({
  worldId: 'WORLD_POSTWAR_GCU_OPENING_20261029_V1',
  seedRef: 'SEED_POSTWAR_GCU_OPENING_20261029_V1',
  contentHash:
    'sha256:cd6cd0825fd8b15c13dab28f030e2df24b804d5675e132ff77715a20ec67056a',
  admissionRef:
    'ADMISSION_7BA0DCD0675E38168F8A86A69B972BA953008B36C52E559C285C1BD3F191C961',
});

describe('immutable utility source identity', () => {
  it('preserves the actually registered four-pin identity independently of read minimums', () => {
    const original =
      'INDUSTRY_FIRST_DAY_' +
      createHash('sha256')
        .update(canonicalSerialize(pins))
        .digest('hex')
        .toUpperCase();
    expect(original).toBe(
      'INDUSTRY_FIRST_DAY_2C7BE75EF72F0B0E67F1B9A29E2098FF18777692F4692775A473DE54A4944CFD',
    );
    expect(derivePostwarIndustryUtilityScenarioRef(pins)).toBe(original);
    for (const minimumWorldVersion of ['0', '1', '257']) {
      const readPins = { ...pins, minimumWorldVersion };
      expect(derivePostwarIndustryUtilityScenarioRef(readPins)).toBe(original);
      expect(readPins.minimumWorldVersion).toBe(minimumWorldVersion);
    }
  });

  it.each(['worldId', 'seedRef', 'contentHash', 'admissionRef'] as const)(
    'changes identity when the authoritative %s changes',
    (key) => {
      expect(
        derivePostwarIndustryUtilityScenarioRef({
          ...pins,
          [key]: pins[key] + '_OTHER',
        }),
      ).not.toBe(derivePostwarIndustryUtilityScenarioRef(pins));
    },
  );
});
