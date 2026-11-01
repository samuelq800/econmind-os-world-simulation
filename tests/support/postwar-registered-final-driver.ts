/** TEST_ONLY orchestration of the actual registered child. This module has no
 * source publisher, authorization writer, clock mutation or receipt factory.
 * SQL is inspection of the owned installation, never an economic write. */
import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandRequestDto,
  type ManualOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
import {
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
  WorldDecimal,
  Money,
  canonicalDecimal,
} from '@econmind/core';
import { startPostwarRegisteredFinalNodeChild } from './postwar-registered-final-child.js';
import { serializePostwarSocialPrefixEvidence } from './postwar-social-prefix-evidence-json.js';
import type { RegisteredIndustryStoredStage } from './registered-final-industry-steps.js';

export type RegisteredFinalChild = Awaited<
  ReturnType<typeof startPostwarRegisteredFinalNodeChild>
>;
export interface RegisteredFinalHead {
  readonly worldVersion: string;
  readonly eventSequence: string;
}
export interface RegisteredStoredCommand extends Omit<
  RegisteredIndustryStoredStage,
  'officeId'
> {
  readonly officeId: string | null;
  readonly queueState: string;
  readonly receiptEventIds: readonly string[];
  readonly financialBatchFingerprints: readonly string[];
  readonly inventoryPostingFingerprints: readonly string[];
}
export function registeredFinalAssert(
  value: unknown,
  reason: string,
): asserts value {
  if (!value) throw Error('REGISTERED_FINAL_DRIVER:' + reason);
}
export function registeredFinalRecord(value: unknown): Record<string, unknown> {
  registeredFinalAssert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'OBJECT_REQUIRED',
  );
  return value as Record<string, unknown>;
}
const uint = (v: unknown): v is string =>
  typeof v === 'string' && /^(0|[1-9][0-9]*)$/u.test(v);
const fp = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[a-f0-9]{64}$/u.test(v);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Planning request DATA only. Actual current source and economic guards still
 * decide admission. One requested output unit; exact source capacity and filled
 * workers determine the finite window. The cap is an explicit conservative
 * request limit derived from existing site payroll reservations, never a wage. */
export function deriveRegisteredFinalIndustryRunPlan(value: unknown) {
  const data = registeredFinalRecord(value),
    site = registeredFinalRecord(data.site),
    source = registeredFinalRecord(data.source),
    funding = registeredFinalRecord(data.fundingAccount);
  registeredFinalAssert(
    data.classification ===
      'ACTUAL_CURRENT_INDUSTRY_PLANNING_DATA_NOT_EXECUTION_AUTHORITY' &&
      site.countryId === 'COUNTRY_02' &&
      site.facilityId === 'OPEN-02-REFINED_FUEL' &&
      data.currentSimTime === '0',
    'ACTUAL_C2_T0_PLANNING_DATA_REQUIRED',
  );
  registeredFinalAssert(
    Array.isArray(site.positions) &&
      Array.isArray(data.currentEmployment) &&
      Array.isArray(data.positionFunding) &&
      Array.isArray(data.financialPositions),
    'ACTUAL_SITE_PEOPLE_AND_FINANCIAL_ORIGINALS_REQUIRED',
  );
  const counts = new Map(
    data.currentEmployment.map((p: unknown) => {
      const r = registeredFinalRecord(p);
      registeredFinalAssert(
        typeof r.positionId === 'string' && uint(r.employedCount),
        'ACTUAL_FILLED_COUNT_REQUIRED',
      );
      return [r.positionId, r.employedCount] as const;
    }),
  );
  let workers = 0n;
  for (const item of site.positions) {
    const p = registeredFinalRecord(item);
    registeredFinalAssert(
      typeof p.positionId === 'string' &&
        uint(p.count) &&
        counts.has(p.positionId),
      'EXACT_SOURCE_POSITION_AND_CURRENT_COUNT_REQUIRED',
    );
    const n = BigInt(counts.get(p.positionId)!);
    registeredFinalAssert(
      n <= BigInt(p.count),
      'CURRENT_FILLED_CANNOT_EXCEED_SOURCE_PEOPLE',
    );
    workers += n;
  }
  registeredFinalAssert(
    workers > 0n &&
      typeof site.capacityPerSimDay === 'string' &&
      typeof site.labourPersonDaysPerOutput === 'string' &&
      typeof site.outputUnit === 'string',
    'POSITIVE_ACTUAL_CAPACITY_AND_LABOUR_REQUIRED',
  );
  const capacity = new WorldDecimal(site.capacityPerSimDay),
    personMs = new WorldDecimal(site.labourPersonDaysPerOutput).times(
      '28800000',
    );
  registeredFinalAssert(
    capacity.isPositive() && personMs.isPositive() && personMs.isInteger(),
    'EXACT_REQUIRED_PERSON_MILLISECONDS_REQUIRED',
  );
  const duration = WorldDecimal.max(
    new WorldDecimal('86400000').dividedBy(capacity).ceil(),
    personMs.dividedBy(workers.toString()).ceil(),
    '1',
  );
  registeredFinalAssert(
    duration.lessThanOrEqualTo('28800000'),
    'ACTUAL_ONE_DAY_WORKER_AND_CAPACITY_WINDOW_REQUIRED',
  );
  let reservation = new WorldDecimal('0');
  const positions = new Set(
    site.positions.map((p: unknown) => registeredFinalRecord(p).positionId),
  );
  const seen = new Set<unknown>();
  for (const item of data.positionFunding) {
    const p = registeredFinalRecord(item);
    registeredFinalAssert(
      positions.has(p.positionId) &&
        !seen.has(p.positionId) &&
        p.accountRef === funding.accountRef &&
        p.currency === funding.currency &&
        typeof p.amount === 'string',
      'ACTUAL_UNIQUE_POSITION_PAYROLL_RESERVATION_REQUIRED',
    );
    seen.add(p.positionId);
    reservation = reservation.add(p.amount);
  }
  registeredFinalAssert(
    seen.size === positions.size &&
      reservation.isPositive() &&
      typeof funding.currency === 'string' &&
      typeof funding.reservedAmount === 'string',
    'COMPLETE_EXISTING_SITE_PAYROLL_BOUND_REQUIRED',
  );
  // Reuse the exact existing site daily payroll reservation as an explicitly
  // chosen test request ceiling. This is neither a new cost formula nor pay.
  // The runtime independently computes actual completed-work earnings.
  const cap = Money.from(canonicalDecimal(reservation), funding.currency);
  registeredFinalAssert(
    cap.amount.isPositive() && data.financialPositions.length === 1,
    'POSITIVE_CAP_AND_CURRENT_OPERATOR_ACCOUNT_REQUIRED',
  );
  const balance = registeredFinalRecord(
    registeredFinalRecord(data.financialPositions[0]).netDebitBalance,
  );
  registeredFinalAssert(
    typeof balance.amount === 'string' &&
      balance.currency === funding.currency &&
      new WorldDecimal(balance.amount)
        .minus(funding.reservedAmount)
        .greaterThanOrEqualTo(cap.amount),
    'ACTUAL_UNRESERVED_OPERATOR_FUNDS_MUST_COVER_REQUEST_CAP',
  );
  return Object.freeze({
    sourceRef: source.sourceRef,
    sourceRawSha256: source.sourceRawSha256,
    quantity: Object.freeze({ amount: '1', unit: site.outputUnit }),
    startsAtSimTime: '0',
    endsAtSimTime: duration.toFixed(),
    maximumExpense: cap.toCanonicalValue(),
    derivation: Object.freeze({
      classification: 'TEST_REQUEST_LIMITS_NOT_EXECUTION_FACTS',
      quantity: 'ONE_SOURCE_OUTPUT_UNIT',
      workers: workers.toString(),
      requiredPersonMilliseconds: personMs.toFixed(),
      durationRule: 'CEIL_MAX_24H_CAPACITY_AND_CURRENT_WORKER_PERSON_MS',
      capRule:
        'EXACT_EXISTING_SITE_DAILY_PAYROLL_RESERVATIONS_AS_TEST_REQUEST_CEILING',
    }),
  });
}

export function registeredFinalPublishedCommand(
  value: unknown,
  shape: 'WRAPPED' | 'CANONICAL' = 'WRAPPED',
): Readonly<{ commandId: string; commandFingerprint: string }> {
  const result = registeredFinalRecord(value),
    command =
      shape === 'CANONICAL' ? result : registeredFinalRecord(result.command);
  registeredFinalAssert(
    (shape === 'CANONICAL' || result.status === 'QUEUED') &&
      command.schemaVersion === 'command-v1' &&
      typeof command.commandId === 'string' &&
      fp(command.fingerprint),
    'ACTUAL_NEW_FIXED_PUBLISHER_COMMAND_REQUIRED',
  );
  return {
    commandId: command.commandId,
    commandFingerprint: command.fingerprint,
  };
}

/** One SQL statement gives one consistent snapshot of immutable actual data.
 * The caller cannot inject a success DTO, events, receipt, or postings. */
export async function inspectRegisteredFinalCommand(
  pool: Pick<Pool, 'query'>,
  worldId: string,
  commandId: string,
): Promise<RegisteredStoredCommand> {
  const result = await pool.query<{
    country_id: string;
    command_type: string;
    command_fingerprint: string;
    office_id: string | null;
    authority_kind: RegisteredStoredCommand['authorityKind'];
    queue_state: string;
    receipt_count: number;
    outcome: string;
    world_version_before: string;
    world_version_after: string;
    receipt_event_ids: string[];
    events: {
      id: string;
      type: string;
      sequence: string;
      hash: string;
      raw: string;
    }[];
    financial: { fingerprint: string; raw: string; legs: number }[];
    inventory: { fingerprint: string; raw: string }[];
  }>(
    `select s.country_id,s.command_type,s.command_fingerprint,s.office_id,q.authority_kind,q.queue_state,
    (select count(*)::int from world_v2.command_receipt r where r.world_id=s.world_id and r.command_id=s.command_id)receipt_count,
    r.outcome,r.world_version_before::text,r.world_version_after::text,r.event_ids receipt_event_ids,
    coalesce((select jsonb_agg(jsonb_build_object('id',e.event_id,'type',e.event_type,'sequence',e.event_sequence::text,'hash',e.payload_sha256,'raw',e.canonical_payload)order by e.event_sequence)from world_v2.authoritative_event e where e.world_id=s.world_id and e.causation_command_id=s.command_id),'[]'::jsonb)events,
    coalesce((select jsonb_agg(jsonb_build_object('fingerprint',b.batch_fingerprint,'raw',b.canonical_payload,'legs',jsonb_array_length(b.canonical_payload::jsonb->'legs'))order by b.batch_id)from world_v2.financial_posting_batch b where b.world_id=s.world_id and b.causation_command_id=s.command_id),'[]'::jsonb)financial,
    coalesce((select jsonb_agg(jsonb_build_object('fingerprint',i.posting_fingerprint,'raw',i.canonical_payload)order by i.posting_id)from world_v2.inventory_posting i where i.world_id=s.world_id and i.causation_command_id=s.command_id),'[]'::jsonb)inventory
    from world_v2.command_submission s join world_v2.command_queue q using(world_id,command_id)
    left join world_v2.command_receipt r using(world_id,command_id)
    where s.world_id=$1 and s.command_id=$2`,
    [worldId, commandId],
  );
  registeredFinalAssert(
    result.rows.length === 1,
    'EXACT_STORED_COMMAND_REQUIRED:' + commandId,
  );
  const r = result.rows[0]!;
  registeredFinalAssert(
    r.receipt_count === 1 &&
      r.outcome === 'COMMITTED' &&
      r.queue_state === 'FINALIZED',
    'ACTUAL_COMMITTED_FINAL_REQUIRED:' + commandId,
  );
  registeredFinalAssert(
    fp(r.command_fingerprint) &&
      uint(r.world_version_before) &&
      uint(r.world_version_after),
    'STORED_IDENTITY_REQUIRED',
  );
  registeredFinalAssert(
    JSON.stringify(r.receipt_event_ids) ===
      JSON.stringify(r.events.map((e) => e.id)),
    'RECEIPT_EVENT_SET_MISMATCH',
  );
  for (const event of r.events)
    registeredFinalAssert(
      event.hash === 'sha256:' + sha('SHA-256\n' + event.raw) &&
        uint(event.sequence),
      'ACTUAL_EVENT_BYTES_HASH_MISMATCH',
    );
  for (const posting of [...r.financial, ...r.inventory])
    registeredFinalAssert(
      posting.fingerprint === 'sha256:' + sha('SHA-256\n' + posting.raw),
      'ACTUAL_POSTING_BYTES_HASH_MISMATCH',
    );
  return Object.freeze({
    worldId,
    countryId: r.country_id,
    commandId,
    commandType: r.command_type,
    commandFingerprint: r.command_fingerprint,
    officeId: r.office_id,
    authorityKind: r.authority_kind,
    queueState: r.queue_state,
    receiptCount: r.receipt_count,
    outcome: r.outcome,
    worldVersionBefore: r.world_version_before,
    worldVersionAfter: r.world_version_after,
    receiptEventIds: r.receipt_event_ids,
    eventIds: r.events.map((e) => e.id),
    eventTypes: r.events.map((e) => e.type),
    eventSequences: r.events.map((e) => e.sequence),
    financialBatchCount: r.financial.length,
    financialLegCount: r.financial.reduce((n, b) => n + b.legs, 0),
    inventoryPostingCount: r.inventory.length,
    financialBatchFingerprints: r.financial.map((b) => b.fingerprint),
    inventoryPostingFingerprints: r.inventory.map((i) => i.fingerprint),
  });
}

export function createRegisteredFinalDriver(
  input: Readonly<{
    repositoryRoot: string;
    evidenceDirectory: string;
    worldId: string;
    installer: Pick<Pool, 'query'>;
    allowedOrigin: string;
    signToken: (countryId: string) => string | Promise<string>;
  }>,
) {
  let child: RegisteredFinalChild | undefined;
  const originals: AuthenticatedOfficeCommandRequestDto[] = [],
    stored: RegisteredStoredCommand[] = [],
    stages: Record<string, unknown>[] = [],
    processes: Record<string, unknown>[] = [],
    http: Record<string, unknown>[] = [];
  const report: Record<string, unknown> = {
    schemaVersion: 'registered-final-driver-evidence-v1',
    classification: 'TEST_ONLY_ACTUAL_REGISTERED_CHILD_NOT_PRODUCTION_APPROVAL',
    status: 'RUNNING',
    worldId: input.worldId,
    stages,
    processes,
    http,
    stored,
    originals,
    WorldClockStarted: false,
    unverified: [
      'COMMIT_UNCERTAIN_FAULT_INJECTION',
      'ALL_70_COUNTRY_COMMANDS',
      'ALL_1404_CATALOG_ITEMS',
      'PRODUCTION_DEPLOYMENT',
    ],
  };
  const checkpoint = async (
    name: string,
    data: Readonly<Record<string, unknown>> = {},
  ) => {
    stages.push({
      name,
      at: new Date().toISOString(),
      parentRss: process.memoryUsage().rss,
      ...data,
    });
    await writeFile(
      path.join(input.evidenceDirectory, 'driver-progress.json'),
      serializePostwarSocialPrefixEvidence(report),
    );
  };
  const current = () => {
    registeredFinalAssert(child, 'OWNED_LIVE_CHILD_REQUIRED');
    return child;
  };
  const ready = () => registeredFinalRecord(current().ready);
  const origin = () => {
    const value = ready().origin;
    registeredFinalAssert(
      typeof value === 'string',
      'ACTUAL_READY_ORIGIN_REQUIRED',
    );
    const url = new URL(value);
    registeredFinalAssert(
      url.origin === value &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname) &&
        !url.username &&
        !url.password,
      'ACTUAL_LOOPBACK_ONLY',
    );
    return value;
  };
  const rpc = async (type: string, data: Record<string, unknown> = {}) => {
    const reply = await current().rpc(type, data);
    registeredFinalAssert(
      reply.ok,
      'CHILD_RPC_FAILED:' + type + ':' + JSON.stringify(reply.error),
    );
    return reply.value;
  };
  const readHead = async (): Promise<RegisteredFinalHead> => {
    const { rows } = await input.installer.query<{
      world_version: string;
      event_sequence: string;
    }>(
      'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1',
      [input.worldId],
    );
    registeredFinalAssert(
      rows.length === 1 &&
        uint(rows[0]!.world_version) &&
        uint(rows[0]!.event_sequence),
      'EXACT_ACTUAL_HEAD_REQUIRED',
    );
    return {
      worldVersion: rows[0]!.world_version,
      eventSequence: rows[0]!.event_sequence,
    };
  };
  const post = async (endpoint: string, body: unknown, countryId: string) => {
    const begin = performance.now(),
      response = await fetch(origin() + endpoint, {
        method: 'POST',
        headers: {
          origin: input.allowedOrigin,
          authorization: 'Bearer ' + (await input.signToken(countryId)),
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      }),
      text = await response.text();
    http.push({
      endpoint,
      countryId,
      status: response.status,
      bytes: Buffer.byteLength(text),
      elapsedMs: performance.now() - begin,
    });
    registeredFinalAssert(
      Buffer.byteLength(text) <= 65536,
      'BOUNDED_HTTP_REPLY_REQUIRED',
    );
    return {
      status: response.status,
      body: registeredFinalRecord(JSON.parse(text)),
    };
  };
  const makeRequest = async (
    request: Omit<
      ManualOfficeCommandRequestDto,
      'worldId' | 'expectedWorldVersion'
    >,
  ): Promise<AuthenticatedOfficeCommandRequestDto> => ({
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: randomUUID(),
    request: {
      ...request,
      worldId: input.worldId,
      expectedWorldVersion: (await readHead()).worldVersion,
    },
  });
  const submit = async (original: AuthenticatedOfficeCommandRequestDto) => {
    // Persist exact original before dispatch. Timeout/unknown acknowledgement
    // leaves this evidence for recovery; the driver never silently resubmits.
    originals.push(original);
    await checkpoint('BEFORE_HTTP_SUBMIT', {
      commandId: original.request.commandId,
    });
    const response = await post(
        '/v1/office-command',
        original,
        original.request.countryId,
      ),
      state = registeredFinalRecord(response.body.state);
    registeredFinalAssert(
      response.status === 202 &&
        response.body.ok === true &&
        state.status === 'QUEUED' &&
        state.source === 'NEW' &&
        state.queued === true &&
        state.submitted === true &&
        state.commandId === original.request.commandId &&
        state.commandType === original.request.commandType &&
        fp(state.commandFingerprint),
      'ACTUAL_NEW_QUEUE_REQUIRED:' + JSON.stringify(response),
    );
    await checkpoint('HTTP_QUEUED', {
      commandId: original.request.commandId,
      commandFingerprint: state.commandFingerprint,
    });
    return String(state.commandFingerprint);
  };
  const inspect = (id: string) =>
    inspectRegisteredFinalCommand(input.installer, input.worldId, id);
  const consume = async (
    id: string,
    expectation: Readonly<{
      commandType: string;
      countryId: string;
      financialBatches?: number;
      financialLegs?: number;
      inventoryPostings?: number;
      fingerprint?: string;
    }>,
  ) => {
    const before = await readHead(),
      step = registeredFinalRecord(await rpc('CONSUME'));
    registeredFinalAssert(
      step.status === 'PROCESSED' &&
        step.commandId === id &&
        step.source === 'NEW_FINAL',
      'SOLE_WORLD_QUEUE_HEAD_REQUIRED:' + JSON.stringify(step),
    );
    const actual = await inspect(id),
      after = await readHead();
    registeredFinalAssert(
      actual.countryId === expectation.countryId &&
        actual.commandType === expectation.commandType &&
        (!expectation.fingerprint ||
          actual.commandFingerprint === expectation.fingerprint),
      'EXACT_STORED_STAGE_REQUIRED',
    );
    registeredFinalAssert(
      actual.worldVersionBefore === before.worldVersion &&
        BigInt(actual.worldVersionAfter) === BigInt(before.worldVersion) + 1n &&
        after.worldVersion === actual.worldVersionAfter,
      'ONE_LOGICAL_TRANSITION_REQUIRED',
    );
    registeredFinalAssert(
      actual.eventIds.length > 0 &&
        new Set(actual.eventIds).size === actual.eventIds.length &&
        actual.eventSequences.every(
          (seq, i) =>
            BigInt(seq) === BigInt(before.eventSequence) + BigInt(i) + 1n,
        ) &&
        BigInt(after.eventSequence) ===
          BigInt(before.eventSequence) + BigInt(actual.eventIds.length),
      'SEPARATE_COMPLETE_EVENT_SEQUENCE_REQUIRED',
    );
    for (const [expected, value] of [
      [expectation.financialBatches, actual.financialBatchCount],
      [expectation.financialLegs, actual.financialLegCount],
      [expectation.inventoryPostings, actual.inventoryPostingCount],
    ])
      if (expected !== undefined)
        registeredFinalAssert(
          expected === value,
          'EXACT_POSTING_COUNT_REQUIRED',
        );
    stored.push(actual);
    await checkpoint('ACTUAL_COMMITTED', { commandId: id, head: after });
    return actual;
  };
  const recover = async (original: AuthenticatedOfficeCommandRequestDto) => {
    const before = await readHead(),
      response = await post(
        '/v1/command-recovery',
        {
          schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
          requestId: randomUUID(),
          request: {
            worldId: input.worldId,
            commandId: original.request.commandId,
            idempotencyKey: original.request.idempotencyKey,
            originalRequest: original,
          },
        },
        original.request.countryId,
      ),
      state = registeredFinalRecord(response.body.state),
      receipt = registeredFinalRecord(state.receipt),
      actual = await inspect(original.request.commandId);
    registeredFinalAssert(
      response.status === 200 &&
        response.body.ok === true &&
        state.status === 'FINAL' &&
        receipt.outcome === 'COMMITTED' &&
        receipt.commandId === actual.commandId &&
        receipt.commandFingerprint === actual.commandFingerprint,
      'DURABLE_FINAL_RECOVERY_REQUIRED',
    );
    const duplicate = await post(
        '/v1/office-command',
        original,
        original.request.countryId,
      ),
      duplicateState = registeredFinalRecord(duplicate.body.state);
    registeredFinalAssert(
      duplicate.status === 200 &&
        duplicateState.status === 'FINALIZED' &&
        duplicateState.source === 'EXISTING' &&
        duplicateState.submitted === false &&
        duplicateState.commandFingerprint === actual.commandFingerprint,
      'IDEMPOTENT_FINAL_REQUIRED',
    );
    registeredFinalAssert(
      JSON.stringify(await readHead()) === JSON.stringify(before) &&
        JSON.stringify(await inspect(actual.commandId)) ===
          JSON.stringify(actual),
      'RECOVERY_MUST_NOT_WRITE_OR_REPEAT_JOURNAL',
    );
    await checkpoint('RECOVERED_SAME_FINAL', { commandId: actual.commandId });
    return state;
  };
  const stop = async () => {
    if (!child) return;
    const owned = child;
    const result = registeredFinalRecord(await owned.stop());
    const close = registeredFinalRecord(
      registeredFinalRecord(result.close).value,
    );
    registeredFinalAssert(
      Array.isArray(close.errors) &&
        close.errors.length === 0 &&
        Array.isArray(close.idleErrors) &&
        close.idleErrors.length === 0,
      'ALL_CHILD_RESOURCES_MUST_DRAIN',
    );
    child = undefined;
    processes.push({ pid: owned.pid, closed: result });
    await checkpoint('CHILD_STOPPED', { pid: owned.pid });
  };
  return {
    report,
    originals,
    stored,
    checkpoint,
    readHead,
    makeRequest,
    submit,
    consume,
    inspect,
    recover,
    post,
    rpc,
    origin,
    async launch(configuration: unknown) {
      registeredFinalAssert(!child, 'ONE_OS_CHILD_ONLY');
      const begin = performance.now();
      child = await startPostwarRegisteredFinalNodeChild({
        repositoryRoot: input.repositoryRoot,
        configuration,
        logFile: path.join(
          input.evidenceDirectory,
          'node-' +
            (processes.filter((p) => p.started === true).length + 1) +
            '.log',
        ),
      });
      const r = ready();
      registeredFinalAssert(
        r.pid === child.pid &&
          r.formalBinding === true &&
          r.consumerState === 'PREPARED',
        'GENUINE_PREPARED_REGISTERED_NODE_REQUIRED',
      );
      processes.push({
        started: true,
        pid: child.pid,
        origin: origin(),
        startupElapsedMs: performance.now() - begin,
        ...r,
      });
      await checkpoint('CHILD_READY', { pid: child.pid });
      return r;
    },
    async start() {
      await rpc('START');
      await checkpoint('SOLE_CONSUMER_STARTED');
    },
    stop,
    async finish(status: 'PASS' | 'FAIL', failure?: unknown) {
      report.status = status;
      if (failure)
        report.failure = {
          name: failure instanceof Error ? failure.name : 'UNKNOWN',
          message: failure instanceof Error ? failure.message : String(failure),
        };
      await checkpoint('DRIVER_' + status);
      await writeFile(
        path.join(input.evidenceDirectory, 'report.json'),
        serializePostwarSocialPrefixEvidence(report),
      );
    },
  };
}
