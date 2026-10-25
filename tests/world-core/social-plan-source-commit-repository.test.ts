// Synthetic mechanism fixtures. No actual source issuer, custody or native locks.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  SimTime,
  acquireWorldWriterLease,
  worldWriterLeaseRequest,
  worldId,
  workerId,
  parseCanonicalCommand,
  parseAuthoritativeEvent,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createWorldWriterCommitAssertion,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_JOB_MATCH_RULE_VERSION,
  SOCIAL_SERVICE_PLAN_EVENT,
  SOCIAL_JOB_MATCH_DUE_COMMAND,
  authSubject,
  authorizeOfficeCapability,
  countryId,
  teamId,
  officeId,
  materializeOpeningLabourState,
  createE01DailyBoundary,
  prepareSocialEmploymentServiceOperation,
  processQueuedCommand,
  canonicalHashInput,
  canonicalSha256,
  type CanonicalCommand,
  type AuthenticatedPrincipal,
  type MembershipSnapshot,
  type SocialEmploymentReadFacts,
  type SocialEmploymentServiceState,
  type FinalCommandReceipt,
} from '@econmind/core';
import {
  AtomicTransitionRepository,
  prepareAtomicTransitionCandidate,
  type AtomicTransitionDraft,
  type PrivateAtomicTransitionCandidate,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  GOVERNING_SOURCE_READ_BINDING_SCHEMA,
  SOCIAL_PLAN_SOURCE_EVALUATION_PURPOSE,
  calculateGoverningSourceCommitBindingFingerprints,
  type GoverningSourceCommitRequestV1,
  type GoverningSourceReadBindingV1,
  type SourceCommitCurrentnessAuditV1,
} from '../../apps/world-worker/src/projections/governing-source-commit-boundary-contract.js';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const at = '2026-10-25T00:00:01.000Z';
// Synthetic closed C-contract data, NOT an admitted source or genuine custody.
function bindingFor(command: CanonicalCommand): GoverningSourceReadBindingV1 {
  const H = canonicalSha256(canonicalHashInput('TEST_ONLY_SOURCE'), digest);
  const paths = [
    '/admittedGenesis/semanticRevision',
    '/admittedGenesis/state',
    '/currentReadFacts/boundary',
    '/currentReadFacts/minimumWage',
    '/currentReadFacts/offer',
    '/currentReadFacts/populationAvailability',
    '/physicalAttemptEnvelope',
  ];
  return {
    schemaVersion: GOVERNING_SOURCE_READ_BINDING_SCHEMA,
    purpose: SOCIAL_PLAN_SOURCE_EVALUATION_PURPOSE,
    scope: {
      worldId: command.worldId,
      countryId: command.countryId!,
      officeId: 'SOCIAL',
    },
    commandBinding: {
      commandId: command.commandId,
      commandFingerprint: command.fingerprint,
      commandType: SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      payloadHash: command.payloadHash,
      simTime: command.simTime.toCanonicalValue(),
    },
    readHead: { worldVersion: '0', eventSequence: '0' },
    worldBinding: {
      seedId: 'SEED_TEST_ONLY',
      seedFingerprint: H,
      modelVersion: 'MODEL_TEST_ONLY',
      replayBindingFingerprint: H,
    },
    historyBinding: {
      openingVersion: '0',
      completePrefixFingerprint: H,
      receiptSetFingerprint: H,
      taxonomyRevision: 'TAXONOMY_TEST_ONLY',
    },
    sourceAuthorityBinding: {
      issuerId: 'ISSUER_TEST_ONLY',
      custodianId: 'CUSTODIAN_TEST_ONLY',
      ownerAdoptionRef: 'ADOPTION_TEST_ONLY',
      ownerAdoptionFingerprint: H,
      admissionRef: 'ADMISSION_TEST_ONLY',
      admissionRevision: '1',
    },
    sourceManifest: {
      manifestId: 'MANIFEST_TEST_ONLY',
      revision: '1',
      contentFingerprint: H,
      entrySetFingerprint: H,
    },
    sourceRevisions: paths.map((path, i) => ({
      recordId: `RECORD_${i}`,
      revision: '2',
      payloadHash: H,
      role:
        i === 6
          ? 'PHYSICAL_ORIGINAL_BODY'
          : i < 2
            ? 'GENESIS_HISTORICAL'
            : 'CURRENT_EFFECTIVE',
      fieldPaths: [path],
      revocationRevision: null,
    })),
    materialBindings: paths.map((path, i) => ({
      fieldPath: path,
      valueHash: H,
      recordId: `RECORD_${i}`,
      recordRevision: '2',
      pointer: '/value',
    })),
    originalPhysicalBodyBindings: [
      {
        groupRef: 'GROUP_TEST_ONLY',
        bodyHash: H,
        originRecordId: 'RECORD_6',
        originRevision: '2',
      },
    ],
    stateHash: H,
    readFactsHash: H,
  };
}
function matchingAudit(
  request: Readonly<GoverningSourceCommitRequestV1>,
): SourceCommitCurrentnessAuditV1 {
  return {
    status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
    purpose: request.purpose,
    commandFingerprint: request.command.fingerprint,
    currentHead: request.currentHead,
    ...calculateGoverningSourceCommitBindingFingerprints(request.readBinding),
    protectionMode: 'HELD_SOURCE_GUARDS',
  };
}
function fixture(overrides: Record<string, unknown> = {}) {
  const command = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      worldId: 'WORLD_SOURCE_COMMIT_TEST',
      countryId: 'COUNTRY_01',
      actorId: 'ACTOR_TEST',
      authSubject: '11111111-1111-4111-8111-111111111111',
      officeId: null,
      commandId: 'COMMAND_TEST',
      commandType: 'TEST_ONLY_SOURCE_CAPTURE',
      correlationId: 'TRACE_TEST',
      expectedWorldVersion: '0',
      idempotencyKey: 'IDEM_TEST',
      payload: { TEST_ONLY: true },
      simTime: '1000',
      submittedAtReal: '2026-10-25T00:00:00.000Z',
      ...overrides,
    },
    digest,
  );
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: 'EVENT_TEST',
      eventType: 'TEST_ONLY_COMMITTED',
      worldId: command.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: '1',
      sequence: '1',
      simTime: '1000',
      recordedAtReal: at,
      correctsEventId: null,
      payload: { TEST_ONLY: true },
    },
    digest,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
  const receipt = createFinalCommandReceipt({
    command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: SimTime.fromTicks('1000'),
    recordedAtReal: at,
  });
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(
      worldId(command.worldId),
      workerId('WORKER_TEST'),
      '2026-10-25T00:00:00.000Z',
      '2026-10-25T01:00:00.000Z',
    ),
  ).lease;
  const draft: AtomicTransitionDraft = {
    transition,
    receipt,
    inventoryPostings: [],
    financialPostingBatches: [],
    outboxMessages: [],
    currentMaterializations: [],
    authorityKind: 'VERSIONED_AUTOMATIC',
    commitAssertion: createWorldWriterCommitAssertion(lease, '0'),
    observedAtReal: at,
  };
  return { command, draft };
}
function candidate(
  value: unknown,
  absent = false,
  overrides: Record<string, unknown> = {},
) {
  const f = fixture(overrides);
  const draft = absent
    ? f.draft
    : { ...f.draft, governingSourceReadBinding: value };
  return prepareAtomicTransitionCandidate({
    command: f.command,
    draft,
    commitAuthorization: null,
    sha256Hex: digest,
  });
}

/** Real Core PLAN + genuine Core discretionary proof, still TEST_ONLY facts. */
async function manualPlanCandidate(metadata: unknown) {
  const command = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      worldId: 'WORLD_SOURCE_COMMIT_TEST',
      countryId: 'COUNTRY_01',
      actorId: 'ACTOR_TEST',
      authSubject: '11111111-1111-4111-8111-111111111111',
      officeId: 'SOCIAL',
      commandId: 'PLAN_TEST',
      commandType: SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      correlationId: 'TRACE_PLAN_TEST',
      expectedWorldVersion: '0',
      idempotencyKey: 'IDEM_PLAN_TEST',
      simTime: '1000',
      submittedAtReal: '2026-10-25T00:00:00.000Z',
      payload: {
        schemaVersion: 'social-employment-service-plan-v1',
        locationId: 'REGION_01_E1',
        skill: 'HIGH',
        positionId: 'POSITION_A',
        servicePoolId: 'POOL_HIGH',
        requestedMatches: '1',
        dueDayIndex: '0',
      },
    },
    digest,
  );
  const scope = {
    countryId: 'COUNTRY_01',
    locationId: 'REGION_01_E1',
    skill: 'HIGH' as const,
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
        positionId: 'POSITION_A',
        requiredCount: '7',
        sourceWeight: '1',
        owner: 'PRIVATE_SECTOR',
        classificationId: 'SECTOR_FOOD',
        employerId: 'ENTITY_OPERATOR_01',
        employerRole: 'OP',
        occupation: 'GENERAL',
        wageAmount: '11',
        wageCurrency: 'XAA',
        wagePeriod: 'SIM_YEAR',
        wageVersion: 'TEST_WAGE_1',
        payrollFundingRef: 'TEST_PAYROLL',
      },
    ],
    populationAvailability,
    skillAvailability: [{ ...scope, count: '7' }],
    nonEmployedAggregates: [
      { ...scope, status: 'UNEMPLOYED_SEARCHING', count: '5' },
    ],
    employers: [
      {
        countryId: scope.countryId,
        employerId: 'ENTITY_OPERATOR_01',
        role: 'OP',
      },
    ],
  });
  const state: SocialEmploymentServiceState = {
    schemaVersion: 'social-employment-service-state-v1',
    worldId: command.worldId,
    labour: opening.state,
    servicePools: (['LOW', 'MEDIUM', 'HIGH'] as const).map((skill) => ({
      poolId: `POOL_${skill}`,
      countryId: scope.countryId,
      locationId: scope.locationId,
      skill,
      dayIndex: '0',
      ruleVersion: SOCIAL_JOB_MATCH_RULE_VERSION,
      capacitySlots: '3',
      usedSlots: '0',
      reservedSlots: '0',
    })),
    plans: [],
    appliedOperations: [],
  };
  const readFacts: SocialEmploymentReadFacts = {
    boundary: createE01DailyBoundary('0'),
    simTime: '1000',
    populationAvailability,
    offer: {
      ...scope,
      positionId: 'POSITION_A',
      employerId: 'ENTITY_OPERATOR_01',
      employerRole: 'OP',
      legalPositionRef: 'TEST_LEGAL_POSITION',
      payrollFundingRef: 'TEST_PAYROLL',
      offerVersion: 'TEST_OFFER_1',
      state: 'ACTIVE',
      wageVersion: 'TEST_WAGE_1',
      amount: '11',
      currency: 'XAA',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '2',
    },
    minimumWage: {
      countryId: scope.countryId,
      ruleId: 'TEST_MIN',
      ruleVersion: 'TEST_MIN_1',
      amount: '7',
      currency: 'XAA',
      period: 'SIM_YEAR',
      validFromDayIndex: '0',
      validUntilDayIndex: '2',
    },
  };
  const operation = prepareSocialEmploymentServiceOperation({
    command,
    state,
    readFacts,
    sha256Hex: digest,
  });
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: 'PLAN_EVENT_TEST',
      eventType: SOCIAL_SERVICE_PLAN_EVENT,
      worldId: command.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: '1',
      sequence: '1',
      simTime: '1000',
      recordedAtReal: at,
      correctsEventId: null,
      payload: operation.eventPayload,
    },
    digest,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
  const receipt = createFinalCommandReceipt({
    command,
    transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: command.simTime,
    recordedAtReal: at,
  });
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(
      worldId(command.worldId),
      workerId('WORKER_TEST'),
      '2026-10-25T00:00:00.000Z',
      '2026-10-25T01:00:00.000Z',
    ),
  ).lease;
  const principal: AuthenticatedPrincipal = {
    authSubject: authSubject(command.authSubject),
    facts: {
      user_id: command.authSubject,
      display_name: 'TEST_ONLY',
      school_id: null,
    },
    token: {
      subject: command.authSubject,
      issuer: 'TEST_ONLY',
      audience: 'world',
      issuedAt: '2026-10-25T00:00:00.000Z',
      expiresAt: '2026-10-25T01:00:00.000Z',
    },
  };
  const membership: MembershipSnapshot = {
    authorizationVersion: '1',
    authSubject: principal.authSubject,
    worldId: worldId(command.worldId),
    teamId: teamId('TEAM_TEST'),
    countryId: countryId(scope.countryId),
    officeAssignments: [officeId('SOCIAL')],
    active: true,
    suspended: false,
    isWorldAdmin: false,
    negotiationPartyIds: [],
  };
  const context = await authorizeOfficeCapability({
    principal,
    resolver: {
      async resolveCurrentIdentity() {
        return principal.authSubject;
      },
      async resolveCurrentMembership() {
        return membership;
      },
    },
    worldId: worldId(command.worldId),
    requestedCountryId: countryId(scope.countryId),
    requestedOfficeId: officeId('SOCIAL'),
    capability: 'SOCIAL_LABOUR',
  });
  let prepared: PrivateAtomicTransitionCandidate | undefined;
  await processQueuedCommand({
    command,
    authorityKind: 'DISCRETIONARY_USER',
    commitSimTime: command.simTime,
    recordedAtReal: at,
    requiredCapability: 'SOCIAL_LABOUR',
    intakeAuthorization: context,
    persistence: {
      async readFinalReceipt() {
        return null;
      },
      async recordZeroEffectReceipt() {
        throw Error('UNEXPECTED_ZERO_EFFECT');
      },
      async commitAuthorizedCommand(input) {
        prepared = prepareAtomicTransitionCandidate({
          command,
          commitAuthorization: input.commitAuthorization,
          draft: {
            transition,
            receipt,
            inventoryPostings: [],
            financialPostingBatches: [],
            outboxMessages: [],
            currentMaterializations: [],
            authorityKind: 'DISCRETIONARY_USER',
            commitAssertion: createWorldWriterCommitAssertion(lease, '0'),
            observedAtReal: at,
            governingSourceReadBinding: metadata,
          },
          sha256Hex: digest,
        });
        return { receipt, transition };
      },
    },
  });
  if (!prepared) throw Error('MISSING_REAL_CORE_CANDIDATE');
  return { candidate: prepared, command, state, readFacts, operation };
}
function receiptRow(r: FinalCommandReceipt) {
  return {
    world_id: r.worldId,
    command_id: r.commandId,
    idempotency_key: r.idempotencyKey,
    schema_version: r.schemaVersion,
    command_fingerprint: r.commandFingerprint,
    outcome: r.outcome,
    reason_code: r.reasonCode,
    transition_id: r.transitionId,
    world_version_before: r.worldVersionBefore,
    world_version_after: r.worldVersionAfter,
    sim_time: r.simTime.toCanonicalValue(),
    event_ids: r.eventIds,
    recorded_at_real: r.recordedAtReal,
  };
}
function receiptOnlyRepository(c: PrivateAtomicTransitionCandidate) {
  const trace: string[] = [];
  const command = c.command;
  const tx: SqlExecutor = {
    async query<Row extends object>(sql: string) {
      trace.push(sql);
      let rows: readonly object[];
      if (sql.includes('from world_v2.command_submission'))
        rows = [
          {
            actor_id: command.actorId,
            auth_subject: command.authSubject,
            command_id: command.commandId,
            command_fingerprint: command.fingerprint,
            command_type: command.commandType,
            canonical_payload: command.canonicalPayload,
            correlation_id: command.correlationId,
            country_id: command.countryId,
            idempotency_key: command.idempotencyKey,
            expected_world_version: command.expectedWorldVersion,
            office_id: command.officeId,
            payload_sha256: command.payloadHash,
            schema_version: command.schemaVersion,
            sim_time: command.simTime.toCanonicalValue(),
            submitted_at_real: command.submittedAtReal,
            world_id: command.worldId,
          },
        ];
      else if (sql.includes('from world_v2.command_receipt'))
        rows = [receiptRow(c.receipt)];
      else throw Error('UNEXPECTED_AFTER_KNOWN_RECEIPT');
      return { rows: rows as readonly Row[], rowCount: rows.length };
    },
  };
  const database: SqlDatabase = {
    query: async () => {
      throw Error('NO_POOL_FALLBACK');
    },
    transaction: async (fn) => fn(tx),
  };
  const repository = new AtomicTransitionRepository({
    database,
    workerId: 'WORKER_TEST',
    sha256Hex: digest,
    authorizationGuard: {
      async assertCurrent() {
        throw Error('NO_FRESH_AUTH_AFTER_RECEIPT');
      },
    },
  });
  return { repository, trace };
}

/** Controlled SQL/outcome protocol only, never a native lock/rollback proof. */
function controlledRepository(
  c: PrivateAtomicTransitionCandidate,
  options: {
    worldVersion?: string;
    eventSequence?: string;
    unknownAck?: boolean;
    denyAuth?: boolean;
    onSource?: (
      tx: SqlExecutor,
      request: Readonly<GoverningSourceCommitRequestV1>,
    ) => Promise<unknown>;
  } = {},
) {
  const calls: string[] = [];
  let receipt: FinalCommandReceipt | null = null;
  const command = c.command;
  const transaction: SqlExecutor = {
    async query<Row extends object>(sql: string) {
      calls.push(sql);
      let rows: readonly object[] = [];
      if (sql.includes('from world_v2.command_submission'))
        rows = [
          {
            actor_id: command.actorId,
            auth_subject: command.authSubject,
            command_id: command.commandId,
            command_fingerprint: command.fingerprint,
            command_type: command.commandType,
            canonical_payload: command.canonicalPayload,
            correlation_id: command.correlationId,
            country_id: command.countryId,
            idempotency_key: command.idempotencyKey,
            expected_world_version: command.expectedWorldVersion,
            office_id: command.officeId,
            payload_sha256: command.payloadHash,
            schema_version: command.schemaVersion,
            sim_time: command.simTime.toCanonicalValue(),
            submitted_at_real: command.submittedAtReal,
            world_id: command.worldId,
          },
        ];
      else if (sql.includes('from world_v2.command_receipt'))
        rows = receipt ? [receiptRow(receipt)] : [];
      else if (sql.includes('world_v2.assert_world_writer_commit_guard'))
        rows = [
          {
            world_version: options.worldVersion ?? '0',
            event_sequence: options.eventSequence ?? '0',
          },
        ];
      return {
        rows: rows as readonly Row[],
        rowCount: sql.startsWith('select') ? rows.length : 1,
      };
    },
  };
  const database: SqlDatabase = {
    async query<Row extends object>(sql: string) {
      calls.push('RECOVERY_READ');
      expect(sql).toContain('from world_v2.command_receipt');
      const rows: readonly object[] = receipt ? [receiptRow(receipt)] : [];
      return { rows: rows as readonly Row[], rowCount: rows.length };
    },
    async transaction(fn) {
      calls.push('BEGIN');
      try {
        const result = await fn(transaction);
        receipt = c.receipt;
        calls.push('COMMIT');
        if (options.unknownAck) throw Error('TEST_ONLY_COMMIT_ACK_UNKNOWN');
        return result;
      } catch (error) {
        if (!receipt) calls.push('ROLLBACK');
        throw error;
      }
    },
  };
  const repository = new AtomicTransitionRepository({
    database,
    workerId: 'WORKER_TEST',
    sha256Hex: digest,
    authorizationGuard: {
      async assertCurrent(tx) {
        expect(tx).toBe(transaction);
        calls.push('CURRENT_AUTH');
        if (options.denyAuth) throw Error('TEST_ONLY_AUTH_REVOKED');
      },
    },
    faultInjector: {
      async hit(phase) {
        calls.push(`PHASE:${phase}`);
      },
    },
    ...(options.onSource
      ? {
          sourceCommitProtectionPort: {
            async assertCurrentFrom(
              tx: SqlExecutor,
              request: Readonly<GoverningSourceCommitRequestV1>,
            ) {
              expect(tx).toBe(transaction);
              calls.push('SOURCE_CURRENT');
              // Deliberately invalid provider replies are negative fixtures only.
              return (await options.onSource!(
                tx,
                request,
              )) as SourceCommitCurrentnessAuditV1;
            },
          },
        }
      : {}),
  });
  return { repository, calls };
}

describe('bounded deferred source binding capture and exact old receipt recovery', () => {
  it('captures owned canonical text without freezing or retaining caller aliases', () => {
    const input = { nested: { revision: '1' } },
      c = candidate(input);
    expect(c.deferredGoverningSourceReadBinding).toEqual({
      canonicalData: '{"nested":{"revision":"1"}}',
      captureFailed: false,
    });
    input.nested.revision = '2';
    expect(c.deferredGoverningSourceReadBinding.canonicalData).toContain('"1"');
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(c.deferredGoverningSourceReadBinding)).toBe(true);
  });
  it.each([
    ['absent', true],
    ['null', false],
  ])('does not require %s metadata before recovery', async (_name, absent) => {
    const c = candidate(null, absent as boolean),
      r = receiptOnlyRepository(c);
    expect((await r.repository.commit(c)).source).toBe('EXISTING_COMMIT');
    expect(r.trace).toHaveLength(2);
  });
  it.each([
    ['undefined', () => undefined],
    ['function', () => () => true],
    ['number', () => 1],
    ['bigint', () => 1n],
    ['class', () => new Date('2026-10-25T00:00:00.000Z')],
    ['sparse', () => Array(2)],
    ['too many array entries', () => Array(10001).fill('x')],
    ['oversize string', () => 'x'.repeat(4194305)],
    [
      'too deep',
      () => {
        let v: unknown = 'x';
        for (let n = 0; n < 18; n++) v = { nested: v };
        return v;
      },
    ],
    [
      'cycle',
      () => {
        const v: Record<string, unknown> = {};
        v.self = v;
        return v;
      },
    ],
    ['symbol', () => ({ [Symbol('hidden')]: 'x' })],
    [
      'hidden',
      () =>
        Object.defineProperty({}, 'hidden', { value: 'x', enumerable: false }),
    ],
  ])(
    'marks malformed %s but still recovers exact committed receipt',
    async (_name, make) => {
      const c = candidate((make as () => unknown)());
      expect(c.deferredGoverningSourceReadBinding.captureFailed).toBe(true);
      expect(c.deferredGoverningSourceReadBinding.canonicalData).toBeNull();
      expect((await receiptOnlyRepository(c).repository.commit(c)).source).toBe(
        'EXISTING_COMMIT',
      );
    },
  );
  it('rejects nested accessors and proxies before caller code executes', async () => {
    let calls = 0;
    const getter = Object.defineProperty({}, 'value', {
      get() {
        calls++;
        return 'x';
      },
      enumerable: true,
    });
    const proxy = new Proxy(
      {},
      {
        getPrototypeOf() {
          calls++;
          throw Error('no trap');
        },
        ownKeys() {
          calls++;
          throw Error('no trap');
        },
      },
    );
    for (const value of [{ nested: getter }, { nested: proxy }]) {
      const c = candidate(value);
      expect(c.deferredGoverningSourceReadBinding.captureFailed).toBe(true);
      expect((await receiptOnlyRepository(c).repository.commit(c)).source).toBe(
        'EXISTING_COMMIT',
      );
    }
    expect(calls).toBe(0);
  });
  it('does not call an outer optional getter or nested toJSON', () => {
    let calls = 0;
    const f = fixture();
    Object.defineProperty(f.draft, 'governingSourceReadBinding', {
      get() {
        calls++;
        return {};
      },
    });
    const c = prepareAtomicTransitionCandidate({
      command: f.command,
      draft: f.draft,
      commitAuthorization: null,
      sha256Hex: digest,
    });
    expect(c.deferredGoverningSourceReadBinding.captureFailed).toBe(true);
    expect(
      candidate({
        toJSON() {
          calls++;
          return {};
        },
      }).deferredGoverningSourceReadBinding.captureFailed,
    ).toBe(true);
    expect(calls).toBe(0);
  });
});

describe('existing H and recovery mechanics remain authoritative for non-PLAN', () => {
  it('uses returned H before current authorization and event inserts', async () => {
    const c = candidate(null),
      r = controlledRepository(c);
    expect((await r.repository.commit(c)).source).toBe('NEW_COMMIT');
    const head = r.calls.findIndex((s) =>
      s.includes('world_v2.assert_world_writer_commit_guard'),
    );
    const auth = r.calls.indexOf('CURRENT_AUTH');
    const event = r.calls.findIndex((s) =>
      s.includes('insert into world_v2.authoritative_event'),
    );
    expect(head).toBeGreaterThan(0);
    expect(auth).toBeGreaterThan(head);
    expect(event).toBeGreaterThan(auth);
    expect(r.calls.at(-1)).toBe('COMMIT');
  });
  it('rejects the database actual WorldVersion mismatch before authorization/facts', async () => {
    const c = candidate(null),
      r = controlledRepository(c, { worldVersion: '1' });
    await expect(r.repository.commit(c)).rejects.toThrow(
      'different WorldVersion',
    );
    expect(r.calls).not.toContain('CURRENT_AUTH');
    expect(r.calls.some((s) => s.includes('insert into'))).toBe(false);
    expect(r.calls).toContain('ROLLBACK');
  });
  it('does not replace actual returned event head by prepared command text', async () => {
    const c = candidate(null),
      r = controlledRepository(c, { eventSequence: '9' });
    await expect(r.repository.commit(c)).rejects.toThrow();
    expect(r.calls).toContain('CURRENT_AUTH');
    expect(r.calls.some((s) => s.includes('insert into'))).toBe(false);
  });
  it('recovers an exact known receipt after simulated commit-ack loss without second inserts', async () => {
    const c = candidate({ bad: undefined }),
      r = controlledRepository(c, { unknownAck: true });
    const result = await r.repository.commit(c);
    expect(result.source).toBe('RECOVERED_AFTER_UNKNOWN_ACKNOWLEDGEMENT');
    expect(
      r.calls.filter((s) =>
        s.includes('insert into world_v2.authoritative_event'),
      ),
    ).toHaveLength(1);
    expect(r.calls.filter((s) => s === 'BEGIN')).toHaveLength(1);
    expect(r.calls).toContain('RECOVERY_READ');
  });
  it('keeps existing current-authorization refusal ahead of all new facts', async () => {
    const c = candidate(null),
      r = controlledRepository(c, { denyAuth: true });
    await expect(r.repository.commit(c)).rejects.toThrow(
      'TEST_ONLY_AUTH_REVOKED',
    );
    expect(r.calls.some((s) => s.includes('insert into'))).toBe(false);
    expect(r.calls).toContain('ROLLBACK');
  });
});

describe('genuine Core manual PLAN preparation and historical receipt priority', () => {
  it.each([
    ['absent', null],
    ['malformed', { bad: undefined }],
  ])(
    'recovers a manual PLAN with %s fresh-source data',
    async (_name, data) => {
      const f = await manualPlanCandidate(data);
      expect(f.candidate.authorityKind).toBe('DISCRETIONARY_USER');
      expect(f.candidate.commitAuthorization).not.toBeNull();
      expect(f.candidate.transition.events[0]!.eventType).toBe(
        SOCIAL_SERVICE_PLAN_EVENT,
      );
      expect(
        (
          await receiptOnlyRepository(f.candidate).repository.commit(
            f.candidate,
          )
        ).source,
      ).toBe('EXISTING_COMMIT');
    },
  );
});

async function freshPlan() {
  const identity = await manualPlanCandidate(null);
  const metadata = bindingFor(identity.command);
  return { ...(await manualPlanCandidate(metadata)), metadata };
}
function expectNoFacts(calls: readonly string[]) {
  expect(
    calls.some(
      (s) => s.includes('insert into') || s.includes('update world_v2.'),
    ),
  ).toBe(false);
  expect(calls).not.toContain('PHASE:BEFORE_EVENTS');
  expect(calls).toContain('ROLLBACK');
}
describe('mandatory fresh PLAN shared commit source boundary (controlled protocol)', () => {
  it('awaits the same-executor verifier after actual H/current auth, before events and COMMIT', async () => {
    const f = await freshPlan();
    let release!: () => void, started!: () => void;
    const entered = new Promise<void>((r) => {
      started = r;
    });
    const pending = new Promise<void>((r) => {
      release = r;
    });
    const r = controlledRepository(f.candidate, {
      onSource: async (_tx, request) => {
        expect(request.currentHead).toEqual({
          worldId: f.command.worldId,
          worldVersion: '0',
          eventSequence: '0',
        });
        expect(request.command).toBe(f.candidate.command);
        expect(request.transition).toBe(f.candidate.transition);
        expect(request.observedAtReal).toBe(at);
        expect(request.phase).toBe('BEFORE_EVENTS');
        expect(request.purpose).toBe(SOCIAL_PLAN_SOURCE_EVALUATION_PURPOSE);
        expect(request.readBinding).toEqual(f.metadata);
        expect(request.readBinding).not.toBe(f.metadata);
        expect(Object.isFrozen(request.readBinding)).toBe(true);
        started();
        await pending;
        return matchingAudit(request);
      },
    });
    const result = r.repository.commit(f.candidate);
    await entered;
    expect(r.calls).toContain('PHASE:AUTHORIZATION_RECHECKED');
    expect(r.calls).not.toContain('PHASE:BEFORE_EVENTS');
    expect(r.calls.some((s) => s.includes('insert into'))).toBe(false);
    expect(r.calls).not.toContain('COMMIT');
    release();
    expect((await result).source).toBe('NEW_COMMIT');
    expect(r.calls.indexOf('SOURCE_CURRENT')).toBeGreaterThan(
      r.calls.indexOf('CURRENT_AUTH'),
    );
    expect(r.calls.indexOf('PHASE:BEFORE_EVENTS')).toBeGreaterThan(
      r.calls.indexOf('SOURCE_CURRENT'),
    );
    expect(r.calls.at(-1)).toBe('COMMIT');
  });
  it.each([
    ['absent', null],
    ['malformed', { bad: undefined }],
    ['closed shape wrong', {}],
  ])(
    'refuses fresh PLAN %s binding before verifier/facts',
    async (_name, data) => {
      const f = await manualPlanCandidate(data);
      const r = controlledRepository(f.candidate, {
        onSource: async (request) => {
          throw Error(`MUST_NOT_CALL:${String(request)}`);
        },
      });
      await expect(r.repository.commit(f.candidate)).rejects.toThrow();
      expect(r.calls).not.toContain('SOURCE_CURRENT');
      expectNoFacts(r.calls);
    },
  );
  it('refuses a missing port, with no default pass', async () => {
    const f = await freshPlan(),
      r = controlledRepository(f.candidate);
    await expect(r.repository.commit(f.candidate)).rejects.toThrow(
      'server source protection port',
    );
    expectNoFacts(r.calls);
  });
  it.each([
    [
      'wrong command',
      (b: GoverningSourceReadBindingV1) => ({
        ...b,
        commandBinding: { ...b.commandBinding, commandId: 'OTHER_COMMAND' },
      }),
    ],
    [
      'wrong command hash',
      (b: GoverningSourceReadBindingV1) => ({
        ...b,
        commandBinding: {
          ...b.commandBinding,
          commandFingerprint: b.stateHash,
        },
      }),
    ],
    [
      'wrong read WorldVersion',
      (b: GoverningSourceReadBindingV1) => ({
        ...b,
        readHead: { ...b.readHead, worldVersion: '1' },
      }),
    ],
    [
      'wrong read event sequence',
      (b: GoverningSourceReadBindingV1) => ({
        ...b,
        readHead: { ...b.readHead, eventSequence: '1' },
      }),
    ],
    [
      'wrong SimTime',
      (b: GoverningSourceReadBindingV1) => ({
        ...b,
        commandBinding: { ...b.commandBinding, simTime: '2000' },
      }),
    ],
    [
      'wrong World',
      (b: GoverningSourceReadBindingV1) => ({
        ...b,
        scope: { ...b.scope, worldId: 'WORLD_OTHER' },
      }),
    ],
    [
      'wrong purpose',
      (b: GoverningSourceReadBindingV1) => ({ ...b, purpose: 'MATCH' }),
    ],
    [
      'extra field',
      (b: GoverningSourceReadBindingV1) => ({ ...b, sourceGrant: true }),
    ],
  ] as const)(
    'rejects captured %s via actual C consistency checks before verifier',
    async (_name, mutate) => {
      const f = await freshPlan();
      const altered = await manualPlanCandidate(mutate(f.metadata));
      const r = controlledRepository(altered.candidate, {
        onSource: async (_tx, request) => matchingAudit(request),
      });
      await expect(r.repository.commit(altered.candidate)).rejects.toThrow();
      expect(r.calls).not.toContain('SOURCE_CURRENT');
      expectNoFacts(r.calls);
    },
  );
  it.each([
    'revoked',
    'missing original body',
    'incomplete prefix',
    'changed manifest',
    'resource guard unavailable',
  ])('propagates verifier refusal: %s', async (reason) => {
    const f = await freshPlan(),
      r = controlledRepository(f.candidate, {
        onSource: async () => {
          throw Error(`TEST_ONLY:${reason}`);
        },
      });
    await expect(r.repository.commit(f.candidate)).rejects.toThrow(
      `TEST_ONLY:${reason}`,
    );
    expect(r.calls).toContain('SOURCE_CURRENT');
    expectNoFacts(r.calls);
  });
  it.each([
    ['void', () => undefined],
    ['boolean', () => true],
    ['null', () => null],
    [
      'extra',
      (a: SourceCommitCurrentnessAuditV1) => ({ ...a, extra: 'not allowed' }),
    ],
    [
      'missing',
      (a: SourceCommitCurrentnessAuditV1) => {
        const v = { ...a };
        Reflect.deleteProperty(v, 'readBindingFingerprint');
        return v;
      },
    ],
    [
      'wrong status',
      (a: SourceCommitCurrentnessAuditV1) => ({ ...a, status: 'PASS' }),
    ],
    [
      'wrong purpose',
      (a: SourceCommitCurrentnessAuditV1) => ({ ...a, purpose: 'MATCH' }),
    ],
    [
      'wrong command',
      (a: SourceCommitCurrentnessAuditV1) => ({
        ...a,
        commandFingerprint: canonicalSha256(
          canonicalHashInput('other'),
          digest,
        ),
      }),
    ],
    [
      'wrong head',
      (a: SourceCommitCurrentnessAuditV1) => ({
        ...a,
        currentHead: { ...a.currentHead, eventSequence: '9' },
      }),
    ],
    [
      'wrong read hash',
      (a: SourceCommitCurrentnessAuditV1) => ({
        ...a,
        readBindingFingerprint: a.commandFingerprint,
      }),
    ],
    [
      'wrong manifest hash',
      (a: SourceCommitCurrentnessAuditV1) => ({
        ...a,
        sourceManifestFingerprint: a.commandFingerprint,
      }),
    ],
    [
      'wrong revisions hash',
      (a: SourceCommitCurrentnessAuditV1) => ({
        ...a,
        sourceRevisionSetFingerprint: a.commandFingerprint,
      }),
    ],
    [
      'unproved mode',
      (a: SourceCommitCurrentnessAuditV1) => ({
        ...a,
        protectionMode: 'WORLD_REVISION_COUPLED',
      }),
    ],
  ] as const)('rejects %s audit before facts', async (_name, transform) => {
    const f = await freshPlan(),
      r = controlledRepository(f.candidate, {
        onSource: async (_tx, request) => transform(matchingAudit(request)),
      });
    await expect(r.repository.commit(f.candidate)).rejects.toThrow(
      'mismatched currentness audit',
    );
    expectNoFacts(r.calls);
  });
  it('rejects audit getters and proxies without executing provider-owned code', async () => {
    let traps = 0;
    for (const kind of ['getter', 'proxy']) {
      const f = await freshPlan(),
        r = controlledRepository(f.candidate, {
          onSource: async (_tx, req) => {
            const a = matchingAudit(req);
            return kind === 'getter'
              ? Object.defineProperty(a, 'status', {
                  get() {
                    traps++;
                    throw Error('NO_GETTER');
                  },
                  enumerable: true,
                })
              : new Proxy(a, {
                  ownKeys() {
                    traps++;
                    throw Error('NO_PROXY');
                  },
                });
          },
        });
      await expect(r.repository.commit(f.candidate)).rejects.toThrow(
        'mismatched currentness audit',
      );
      expectNoFacts(r.calls);
    }
    expect(traps).toBe(0);
  });
  it('uses actual returned event head rather than the matching prepared readHead', async () => {
    const f = await freshPlan(),
      r = controlledRepository(f.candidate, {
        eventSequence: '9',
        onSource: async (_tx, req) => matchingAudit(req),
      });
    await expect(r.repository.commit(f.candidate)).rejects.toThrow();
    expect(r.calls).toContain('CURRENT_AUTH');
    expect(r.calls).not.toContain('SOURCE_CURRENT');
    expectNoFacts(r.calls);
  });
  it('keeps actual H and current authorization failures ahead of source', async () => {
    for (const extra of [{ worldVersion: '1' }, { denyAuth: true }]) {
      const f = await freshPlan(),
        r = controlledRepository(f.candidate, {
          ...extra,
          onSource: async (_tx, req) => matchingAudit(req),
        });
      await expect(r.repository.commit(f.candidate)).rejects.toThrow();
      expect(r.calls).not.toContain('SOURCE_CURRENT');
      expectNoFacts(r.calls);
    }
  });
  it.each([{ officeId: null }, { officeId: 'SOCIAL' }])(
    'type-based guard cannot be bypassed by automatic/wrong-office PLAN: %o',
    async (overrides) => {
      const c = candidate({}, false, {
        ...overrides,
        commandType: SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
      });
      const r = controlledRepository(c, {
        onSource: async (_tx, req) => matchingAudit(req),
      });
      await expect(r.repository.commit(c)).rejects.toThrow('Fresh Social PLAN');
      expect(r.calls).not.toContain('SOURCE_CURRENT');
      expectNoFacts(r.calls);
    },
  );
  it('owned capture survives caller mutation and does not freeze caller data', async () => {
    const f = await freshPlan();
    Object.assign(f.metadata.sourceManifest, { revision: '2' });
    const r = controlledRepository(f.candidate, {
      onSource: async (_tx, req) => {
        expect(
          (req.readBinding as GoverningSourceReadBindingV1).sourceManifest
            .revision,
        ).toBe('1');
        return matchingAudit(req);
      },
    });
    expect(Object.isFrozen(f.metadata.sourceManifest)).toBe(false);
    expect((await r.repository.commit(f.candidate)).source).toBe('NEW_COMMIT');
  });
  it('recovers exact PLAN receipt after source revocation without another source call or event', async () => {
    const f = await freshPlan();
    let revoked = false;
    const r = controlledRepository(f.candidate, {
      onSource: async (_tx, req) => {
        if (revoked) throw Error('SOURCE_REVOKED');
        return matchingAudit(req);
      },
    });
    expect((await r.repository.commit(f.candidate)).source).toBe('NEW_COMMIT');
    revoked = true;
    expect((await r.repository.commit(f.candidate)).source).toBe(
      'EXISTING_COMMIT',
    );
    expect(r.calls.filter((s) => s === 'SOURCE_CURRENT')).toHaveLength(1);
    expect(
      r.calls.filter((s) =>
        s.includes('insert into world_v2.authoritative_event'),
      ),
    ).toHaveLength(1);
  });
  it('unknown-ack receipt recovery is not another physical attempt/source verification', async () => {
    const f = await freshPlan(),
      r = controlledRepository(f.candidate, {
        unknownAck: true,
        onSource: async (_tx, req) => matchingAudit(req),
      });
    expect((await r.repository.commit(f.candidate)).source).toBe(
      'RECOVERED_AFTER_UNKNOWN_ACKNOWLEDGEMENT',
    );
    expect(r.calls.filter((s) => s === 'SOURCE_CURRENT')).toHaveLength(1);
    expect(
      r.calls.filter((s) =>
        s.includes('insert into world_v2.authoritative_event'),
      ),
    ).toHaveLength(1);
  });
  it('does not silently reuse PLAN purpose for an inert automatic MATCH envelope', async () => {
    const c = candidate(null, false, {
        commandType: SOCIAL_JOB_MATCH_DUE_COMMAND,
      }),
      r = controlledRepository(c, {
        onSource: async () => {
          throw Error('NO_PLAN_PURPOSE_FOR_MATCH');
        },
      });
    expect((await r.repository.commit(c)).source).toBe('NEW_COMMIT');
    expect(r.calls).not.toContain('SOURCE_CURRENT');
  });
});
