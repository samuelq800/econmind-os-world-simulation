/** TEST_ONLY Core calculation; real seat/source/SQL custody tested by runtime. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  applyLabourFacts,
  canonicalSerialize,
  createE01DailyBoundary,
  materializeOpeningLabourState,
  parseCanonicalCommand,
  eventId,
  eventType,
  SOCIAL_LABOUR_PROGRAMME_CREATE_COMMAND,
  SOCIAL_LABOUR_PROGRAMME_APPLY_COMMAND,
  SOCIAL_LABOUR_PROGRAMME_APPLIED_EVENT,
  prepareSocialLabourProgrammeCreation,
  prepareSocialLabourProgrammeApplication,
  parseSocialLabourProgrammeApplyIntent,
  readSocialLabourProgrammeApplications,
  reduceSocialLabourProgrammeAppliedEvent,
  createSocialEmploymentServiceReplayReducers,
  type SocialEmploymentServiceState,
  type SocialLabourProgrammeReadFacts,
  type ReplayReducerEvent,
} from '../../packages/core/src/index.js';
import {
  parseSocialProgrammeApplicationIntentDto,
  parseSocialProgrammeApplicationRowDto,
} from '../../packages/core/src/commands/social-labour-programme-public-contract.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const country = 'COUNTRY_01',
  location = 'REGION_01_E1',
  world = 'WORLD_TEST_ONLY_APPLICATION';
function command(payload: unknown, change: Record<string, unknown> = {}) {
  return parseCanonicalCommand(
    {
      schemaVersion: 'command-v1',
      worldId: world,
      countryId: country,
      officeId: 'SOCIAL',
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: 'COMMAND_APPLICATION_TEST_ONLY',
      idempotencyKey: 'COMMAND_APPLICATION_TEST_ONLY',
      commandType: SOCIAL_LABOUR_PROGRAMME_APPLY_COMMAND,
      expectedWorldVersion: '1',
      simTime: '10001',
      submittedAtReal: '2026-11-16T00:00:00.000Z',
      correlationId: 'TRACE_TEST_ONLY',
      payload,
      ...change,
    },
    sha,
  );
}
function fixture(
  kind: 'RELOCATION_SUPPORT' | 'RETURN_TO_WORK' = 'RELOCATION_SUPPORT',
) {
  const populationAvailability = [
      { countryId: country, locationId: location, workingAgeAvailable: '22' },
    ],
    scope = { countryId: country, locationId: location, skill: 'LOW' as const };
  const state: SocialEmploymentServiceState = {
    schemaVersion: 'social-employment-service-state-v1',
    worldId: world,
    labour: materializeOpeningLabourState({
      targets: [],
      positions: [],
      populationAvailability,
      skillAvailability: [{ ...scope, count: '22' }],
      nonEmployedAggregates: [
        { ...scope, status: 'UNEMPLOYED_SEARCHING', count: '22' },
      ],
      employers: [],
    }).state,
    servicePools: [],
    plans: [],
    appliedOperations: [],
  };
  const facts: SocialLabourProgrammeReadFacts = {
    worldId: world,
    countryId: country,
    boundary: createE01DailyBoundary('0'),
    simTime: '10000',
    populationAvailability,
    head: { worldVersion: '0', eventSequence: '0' },
    localCurrency: 'XAA',
    sourceRef: 'SOURCE_TEST_ONLY',
    sourceFingerprint: `sha256:${'1'.repeat(64)}`,
    sourceRevocations: [],
  };
  const creation = command(
    {
      schemaVersion: 'social-labour-programme-create-v1',
      programmeId: 'PROGRAMME_TEST_ONLY',
      ...(kind === 'RELOCATION_SUPPORT'
        ? {
            kind,
            locationId: location,
            participants: '2',
            benefit: { amount: '3', currency: 'XAA' },
          }
        : {
            kind,
            eligible: 'TEST_ONLY_PROPOSED_CONDITION_NOT_APPROVED',
            capacity: '2',
            duration: { amount: '5', unit: 'SIM_DAY' },
          }),
    },
    {
      commandType: SOCIAL_LABOUR_PROGRAMME_CREATE_COMMAND,
      commandId: 'COMMAND_CREATION_TEST_ONLY',
      idempotencyKey: 'COMMAND_CREATION_TEST_ONLY',
      expectedWorldVersion: '0',
      simTime: '10000',
    },
  );
  const created = prepareSocialLabourProgrammeCreation({
    command: creation,
    state,
    readFacts: facts,
    sha256Hex: sha,
  });
  const intent = {
    schemaVersion: 'social-labour-programme-apply-v1',
    programmeId: 'PROGRAMME_TEST_ONLY',
    programmeCommandFingerprint: creation.fingerprint,
    applicationId: 'APPLICATION_TEST_ONLY',
    applicant: {
      locationId: location,
      skill: 'LOW',
      status: 'UNEMPLOYED_SEARCHING',
    },
  };
  return {
    state: created.state,
    creation,
    intent,
    facts: {
      ...facts,
      simTime: '10001',
      head: { worldVersion: '1', eventSequence: '1' },
    },
    historical: state,
  };
}
function apply(f = fixture(), c = command(f.intent)) {
  return prepareSocialLabourProgrammeApplication({
    command: c,
    state: f.state,
    readFacts: f.facts,
    sha256Hex: sha,
  });
}
function event(
  f: ReturnType<typeof fixture>,
  result: ReturnType<typeof apply>,
): ReplayReducerEvent {
  const c = command(f.intent);
  return {
    transitionId: c.commandId,
    worldId: c.worldId,
    eventId: eventId('EVENT_APPLICATION_TEST_ONLY'),
    causationCommandId: c.commandId,
    correctsEventId: null,
    eventType: eventType(SOCIAL_LABOUR_PROGRAMME_APPLIED_EVENT),
    sequence: '2',
    worldVersionBefore: '1',
    worldVersionAfter: '2',
    simTime: c.simTime,
    payload: result.eventPayload,
  };
}
describe('Social whole current group application, not eligibility or funding', () => {
  it('derives actual people and preserves every existing economic field and old state shape', () => {
    const f = fixture(),
      old = canonicalSerialize(f.state),
      result = apply(f);
    expect(f.historical).not.toHaveProperty('programmeApplications');
    expect(f.state).not.toHaveProperty('programmeApplications');
    expect(canonicalSerialize(f.state)).toBe(old);
    const { programmeApplications, ...same } = result.state;
    expect(same).toEqual(f.state);
    expect(programmeApplications).toHaveLength(1);
    expect(programmeApplications![0]!.personCount).toBe('22');
    // Applicants may exceed proposed places: application != capacity allocation.
    expect(result.result).toEqual({
      programmeId: f.intent.programmeId,
      applicationId: f.intent.applicationId,
      personCount: '22',
      status: 'APPLIED',
      classification:
        'APPLICATION_ONLY_NOT_ELIGIBILITY_APPROVAL_FUNDING_OR_SERVICE',
    });
    const page = readSocialLabourProgrammeApplications({
      state: result.state,
      countryId: country,
      offset: 0,
      limit: 1,
      sha256Hex: sha,
    });
    expect(page.total).toBe(1);
    expect(page.nextOffset).toBeNull();
    expect(
      readSocialLabourProgrammeApplications({
        state: result.state,
        countryId: country,
        offset: 1,
        limit: 1,
        sha256Hex: sha,
      }),
    ).toEqual({ rows: [], total: 1, nextOffset: null });

    expect(page.rows[0]!.reviewFacts).toMatchObject({
      currentGroupPersonCount: '22',
      membership: 'UNCHANGED_LABOUR_SNAPSHOT',
      proposedCapacity: '2',
      capacityComparison: 'EXCEEDS_PROPOSED_CAPACITY',
      locationRelation: 'SAME_REGION',
      eligibility: 'NOT_VERIFIED',
      budgetBinding: 'NO_APPROVED_PROGRAMME_BUDGET_LINK',
      payment: 'NOT_SCHEDULED',
    });
    for (const bad of [
      { eligibility: 'VERIFIED' },
      { payment: 'PAID' },
      { currentGroupPersonCount: '21' },
      { proposedCapacity: '22' },
      { locationRelation: 'CROSS_REGION' },
    ]) {
      expect(() =>
        parseSocialProgrammeApplicationRowDto({
          ...page.rows[0],
          reviewFacts: { ...page.rows[0]!.reviewFacts, ...bad },
        }),
      ).toThrow();
    }

    expect(parseSocialProgrammeApplicationRowDto(page.rows[0])).toEqual(
      page.rows[0],
    );
    expect(
      readSocialLabourProgrammeApplications({
        state: result.state,
        countryId: 'COUNTRY_02',
        offset: 0,
        limit: 1,
        sha256Hex: sha,
      }).rows,
    ).toEqual([]);
    expect(
      readSocialLabourProgrammeApplications({
        state: result.state,
        countryId: country,
        programmeId: 'PROGRAMME_OTHER',
        offset: 0,
        limit: 1,
        sha256Hex: sha,
      }).rows,
    ).toEqual([]);
  });
  it('exposes proposed return-to-work conditions without inventing a long-term threshold, budget or eligibility', () => {
    const f = fixture('RETURN_TO_WORK'),
      result = apply(f);
    const current = readSocialLabourProgrammeApplications({
      state: result.state,
      countryId: country,
      offset: 0,
      limit: 1,
      sha256Hex: sha,
    }).rows[0]!;
    expect(current.reviewFacts).toMatchObject({
      terms: {
        kind: 'RETURN_TO_WORK',
        eligible: 'TEST_ONLY_PROPOSED_CONDITION_NOT_APPROVED',
        capacity: '2',
        duration: { amount: '5', unit: 'SIM_DAY' },
      },
      locationRelation: 'NOT_APPLICABLE',
      eligibility: 'NOT_VERIFIED',
      budgetBinding: 'NO_APPROVED_PROGRAMME_BUDGET_LINK',
      payment: 'NOT_SCHEDULED',
    });
    expect(parseSocialProgrammeApplicationRowDto(current)).toEqual(current);
    expect(current.reviewFacts).not.toHaveProperty('eligiblePeople');
    expect(current.reviewFacts).not.toHaveProperty('nonEmploymentDuration');
  });
  it('replays exactly, rejects changed derived counts and restores duplicates without reevaluating current group size', () => {
    const f = fixture(),
      result = apply(f),
      e = event(f, result);
    expect(
      reduceSocialLabourProgrammeAppliedEvent({
        state: f.state,
        event: e,
        sha256Hex: sha,
      }),
    ).toEqual(result.state);
    expect(createSocialEmploymentServiceReplayReducers(sha)).toHaveProperty(
      SOCIAL_LABOUR_PROGRAMME_APPLIED_EVENT,
    );
    expect(apply({ ...f, state: result.state })).toMatchObject({
      source: 'EXACT_DUPLICATE',
      eventPayload: null,
      result: result.result,
    });
    const changedState = {
      ...result.state,
      labour: {
        ...result.state.labour,
        aggregates: [
          { ...result.state.labour.aggregates[0]!, count: '20' },
          {
            ...result.state.labour.aggregates[0]!,
            status: 'NOT_IN_LABOUR_FORCE' as const,
            count: '2',
          },
        ],
      },
    };
    expect(apply({ ...f, state: changedState })).toMatchObject({
      source: 'EXACT_DUPLICATE',
      result: { personCount: '22' },
    });
    for (const changed of [
      { ...e, sequence: '3' },
      { ...e, worldVersionAfter: '3' },
    ])
      expect(() =>
        reduceSocialLabourProgrammeAppliedEvent({
          state: f.state,
          event: changed,
          sha256Hex: sha,
        }),
      ).toThrow();
    const payload = JSON.parse(canonicalSerialize(result.eventPayload));
    payload.result.personCount = '21';
    expect(() =>
      reduceSocialLabourProgrammeAppliedEvent({
        state: f.state,
        event: { ...e, payload },
        sha256Hex: sha,
      }),
    ).toThrow();
  });
  it('rejects unknown groups, stale programmes/source/head and client-supplied people or eligibility', () => {
    const f = fixture();
    for (const applicant of [
      { ...f.intent.applicant, locationId: 'REGION_02_E1' },
      { ...f.intent.applicant, skill: 'HIGH' },
      { ...f.intent.applicant, status: 'EMPLOYED' },
      { ...f.intent.applicant, status: 'ELIGIBLE' },
    ])
      expect(() => apply(f, command({ ...f.intent, applicant }))).toThrow();
    expect(() =>
      apply(
        f,
        command({
          ...f.intent,
          programmeCommandFingerprint: `sha256:${'3'.repeat(64)}`,
        }),
      ),
    ).toThrow();
    expect(() =>
      apply({ ...f, state: { ...f.state, programmes: [] } }),
    ).toThrow();
    expect(() =>
      apply({ ...f, facts: { ...f.facts, sourceRevocations: ['REVOKED'] } }),
    ).toThrow();
    expect(() =>
      apply({ ...f, facts: { ...f.facts, countryId: 'COUNTRY_02' } }),
    ).toThrow();
    expect(() =>
      apply({
        ...f,
        facts: { ...f.facts, head: { worldVersion: '2', eventSequence: '2' } },
      }),
    ).toThrow();
    expect(() =>
      apply(f, command(f.intent, { officeId: 'FINANCE' })),
    ).toThrow();
    for (const extra of [
      { personCount: '1' },
      { eligible: true },
      { sourceRef: 'ARBITRARY_SOURCE' },
    ]) {
      expect(() =>
        parseSocialLabourProgrammeApplyIntent({ ...f.intent, ...extra }),
      ).toThrow();
      expect(() =>
        parseSocialProgrammeApplicationIntentDto({ ...f.intent, ...extra }),
      ).toThrow();
    }
  });
  it('rejects duplicate application and group identity under a distinct command', () => {
    const f = fixture(),
      result = apply(f),
      next = {
        ...f,
        state: result.state,
        facts: { ...f.facts, head: { worldVersion: '2', eventSequence: '2' } },
      };
    for (const intent of [
      f.intent,
      { ...f.intent, applicationId: 'APPLICATION_SECOND' },
    ])
      expect(() =>
        apply(
          next,
          command(intent, {
            commandId: 'COMMAND_OTHER',
            idempotencyKey: 'COMMAND_OTHER',
            expectedWorldVersion: '2',
          }),
        ),
      ).toThrow('unique programme application');
  });
  it('refuses status-crossing group overlap after actual Core matching, while recovering the original receipt', () => {
    const f = fixture(),
      first = apply(f),
      common = {
        countryId: country,
        locationId: location,
        dayIndex: '0',
        skill: 'LOW' as const,
      };
    const demand = applyLabourFacts({
      state: first.state.labour,
      boundary: f.facts.boundary,
      populationAvailability: f.facts.populationAvailability,
      facts: [
        {
          ...common,
          kind: 'PRIVATE_JOB_DEMAND_SET',
          factId: 'TEST_ONLY_DEMAND',
          positionId: 'TEST_ONLY_POSITION',
          sectorId: 'INDUSTRY',
          requiredCount: '2',
        },
      ],
    }).state;
    const labour = applyLabourFacts({
      state: demand,
      boundary: f.facts.boundary,
      populationAvailability: f.facts.populationAvailability,
      facts: [
        {
          ...common,
          kind: 'JOB_MATCH',
          factId: 'TEST_ONLY_MATCH',
          positionId: 'TEST_ONLY_POSITION',
          count: '2',
        },
      ],
    }).state;
    const next = {
      ...f,
      state: { ...first.state, labour },
      facts: { ...f.facts, head: { worldVersion: '3', eventSequence: '3' } },
    };
    const before = canonicalSerialize(next.state);
    expect(() =>
      apply(
        next,
        command(
          {
            ...f.intent,
            applicationId: 'APPLICATION_EMPLOYED',
            applicant: { ...f.intent.applicant, status: 'EMPLOYED' },
          },
          {
            commandId: 'COMMAND_EMPLOYED',
            idempotencyKey: 'COMMAND_EMPLOYED',
            expectedWorldVersion: '3',
          },
        ),
      ),
    ).toThrow('GROUP_MEMBERSHIP_CHANGED_INDIVIDUAL_MAPPING_REQUIRED');
    expect(canonicalSerialize(next.state)).toBe(before);
    const current = readSocialLabourProgrammeApplications({
      state: next.state,
      countryId: country,
      offset: 0,
      limit: 10,
      sha256Hex: sha,
    }).rows[0]!;
    expect(current.personCount).toBe('22');
    expect(current.reviewFacts).toMatchObject({
      currentGroupPersonCount: '20',
      membership: 'UNRESOLVED_AFTER_LABOUR_CHANGE',
      eligibility: 'NOT_VERIFIED',
      payment: 'NOT_SCHEDULED',
    });
    expect(parseSocialProgrammeApplicationRowDto(current)).toEqual(current);

    expect(apply(next)).toMatchObject({
      source: 'EXACT_DUPLICATE',
      result: { personCount: '22' },
    });
  });
});
