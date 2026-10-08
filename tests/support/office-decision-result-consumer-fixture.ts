import { createHash } from 'node:crypto';
import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  CAPTAIN_POLITICAL_CAPITAL_COMMAND,
  CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
  CENTRAL_BANK_OMO_COMMAND,
  CENTRAL_BANK_OMO_EVENT,
  POLITICAL_CAPITAL_BUCKETS,
  SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
  SOCIAL_JOB_MATCH_DUE_COMMAND,
  SOCIAL_JOB_MATCH_RULE_VERSION,
  SOCIAL_SERVICE_PLAN_EVENT,
  SOCIAL_JOB_MATCH_EVENT,
  canonicalSha256,
  calculateOpenMarketOperation,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  createFoundationFact,
  captainPoliticalCapitalSourceHash,
  centralBankOmoSourceHash,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  prepareCaptainPoliticalCapitalEvent,
  createE01DailyBoundary,
  materializeOpeningLabourState,
  prepareSocialEmploymentServiceOperation,
  acquireWorldWriterLease,
  worldId,
  workerId,
  worldWriterLeaseRequest,
  createWorldWriterCommitAssertion,
  type CanonicalCommand,
  type FoundationTraceRequest,
  type CentralBankOmoSourceFacts,
  type SocialEmploymentServiceState,
  type SocialEmploymentReadFacts,
} from '@econmind/core';
import {
  projectOfficeDecisionResult,
  type CommittedOfficeDecisionTransition,
} from '../../apps/world-worker/src/projections/office-decision-result-projector.js';
import { AuthoritativeActivityReadProjectionPublisher } from '../../apps/world-worker/src/projections/authoritative-activity-read-projection-publisher.js';
import type { EconomicReadVisibilitySnapshot } from '../../apps/world-worker/src/projections/economic-read-visibility-source.js';
import {
  createWorldReadRequest,
  parseSupabaseAuthSubject,
  readEntitledWorldProjection,
} from '../../apps/world-api/src/index.js';
import type { ParameterizedPgReadRequest } from '../../apps/world-api/src/integration/postgres-read-adapter.js';
import type {
  SqlDatabase,
  SqlExecutor,
  SqlQueryResult,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import { createProductionReadClient } from '../../apps/world-web/src/production-read/client.js';
import type { OfficeRole } from '../../apps/world-web/src/office-projection/model.js';
import { officeProjectionFixture } from '../world-web/office-projection-fixture.js';
const WORLD = 'WORLD_TEST_ONLY_DECISION_RESULTS',
  COUNTRY = 'COUNTRY_01',
  AT = '2026-10-08T00:00:00.000Z';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const q = (amount: string) => ({ amount, unit: 'political_capital' });
function command(
  office: string | null,
  commandType: string,
  payload: unknown,
  version = '0',
  id = 'COMMAND_TEST_RESULT',
): CanonicalCommand {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      worldId: WORLD,
      countryId: COUNTRY,
      officeId: office,
      commandType,
      commandId: id,
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      correlationId: 'CORRELATION_TEST_RESULT',
      expectedWorldVersion: version,
      idempotencyKey: `IDEM_${id}`,
      simTime: '10000',
      submittedAtReal: AT,
      payload,
    },
    sha,
  );
}
function committed(
  cmd: CanonicalCommand,
  event: ReturnType<typeof parseAuthoritativeEvent>,
): CommittedOfficeDecisionTransition {
  const transition = createAuthoritativeTransition({
    command: cmd,
    worldVersionBefore: cmd.expectedWorldVersion!,
    worldVersionAfter: event.worldVersion,
    events: [event],
  });
  return {
    command: cmd,
    transition,
    receipt: createFinalCommandReceipt({
      command: cmd,
      transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: cmd.simTime,
      recordedAtReal: AT,
    }),
  };
}
function event(
  cmd: CanonicalCommand,
  type: string,
  payload: unknown,
  sequence = (BigInt(cmd.expectedWorldVersion!) + 1n).toString(),
) {
  return parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: `EVENT_${cmd.commandId}`,
      eventType: type,
      worldId: cmd.worldId,
      causationCommandId: cmd.commandId,
      correlationId: cmd.correlationId,
      worldVersion: (BigInt(cmd.expectedWorldVersion!) + 1n).toString(),
      sequence,
      simTime: cmd.simTime.toCanonicalValue(),
      recordedAtReal: AT,
      correctsEventId: null,
      payload,
    },
    sha,
  );
}
function trace(version = '0'): FoundationTraceRequest {
  return {
    traceRef: 'TRACE.TEST_ONLY.RESULT',
    calculationVersion: 'TEST_ONLY.RESULT.1',
    snapshot: {
      lineageRef: WORLD,
      sourceVersion: `WORLD_VERSION_${version}`,
      snapshotRef: 'SNAPSHOT.TEST_ONLY.RESULT',
      snapshotHash: 'a'.repeat(64),
      predecessorSnapshotHash: 'b'.repeat(64),
    },
    snapshotAt: { amount: '10000', unit: 'sim_millisecond' },
  };
}
function captain(): CommittedOfficeDecisionTransition {
  const intent = {
    schemaVersion: CAPTAIN_POLITICAL_CAPITAL_PAYLOAD_SCHEMA,
    fromBucket: 'FISCAL_REFORM',
    toBucket: 'INDUSTRIAL_STRATEGY',
    amount: q('2.75'),
    reasonFactRef: 'FACT.TEST_ONLY.REASON',
  };
  const cmd = command('CAPTAIN', CAPTAIN_POLITICAL_CAPITAL_COMMAND, intent);
  const capital = {
    capitalRef: 'CAPITAL.TEST_ONLY.RESULT',
    countryRef: COUNTRY,
    opening: q('35'),
    generated: q('7'),
    total: q('42'),
    available: q('38'),
    spent: q('4'),
    closing: q('38'),
    buckets: POLITICAL_CAPITAL_BUCKETS.map((bucket, i) => ({
      bucket,
      balance: q(['11.5', '6.25', '4', '5', '3', '2', '6.25'][i]!),
    })),
  };
  const facts = (t: FoundationTraceRequest) => ({
    capitalFact: createFoundationFact({
      trace: t,
      factRef: 'FACT.TEST_ONLY.CAPITAL',
      sourceRef: 'SOURCE.TEST_ONLY.CAPITAL',
      predecessorFactRefs: ['EVENT.TEST_ONLY.OPENING'],
      payload: capital,
    }),
    reasonFact: createFoundationFact({
      trace: t,
      factRef: intent.reasonFactRef,
      sourceRef: 'SOURCE.TEST_ONLY.REASON',
      predecessorFactRefs: ['EVENT.TEST_ONLY.CABINET'],
      payload: {
        countryRef: COUNTRY,
        recordRef: 'RECORD.TEST_ONLY.CABINET',
        reason: 'Explicit TEST_ONLY committed redistribution.',
      },
    }),
  });
  const scope = {
    worldId: WORLD,
    countryId: COUNTRY,
    worldVersion: '0',
    lastEventSequence: '0',
  };
  const t = trace(),
    bound = {
      ...t,
      snapshot: {
        ...t.snapshot,
        snapshotHash: captainPoliticalCapitalSourceHash(
          { ...scope, ...facts(t) },
          sha,
        ),
      },
    };
  return committed(
    cmd,
    prepareCaptainPoliticalCapitalEvent({
      command: cmd,
      source: { ...scope, trace: bound, ...facts(bound) },
      eventId: `EVENT_${cmd.commandId}`,
      recordedAtReal: AT,
      sha256Hex: sha,
    }).event,
  );
}
function cb(): CommittedOfficeDecisionTransition {
  const money = (amount: string) => ({ amount, currency: 'GBP' });
  const bank = {
    bankRef: 'ENTITY_TEST_BANK',
    centralBankRef: 'ENTITY_TEST_CB',
    currency: 'GBP',
    reservesAtCentralBank: money('100'),
    settlementCash: money('10'),
    loanAssets: money('10'),
    governmentSecurities: money('100'),
    otherAssets: money('10'),
    demandDeposits: money('100'),
    savingsDeposits: money('10'),
    timeDeposits: money('10'),
    wholesaleFunding: money('10'),
    centralBankRefinancingBorrowing: money('10'),
    centralBankEmergencyLiquidityBorrowing: money('10'),
    otherLiabilities: money('10'),
    equity: money('70'),
    nonPerformingLoans: money('0'),
  };
  const centralBank = {
    centralBankRef: bank.centralBankRef,
    commercialBankRef: bank.bankRef,
    currency: 'GBP',
    governmentSecurities: money('100'),
    regularRefinancingLoans: money('10'),
    emergencyLiquidityLoans: money('10'),
    otherAssets: money('10'),
    currencyInCirculation: money('10'),
    commercialBankReserves: money('100'),
    treasuryDeposits: money('5'),
    centralBankBills: money('5'),
    otherLiabilities: money('5'),
    equity: money('5'),
  };
  const intent = {
    schemaVersion: 'central-bank-omo-intent-v1',
    direction: 'BUY_GOVERNMENT_SECURITIES' as const,
    securityRef: 'SECURITY_TEST',
    batchRef: 'BATCH_TEST',
    faceValue: money('8'),
    settlementSimTime: '10000',
    policyNote: null,
  };
  const cmd = command('CENTRAL_BANK', CENTRAL_BANK_OMO_COMMAND, intent);
  const facts = {
    worldId: WORLD,
    countryId: COUNTRY,
    worldVersion: '0',
    currentEventSequence: '0',
    currentSimTime: '10000',
    domesticTreasuryRef: 'ENTITY_TEST_TREASURY',
    bank,
    centralBank,
    bankAccounts: {},
    centralBankAccounts: {
      governmentSecurities: 'ACCOUNT_TEST_CB_SECURITIES',
      commercialBankReserves: 'ACCOUNT_TEST_CB_RESERVES',
    },
    holdings: [],
    quote: {
      quoteRef: 'QUOTE_TEST',
      securityRef: 'SECURITY_TEST',
      batchRef: 'BATCH_TEST',
      issuerRef: 'ENTITY_TEST_TREASURY',
      currency: 'GBP',
      pricePerFace: '1.25',
      validAtSimTime: '10000',
      sourceRef: 'SOURCE.TEST_ONLY.QUOTE',
      worldVersion: '0',
    },
  } as unknown as CentralBankOmoSourceFacts;
  const t = trace(),
    bound = {
      ...t,
      snapshot: {
        ...t.snapshot,
        sourceVersion: 'WORLD_VERSION.0',
        snapshotHash: centralBankOmoSourceHash(facts, sha),
      },
    };
  const fact = <T>(kind: string, value: T) =>
    createFoundationFact({
      trace: bound,
      factRef: `CB1.${kind}`,
      sourceRef: bound.snapshot.snapshotRef,
      predecessorFactRefs: [bound.snapshot.lineageRef],
      payload: value,
    });
  const kernel = calculateOpenMarketOperation({
    trace: bound,
    commercialBankFact: fact('Bank', bank),
    centralBankFact: fact('CentralBank', centralBank),
    operationFact: fact('Operation', {
      bankRef: bank.bankRef,
      centralBankRef: bank.centralBankRef,
      operationRef: cmd.commandId,
      securityRef: intent.securityRef,
      direction: intent.direction,
      settlementAmount: money('10'),
    }),
    outputRef: 'CB1.Output',
  });
  return committed(
    cmd,
    event(cmd, CENTRAL_BANK_OMO_EVENT, {
      schemaVersion: 'central-bank-omo-settlement-v1',
      commandFingerprint: cmd.fingerprint,
      intent,
      source: facts,
      trace: bound,
      rights: { before: [], after: [], settlementAmount: money('10') },
      kernelReplayHash: canonicalSha256(kernel.replayProof.hashInput, sha),
    }),
  );
}
function social(): readonly CommittedOfficeDecisionTransition[] {
  const scope = {
    countryId: COUNTRY,
    locationId: 'LOCATION_TEST',
    skill: 'HIGH' as const,
  };
  const populationAvailability = [
    {
      countryId: COUNTRY,
      locationId: scope.locationId,
      workingAgeAvailable: '7',
    },
  ];
  const opening = materializeOpeningLabourState({
    targets: [{ ...scope, count: '2' }],
    populationAvailability,
    skillAvailability: [{ ...scope, count: '7' }],
    nonEmployedAggregates: [
      { ...scope, status: 'UNEMPLOYED_SEARCHING', count: '5' },
    ],
    employers: [
      { countryId: COUNTRY, employerId: 'ENTITY_TEST_OPERATOR', role: 'OP' },
    ],
    positions: [
      {
        ...scope,
        positionId: 'POSITION_TEST',
        requiredCount: '6',
        sourceWeight: '1',
        owner: 'PRIVATE_SECTOR',
        classificationId: 'SECTOR_FOOD',
        employerId: 'ENTITY_TEST_OPERATOR',
        employerRole: 'OP',
        occupation: 'GENERAL',
        wageAmount: '2.5',
        wageCurrency: 'GCU',
        wagePeriod: 'SIM_HOUR',
        wageVersion: 'WAGE_TEST',
        payrollFundingRef: 'PAYROLL_TEST',
      },
    ],
  });
  const state: SocialEmploymentServiceState = {
    schemaVersion: 'social-employment-service-state-v1',
    worldId: WORLD,
    labour: opening.state,
    servicePools: [
      {
        ...scope,
        poolId: 'POOL_TEST',
        dayIndex: '1',
        ruleVersion: SOCIAL_JOB_MATCH_RULE_VERSION,
        capacitySlots: '3',
        usedSlots: '0',
        reservedSlots: '0',
      },
    ],
    plans: [],
    appliedOperations: [],
  };
  const readFacts: SocialEmploymentReadFacts = {
    boundary: createE01DailyBoundary('0'),
    simTime: '10000',
    populationAvailability,
    offer: {
      ...scope,
      positionId: 'POSITION_TEST',
      employerId: 'ENTITY_TEST_OPERATOR',
      employerRole: 'OP',
      legalPositionRef: 'LEGAL_TEST',
      payrollFundingRef: 'PAYROLL_TEST',
      offerVersion: 'OFFER_TEST',
      state: 'ACTIVE',
      wageVersion: 'WAGE_TEST',
      amount: '2.5',
      currency: 'GCU',
      period: 'SIM_HOUR',
      validFromDayIndex: '0',
      validUntilDayIndex: '10',
    },
    minimumWage: {
      countryId: COUNTRY,
      ruleId: 'RULE_TEST',
      ruleVersion: 'RULE_TEST_V1',
      amount: '2',
      currency: 'GCU',
      period: 'SIM_HOUR',
      validFromDayIndex: '0',
      validUntilDayIndex: '10',
    },
  };
  const plan = command(
    'SOCIAL',
    SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
    {
      schemaVersion: 'social-employment-service-plan-v1',
      ...scope,
      positionId: 'POSITION_TEST',
      servicePoolId: 'POOL_TEST',
      requestedMatches: '3',
      dueDayIndex: '1',
    },
    '0',
    'COMMAND_TEST_PLAN',
  );
  // countryId belongs to the envelope, not to the strict intent.
  const payload = JSON.parse(plan.canonicalPayload) as Record<string, unknown>;
  delete payload.countryId;
  const strictPlan = command(
    'SOCIAL',
    SOCIAL_EMPLOYMENT_SERVICE_PLAN_COMMAND,
    payload,
    '0',
    'COMMAND_TEST_PLAN',
  );
  const preparedPlan = prepareSocialEmploymentServiceOperation({
    command: strictPlan,
    state,
    readFacts,
    sha256Hex: sha,
  });
  const due = command(
    null,
    SOCIAL_JOB_MATCH_DUE_COMMAND,
    {
      schemaVersion: 'social-job-match-settlement-v1',
      planCommandId: strictPlan.commandId,
      planFingerprint: strictPlan.fingerprint,
      dueDayIndex: '1',
      ruleVersion: SOCIAL_JOB_MATCH_RULE_VERSION,
    },
    '1',
    'COMMAND_TEST_DUE',
  );
  const preparedMatch = prepareSocialEmploymentServiceOperation({
    command: due,
    state: preparedPlan.state,
    readFacts: { ...readFacts, boundary: createE01DailyBoundary('1') },
    sha256Hex: sha,
  });
  return [
    committed(
      strictPlan,
      event(strictPlan, SOCIAL_SERVICE_PLAN_EVENT, preparedPlan.eventPayload),
    ),
    committed(
      due,
      event(due, SOCIAL_JOB_MATCH_EVENT, preparedMatch.eventPayload),
    ),
  ];
}
function visibility(
  version: string,
  sequence = version,
  allow = true,
): EconomicReadVisibilitySnapshot {
  return {
    worldId: WORLD,
    worldVersion: version,
    eventSequence: sequence,
    openingBinding: null,
    financial: (account, scope) =>
      allow &&
      account.ownerId === 'ENTITY_TEST_CB' &&
      scope.officeId === 'CENTRAL_BANK'
        ? { status: 'AUTHORIZED', sourceUnits: ['TEST_ONLY'] }
        : { status: 'NOT_AUTHORIZED', reason: 'SCOPE_NOT_AUTHORIZED' },
    inventory: () => ({
      status: 'NOT_AUTHORIZED',
      reason: 'SCOPE_NOT_AUTHORIZED',
    }),
    summary: () => ({
      schemaVersion: 'economic-read-visibility-v1',
      financialDetail: allow ? 'AUTHORIZED_FILTERED' : 'NOT_AUTHORIZED',
      inventoryDetail: 'NOT_AUTHORIZED',
      countrySummary: 'NOT_AUTHORIZED',
    }),
  };
}
function project(
  transitions: readonly CommittedOfficeDecisionTransition[],
  officeId: string,
  extra: Record<string, unknown> = {},
) {
  const head = {
    worldId: WORLD,
    worldVersion: transitions.at(-1)?.transition.worldVersionAfter ?? '0',
    eventSequence:
      transitions.at(-1)?.transition.events.at(-1)?.sequence ?? '0',
  };
  return projectOfficeDecisionResult({
    countryId: COUNTRY,
    officeId,
    sourceHead: head,
    transitions,
    visibility: visibility(head.worldVersion, head.eventSequence),
    sha256Hex: sha,
    ...extra,
  });
}
/** TEST_ONLY held-SQL double: canonical records only, no DB/service/World startup. */
class HeldDatabase implements SqlDatabase {
  active = true;
  corrupt = false;
  readonly statements: string[] = [];
  projections: readonly {
    classification: unknown;
    payload: string;
    row: Record<string, unknown>;
  }[] = [];
  constructor(
    readonly value = captain(),
    readonly scopedOffice = value.command.officeId ?? 'SOCIAL',
  ) {}
  async transaction<R>(
    operation: (transaction: SqlExecutor) => Promise<R>,
  ): Promise<R> {
    const prior = this.projections;
    try {
      return await operation(this);
    } catch (error) {
      this.projections = prior;
      throw error;
    }
  }
  async query<R extends object = Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[] = [],
  ): Promise<SqlQueryResult<R>> {
    this.statements.push(sql);
    let rows: object[] = [];
    const { command: c, receipt: r } = this.value,
      e = this.value.transition.events[0]!;
    if (sql.includes('assert_world_writer_commit_guard'))
      rows = [{ world_version: '1', event_sequence: '1' }];
    else if (sql.includes('from world_v2.current_commit_authorization'))
      rows = this.active
        ? [{ country_id: COUNTRY, office_id: this.scopedOffice }]
        : [];
    else if (sql.includes('count(event.event_id)'))
      rows = [
        {
          country_id: COUNTRY,
          office_id: c.officeId,
          event_count: '1',
          last_event_sequence: '1',
          last_event_world_version: '1',
        },
      ];
    else if (sql.includes('from world_v2.world_head'))
      rows = [{ world_version: '1', event_sequence: '1' }];
    else if (sql.includes('to_regclass'))
      rows = [{ opening: null, admission: null }];
    else if (sql.includes('to_jsonb(event)'))
      rows = [
        {
          event_row: {
            schema_version: e.schemaVersion,
            world_id: e.worldId,
            event_id: e.eventId,
            event_type: e.eventType,
            causation_command_id: e.causationCommandId,
            correlation_id: e.correlationId,
            world_version: e.worldVersion,
            event_sequence: e.sequence,
            sim_time: e.simTime.toCanonicalValue(),
            recorded_at_real: e.recordedAtReal,
            corrects_event_id: e.correctsEventId,
            canonical_payload: e.canonicalPayload,
            event_fingerprint: this.corrupt
              ? `sha256:${'f'.repeat(64)}`
              : e.fingerprint,
            payload_sha256: e.payloadHash,
          },
          receipt_row: {
            schema_version: r.schemaVersion,
            world_id: r.worldId,
            command_id: r.commandId,
            idempotency_key: r.idempotencyKey,
            command_fingerprint: r.commandFingerprint,
            outcome: r.outcome,
            reason_code: r.reasonCode,
            transition_id: r.transitionId,
            world_version_before: r.worldVersionBefore,
            world_version_after: r.worldVersionAfter,
            sim_time: r.simTime.toCanonicalValue(),
            event_ids: r.eventIds,
            recorded_at_real: r.recordedAtReal,
          },
        },
      ];
    else if (sql.includes('from world_v2.command_submission'))
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
    else if (sql.includes('delete from world_v2.read_projection'))
      this.projections = [];
    else if (sql.includes('insert into world_v2.read_projection'))
      this.projections = [
        ...this.projections,
        {
          classification: parameters[1],
          payload: String(parameters[6]),
          row: {
            world_id: parameters[0],
            classification: parameters[1],
            scope_key: parameters[2],
            schema_version: parameters[3],
            world_version: parameters[4],
            event_sequence: parameters[5],
            payload: JSON.parse(String(parameters[6])),
            generated_at: parameters[7],
          },
        },
      ];
    else if (sql.includes('count(*)')) rows = [{ count: '0' }];
    else if (!sql.includes('posting'))
      throw new Error(`Unimplemented held SQL: ${sql}`);
    return { rows: rows as R[], rowCount: rows.length };
  }
}

/** Canonical helpers/held SQL copied mechanically from E's reviewed
 * office-decision-result-projector.test.ts at 5e8a405 (b64a140 integration).
 * No economic fixtures are installed into any page or real database. */
export async function publishedDecisionFixture(
  role: OfficeRole,
  classification: 'COUNTRY' | 'OFFICE_PRIVATE' = 'OFFICE_PRIVATE',
) {
  const records =
    role === 'social' ? social() : [role === 'central_bank' ? cb() : captain()];
  const db = new HeldDatabase(records[0]!, role.toUpperCase());
  const assertion = createWorldWriterCommitAssertion(
    acquireWorldWriterLease(
      null,
      worldWriterLeaseRequest(
        worldId(WORLD),
        workerId('WORKER_TEST_ONLY_RESULT'),
        AT,
        '2026-10-08T00:05:00.000Z',
      ),
    ).lease,
    '1',
  );
  await new AuthoritativeActivityReadProjectionPublisher({
    database: db,
    workerId: 'WORKER_TEST_ONLY_RESULT',
  }).replace({ assertion, observedAtReal: AT });
  const stored = db.projections.find(
    (p) => p.classification === classification,
  )!.row;
  const subject = parseSupabaseAuthSubject(
    '11111111-1111-4111-8111-111111111111',
  );
  const assertQuery = (request: ParameterizedPgReadRequest) => {
    if (
      request.verifiedAuthSubject !== subject ||
      JSON.stringify(request.values.slice(0, 4)) !==
        JSON.stringify([subject, WORLD, classification, stored.scope_key]) ||
      !request.text.includes('entitlement.active') ||
      !request.text.includes('entitlement.revoked_at is null')
    )
      throw Error('Actual TEST_ONLY strict reader subject/scope query changed');
  };
  const dto = await readEntitledWorldProjection({
    executor: {
      query: async (request) => {
        assertQuery(request);
        return { rows: db.active ? [structuredClone(stored)] : [] };
      },
    },
    authSubject: subject,
    request: createWorldReadRequest({
      requestId: '11111111-1111-4111-8111-111111111112',
      worldId: WORLD,
      classification,
      scopeKey: String(stored.scope_key),
    }),
  });
  if (!dto) throw Error('Actual strict reader returned no TEST_ONLY DTO');
  const base = officeProjectionFixture(role);
  Object.assign(base.config.identity, {
    worldId: WORLD,
    countryId: COUNTRY,
    classification,
    scopeKey: dto.scopeKey,
  });
  const config = {
    ...base.config,
    world: { ...base.config.world, worldId: WORLD },
  };
  let data = structuredClone(dto);
  let failHttp = 0;
  const fetcher: typeof fetch = async (_input, init) => {
    if (failHttp) return new Response(null, { status: failHttp });
    const request = JSON.parse(String(init?.body)) as { requestId: string };
    return Response.json({
      schemaVersion: 'world-authorized-read-binding-v1',
      requestId: request.requestId,
      ok: true,
      authority: {
        source: 'SERVER_VERIFIED_READ_BINDING',
        capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
        identity: config.identity,
        seatRef: config.seatRef,
        seatState: 'ACTIVE',
        seed: {
          worldId: WORLD,
          seedRef: config.world.seedRef,
          contentHash: config.world.contentHash,
          admissionRef: config.world.admissionRef,
        },
        readback: {
          worldId: WORLD,
          seedRef: config.world.seedRef,
          contentHash: config.world.contentHash,
          admissionRef: config.world.admissionRef,
          worldVersion: data.watermark.worldVersion,
          eventSequence: data.watermark.eventSequence,
          readbackRef: 'TEST_READBACK',
        },
      },
      result: {
        schemaVersion: 'world-read-api-v1',
        requestId: request.requestId,
        ok: true,
        data,
      },
    });
  };
  return {
    config,
    dto,
    db,
    binding: { read: config, view: base.binding.view },
    client: () => createProductionReadClient(config, { fetcher }),
    invalidate: base.invalidate,
    setData: (value: typeof dto) => {
      data = structuredClone(value);
    },
    fail: (status = 503) => {
      failHttp = status;
    },
    // Additional domain outputs use the real reviewed pure projector, never browser arithmetic.
    projected: () => project(records, config.identity.officeId),
    // Pure domain result -> actual strict API reader, with TEST_ONLY disclosure.
    // This additional path is NOT the unmodified publisher denial path above.
    async domainDto() {
      const result = project(records, config.identity.officeId);
      if (!result)
        throw Error('No domain result contract for this TEST_ONLY office');
      const wire = structuredClone(dto);
      const payload = wire.payload as Record<string, unknown>;
      payload.decisionResult = result;
      const ledger = payload.ledger as Record<string, unknown>;
      (ledger.visibility as Record<string, unknown>).financialDetail =
        role === 'central_bank' ? 'AUTHORIZED_FILTERED' : 'NOT_AUTHORIZED';
      Object.assign(wire.watermark, {
        worldVersion: result.sourceHead.worldVersion,
        eventSequence: result.sourceHead.eventSequence,
      });
      const checked = await readEntitledWorldProjection({
        executor: {
          query: async (request) => {
            assertQuery(request);
            return {
              rows: [
                {
                  ...stored,
                  payload,
                  world_version: wire.watermark.worldVersion,
                  event_sequence: wire.watermark.eventSequence,
                },
              ],
            };
          },
        },
        authSubject: subject,
        request: createWorldReadRequest({
          requestId: '11111111-1111-4111-8111-111111111112',
          worldId: WORLD,
          classification,
          scopeKey: String(stored.scope_key),
        }),
      });
      if (!checked) throw Error('Strict domain DTO unavailable');
      return checked;
    },
  };
}
