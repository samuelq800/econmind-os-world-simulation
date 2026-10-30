import { readFile } from 'node:fs/promises';
import { beforeAll, describe, it, expect } from 'vitest';
import {
  canonicalSerialize,
  validatePoliticalCapitalSnapshot,
} from '@econmind/core';
import {
  parseAdoptedCaptainOpeningPolicy,
  createAdoptedCaptainOpeningCandidate,
  publishAdoptedCaptainNewScenarioFrom,
  type AdoptedCaptainOpeningPolicy,
} from '../../apps/world-worker/src/preparation/postwar-captain-opening-source.js';
let policy: AdoptedCaptainOpeningPolicy,
  policyBytes: string,
  receiptBytes: string;
const input = {
  worldId: 'WORLD_ADOPTED_CAPTAIN_NEW_SCENARIO_TEST_ONLY',
  seedId: 'SEED_ADOPTED_CAPTAIN_TEST_ONLY',
  seedFingerprint: 'sha256:' + 'a'.repeat(64),
  worldAdmissionRef: 'ADMISSION_TEST_ONLY',
  countryIds: Array.from(
    { length: 70 },
    (_, i) => 'COUNTRY_' + String(i + 1).padStart(2, '0'),
  ),
};
beforeAll(async () => {
  [policyBytes, receiptBytes] = await Promise.all(
    ['captain-opening.v1.json', 'captain-opening-adoption.v1.json'].map((p) =>
      readFile(
        new URL('../../config/postwar-genesis/' + p, import.meta.url),
        'utf8',
      ),
    ),
  );
  policy = parseAdoptedCaptainOpeningPolicy({ policyBytes, receiptBytes });
});
describe('explicitly adopted new-scenario Captain opening rule', () => {
  it('derives all70 countries from the exact owner adoption with real Core conservation and seven tens', () => {
    const c = createAdoptedCaptainOpeningCandidate(policy, input);
    expect(c.packets).toHaveLength(70);
    expect(c.documents.map((d) => d.bytes)).toEqual([
      policyBytes,
      receiptBytes,
    ]);
    for (const p of c.packets) {
      const g = JSON.parse(p.genesis.canonicalPayload),
        cap = validatePoliticalCapitalSnapshot(g.capital);
      expect(cap).toMatchObject({
        countryRef: p.adoption.countryId,
        opening: { amount: '70', unit: 'political_capital' },
        generated: { amount: '0' },
        total: { amount: '70' },
        available: { amount: '70' },
        spent: { amount: '0' },
        closing: { amount: '70' },
      });
      expect(cap.buckets.map((b) => b.balance.amount)).toEqual(
        Array(7).fill('10'),
      );
      expect(p.genesis.sourceClass).toBe('ADMITTED_ORIGINAL');
      expect(p.reasons[0]?.canonicalPayload).toContain(
        '不是对任何具体未来再分配的批准',
      );
    }
    expect(c.effects).toEqual({
      financialPostings: '0',
      inventoryPostings: '0',
      politicalCapitalGenerationEvents: '0',
    });
  });
  it('is byte deterministic under rerun/order and binds new world/seed instead of resetting an old candidate', () => {
    const a = createAdoptedCaptainOpeningCandidate(policy, input),
      b = createAdoptedCaptainOpeningCandidate(policy, {
        ...input,
        countryIds: [...input.countryIds].reverse(),
      });
    expect(canonicalSerialize(a)).toBe(canonicalSerialize(b));
    expect(new Set(a.packets.map((p) => p.adoption.adoptionRef)).size).toBe(70);
    expect(
      createAdoptedCaptainOpeningCandidate(policy, {
        ...input,
        worldId: 'WORLD_ANOTHER_NEW_SCENARIO',
      }).fingerprint,
    ).not.toBe(a.fingerprint);
    expect(
      createAdoptedCaptainOpeningCandidate(policy, {
        ...input,
        seedFingerprint: 'sha256:' + 'b'.repeat(64),
      }).fingerprint,
    ).not.toBe(a.fingerprint);
  });
  it('refuses fabricated approval/changed receipt/rules and incomplete country roster', () => {
    expect(() =>
      parseAdoptedCaptainOpeningPolicy({
        policyBytes: policyBytes.replace('"70"', '"100"'),
        receiptBytes,
      }),
    ).toThrow('EXACT_ADOPTED');
    expect(() =>
      parseAdoptedCaptainOpeningPolicy({
        policyBytes,
        receiptBytes: receiptBytes.replace('可以', '未决定'),
      }),
    ).toThrow('EXACT_ADOPTED');
    expect(() =>
      createAdoptedCaptainOpeningCandidate(
        { kind: 'ADOPTED_CAPTAIN_OPENING_70_7X10_V1' },
        input,
      ),
    ).toThrow('GENUINE_ADOPTED');
    expect(() =>
      createAdoptedCaptainOpeningCandidate(policy, {
        ...input,
        countryIds: input.countryIds.slice(1),
      }),
    ).toThrow('SEVENTY_COUNTRY');
  });
  it('does not turn a review artifact into permission to publish/reinitialize any database', async () => {
    const c = createAdoptedCaptainOpeningCandidate(policy, input);
    let calls = 0;
    await expect(
      publishAdoptedCaptainNewScenarioFrom(
        {
          async query() {
            calls++;
            throw Error('MUST_NOT_QUERY');
          },
        },
        c,
      ),
    ).rejects.toThrow('GENUINE_LIVE_NEW_SCENARIO');
    expect(calls).toBe(0);
  });
});
