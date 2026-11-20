import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalSerialize,
  parseCanonicalCommand,
  COMMAND_SCHEMA_VERSION,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  createReplaySeed,
  createReplayOrigin,
  createReplayReducerRegistry,
  replayAuthoritativeEvents,
  CURRENT_REPLAY_BINDING,
  worldId as coreWorldId,
  prepareSocialEmploymentServiceOperation,
  validateSocialEmploymentServiceState,
  createSocialEmploymentServiceReplayReducers,
} from '@econmind/core';
import { createHash } from 'node:crypto';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import {
  preparePostwarSocialServiceGenesis,
  createPostwarSocialServiceFundingRequests,
} from '../../apps/world-worker/src/preparation/postwar-social-service-genesis.js';
import {
  createPostwarPublicSafetyGenesis,
  createPostwarPublicSafetyFundingRequests,
} from '../../apps/world-worker/src/preparation/postwar-public-safety-genesis.js';
import {
  preparePostwarLabourGenesis,
  materializePostwarLabourGenesis,
} from '../../apps/world-worker/src/preparation/postwar-labour-genesis.js';
import { createPostwarPopulationFacts } from '../../apps/world-worker/src/preparation/postwar-population-facts.js';
import { createPostwarMonetaryGenesis } from '../../apps/world-worker/src/preparation/postwar-monetary-genesis.js';
import {
  createPostwarWagePolicy,
  POSTWAR_WAGE_POLICY_PATH,
} from '../../apps/world-worker/src/preparation/postwar-wage-policy.js';
import { createPostwarFinancialGenesis } from '../../apps/world-worker/src/preparation/postwar-financial-genesis.js';
import { createPostwarFundingGenesis } from '../../apps/world-worker/src/preparation/postwar-funding-genesis.js';
import {
  createPostwarSocialEmploymentState,
  consumePostwarSocialEmploymentState,
  validatePostwarSocialEmploymentStateDocument,
  selectPostwarSocialEmploymentCountry,
  selectPostwarSocialEmploymentVacancyFacts,
} from '../../apps/world-worker/src/preparation/postwar-social-employment-state.js';

const root = path.resolve(import.meta.dirname, '../..');
const context = await loadPostwarSourceContext(root);
const worldId = 'WORLD_POSTWAR_E03_STATE_TEST',
  seedId = 'SEED_POSTWAR_E03_STATE_TEST';
const {
  source,
  labourSocial: adoption,
  mappingBytes,
  countriesBytes,
  regionsBytes,
  facilitiesBytes,
} = context;
const social = preparePostwarSocialServiceGenesis({
  adoption,
  mappingBytes,
  regionsBytes,
  worldId,
  seedId,
});
const safety = createPostwarPublicSafetyGenesis({
  source,
  adoption,
  mappingBytes,
  countriesBytes,
  regionsBytes,
  worldId,
  seed: seedId,
  policyBytes: await readFile(
    path.join(root, 'config/postwar-genesis/public-safety.v1.json'),
    'utf8',
  ),
});
const labourPreparation = preparePostwarLabourGenesis({
  adoption,
  mappingBytes,
  regionsBytes,
  facilitiesBytes,
  serviceDemands: [...social.demands, ...safety.demands],
});
const monetary = createPostwarMonetaryGenesis({
  source,
  countriesBytes,
  mappingBytes,
  valueDate: '2026-10-28',
});
const wages = createPostwarWagePolicy({
  policyBytes: await readFile(
    path.join(root, POSTWAR_WAGE_POLICY_PATH),
    'utf8',
  ),
  adoption,
  financeSource: source,
  monetaryBindings: monetary.bindings,
  labourPreparation,
});
const financial = createPostwarFinancialGenesis({
  adoption: context.ownerAdoption,
  monetary,
  worldId,
  seedId,
  sourceId: 'SOURCE_POSTWAR_E03_STATE_TEST',
  genesisVersion: 'POSTWAR_E03_STATE_TEST_V1',
});
const publicRequests = [
  ...createPostwarSocialServiceFundingRequests(social, wages).requests,
  ...createPostwarPublicSafetyFundingRequests({
    genesis: safety,
    labour: labourPreparation,
    social,
    wages,
  }),
];
const funding = createPostwarFundingGenesis({
  source,
  openingSeed: financial.baselineSeed,
  monetary,
  labourPreparation,
  wages,
  publicRequests,
});
const materialized = materializePostwarLabourGenesis(labourPreparation, {
  wagesByPositionId: funding.wagesByPositionId,
});
const populationFacts = createPostwarPopulationFacts({
  labourPreparation,
  socialPrepared: social,
});
const input = {
  labourPreparation,
  labourState: materialized.state,
  populationFacts,
  wages,
  funding,
};
const prep = createPostwarSocialEmploymentState(input);
const document = consumePostwarSocialEmploymentState(prep);
const digest = (v: string) => createHash('sha256').update(v).digest('hex');
const sum = (values: readonly string[]) =>
  values.reduce((a, b) => a + BigInt(b), 0n);

describe('postwar Social E03 source uses complete Core state and one actual funding reservation', () => {
  it('validates the full E03 state and all 70 exact country slices through the existing Core consumer', () => {
    expect(document.countries).toHaveLength(70);
    expect(document.state.labour).toEqual(materialized.state);
    expect(document.state.servicePools).toHaveLength(366);
    expect(document.state.plans).toEqual([]);
    expect(document.state.appliedOperations).toEqual([]);
    expect(document.state.labour.appliedFactBindings).toEqual([]);
    for (const country of document.countries) {
      expect(
        country.state.labour.positions.every(
          (p) => p.countryId === country.countryId,
        ),
      ).toBe(true);
      expect(
        country.state.labour.aggregates.every(
          (p) => p.countryId === country.countryId,
        ),
      ).toBe(true);
      const c = selectPostwarSocialEmploymentCountry(
        document,
        country.countryId,
      );
      expect(
        validateSocialEmploymentServiceState(
          c.state,
          c.validationReadFacts.facts,
          digest,
        ),
      ).toEqual(c.state);
      expect(c.validationReadFacts.classification).toBe(
        'VALIDATION_ONLY_NOT_ACTIVE_OFFER',
      );
      expect(c.validationReadFacts.facts.offer.state).toBe('REVOKED');
      expect(c.minimumWage.currency).toBe(
        wages.countries.find((w) => w.countryId === c.countryId)!.currency,
      );
      expect(c.minimumWage.validFromDayIndex).toBe('0');
      expect(c.minimumWage.validUntilDayIndex).toBe('1');
    }
    const seed = createReplaySeed({ seedId, state: document.state }, digest);
    const origin = createReplayOrigin({
      worldId: coreWorldId(worldId),
      lastSequence: '0',
      worldVersion: '0',
      state: document.state,
      seed,
      binding: CURRENT_REPLAY_BINDING,
      sha256Hex: digest,
    });
    const replay = replayAuthoritativeEvents({
      origin,
      seed,
      binding: CURRENT_REPLAY_BINDING,
      registry: createReplayReducerRegistry({
        binding: CURRENT_REPLAY_BINDING,
        reducers: createSocialEmploymentServiceReplayReducers(digest),
      }),
      transitions: [],
      sha256Hex: digest,
    });
    expect(replay.canonicalState).toBe(canonicalSerialize(document.state));
    expect(replay.appliedEventIds).toEqual([]);
  });
  it('preserves true zero vacancies and never exposes the validation witness as a command offer', () => {
    for (const c of document.countries) {
      expect(c.vacancyStatus).toBe('NO_ACTUAL_VACANCY');
      expect(c.offers).toEqual([]);
      const p = c.state.labour.positions[0]!;
      const pool = c.state.servicePools.find(
        (s) => s.locationId === p.locationId && s.skill === p.skill,
      )!;
      expect(() =>
        selectPostwarSocialEmploymentVacancyFacts(c, {
          positionId: p.positionId,
          servicePoolId: pool.poolId,
        }),
      ).toThrow('NO_ACTUAL_VACANCY');
    }
  });
  it('the real Core PLAN consumer rejects the explicitly revoked validation-only witness', () => {
    const c = document.countries[0]!;
    const p = c.validationReadFacts.facts.offer;
    const pool = c.state.servicePools.find(
      (s) => s.locationId === p.locationId && s.skill === p.skill,
    )!;
    const command = parseCanonicalCommand(
      {
        schemaVersion: COMMAND_SCHEMA_VERSION,
        actorId: 'ACTOR_SOCIAL',
        authSubject: '11111111-1111-4111-8111-111111111111',
        commandId: 'POSTWAR_VALIDATION_WITNESS_PLAN',
        commandType: SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
        correlationId: 'POSTWAR_VALIDATION_TRACE',
        countryId: c.countryId,
        worldId,
        officeId: 'SOCIAL',
        expectedWorldVersion: '0',
        idempotencyKey: 'POSTWAR_VALIDATION_IDEM',
        simTime: '0',
        submittedAtReal: '2026-10-28T15:00:00.000Z',
        payload: {
          schemaVersion: 'social-employment-service-plan-v1',
          locationId: p.locationId,
          skill: p.skill,
          positionId: p.positionId,
          servicePoolId: pool.poolId,
          requestedMatches: '1',
          dueDayIndex: '0',
        },
      },
      digest,
    );
    expect(() =>
      prepareSocialEmploymentServiceOperation({
        command,
        state: c.state,
        readFacts: c.validationReadFacts.facts,
        sha256Hex: digest,
      }),
    ).toThrow('current eligible legal position/offer');
  });
  it('subdivides only existing OP professional recovery workers into mutually exclusive duty ranges at the original single wage', () => {
    for (const c of document.countries) {
      for (const license of c.npcUsageLicenses) {
        expect(license.validFromDayIndex).toBe('0');
        expect(license.validUntilDayIndex).toBe('1');
        expect(license.additionalFeeAmount).toBe('0');
        expect(license.state).toBe('GENESIS_USAGE_LICENSE_NOT_PAID_PURCHASE');
        const permitted = c.dutyAssignments.filter((a) =>
          license.dutyAssignmentIds.includes(a.assignmentId),
        );
        expect(
          permitted.every(
            (a) =>
              a.employerId === license.licensorEntityId &&
              a.duty !== 'PRIMARY_RECOVERY_SERVICE',
          ),
        ).toBe(true);
        expect(sum(permitted.map((a) => a.totalMinutes))).toBe(
          BigInt(license.maximumWorkerMinutes),
        );
        expect(
          labourPreparation.employers.find(
            (e) => e.countryId === c.countryId && e.role === 'GOV',
          )!.employerId,
        ).toBe(license.beneficiaryEntityId);
      }
      const positions = new Set(c.dutyAssignments.map((a) => a.positionId));
      for (const id of positions) {
        const p = labourPreparation.positions.find((p) => p.positionId === id)!;
        expect(p).toMatchObject({
          owner: 'PRIVATE_SECTOR',
          employerRole: 'OP',
          classificationId: 'PROFESSIONAL_AND_BUSINESS_SERVICES',
          occupation: 'GENERAL',
        });
        const original = populationFacts.positionPopulationRefs.find(
          (p) => p.positionId === id,
        )!;
        const assignments = c.dutyAssignments
          .filter((a) => a.positionId === id)
          .sort((a, b) =>
            Number(BigInt(a.startOrdinal) - BigInt(b.startOrdinal)),
          );
        let cursor = BigInt(original.startOrdinal);
        for (const a of assignments) {
          expect(BigInt(a.startOrdinal)).toBe(cursor);
          expect(a.employerId).toBe(p.employerId);
          expect(a.payrollFundingRef).toBe(
            funding.wagesByPositionId[id]!.payrollFundingRef,
          );
          expect(BigInt(a.totalMinutes)).toBe(BigInt(a.workerCount) * 480n);
          cursor += BigInt(a.workerCount);
        }
        expect(cursor).toBe(
          BigInt(original.startOrdinal) + BigInt(original.count),
        );
        expect(sum(assignments.map((a) => a.totalMinutes))).toBe(
          BigInt(p.filledCount) * 480n,
        );
      }
    }
    expect(document.policy.futurePaymentCondition).toContain(
      'SEPARATE_LAWFUL_FUNDED_CONTRACT',
    );
    expect(funding.paymentsGenerated).toBe(false);
  });
  it('keeps joint LOW/MEDIUM/HIGH lane capacity within every original finite stage-minute body', () => {
    for (const c of document.countries)
      for (const body of c.physicalDayBodies) {
        const original = c.physicalOriginalBodies.find(
          (o) => o.locationId === body.locationId,
        )!;
        expect(original).not.toHaveProperty('headWorldVersion');
        expect(original).not.toHaveProperty('headEventSequence');
        expect({
          ...original,
          headWorldVersion: '0',
          headEventSequence: '0',
        }).toEqual(body);
        for (const stage of body.stages) {
          const charged = body.pools.reduce(
            (a, l) =>
              a +
              BigInt(
                c.state.servicePools.find((p) => p.poolId === l.poolId)!
                  .capacitySlots,
              ) *
                BigInt(stage.minutesPerOpportunity[l.skill]),
            0n,
          );
          expect(charged).toBeLessThanOrEqual(BigInt(stage.availableMinutes));
        }
      }
  });
  it('re-derives serialized source bytes using Core and refuses countries outside the source', () => {
    const parsed = validatePostwarSocialEmploymentStateDocument(
      JSON.parse(canonicalSerialize(document)),
    );
    expect(parsed).toEqual(document);
    expect(() =>
      selectPostwarSocialEmploymentCountry(document, 'COUNTRY_71'),
    ).toThrow('country outside');
  });
  it.each([
    {
      name: 'changed Core employment',
      mutate: (d: typeof document) => {
        (
          d.state.labour.positions[0] as { employedCount: string }
        ).employedCount = '0';
      },
    },
    {
      name: 'forged active validation offer',
      mutate: (d: typeof document) => {
        (
          d.countries[0]!.validationReadFacts.facts.offer as { state: string }
        ).state = 'ACTIVE';
      },
    },
    {
      name: 'unfunded payroll reservation',
      mutate: (d: typeof document) => {
        (
          d.inputs.positionFunding[0] as { uncoveredReservationAmount: string }
        ).uncoveredReservationAmount = '1';
      },
    },
    {
      name: 'inflated worker duties',
      mutate: (d: typeof document) => {
        (
          d.countries[0]!.dutyAssignments[0] as { totalMinutes: string }
        ).totalMinutes = '999999999999';
      },
    },
  ])('refuses $name through the complete source validator', ({ mutate }) => {
    const changed = JSON.parse(canonicalSerialize(document)) as typeof document;
    mutate(changed);
    expect(() =>
      validatePostwarSocialEmploymentStateDocument(changed),
    ).toThrow();
  });
  it('requires true source issuers and full Core state; re-running the same sources produces identical bytes', () => {
    expect(() =>
      createPostwarSocialEmploymentState({ ...input, funding: { ...funding } }),
    ).toThrow();
    expect(() =>
      createPostwarSocialEmploymentState({
        ...input,
        populationFacts: { ...populationFacts },
      }),
    ).toThrow();
    expect(() => consumePostwarSocialEmploymentState({ ...prep })).toThrow();
    const changed = structuredClone(materialized.state) as LabourEngineState;
    (changed.positions[0] as { employedCount: string }).employedCount = '0';
    expect(() =>
      createPostwarSocialEmploymentState({ ...input, labourState: changed }),
    ).toThrow('supplied full Core');
    expect(
      canonicalSerialize(
        consumePostwarSocialEmploymentState(
          createPostwarSocialEmploymentState(input),
        ),
      ),
    ).toBe(canonicalSerialize(document));
  });
});
