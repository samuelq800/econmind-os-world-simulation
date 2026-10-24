import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_JOB_MATCH_RULE_VERSION,
  createE01DailyBoundary,
  materializeOpeningLabourState,
  parseCanonicalCommand,
  prepareSocialEmploymentServiceOperation,
  type SocialEmploymentReadFacts,
  type SocialEmploymentServiceState,
} from '@econmind/core';
import {
  consumeSocialModelCandidate,
  mapSocialCandidateWageWindows,
  type SocialModelCandidateInput,
  type SocialCandidateSourceWindow,
} from '../../apps/world-worker/src/preparation/social-model-candidate-consumer.js';
import type { SocialEmploymentRuntimeSnapshotReader } from '../../apps/world-worker/src/persistence/social-job-match-candidate-source.js';

const root = new URL('../../', import.meta.url);
const data = new URL(
  'data/scenario-candidates/social-c01-independent-demand-v2/',
  root,
);
const input = {
  modelOptionsJson: readFileSync(
    new URL('model-options.v2.json', data),
    'utf8',
  ),
  independentDemandJson: readFileSync(
    new URL('independent-demand.v2.json', data),
    'utf8',
  ),
  wageInputJson: readFileSync(new URL('wage-input.v1.json', data), 'utf8'),
};
const options = JSON.parse(input.modelOptionsJson) as {
  models: { id: string; demandProfile: string }[];
};
const high = options.models.filter(
  (m) => m.demandProfile === 'HIGH_CONTACT_TIME',
);
const moderate = options.models.filter((m) => m.demandProfile === 'MODERATE');
const consume = (modelId = high[0]!.id) =>
  consumeSocialModelCandidate({ ...input, modelId });
const sourceWindow = {
  validFromDayIndex: '0',
  validUntilDayIndex: '29',
  inclusiveEndpoints: true,
  durationE01Days: '30',
} as const;
const cli = (...args: string[]) =>
  spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('tools/unknown2544-social-candidate/consume.mjs', root),
      ),
      ...args,
    ],
    { cwd: fileURLToPath(root), encoding: 'utf8' },
  );

describe('exact inert Social model candidate consumption', () => {
  it.each(high)('consumes real $id without selecting/adopting it', ({ id }) => {
    const result = consume(id);
    expect(result.status).toBe('CANDIDATE_CONSUMED');
    expect(result.previewModelId).toBe(id);
    expect(String(result.candidateModel.id)).toBe(id);
    expect(result.candidateWageVersion.id).toBe(
      result.candidateModel.wageVersion,
    );
    expect(Object.keys(result.candidateIndependentDemand)).toHaveLength(6);
    expect(result.authority).toEqual({
      selected: false,
      adopted: false,
      sourceAdmitted: false,
      runtimeReady: false,
      formalSourceInputReady: false,
      operatingReady: false,
      executionEligible: false,
      actualCash: null,
      actualEmployerBinding: null,
      actualLawfulFundedOffers: null,
      actualInputs: null,
      actualCustodian: 'SUPPLIER_UNCONFIRMED',
      physicalDailyAttemptTimeEnvelope: 'OPEN',
      WorldClock: false,
    });
    expect(result.wageWindows.offer).toEqual({
      validFromDayIndex: '0',
      validUntilDayIndex: '30',
    });
    expect(result.wageWindows.minimumWage).toEqual(result.wageWindows.offer);
    expect(result.wageWindows.minimumWage).not.toBe(result.wageWindows.offer);
  });
  it.each(moderate)(
    'rejects incomplete $id without filling source employment',
    ({ id }) => {
      expect(() => consume(id)).toThrow('incomplete source employment');
    },
  );
  it.each(['', 'UNKNOWN', high[0]!.id + ',' + high[1]!.id])(
    'requires one explicit known ID (%s)',
    (id) => {
      expect(() => consume(id)).toThrow();
    },
  );
  it('rejects missing selection and caller authority overrides', () => {
    expect(() =>
      consumeSocialModelCandidate(input as SocialModelCandidateInput),
    ).toThrow('missing/unknown');
    for (const override of [
      'adopted',
      'sourceAdmitted',
      'WorldClock',
      'selectedModel',
      'sourcePath',
    ]) {
      expect(() =>
        consumeSocialModelCandidate({
          ...input,
          modelId: high[0]!.id,
          [override]: true,
        }),
      ).toThrow('missing/unknown');
    }
  });
  it.each([
    'modelOptionsJson',
    'independentDemandJson',
    'wageInputJson',
  ] as const)('rejects corrupt/foreign bytes in %s', (key) => {
    expect(() =>
      consumeSocialModelCandidate({
        ...input,
        modelId: high[0]!.id,
        [key]: input[key] + '\n',
      }),
    ).toThrow('identity mismatch');
  });
  it.each([
    [
      'modelOptionsJson',
      'G_C01_TASK_BASED_SUCCESSOR_OPTIONS_V2',
      'FOREIGN_VERSION',
    ],
    ['modelOptionsJson', 'COUNTRY_01', 'COUNTRY_02'],
    ['wageInputJson', 'REGION_01_E1', 'FOREIGN_LOCATION'],
  ] as const)(
    'rejects changed source schema/scope (%s %s)',
    (key, from, to) => {
      expect(() =>
        consumeSocialModelCandidate({
          ...input,
          modelId: high[0]!.id,
          [key]: input[key].replaceAll(from, to),
        }),
      ).toThrow('identity mismatch');
    },
  );
  it('owns all nested output and cannot satisfy the formal reader port', () => {
    const result = consume();
    const before = JSON.stringify(result);
    expect(() =>
      Reflect.set(result.candidateModel, 'id', 'MUTATED'),
    ).not.toThrow();
    expect(Reflect.set(result.candidateModel, 'id', 'MUTATED')).toBe(false);
    expect(Object.isFrozen(result.candidateModel.positions)).toBe(true);
    expect(
      Object.isFrozen(
        result.candidateIndependentDemand.RETAIL_CONSUMER_DISTRIBUTION,
      ),
    ).toBe(true);
    expect(
      Reflect.set(result.wageWindows.offer, 'validUntilDayIndex', '31'),
    ).toBe(false);
    expect(Reflect.set(result.authority, 'adopted', true)).toBe(false);
    expect(JSON.stringify(result)).toBe(before);
    expect(consume().candidateModel).not.toBe(result.candidateModel);
    for (const key of [
      'readFrom',
      'state',
      'readFacts',
      'provenance',
      'headWorldVersion',
      'headEventSequence',
    ])
      expect(Object.hasOwn(result, key)).toBe(false);
    // @ts-expect-error Candidate preparation has no readFrom and cannot implement the formal port.
    const formalReader: SocialEmploymentRuntimeSnapshotReader = result;
    expect(formalReader).toBe(result);
  });
  it.each(high)('normal Worker dist CLI consumes $id identically', ({ id }) => {
    const run = cli('--model-id', id);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stderr).toBe('');
    expect(JSON.parse(run.stdout)).toEqual(consume(id));
  });
  it.each(moderate)('normal CLI rejects $id with empty stdout', ({ id }) => {
    const run = cli('--model-id', id);
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain('incomplete source employment');
  });
  it.each(
    [
      [],
      ['--model-id'],
      ['--model-id', 'UNKNOWN'],
      ['--model-id', high[0]!.id, '--model-id', high[1]!.id],
      ['--source', '/tmp/foreign.json'],
    ].map((args) => ({ args })),
  )('CLI rejects invalid arguments $args', ({ args }) => {
    const run = cli(...args);
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
  });
});

describe('single inclusive to half-open bridge', () => {
  it.each([
    { inclusiveEndpoints: false },
    { inclusiveEndpoints: undefined },
    { validFromDayIndex: '-1' },
    { validUntilDayIndex: '029' },
    { validUntilDayIndex: '30' },
    { durationE01Days: '0' },
    { validFromDayIndex: '30' },
    { validUntilDayIndex: '2.9' },
    {
      validUntilDayIndex: '9223372036854775807',
      durationE01Days: '9223372036854775808',
    },
    {
      validFromDayIndex: '9223372036854775807',
      validUntilDayIndex: '9223372036854775807',
      durationE01Days: '1',
    },
    { validUntilDayIndex: '9223372036854775808' },
    { validUntilDayIndex: 29 },
    { targetConvention: 'HALF_OPEN' },
  ])('rejects unknown/invalid/double conversion %j', (delta) => {
    expect(() =>
      mapSocialCandidateWageWindows({
        ...sourceWindow,
        ...delta,
      } as SocialCandidateSourceWindow),
    ).toThrow();
  });
  it('detaches source metadata and keeps Core fragments closed', () => {
    const source = { ...sourceWindow, validUntilDayIndex: String('29') };
    const mapped = mapSocialCandidateWageWindows(source);
    source.validUntilDayIndex = '30';
    expect(Object.keys(mapped.offer).sort()).toEqual([
      'validFromDayIndex',
      'validUntilDayIndex',
    ]);
    expect(Object.keys(mapped.minimumWage).sort()).toEqual([
      'validFromDayIndex',
      'validUntilDayIndex',
    ]);
    expect(mapped.sourceConvention).toEqual({
      ...sourceWindow,
      targetConvention: 'HALF_OPEN',
      conversionCount: 1,
    });
    expect(Object.isFrozen(mapped.sourceConvention)).toBe(true);
    expect(() =>
      mapSocialCandidateWageWindows({ ...sourceWindow, ...mapped.offer }),
    ).toThrow('repeated conversion');
  });
});

/** Synthetic TEST_ONLY Core fixture: candidate employers/funding/state are never admitted. */
function coreFixture(day: string, changed: 'offer' | 'minimumWage' | 'both') {
  const scope = {
    countryId: 'COUNTRY_01',
    locationId: 'REGION_01_E1',
    skill: 'LOW' as const,
  };
  const populationAvailability = [
    {
      countryId: scope.countryId,
      locationId: scope.locationId,
      workingAgeAvailable: '7',
    },
  ];
  const opening = materializeOpeningLabourState({
    targets: [{ ...scope, count: '2' }],
    positions: [
      {
        ...scope,
        positionId: 'TEST_POSITION',
        requiredCount: '6',
        sourceWeight: '1',
        owner: 'PRIVATE_SECTOR',
        classificationId: 'SECTOR_FOOD',
        employerId: 'TEST_EMPLOYER',
        employerRole: 'OP',
        occupation: 'GENERAL',
        wageAmount: '2.5',
        wageCurrency: 'GCU',
        wagePeriod: 'SIM_HOUR',
        wageVersion: 'TEST_WAGE',
        payrollFundingRef: 'TEST_PAYROLL_ONLY',
      },
    ],
    populationAvailability,
    skillAvailability: [{ ...scope, count: '7' }],
    nonEmployedAggregates: [
      { ...scope, status: 'UNEMPLOYED_SEARCHING', count: '5' },
    ],
    employers: [
      { countryId: scope.countryId, employerId: 'TEST_EMPLOYER', role: 'OP' },
    ],
  });
  const state: SocialEmploymentServiceState = {
    schemaVersion: 'social-employment-service-state-v1',
    worldId: 'WORLD_TEST_01',
    labour: opening.state,
    servicePools: [
      {
        ...scope,
        poolId: 'TEST_POOL',
        dayIndex: day,
        ruleVersion: SOCIAL_JOB_MATCH_RULE_VERSION,
        capacitySlots: '3',
        usedSlots: '0',
        reservedSlots: '0',
      },
    ],
    plans: [],
    appliedOperations: [],
  };
  const mapped = consume().wageWindows;
  const broad = { validFromDayIndex: '0', validUntilDayIndex: '100' };
  const readFacts: SocialEmploymentReadFacts = {
    boundary: createE01DailyBoundary(day),
    simTime: '10000',
    populationAvailability,
    offer: {
      ...scope,
      positionId: 'TEST_POSITION',
      employerId: 'TEST_EMPLOYER',
      employerRole: 'OP',
      legalPositionRef: 'TEST_LEGAL_ONLY',
      payrollFundingRef: 'TEST_PAYROLL_ONLY',
      offerVersion: 'TEST_OFFER',
      state: 'ACTIVE',
      wageVersion: 'TEST_WAGE',
      amount: '2.5',
      currency: 'GCU',
      period: 'SIM_HOUR',
      ...(changed === 'minimumWage' ? broad : mapped.offer),
    },
    minimumWage: {
      countryId: scope.countryId,
      ruleId: 'TEST_MINIMUM',
      ruleVersion: 'TEST_MINIMUM_V1',
      amount: '2',
      currency: 'GCU',
      period: 'SIM_HOUR',
      ...(changed === 'offer' ? broad : mapped.minimumWage),
    },
  };
  const digest = (value: string) =>
    createHash('sha256').update(value).digest('hex');
  const command = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      actorId: 'ACTOR_SOCIAL',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: 'TEST_PLAN',
      commandType: SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      correlationId: 'TEST_TRACE',
      countryId: scope.countryId,
      worldId: 'WORLD_TEST_01',
      officeId: 'SOCIAL',
      expectedWorldVersion: '0',
      idempotencyKey: 'TEST_IDEM',
      simTime: '10000',
      submittedAtReal: '2026-10-07T00:00:01.000Z',
      payload: {
        schemaVersion: 'social-employment-service-plan-v1',
        locationId: scope.locationId,
        skill: scope.skill,
        positionId: 'TEST_POSITION',
        servicePoolId: 'TEST_POOL',
        requestedMatches: '1',
        dueDayIndex: day,
      },
    },
    digest,
  );
  return () =>
    prepareSocialEmploymentServiceOperation({
      command,
      state,
      readFacts,
      sha256Hex: digest,
    });
}

describe.each(['offer', 'minimumWage', 'both'] as const)(
  'actual Core TEST_ONLY window eligibility: %s',
  (changed) => {
    it.each(['0', '29'])('accepts day %s', (day) => {
      const prepared = coreFixture(day, changed)();
      expect(prepared.result.kind).toBe('PLAN');
      expect(prepared.state.servicePools[0]!.reservedSlots).toBe('1');
      expect(prepared.result.matched).toBe('0');
    });
    it('rejects day 30 through existing Core offer guard', () => {
      expect(coreFixture('30', changed)).toThrow(
        'current eligible legal position/offer',
      );
    });
  },
);
