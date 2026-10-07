import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  SimTime,
  authSubject,
  authorizeOfficeCapability,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
  countryId,
  commandId,
  eventId,
  eventType,
  officeId,
  teamId,
  worldId,
  createE01DailyBoundary,
  materializeOpeningLabourState,
  parseCanonicalCommand,
  parseSocialEmploymentServicePlanIntent,
  parseSocialJobMatchDueIntent,
  prepareSocialEmploymentServiceOperation,
  reduceSocialEmploymentServiceEvent,
  createSocialEmploymentServiceReplayReducers,
  processQueuedCommand,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_JOB_MATCH_DUE_COMMAND,
  SOCIAL_JOB_MATCH_RULE_VERSION,
  SOCIAL_SERVICE_PLAN_EVENT,
  SOCIAL_JOB_MATCH_EVENT,
  type AuthenticatedPrincipal,
  type CanonicalCommand,
  type MembershipSnapshot,
  type ReplayReducerEvent,
  type SocialEmploymentReadFacts,
  type SocialEmploymentServiceState,
} from '../../packages/core/src/index.js';
import { inspectOfficialOpeningDecisionSource } from '../../apps/world-worker/src/preparation/official-opening-decision-reconciliation.js';
import { createOfficialLabourSocialOpeningAdoption } from '../../apps/world-worker/src/preparation/official-labour-social-opening-adoption.js';
import {
  SocialOperatingStateMissingError,
  SqlSocialJobMatchCandidateSource,
  createSocialJobMatchCandidateFactory,
  prepareSocialJobMatchAtomicDraft,
  type SocialEmploymentRuntimeSnapshotReader,
} from '../../apps/world-worker/src/persistence/social-job-match-candidate-source.js';
import { prepareAtomicTransitionCandidate } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const hash = (value: unknown) =>
  canonicalSha256(canonicalHashInput(value), digest);
const at = '2026-10-07T00:00:01.000Z';
const scope = {
  countryId: 'COUNTRY_01',
  locationId: 'REGION_01_E1',
  skill: 'HIGH' as const,
};
const planPayload = {
  schemaVersion: 'social-employment-service-plan-v1',
  locationId: scope.locationId,
  skill: scope.skill,
  positionId: 'POSITION_A',
  servicePoolId: 'SOCIAL_POOL_A',
  requestedMatches: '3',
  dueDayIndex: '1',
};
function command(overrides: Record<string, unknown> = {}): CanonicalCommand {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      actorId: 'ACTOR_SOCIAL',
      authSubject: '11111111-1111-4111-8111-111111111111',
      commandId: 'SOCIAL_PLAN_1',
      commandType: SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      correlationId: 'SOCIAL_TRACE',
      countryId: scope.countryId,
      worldId: 'WORLD_TEST_01',
      officeId: 'SOCIAL',
      expectedWorldVersion: '0',
      idempotencyKey: 'SOCIAL_IDEM_1',
      simTime: '10000',
      submittedAtReal: at,
      payload: planPayload,
      ...overrides,
    },
    digest,
  );
}
function due(original = command(), overrides: Record<string, unknown> = {}) {
  return command({
    commandId: 'SOCIAL_DUE_1',
    commandType: SOCIAL_JOB_MATCH_DUE_COMMAND,
    officeId: null,
    expectedWorldVersion: '1',
    idempotencyKey: 'SOCIAL_DUE_IDEM_1',
    simTime: '20000',
    payload: {
      schemaVersion: 'social-job-match-settlement-v1',
      planCommandId: original.commandId,
      planFingerprint: original.fingerprint,
      dueDayIndex: '1',
      ruleVersion: SOCIAL_JOB_MATCH_RULE_VERSION,
    },
    ...overrides,
  });
}
/** Entirely explicit TEST_ONLY genesis, NOT official opening or operational grant. */
function fixture(
  publicService = false,
  unemployed = '5',
  vacancies = '4',
  capacity = '3',
) {
  const populationAvailability = [
    {
      countryId: scope.countryId,
      locationId: scope.locationId,
      workingAgeAvailable: (BigInt(unemployed) + 2n).toString(),
    },
  ];
  const employerId = publicService
    ? 'ENTITY_GOVERNMENT_01'
    : 'ENTITY_OPERATOR_01';
  const employerRole = publicService ? ('GOV' as const) : ('OP' as const);
  const opening = materializeOpeningLabourState({
    targets: [{ ...scope, count: '2' }],
    positions: [
      {
        ...scope,
        positionId: 'POSITION_A',
        requiredCount: (BigInt(vacancies) + 2n).toString(),
        sourceWeight: '1',
        owner: publicService ? 'PUBLIC_SERVICE' : 'PRIVATE_SECTOR',
        classificationId: publicService ? 'EDUCATION' : 'SECTOR_FOOD',
        employerId,
        employerRole,
        occupation: publicService ? 'TEACHER' : 'GENERAL',
        wageAmount: '2.5',
        wageCurrency: 'GCU',
        wagePeriod: 'SIM_HOUR',
        wageVersion: 'WAGE_V1',
        payrollFundingRef: 'PAYROLL_REF',
      },
    ],
    populationAvailability,
    skillAvailability: [
      { ...scope, count: (BigInt(unemployed) + 2n).toString() },
    ],
    nonEmployedAggregates: [
      { ...scope, status: 'UNEMPLOYED_SEARCHING', count: unemployed },
    ],
    employers: [{ countryId: scope.countryId, employerId, role: employerRole }],
  });
  const state: SocialEmploymentServiceState = {
    schemaVersion: 'social-employment-service-state-v1',
    worldId: 'WORLD_TEST_01',
    labour: opening.state,
    servicePools: [
      {
        ...scope,
        poolId: 'SOCIAL_POOL_A',
        dayIndex: '1',
        ruleVersion: SOCIAL_JOB_MATCH_RULE_VERSION,
        capacitySlots: capacity,
        usedSlots: '0',
        reservedSlots: '0',
      },
    ],
    plans: [],
    appliedOperations: [],
  };
  const facts: SocialEmploymentReadFacts = {
    boundary: createE01DailyBoundary('0'),
    simTime: '10000',
    populationAvailability,
    offer: {
      ...scope,
      positionId: 'POSITION_A',
      employerId,
      employerRole,
      legalPositionRef: 'LEGAL_POSITION_REF',
      payrollFundingRef: 'PAYROLL_REF',
      offerVersion: 'OFFER_V1',
      state: 'ACTIVE',
      wageVersion: 'WAGE_V1',
      amount: '2.5',
      currency: 'GCU',
      period: 'SIM_HOUR',
      validFromDayIndex: '0',
      validUntilDayIndex: '10',
    },
    minimumWage: {
      countryId: scope.countryId,
      ruleId: 'MIN_WAGE_RULE',
      ruleVersion: 'MIN_WAGE_V1',
      amount: '2',
      currency: 'GCU',
      period: 'SIM_HOUR',
      validFromDayIndex: '0',
      validUntilDayIndex: '10',
    },
  };
  return { state, facts };
}
const prepare = (
  cmd: CanonicalCommand,
  state: SocialEmploymentServiceState,
  readFacts: SocialEmploymentReadFacts,
) =>
  prepareSocialEmploymentServiceOperation({
    command: cmd,
    state,
    readFacts,
    sha256Hex: digest,
  });
const dueFacts = (
  facts: SocialEmploymentReadFacts,
): SocialEmploymentReadFacts => ({
  ...facts,
  boundary: createE01DailyBoundary('1'),
  simTime: '20000',
});
function event(cmd: CanonicalCommand, payload: unknown): ReplayReducerEvent {
  return {
    transitionId: cmd.commandId,
    worldId: cmd.worldId,
    eventId: eventId(`SOCIAL_EVENT_${cmd.commandId}`),
    causationCommandId: cmd.commandId,
    correctsEventId: null,
    eventType: eventType(
      cmd.officeId === null
        ? SOCIAL_JOB_MATCH_EVENT
        : SOCIAL_SERVICE_PLAN_EVENT,
    ),
    sequence: cmd.officeId === null ? '2' : '1',
    worldVersionBefore: cmd.expectedWorldVersion!,
    worldVersionAfter: (BigInt(cmd.expectedWorldVersion!) + 1n).toString(),
    simTime: cmd.simTime,
    payload,
  };
}

describe('SOC-1 real deterministic Core matching, TEST_ONLY genesis', () => {
  it.each([
    'offeredWageMeetsMinimum',
    'matchingCapacity',
    'unemployedSupply',
    'wageAmount',
  ])('rejects browser supplied %s', (key) => {
    expect(() =>
      parseSocialEmploymentServicePlanIntent({ ...planPayload, [key]: true }),
    ).toThrow('Missing/unknown');
  });
  it('rejects numeric/zero request, unsupported due rule, missing version and wrong office', () => {
    for (const requestedMatches of [3, '0', '03', '-1'])
      expect(() =>
        parseSocialEmploymentServicePlanIntent({
          ...planPayload,
          requestedMatches,
        }),
      ).toThrow();
    expect(() =>
      parseSocialJobMatchDueIntent({
        ...JSON.parse(due().canonicalPayload),
        ruleVersion: 'UNAPPROVED',
      }),
    ).toThrow();
    const f = fixture();
    for (const cmd of [
      command({ expectedWorldVersion: null }),
      command({ officeId: 'FINANCE' }),
    ])
      expect(() => prepare(cmd, f.state, f.facts)).toThrow();
  });
  it.each([false, true])(
    'matches real E03 private/public positions (%s) and conserves people/positions/slots',
    (publicService) => {
      const f = fixture(publicService),
        planned = prepare(command(), f.state, f.facts);
      expect(planned.state.labour).toEqual(f.state.labour);
      expect(planned.state.servicePools[0]).toMatchObject({
        reservedSlots: '3',
        usedSlots: '0',
      });
      const matched = prepare(due(), planned.state, dueFacts(f.facts));
      expect(matched.result).toMatchObject({
        matched: '3',
        remainingUnemployed: '2',
        remainingVacancies: '1',
      });
      expect(
        matched.state.labour.aggregates.reduce(
          (n, p) => n + BigInt(p.count),
          0n,
        ),
      ).toBe(7n);
      expect(matched.state.labour.positions[0]).toMatchObject({
        requiredCount: '6',
        employedCount: '5',
      });
      expect(matched.state.servicePools[0]).toMatchObject({
        usedSlots: '3',
        reservedSlots: '0',
        capacitySlots: '3',
      });
      expect(
        JSON.parse(
          matched.state.labour.appliedFactBindings[0]!.canonicalPayload,
        ).kind,
      ).toBe(publicService ? 'PUBLIC_SERVICE_OCCUPATION' : 'JOB_MATCH');
      expect(matched.state.labour.wageAssertions).toEqual(
        f.state.labour.wageAssertions,
      );
    },
  );
  it.each([
    ['1', '4', '1'],
    ['5', '1', '1'],
    ['0', '4', '0'],
  ])(
    'caps by unemployed %s and vacancy %s, releases unused slots',
    (unemployed, vacancies, expected) => {
      const f = fixture(false, unemployed, vacancies),
        planned = prepare(command(), f.state, f.facts);
      const matched = prepare(due(), planned.state, dueFacts(f.facts));
      expect(matched.result.matched).toBe(expected);
      expect(matched.state.servicePools[0]).toMatchObject({
        usedSlots: expected,
        reservedSlots: '0',
      });
    },
  );
  it('refuses over-capacity reservations, same-id conflicts and another settlement of one plan', () => {
    const f = fixture();
    expect(() =>
      prepare(
        command({ payload: { ...planPayload, requestedMatches: '4' } }),
        f.state,
        f.facts,
      ),
    ).toThrow('finite service');
    const planned = prepare(command(), f.state, f.facts);
    expect(prepare(command(), planned.state, f.facts).source).toBe(
      'EXACT_DUPLICATE',
    );
    expect(() =>
      prepare(
        command({ payload: { ...planPayload, requestedMatches: '2' } }),
        planned.state,
        f.facts,
      ),
    ).toThrow('idempotency conflict');
    const matched = prepare(due(), planned.state, dueFacts(f.facts));
    expect(prepare(due(), matched.state, dueFacts(f.facts)).state).toEqual(
      matched.state,
    );
    expect(() =>
      prepare(
        due(command(), { commandId: 'SECOND_DUE' }),
        matched.state,
        dueFacts(f.facts),
      ),
    ).toThrow('settled');
  });
  it('refuses already-applied E03 match without reconciled service settlement', () => {
    const f = fixture(false, '9', '9');
    const planned = prepare(command(), f.state, f.facts);
    const matched = prepare(due(), planned.state, dueFacts(f.facts));
    const inconsistent = { ...planned.state, labour: matched.state.labour };
    expect(() => prepare(due(), inconsistent, dueFacts(f.facts))).toThrow(
      'Already-applied matching fact',
    );
    expect(inconsistent.servicePools[0]!.usedSlots).toBe('0');
  });
  it.each(['below floor', 'revoked', 'expired', 'period', 'currency'])(
    'settles real zero match for %s, without a zero E03 fact',
    (reason) => {
      const f = fixture(),
        planned = prepare(command(), f.state, f.facts),
        facts = dueFacts(f.facts);
      const altered =
        reason === 'below floor'
          ? { ...facts, minimumWage: { ...facts.minimumWage, amount: '3' } }
          : reason === 'revoked'
            ? { ...facts, offer: { ...facts.offer, state: 'REVOKED' as const } }
            : reason === 'expired'
              ? { ...facts, offer: { ...facts.offer, validUntilDayIndex: '1' } }
              : reason === 'period'
                ? {
                    ...facts,
                    minimumWage: {
                      ...facts.minimumWage,
                      period: 'SIM_YEAR' as const,
                    },
                  }
                : {
                    ...facts,
                    minimumWage: { ...facts.minimumWage, currency: 'USD' },
                  };
      const matched = prepare(due(), planned.state, altered);
      expect(matched.result).toMatchObject({
        matched: '0',
        reason: 'INCOMPATIBLE_SKILL_LOCATION_OR_WAGE',
      });
      expect(matched.state.labour).toEqual(f.state.labour);
      expect(matched.state.servicePools[0]).toMatchObject({
        usedSlots: '0',
        reservedSlots: '0',
      });
    },
  );
  it('refuses missing unemployment/wage facts, mixed location and wrong daily boundary', () => {
    const f = fixture(),
      planned = prepare(command(), f.state, f.facts);
    expect(() =>
      prepare(
        command(),
        {
          ...f.state,
          labour: {
            ...f.state.labour,
            aggregates: f.state.labour.aggregates.filter(
              (a) => a.status !== 'UNEMPLOYED_SEARCHING',
            ),
          },
        },
        f.facts,
      ),
    ).toThrow('missing');
    expect(() =>
      prepare(command(), f.state, {
        ...f.facts,
        offer: { ...f.facts.offer, wageVersion: 'MISSING_WAGE' },
      }),
    ).toThrow('wage version');
    expect(() =>
      prepare(command(), f.state, {
        ...f.facts,
        offer: { ...f.facts.offer, locationId: 'WRONG_LOCATION' },
      }),
    ).toThrow('scope mismatch');
    expect(() =>
      prepare(due(), planned.state, {
        ...dueFacts(f.facts),
        boundary: createE01DailyBoundary('2'),
      }),
    ).toThrow('boundary');
  });
  it('recomputes real plan/due events and rejects tampered hash/result/causation', () => {
    const f = fixture(),
      planned = prepare(command(), f.state, f.facts),
      matched = prepare(due(), planned.state, dueFacts(f.facts));
    const reducer = createSocialEmploymentServiceReplayReducers(digest);
    const state1 = reducer[SOCIAL_SERVICE_PLAN_EVENT]!({
      state: f.state,
      event: event(command(), planned.eventPayload),
      random: { deriveHex: (stream, counter) => hash({ stream, counter }) },
    });
    const state2 = reducer[SOCIAL_JOB_MATCH_EVENT]!({
      state: state1,
      event: event(due(), matched.eventPayload),
      random: { deriveHex: (stream, counter) => hash({ stream, counter }) },
    });
    expect(hash(state2)).toBe(hash(matched.state));
    const payload = JSON.parse(
      canonicalSerialize(matched.eventPayload),
    ) as Record<string, unknown>;
    for (const altered of [
      { ...payload, afterStateHash: hash('wrong') },
      { ...payload, result: { ...matched.result, matched: '99' } },
    ])
      expect(() =>
        reduceSocialEmploymentServiceEvent({
          state: planned.state,
          event: event(due(), altered),
          sha256Hex: digest,
        }),
      ).toThrow('Replay');
    expect(() =>
      reduceSocialEmploymentServiceEvent({
        state: planned.state,
        event: {
          ...event(due(), matched.eventPayload),
          causationCommandId: commandId('WRONG_COMMAND'),
        },
        sha256Hex: digest,
      }),
    ).toThrow('causation');
  });
});

// One genuine existing fixed-source consumer for NOT_READY refusal. No full-map
// regeneration/copy, no fabricated owner receipt and no production access.
const root = path.resolve(import.meta.dirname, '../..');
const read = (name: string) => readFile(path.join(root, name), 'utf8');
const mappingBytes = await read(
  'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json',
);
const mapping = JSON.parse(mappingBytes) as {
  source: { dataFiles: Record<string, unknown> };
};
const datasets = Object.fromEntries(
  await Promise.all(
    Object.keys(mapping.source.dataFiles).map(async (name) => [
      name,
      await read(`artifacts/world-balanced-candidate-v1/${name}`),
    ]),
  ),
);
const inspected = inspectOfficialOpeningDecisionSource({
  mappingBytes,
  datasets,
  checksumsBytes: await read(
    'artifacts/world-balanced-candidate-v1/CHECKSUMS.json',
  ),
  coverageBytes: await read(
    'docs/reports/world-connection/C_OFFICIAL_WORLD_COMPLETE_COVERAGE.json',
  ),
  proposalBytes: await read(
    'artifacts/E_OPENING_SEMANTIC_MAPPING_PROPOSAL_2026_10_07.md',
  ),
});
if (!inspected.source) throw new Error(JSON.stringify(inspected.blockers));
const adoption = createOfficialLabourSocialOpeningAdoption({
  source: inspected.source,
  mappingBytes,
  ownerOriginalBytes: await read(
    'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
  ),
  ownerReceiptBytes: await read(
    'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
  ),
  datasets: {
    employment: datasets['data/employment.json']!,
    'population-services': datasets['data/population-services.json']!,
    regions: datasets['data/regions.json']!,
    facilities: datasets['data/facilities.json']!,
  },
});

/** TEST_ONLY SQL protocol fixture. It does not prove PostgreSQL persistence. */
function sqlFixture(
  cmd: CanonicalCommand,
  state: SocialEmploymentServiceState,
  facts: SocialEmploymentReadFacts,
  input: {
    original?: CanonicalCommand;
    queue?: Record<string, unknown>;
    lease?: Record<string, unknown>;
    snapshot?: Record<string, unknown>;
    automatic?: boolean;
    revokeDuringRead?: () => void;
    mode?: 'OFFICIAL_RUNTIME' | 'TEST_ONLY_LOCAL';
  } = {},
) {
  const calls: string[] = [];
  const executor: SqlExecutor = {
    async query<Row>(sql: string, params: readonly unknown[] = []) {
      calls.push(sql);
      let rows: unknown[];
      if (sql.includes('command_actor_id')) {
        const c = params[1] === cmd.commandId ? cmd : input.original!;
        rows = [
          {
            command_actor_id: c.actorId,
            command_auth_subject: c.authSubject,
            command_canonical_payload: c.canonicalPayload,
            command_country_id: c.countryId,
            command_expected_world_version: c.expectedWorldVersion,
            command_fingerprint: c.fingerprint,
            command_id: c.commandId,
            command_idempotency_key: c.idempotencyKey,
            command_office_id: c.officeId,
            command_payload_sha256: c.payloadHash,
            command_schema_version: c.schemaVersion,
            command_sim_time: c.simTime.toCanonicalValue(),
            command_submitted_at_real: c.submittedAtReal,
            command_type: c.commandType,
            command_world_id: c.worldId,
            correlation_id: c.correlationId,
          },
        ];
      } else if (sql.includes('command_submission'))
        rows = [{ command_id: cmd.commandId }];
      else if (sql.includes('world_writer_lease'))
        rows = [
          {
            world_id: cmd.worldId,
            holder_id: 'WORKER_SOCIAL',
            fencing_token: '1',
            acquired_at_real: '2026-10-07T00:00:00.000Z',
            renewed_at_real: '2026-10-07T00:00:00.000Z',
            lease_expires_at_real: '2026-10-07T01:00:00.000Z',
            ...input.lease,
          },
        ];
      else if (sql.includes('world_head'))
        rows = [
          {
            world_version: cmd.expectedWorldVersion,
            event_sequence: cmd.officeId === null ? '1' : '0',
          },
        ];
      else if (sql.includes('command_queue'))
        rows = [
          {
            command_type: cmd.commandType,
            authority_kind:
              cmd.officeId === null
                ? 'VERSIONED_AUTOMATIC'
                : 'DISCRETIONARY_USER',
            queue_state: 'CLAIMED',
            available_at_sim_time: cmd.simTime.toCanonicalValue(),
            claimed_by: 'WORKER_SOCIAL',
            claim_fencing_token: '1',
            ...input.queue,
          },
        ];
      else throw new Error(`Unexpected SQL ${sql}`);
      return { rowCount: rows.length, rows: rows as Row[] };
    },
  };
  const database: SqlDatabase = {
    query: executor.query,
    async transaction(operation) {
      return operation(executor);
    },
  };
  const snapshotReader: SocialEmploymentRuntimeSnapshotReader = {
    async readFrom(readInput) {
      expect(readInput.transaction).toBe(executor);
      calls.push('ROOT_READER');
      input.revokeDuringRead?.();
      return {
        status: 'REPLAYED',
        provenance: 'TEST_ONLY',
        openingSeedHash: hash('TEST_ONLY_GENESIS'),
        worldId: cmd.worldId,
        headWorldVersion: cmd.expectedWorldVersion!,
        headEventSequence: cmd.officeId === null ? '1' : '0',
        state,
        stateHash: hash(state),
        readFacts: facts,
        readFactsHash: hash(facts),
        ...input.snapshot,
      } as Awaited<
        ReturnType<SocialEmploymentRuntimeSnapshotReader['readFrom']>
      >;
    },
  };
  const source = new SqlSocialJobMatchCandidateSource({
    mode: input.mode ?? 'TEST_ONLY_LOCAL',
    database,
    workerId: 'WORKER_SOCIAL',
    sha256Hex: digest,
    openingAdoption: adoption,
    snapshotReader,
    automaticAuthority: input.automatic
      ? {
          async assertFrom(grant) {
            expect(grant.transaction).toBe(executor);
            expect(grant.originalPlan.fingerprint).toBe(
              input.original!.fingerprint,
            );
            calls.push('TEST_ONLY_AUTOMATIC_GRANT');
          },
        }
      : null,
  });
  return { source, calls, database };
}
async function authFixture() {
  const principal: AuthenticatedPrincipal = Object.freeze({
    authSubject: authSubject(command().authSubject),
    facts: Object.freeze({
      user_id: command().authSubject,
      display_name: 'TEST_ONLY Social',
      school_id: null,
    }),
    token: Object.freeze({
      subject: command().authSubject,
      issuer: 'test',
      audience: 'world',
      issuedAt: at,
      expiresAt: '2026-10-07T01:00:00.000Z',
    }),
  });
  let membership: MembershipSnapshot | null = Object.freeze({
    authorizationVersion: '1',
    authSubject: principal.authSubject,
    worldId: worldId(command().worldId),
    teamId: teamId('TEAM_SOCIAL'),
    countryId: countryId(scope.countryId),
    officeAssignments: Object.freeze([officeId('SOCIAL')]),
    active: true,
    suspended: false,
    isWorldAdmin: false,
    negotiationPartyIds: Object.freeze([]),
  });
  const context = await authorizeOfficeCapability({
    principal,
    resolver: {
      async resolveCurrentIdentity() {
        return membership ? principal.authSubject : null;
      },
      async resolveCurrentMembership() {
        return membership;
      },
    },
    worldId: worldId(command().worldId),
    requestedCountryId: countryId(scope.countryId),
    requestedOfficeId: officeId('SOCIAL'),
    capability: 'SOCIAL_LABOUR',
  });
  return {
    context,
    revoke() {
      membership = null;
    },
  };
}

describe('SOC-1 server source → real AtomicTransitionDraft, TEST_ONLY SQL protocol', () => {
  it('official construction mode refuses TEST_ONLY reader output', async () => {
    const f = fixture();
    await expect(
      sqlFixture(command(), f.state, f.facts, {
        mode: 'OFFICIAL_RUNTIME',
      }).source.load({ command: command(), observedAtReal: at }),
    ).rejects.toThrow('Reader returned mixed');
  });
  it('preserves genuine 1066 missing/incompatible/title gaps and refuses missing operating state', async () => {
    const f = fixture(),
      sql = sqlFixture(command(), f.state, f.facts);
    const source = new SqlSocialJobMatchCandidateSource({
      mode: 'OFFICIAL_RUNTIME',
      database: sql.database,
      workerId: 'WORKER_SOCIAL',
      sha256Hex: digest,
      openingAdoption: adoption,
      snapshotReader: null,
      automaticAuthority: null,
    });
    try {
      await source.load({ command: command(), observedAtReal: at });
      throw new Error('Unexpected readiness');
    } catch (error) {
      expect(error).toBeInstanceOf(SocialOperatingStateMissingError);
      expect(error).toMatchObject({
        status: 'NOT_READY',
        seedAdmissionReady: false,
      });
      expect((error as SocialOperatingStateMissingError).gaps).toHaveLength(
        1066,
      );
    }
    expect(sql.calls).toEqual([]);
  });
  it('creates genuine-proof plan + authorized due Atomic candidates with real events/replay and no money/inventory postings', async () => {
    const f = fixture(),
      sql = sqlFixture(command(), f.state, f.facts),
      auth = await authFixture();
    const factory = createSocialJobMatchCandidateFactory({
      source: sql.source,
      sha256Hex: digest,
    });
    const result = await processQueuedCommand({
      command: command(),
      authorityKind: 'DISCRETIONARY_USER',
      commitSimTime: SimTime.fromTicks('10000'),
      recordedAtReal: at,
      requiredCapability: 'SOCIAL_LABOUR',
      intakeAuthorization: auth.context,
      persistence: {
        async readFinalReceipt() {
          return null;
        },
        async recordZeroEffectReceipt() {
          throw new Error('Unexpected zero receipt');
        },
        async commitAuthorizedCommand(input) {
          const draft = await factory.prepare({ ...input, observedAtReal: at });
          const candidate = prepareAtomicTransitionCandidate({
            command: input.command,
            commitAuthorization: input.commitAuthorization,
            draft,
            sha256Hex: digest,
          });
          expect(candidate.inventoryPostings).toEqual([]);
          expect(candidate.financialPostingBatches).toEqual([]);
          expect(candidate.currentMaterializations[0]!.key).toBe(
            'SOCIAL_EMPLOYMENT_SERVICE',
          );
          return { receipt: draft.receipt, transition: draft.transition };
        },
      },
    });
    expect(result.receipt.outcome).toBe('COMMITTED');
    const planned = prepare(command(), f.state, f.facts),
      dueSql = sqlFixture(due(), planned.state, dueFacts(f.facts), {
        original: command(),
        automatic: true,
      });
    const draft = await createSocialJobMatchCandidateFactory({
      source: dueSql.source,
      sha256Hex: digest,
    }).prepare({
      command: due(),
      commitAuthorization: null,
      observedAtReal: at,
    });
    const candidate = prepareAtomicTransitionCandidate({
      command: due(),
      commitAuthorization: null,
      draft,
      sha256Hex: digest,
    });
    expect(candidate.receipt.eventIds).toEqual(['SOCIAL_EVENT_SOCIAL_DUE_1']);
    expect(candidate.financialPostingBatches).toEqual([]);
    expect(candidate.inventoryPostings).toEqual([]);
    const checkpoint = JSON.parse(
      candidate.currentMaterializations[0]!.canonicalPayload,
    );
    const emitted = draft.transition.events[0]!;
    const replayed = reduceSocialEmploymentServiceEvent({
      state: planned.state,
      event: {
        ...event(due(), JSON.parse(emitted.canonicalPayload)),
        eventId: emitted.eventId,
        sequence: emitted.sequence,
      },
      sha256Hex: digest,
    });
    expect(hash(replayed)).toBe(hash(checkpoint));
    expect(checkpoint.labour.positions[0].employedCount).toBe('5');
    expect(dueSql.calls.at(-1)).toBe('TEST_ONLY_AUTOMATIC_GRANT');
    expect(
      sql.calls.findIndex((q) => q.includes('command_submission')),
    ).toBeLessThan(
      sql.calls.findIndex((q) => q.includes('world_writer_lease')),
    );
    expect(
      sql.calls.findIndex((q) => q.includes('world_writer_lease')),
    ).toBeLessThan(sql.calls.findIndex((q) => q.includes('world_head')));
    expect(
      sql.calls.every((q) => !/^(?:insert|update|delete)\b/iu.test(q)),
    ).toBe(true);
  });
  it('reader MISSING_OPERATING_STATE retains the genuine opening refusal', async () => {
    const f = fixture();
    await expect(
      sqlFixture(command(), f.state, f.facts, {
        snapshot: { status: 'MISSING_OPERATING_STATE' },
      }).source.load({ command: command(), observedAtReal: at }),
    ).rejects.toMatchObject({ status: 'NOT_READY', seedAdmissionReady: false });
  });
  it.each([
    'queue fence',
    'queue authority',
    'stale lease',
    'mixed snapshot',
    'wrong hash',
    'wrong clock',
  ])('refuses %s before any fresh draft', async (reason) => {
    const f = fixture();
    const overrides =
      reason === 'queue fence'
        ? { queue: { claim_fencing_token: '2' } }
        : reason === 'queue authority'
          ? { queue: { authority_kind: 'VERSIONED_AUTOMATIC' } }
          : reason === 'stale lease'
            ? { lease: { lease_expires_at_real: '2026-10-07T00:00:00.000Z' } }
            : reason === 'mixed snapshot'
              ? { snapshot: { headWorldVersion: '99' } }
              : reason === 'wrong hash'
                ? { snapshot: { stateHash: hash('wrong') } }
                : {
                    snapshot: {
                      readFacts: { ...f.facts, simTime: '999' },
                      readFactsHash: hash({ ...f.facts, simTime: '999' }),
                    },
                  };
    await expect(
      sqlFixture(command(), f.state, f.facts, overrides).source.load({
        command: command(),
        observedAtReal: at,
      }),
    ).rejects.toThrow();
  });
  it('refuses due syntax without connected Root automatic authority and rejects structural fake preparation', async () => {
    const f = fixture(),
      planned = prepare(command(), f.state, f.facts);
    const sql = sqlFixture(due(), planned.state, dueFacts(f.facts), {
      original: command(),
    });
    await expect(
      sql.source.load({ command: due(), observedAtReal: at }),
    ).rejects.toThrow('automatic authority');
    expect(() =>
      prepareSocialJobMatchAtomicDraft({
        preparation: {} as Parameters<
          typeof prepareSocialJobMatchAtomicDraft
        >[0]['preparation'],
        sha256Hex: digest,
      }),
    ).toThrow('not issued');
    await expect(
      createSocialJobMatchCandidateFactory({
        source: sql.source,
        sha256Hex: digest,
      }).prepare({
        command: command(),
        commitAuthorization: null,
        observedAtReal: at,
      }),
    ).rejects.toThrow('Genuine');
  });
  it('reauthorizes after server reading and revokes pending work with zero-effect receipt before candidate entry', async () => {
    const f = fixture(),
      auth = await authFixture(),
      sql = sqlFixture(command(), f.state, f.facts, {
        revokeDuringRead: auth.revoke,
      });
    const factory = createSocialJobMatchCandidateFactory({
      source: sql.source,
      sha256Hex: digest,
    });
    await expect(
      processQueuedCommand({
        command: command(),
        authorityKind: 'DISCRETIONARY_USER',
        commitSimTime: command().simTime,
        recordedAtReal: at,
        requiredCapability: 'SOCIAL_LABOUR',
        intakeAuthorization: auth.context,
        persistence: {
          async readFinalReceipt() {
            return null;
          },
          async recordZeroEffectReceipt(r) {
            return r;
          },
          async commitAuthorizedCommand(input) {
            const draft = await factory.prepare({
              ...input,
              observedAtReal: at,
            });
            return { receipt: draft.receipt, transition: draft.transition };
          },
        },
      }),
    ).rejects.toThrow();
    const auth2 = await authFixture();
    auth2.revoke();
    let commits = 0;
    const result = await processQueuedCommand({
      command: command(),
      authorityKind: 'DISCRETIONARY_USER',
      commitSimTime: command().simTime,
      recordedAtReal: at,
      requiredCapability: 'SOCIAL_LABOUR',
      intakeAuthorization: auth2.context,
      persistence: {
        async readFinalReceipt() {
          return null;
        },
        async recordZeroEffectReceipt(r) {
          return r;
        },
        async commitAuthorizedCommand() {
          commits++;
          throw new Error('Unexpected commit');
        },
      },
    });
    expect(result.receipt).toMatchObject({
      outcome: 'AUTHORIZATION_REVOKED',
      eventIds: [],
      worldVersionBefore: null,
      worldVersionAfter: null,
    });
    expect(commits).toBe(0);
  });
});
