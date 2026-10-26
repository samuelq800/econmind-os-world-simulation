import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import * as C from '@econmind/core';
// @ts-expect-error -- Test-only bridge to A's reviewed data-only .mjs reader; no application imports tools.
import * as A from '../../tools/social-office-demo/check-opening-finance.mjs';
import {
  loadSocialOfficeDemoScenario,
  type SocialOfficeDemoScenario,
} from '../../apps/world-worker/src/social-office-demo/scenario-input.js';
import {
  assertSocialOfficeHistoricalReadFacts,
  bindSocialOfficeSimulatedOpening,
  bindSocialOfficeSimulatedReadFacts,
} from '../../apps/world-worker/src/social-office-demo/source-facts.js';
import type { SocialOfficeSimulatedPublication } from '../../apps/world-worker/src/persistence/social-office-simulated-source-custody.js';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const clone = <T>(v: T): T => JSON.parse(C.canonicalSerialize(v)) as T;
let scenario: Readonly<SocialOfficeDemoScenario>;
beforeAll(async () => {
  const f: unknown = A.selectOpeningFinanceCandidateData(
    A.readOpeningFinanceDistribution(),
    {
      meaning: 'ACCRUAL',
      domainVariant: 'G_DOMAIN_BASELINE_PROPOSAL',
      financeOptionId: 'SIM_SOCIAL_OPENING_BASELINE_V1_PROPOSAL',
    },
  );
  scenario = await loadSocialOfficeDemoScenario({
    openingFinanceCandidateUtf8: C.canonicalSerialize(f),
  });
});
function binding(p = scenario.initialPublication, generation = '1') {
  const publicationUtf8 = C.canonicalSerialize(p);
  return { publicationUtf8, generation, manifestHash: digest(publicationUtf8) };
}
function opening(p = scenario.initialPublication) {
  return bindSocialOfficeSimulatedOpening({
    ...binding(p),
    expectedWorldId: scenario.scope.worldId,
    expectedCountryId: scenario.scope.countryId,
    expectedSeedId: scenario.seed.seedId,
    expectedSeedFingerprint: scenario.seed.fingerprint,
  });
}
function command(
  kind: 'PLAN' | 'ADMIT' | 'GRADUATE' | 'SERVE',
  day = '0',
  country = 'COUNTRY_01',
) {
  const intent =
    kind === 'PLAN'
      ? {
          schemaVersion: 'social-employment-service-plan-v1',
          locationId: 'REGION_01_E1',
          skill: 'MEDIUM',
          positionId: 'POSITION_SIM_CLINIC_NURSE_02',
          servicePoolId: 'SIM_EMP_POOL_MEDIUM_D1',
          requestedMatches: '1',
          dueDayIndex: '1',
        }
      : kind === 'ADMIT'
        ? {
            schemaVersion: 'social-college-admit-v1',
            programmeId: 'SIM_VOCATIONAL_PROGRAMME_V1',
            programmeRuleVersion: 'SIM_VOCATIONAL_RULE_V1',
            cohortId: 'SIM_COHORT_NEW_01',
            applicantPoolId: 'SIM_STUDENT_APPLICANTS_V1',
          }
        : kind === 'GRADUATE'
          ? {
              schemaVersion: 'social-college-graduate-v1',
              cohortId: 'SIM_COHORT_RETURNING_01',
              programmeRuleVersion: 'SIM_VOCATIONAL_RULE_V1',
            }
          : {
              schemaVersion: 'social-clinic-serve-v1',
              clinicId: 'FACILITY_SIM_COMMUNITY_CLINIC_01',
              careWindowId: 'SIM_CLINIC_EPISODE_D0_V1',
              clinicRuleVersion: 'SIM_PRIMARY_CARE_RULE_V1',
            };
  return C.parseCanonicalCommand(
    {
      schemaVersion: C.COMMAND_SCHEMA_VERSION,
      actorId: scenario.actorId,
      authSubject: scenario.authSubject,
      commandId: `G_DEMO_${kind}_D${day}`,
      commandType:
        kind === 'PLAN'
          ? C.SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND
          : kind === 'ADMIT'
            ? C.SOCIAL_COLLEGE_ADMIT_COMMAND
            : kind === 'GRADUATE'
              ? C.SOCIAL_COLLEGE_GRADUATE_COMMAND
              : C.SOCIAL_CLINIC_SERVE_COMMAND,
      correlationId: 'G_DEMO_BINDING_TEST',
      countryId: country,
      worldId: scenario.scope.worldId,
      officeId: 'SOCIAL',
      expectedWorldVersion: '0',
      idempotencyKey: `G_DEMO_IDEM_${kind}_D${day}`,
      simTime: (BigInt(day) * 86400000n).toString(),
      submittedAtReal: '2026-10-26T00:00:00.000Z',
      payload: intent,
    },
    digest,
  );
}
function mutate(
  recordId: string,
  change: (v: Record<string, unknown>) => void,
) {
  const p = clone(scenario.initialPublication);
  return {
    ...p,
    records: p.records.map((r) => {
      if (r.recordId !== recordId) return r;
      const value = JSON.parse(r.rawUtf8) as Record<string, unknown>;
      change(value);
      const rawUtf8 = C.canonicalSerialize(value);
      return { ...r, rawUtf8, sha256: digest(rawUtf8) };
    }),
  };
}
function prepared(kind: 'PLAN' | 'ADMIT' | 'GRADUATE' | 'SERVE', day = '0') {
  const p =
    day === '0'
      ? scenario.initialPublication
      : scenario.publicationForPreset({
          dayIndex: day,
          expectedGeneration: '1',
          expectedManifestHash: binding().manifestHash,
        });
  const c = command(kind, day),
    f = bindSocialOfficeSimulatedReadFacts({
      ...binding(p, day === '0' ? '1' : '2'),
      command: c,
    });
  const ledgers = C.rebuildV08LedgersFromLineage({
    seed: scenario.seed,
    sha256Hex: digest,
  });
  return C.prepareSocialOfficeOperation({
    command: c,
    state: scenario.socialOpening,
    readFacts: f,
    inventoryBefore: ledgers.inventory,
    financialBefore: ledgers.financial,
    sha256Hex: digest,
  });
}

describe('G selected simulated source construction and original document binding, no installation', () => {
  it('accepts no caller-authored finance before-state or activation flag in place of exact A query bytes', async () => {
    await expect(
      loadSocialOfficeDemoScenario({
        openingFinanceCandidateUtf8: C.canonicalSerialize({
          financialBefore: scenario.financeData.financialOpening,
          activationAuthorized: true,
        }),
      }),
    ).rejects.toThrow('exact selected A query');
    let invoked = false;
    const input = new Proxy(
      { openingFinanceCandidateUtf8: '' },
      {
        getPrototypeOf() {
          invoked = true;
          throw Error('trap');
        },
      },
    );
    await expect(loadSocialOfficeDemoScenario(input)).rejects.toThrow(
      'fixed packaged',
    );
    expect(invoked).toBe(false);
  });
  it('reconstructs genuine seed and both ledgers without admitting or activating the candidate', () => {
    const r = C.rebuildV08LedgersFromLineage({
      seed: scenario.seed,
      sha256Hex: digest,
    });
    expect(r.seedFingerprint).toBe(scenario.seed.fingerprint);
    expect(r.worldVersion).toBe('0');
    expect(scenario.sourceAdmitted).toBe(false);
    expect(scenario.financeData.ownerSelectedOption).toBeNull();
    expect(scenario.financeData.activationAuthorized).toBe(false);
    expect(scenario.selectionClass).toBe(
      'DEMO_SELECTION_ONLY_NOT_ADOPTED_WORLD_POLICY',
    );
  });
  it('keeps initial commitments and all original course windows rather than stale empty fields', () => {
    const s = opening().socialOpening;
    expect(s.budgetCommitments.map((b) => b.committedAmount.amount)).toEqual([
      '150',
      '0',
    ]);
    expect(s.cohorts[0]!.futureTeachingReservations).toHaveLength(10);
    expect(
      s.cohorts[0]!.futureTeachingReservations.reduce(
        (n, r) => n + BigInt(r.amount),
        0n,
      ),
    ).toBe(1800n);
    expect(
      s.resourceWindows.filter(
        (r) =>
          r.allocation.canonicalPhysicalResourceId ===
          'PHYSICAL_PERSON_SIM_M001',
      ),
    ).toHaveLength(11);
  });
  it('normalizes the raw publication hash by prefix only and keeps null purpose exclusively for n0', () => {
    const f = opening().openingReadFacts;
    expect(f.sourceBinding.manifestHash).toBe(
      `sha256:${binding().manifestHash}`,
    );
    expect(f.sourceBinding.purpose).toBeNull();
    const l = C.rebuildV08LedgersFromLineage({
      seed: scenario.seed,
      sha256Hex: digest,
    });
    expect(() =>
      C.prepareSocialOfficeOperation({
        command: command('ADMIT'),
        state: scenario.socialOpening,
        readFacts: f,
        inventoryBefore: l.inventory,
        financialBefore: l.financial,
        sha256Hex: digest,
      }),
    ).toThrow();
  });
  it('rejects fabricated opening state even when all surrounding record and manifest hashes are recomputed', () => {
    const p = mutate('G_SOCIAL_OPENING_AGGREGATE_V1', (v) => {
      (v.socialOpening as { clinic: { backlog: string } }).clinic.backlog = '0';
    });
    expect(() => opening(p)).toThrow('seed does not bind');
  });
  it('rejects recipe changes under the original retained seed', () => {
    const p = mutate('G_SOCIAL_DOMAIN_FACTS_V1', (v) => {
      (
        v.fixedFacts as {
          approvedBudgets: { approvedAmount: { amount: string } }[];
        }
      ).approvedBudgets[0]!.approvedAmount.amount = '999';
    });
    expect(() => opening(p)).toThrow('seed does not bind');
  });
  it('rejects raw hash drift before constructing facts', () => {
    expect(() =>
      bindSocialOfficeSimulatedReadFacts({
        ...binding(),
        publicationUtf8: `${binding().publicationUtf8} `,
        command: command('PLAN'),
      }),
    ).toThrow('hash mismatch');
  });
  it('rejects a top-level accessor without invoking it or accepting a callback resolver', () => {
    let invoked = false;
    const input = { ...binding(), command: command('PLAN') };
    Object.defineProperty(input, 'publicationUtf8', {
      enumerable: true,
      get: () => {
        invoked = true;
        return binding().publicationUtf8;
      },
    });
    expect(() => bindSocialOfficeSimulatedReadFacts(input)).toThrow('inert');
    expect(invoked).toBe(false);
    expect(() =>
      bindSocialOfficeSimulatedReadFacts({
        ...binding(),
        command: command('PLAN'),
        resolver: () => scenario.socialOpening,
      } as never),
    ).toThrow('closed');
  });
  it('rejects a proxy binding without invoking its traps', () => {
    let invoked = false;
    const input = new Proxy(
      { ...binding(), command: command('PLAN') },
      {
        get() {
          invoked = true;
          throw Error('trap');
        },
      },
    );
    expect(() => bindSocialOfficeSimulatedReadFacts(input)).toThrow('inert');
    expect(invoked).toBe(false);
  });
  it('rejects generation not paired to its exact publication predecessor', () => {
    expect(() =>
      bindSocialOfficeSimulatedReadFacts({
        ...binding(),
        generation: '2',
        command: command('PLAN'),
      }),
    ).toThrow('generation mismatch');
  });
  it('rejects current revocation instead of treating a policy document as a grant', () => {
    const p: SocialOfficeSimulatedPublication = {
      ...scenario.initialPublication,
      disposition: 'REVOKED',
    };
    expect(() => opening(p)).toThrow('active original');
  });
  it('rejects cross-country commands and caller-supplied time', () => {
    expect(() =>
      bindSocialOfficeSimulatedReadFacts({
        ...binding(),
        command: command('PLAN', '0', 'COUNTRY_02'),
      }),
    ).toThrow('scope');
    expect(() =>
      bindSocialOfficeSimulatedReadFacts({
        ...binding(),
        command: command('PLAN', '1'),
      }),
    ).toThrow('as-of');
  });
  it('rejects an allocation that acquires a different physical identity', () => {
    const p = mutate('G_SOCIAL_PHYSICAL_DAY_0', (v) => {
      (
        v.allocations as { canonicalPhysicalResourceId: string }[]
      )[0]!.canonicalPhysicalResourceId = 'PHYSICAL_ALIAS_NEW_ALLOWANCE';
    });
    expect(() => opening(p)).toThrow('physical alias');
  });
  it('reconstructs the full original facts and refuses an unchanged binding with edited quantities', () => {
    const c = command('SERVE'),
      f = bindSocialOfficeSimulatedReadFacts({ ...binding(), command: c });
    expect(
      assertSocialOfficeHistoricalReadFacts({
        ...binding(),
        command: c,
        retainedReadFacts: f,
      }),
    ).toEqual(f);
    const altered = clone(f);
    (altered.demandWindows[0] as { newCases: string }).newCases = '0';
    expect(() =>
      assertSocialOfficeHistoricalReadFacts({
        ...binding(),
        command: c,
        retainedReadFacts: altered,
      }),
    ).toThrow('complete source');
  });
  it('constructs only the three explicitly selected documentary presets, with real CAS pins still required', () => {
    expect(() =>
      scenario.publicationForPreset({
        dayIndex: '2',
        expectedGeneration: '1',
        expectedManifestHash: binding().manifestHash,
      }),
    ).toThrow('fixed documentary');
    expect(() =>
      scenario.publicationForPreset({
        dayIndex: '1',
        expectedGeneration: '1',
        expectedManifestHash: null,
      }),
    ).toThrow('CAS pins');
    return expect(
      Reflect.apply(loadSocialOfficeDemoScenario, null, ['arbitrary-path']),
    ).rejects.toThrow('fixed packaged');
  });
  it('prepares the actual college action from G facts while reserving every new learner teaching day', () => {
    const r = prepared('ADMIT');
    expect(r.source).toBe('PREPARED_NOT_COMMITTED');
    expect(r.outcome.units).toBe('2');
    expect(r.outcome.budgetEffect?.amount.amount).toBe('100');
    expect(
      r.state.cohorts.find((c) => c.cohortId === 'SIM_COHORT_NEW_01')!
        .futureTeachingReservations,
    ).toHaveLength(10);
    expect(
      r.outcome.financialRequirement?.legs.some(
        (l) =>
          l.account.claimId === 'CLAIM_SIM_SOCIAL_SCHOLARSHIP_V1' &&
          l.amount.amount === '10',
      ),
    ).toBe(true);
  });
  it('prepares real clinic inventory and complete finance requirements, without claiming they were committed', () => {
    const r = prepared('SERVE');
    expect(r.source).toBe('PREPARED_NOT_COMMITTED');
    expect(r.outcome.units).toBe('5');
    expect(r.state.clinic.backlog).toBe('9');
    expect(r.outcome.inventoryRequirement?.quantity).toBe('5');
    expect(r.outcome.financialRequirement?.legs).toHaveLength(6);
    expect(
      r.outcome.financialRequirement?.legs.find(
        (l) => l.account.accountId === 'ACCOUNT_SIM_SOCIAL_GOV_MEDICINE_ASSET',
      )?.amount.amount,
    ).toBe('100');
  });
  it('prepares PLAN with the original caseworker future window and refuses early graduation', () => {
    const r = prepared('PLAN');
    expect(r.outcome.units).toBe('1');
    expect(
      r.outcome.resourceEffects.some(
        (x) =>
          x.resourceId === 'SIM_PERSON_SIM_M001_DAY_1' && x.reserved === '55',
      ),
    ).toBe(true);
    expect(() => prepared('GRADUATE')).toThrow();
  });
  it('at the own due preset consumes complete original teaching and assesses all original enrolled', () => {
    const r = prepared('GRADUATE', '10');
    expect(r.outcome.units).toBe('1');
    expect(r.state.cohorts[0]!.state).toBe('GRADUATION_PROCESSED');
    expect(
      r.outcome.resourceEffects
        .filter((x) => BigInt(x.released) > 0n)
        .reduce((n, x) => n + BigInt(x.released), 0n),
    ).toBe(1800n);
    expect(
      r.outcome.resourceEffects.some(
        (x) =>
          x.resourceId === 'SIM_PERSON_SIM_H001_DAY_10' && x.consumed === '90',
      ),
    ).toBe(true);
    expect(r.outcome.budgetEffect?.amount.amount).toBe('0');
  });
});
