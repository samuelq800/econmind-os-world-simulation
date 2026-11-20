/** TEST_ONLY terms lifecycle; no source custody, approval or DB acceptance. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalSerialize,
  createE01DailyBoundary,
  materializeOpeningLabourState,
  parseCanonicalCommand,
  eventId,
  eventType,
  SOCIAL_LABOUR_PROGRAMME_CREATE_COMMAND,
  SOCIAL_LABOUR_PROGRAMME_CREATED_EVENT,
  prepareSocialLabourProgrammeCreation,
  parseSocialLabourProgrammeCreateIntent,
  readSocialLabourProgrammes,
  reduceSocialLabourProgrammeCreatedEvent,
  type SocialEmploymentServiceState,
  type SocialLabourProgrammeReadFacts,
  type ReplayReducerEvent,
} from '../../packages/core/src/index.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const country = 'COUNTRY_01',
  location = 'REGION_01_E1',
  world = 'WORLD_TEST_ONLY_PROGRAMME';
function fixture() {
  const populationAvailability = [
    { countryId: country, locationId: location, workingAgeAvailable: '22' },
  ];
  const scope = {
    countryId: country,
    locationId: location,
    skill: 'LOW' as const,
  };
  const labour = materializeOpeningLabourState({
    targets: [],
    positions: [],
    populationAvailability,
    skillAvailability: [{ ...scope, count: '22' }],
    nonEmployedAggregates: [
      { ...scope, status: 'UNEMPLOYED_SEARCHING', count: '22' },
    ],
    employers: [],
  }).state;
  const state: SocialEmploymentServiceState = {
    schemaVersion: 'social-employment-service-state-v1',
    worldId: world,
    labour,
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
  return { state, facts };
}
const relocation = {
  schemaVersion: 'social-labour-programme-create-v1',
  programmeId: 'PROGRAMME_RELOCATION_TEST_ONLY',
  kind: 'RELOCATION_SUPPORT',
  locationId: location,
  participants: '12',
  benefit: { amount: '3', currency: 'XAA' },
};
const returning = {
  schemaVersion: 'social-labour-programme-create-v1',
  programmeId: 'PROGRAMME_RETURN_TEST_ONLY',
  kind: 'RETURN_TO_WORK',
  eligible: 'Proposed eligibility requires verified duration of non-employment',
  capacity: '5',
  duration: { amount: '12', unit: 'SIM_DAY' },
};
function command(
  payload: unknown = relocation,
  change: Record<string, unknown> = {},
) {
  return parseCanonicalCommand(
    {
      schemaVersion: 'command-v1',
      worldId: world,
      countryId: country,
      officeId: 'SOCIAL',
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: 'COMMAND_PROGRAMME_TEST_ONLY',
      idempotencyKey: 'COMMAND_PROGRAMME_TEST_ONLY',
      commandType: SOCIAL_LABOUR_PROGRAMME_CREATE_COMMAND,
      expectedWorldVersion: '0',
      simTime: '10000',
      submittedAtReal: '2026-11-13T00:00:00.000Z',
      correlationId: 'TRACE_TEST_ONLY',
      payload,
      ...change,
    },
    sha,
  );
}
function execute(payload: unknown = relocation) {
  const f = fixture(),
    c = command(payload);
  return {
    ...f,
    c,
    result: prepareSocialLabourProgrammeCreation({
      command: c,
      state: f.state,
      readFacts: f.facts,
      sha256Hex: sha,
    }),
  };
}
describe('Social explicit pending programme registration', () => {
  it('retains the exact old slice and registers both parameter sets without labour, capacity or money effects', () => {
    for (const intent of [relocation, returning]) {
      const { state, result } = execute(intent);
      expect(state).not.toHaveProperty('programmes');
      const { programmes, ...withoutProgrammes } = result.state;
      expect(withoutProgrammes).toEqual(state);
      expect(programmes).toHaveLength(1);
      expect(programmes![0]!.status).toBe('PENDING_REVIEW');
      const page = readSocialLabourProgrammes({
        state: result.state,
        countryId: country,
        offset: 0,
        limit: 1,
        sha256Hex: sha,
      });
      expect(page.rows[0]!.terms).toEqual(intent);
      expect(page.rows[0]).not.toHaveProperty('approved');
      expect(page.rows[0]).not.toHaveProperty('funded');
      expect(
        readSocialLabourProgrammes({
          state: result.state,
          countryId: 'COUNTRY_02',
          offset: 0,
          limit: 1,
          sha256Hex: sha,
        }).rows,
      ).toEqual([]);
    }
  });
  it('replays the same event, recovers duplicates and rejects tampering or repeated programme identities', () => {
    const { state, facts, c, result } = execute();
    const event: ReplayReducerEvent = {
      transitionId: c.commandId,
      worldId: c.worldId,
      eventId: eventId('EVENT_TEST_ONLY'),
      causationCommandId: c.commandId,
      correctsEventId: null,
      eventType: eventType(SOCIAL_LABOUR_PROGRAMME_CREATED_EVENT),
      sequence: '1',
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: c.simTime,
      payload: result.eventPayload,
    };
    expect(
      reduceSocialLabourProgrammeCreatedEvent({ state, event, sha256Hex: sha }),
    ).toEqual(result.state);
    expect(
      prepareSocialLabourProgrammeCreation({
        command: c,
        state: result.state,
        readFacts: facts,
        sha256Hex: sha,
      }),
    ).toMatchObject({
      source: 'EXACT_DUPLICATE',
      result: result.result,
      eventPayload: null,
    });
    expect(() =>
      reduceSocialLabourProgrammeCreatedEvent({
        state,
        event: { ...event, sequence: '2' },
        sha256Hex: sha,
      }),
    ).toThrow();
    const payload = JSON.parse(canonicalSerialize(result.eventPayload));
    payload.result.status = 'APPROVED';
    expect(() =>
      reduceSocialLabourProgrammeCreatedEvent({
        state,
        event: { ...event, payload },
        sha256Hex: sha,
      }),
    ).toThrow();
    expect(() =>
      prepareSocialLabourProgrammeCreation({
        command: command(relocation, {
          commandId: 'OTHER_COMMAND',
          idempotencyKey: 'OTHER_COMMAND',
          expectedWorldVersion: '1',
        }),
        state: result.state,
        readFacts: {
          ...facts,
          head: { worldVersion: '1', eventSequence: '1' },
        },
        sha256Hex: sha,
      }),
    ).toThrow('unique pending');
  });
  it('rejects wrong command office, source country, revoked source, foreign destination, currency and implicit approval fields', () => {
    const { state, facts } = fixture();
    for (const c of [
      command(relocation, { officeId: 'FINANCE' }),
      command({ ...relocation, locationId: 'REGION_02_E1' }),
      command({ ...relocation, benefit: { amount: '3', currency: 'XBB' } }),
    ])
      expect(() =>
        prepareSocialLabourProgrammeCreation({
          command: c,
          state,
          readFacts: facts,
          sha256Hex: sha,
        }),
      ).toThrow();
    for (const f of [
      { ...facts, countryId: 'COUNTRY_02' },
      { ...facts, sourceRevocations: ['REVOKED'] },
    ])
      expect(() =>
        prepareSocialLabourProgrammeCreation({
          command: command(),
          state,
          readFacts: f,
          sha256Hex: sha,
        }),
      ).toThrow();
    for (const value of [
      { ...relocation, approved: true },
      { ...returning, capacity: '0' },
      { ...returning, duration: { amount: '12', unit: 'REAL_DAY' } },
      { ...relocation, benefit: { amount: '-1', currency: 'XAA' } },
      { ...returning, eligible: '   ' },
    ])
      expect(() => parseSocialLabourProgrammeCreateIntent(value)).toThrow();
  });
});
