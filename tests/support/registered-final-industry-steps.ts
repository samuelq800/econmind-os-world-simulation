/** Fixed test DRIVER for the one prepared registered child. This module never
 * constructs a source/admission/receipt, changes a clock, starts a consumer or
 * provides an execution guard. Every stage must be observed from the real host.
 * C2 refinery scope only; no other facility/country inherits this evidence. */
import { randomUUID } from 'node:crypto';
import {
  AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
  INDUSTRY_FIRST_DAY_POLICY_VERSION,
} from '@econmind/core';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  type AuthenticatedOfficeCommandRequestDto,
} from '@econmind/core/authenticated-office-command-contract';
import {
  INDUSTRY_RUN_SCHEDULE_COMMAND,
  INDUSTRY_RUN_SCHEDULED_EVENT,
  INDUSTRY_FIRST_DAY_WORK_COMMAND,
  INDUSTRY_FIRST_DAY_WORK_EVENT,
  type IndustryFirstDayRunTerms,
} from '@econmind/core/industry-first-day-work';
import {
  INDUSTRY_OPERATING_WAGE_COMMAND,
  INDUSTRY_OPERATING_WAGE_EVENT,
} from '@econmind/core/industry-operating-wage-payment';
import { INDUSTRY_PRODUCTION_COMMAND } from '@econmind/core/industry-production-command';
export interface RegisteredIndustryHead {
  readonly worldVersion: string;
  readonly eventSequence: string;
}
/** Read these identifiers from the installed actual C2 source. They are DATA,
 * never accepted by any product source/guard as admission or readiness. */
export interface RegisteredIndustrySelectors {
  readonly worldId: string;
  readonly countryId: 'COUNTRY_02';
  readonly facilityId: 'OPEN-02-REFINED_FUEL';
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
  readonly policyVersion: typeof INDUSTRY_FIRST_DAY_POLICY_VERSION;
}
export interface RegisteredIndustryStoredStage {
  readonly worldId: string;
  readonly countryId: string;
  readonly commandId: string;
  readonly commandType: string;
  readonly commandFingerprint: string;
  readonly officeId: 'INDUSTRY' | null;
  readonly authorityKind: 'DISCRETIONARY_USER' | 'VERSIONED_AUTOMATIC';
  readonly receiptCount: number;
  readonly outcome: string;
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly eventIds: readonly string[];
  readonly eventTypes: readonly string[];
  readonly eventSequences: readonly string[];
  readonly financialBatchCount: number;
  readonly financialLegCount: number;
  readonly inventoryPostingCount: number;
}
export interface RegisteredIndustryNativeDriver {
  /** Actual loopback Node origin only; Authorization is used, never returned. */
  readonly origin: string;
  readonly allowedOrigin: string;
  readonly accessToken: () => Promise<string>;
  /** Explicit existing source clock. This driver may not advance it. */
  readHead(): Promise<RegisteredIndustryHead>;
  /** Invoke the existing sole registered child consumer exactly once. */
  consumeOnce(): Promise<unknown>;
  /** Fixed real publishers, awaited until canonical due tasks actually exist.
   * A missing publisher/source/time must throw, never return synthetic success. */
  publishWork(
    scope: Readonly<{
      countryId: 'COUNTRY_02';
      facilityId: 'OPEN-02-REFINED_FUEL';
      runId: string;
    }>,
  ): Promise<Readonly<{ commandId: string; commandFingerprint: string }>>;
  publishWage(
    scope: Readonly<{
      countryId: 'COUNTRY_02';
      facilityId: 'OPEN-02-REFINED_FUEL';
      runId: string;
    }>,
  ): Promise<Readonly<{ commandId: string; commandFingerprint: string }>>;
  /** Query the owned DB's actual immutable command/receipt/events/both journals.
   * It must not reconstruct success from the submitted request or RPC status. */
  inspectStored(commandId: string): Promise<RegisteredIndustryStoredStage>;
}
const uint = (s: unknown): s is string =>
  typeof s === 'string' && /^(0|[1-9][0-9]*)$/u.test(s);
const fingerprint = (s: unknown): s is string =>
  typeof s === 'string' && /^sha256:[a-f0-9]{64}$/u.test(s);
function assert(value: unknown, code: string): asserts value {
  if (!value) throw Error('REGISTERED_INDUSTRY_STEPS:' + code);
}
function record(v: unknown): Record<string, unknown> {
  assert(v && typeof v === 'object' && !Array.isArray(v), 'OBJECT_REQUIRED');
  return v as Record<string, unknown>;
}
function checkHead(h: RegisteredIndustryHead) {
  assert(
    uint(h.worldVersion) &&
      uint(h.eventSequence) &&
      BigInt(h.eventSequence) >= BigInt(h.worldVersion),
    'ACTUAL_HEAD_REQUIRED',
  );
}
/** The caller supplies an explicit planned quantity/window/maximum expense;
 * this helper adds no defaults and does not infer money/work from headcount. */
export async function executeRegisteredFinalIndustrySteps(
  input: Readonly<{
    driver: RegisteredIndustryNativeDriver;
    selectors: RegisteredIndustrySelectors;
    commandPrefix: string;
    plan: Pick<
      IndustryFirstDayRunTerms,
      | 'runId'
      | 'quantity'
      | 'startsAtSimTime'
      | 'endsAtSimTime'
      | 'maximumExpense'
    >;
  }>,
) {
  const { driver: d, selectors: s, plan } = input,
    url = new URL(d.origin);
  assert(
    ['127.0.0.1', 'localhost'].includes(url.hostname) &&
      url.origin === d.origin &&
      !url.username &&
      !url.password,
    'OWNED_LOOPBACK_HOST_REQUIRED',
  );
  assert(
    s.countryId === 'COUNTRY_02' &&
      s.facilityId === 'OPEN-02-REFINED_FUEL' &&
      s.policyVersion === INDUSTRY_FIRST_DAY_POLICY_VERSION &&
      /^[a-f0-9]{64}$/u.test(s.sourceRawSha256),
    'ACTUAL_C2_SOURCE_SELECTORS_REQUIRED',
  );
  assert(
    /^[A-Z][A-Z0-9_]{0,180}$/u.test(input.commandPrefix),
    'EXACT_COMMAND_PREFIX_REQUIRED',
  );
  const scope = {
    countryId: s.countryId,
    facilityId: s.facilityId,
    runId: plan.runId,
  };
  let head = await d.readHead();
  checkHead(head);
  async function post(path: string, body: unknown) {
    const response = await fetch(d.origin + path, {
      method: 'POST',
      headers: {
        origin: d.allowedOrigin,
        authorization: 'Bearer ' + (await d.accessToken()),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const result: unknown = await response.json();
    assert(response.status === 200, 'HTTP_' + response.status);
    return record(result);
  }
  function manual(
    commandType:
      typeof INDUSTRY_RUN_SCHEDULE_COMMAND | typeof INDUSTRY_PRODUCTION_COMMAND,
    payload: unknown,
    suffix: string,
  ): AuthenticatedOfficeCommandRequestDto {
    return {
      schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
      requestId: randomUUID(),
      request: {
        worldId: s.worldId,
        countryId: s.countryId,
        officeId: 'INDUSTRY',
        commandType,
        commandId: input.commandPrefix + '_' + suffix,
        idempotencyKey: input.commandPrefix + '_KEY_' + suffix,
        expectedWorldVersion: head.worldVersion,
        payload,
      },
    };
  }
  async function queue(request: AuthenticatedOfficeCommandRequestDto) {
    const r = await post('/v1/office-command', request),
      state = record(r.state);
    assert(
      r.ok === true &&
        state.queued === true &&
        state.submitted === true &&
        state.source === 'NEW' &&
        state.commandId === request.request.commandId &&
        state.commandType === request.request.commandType &&
        fingerprint(state.commandFingerprint),
      'ACTUAL_NEW_QUEUE_ACK_REQUIRED',
    );
    return String(state.commandFingerprint);
  }
  const stages: RegisteredIndustryStoredStage[] = [];
  async function consume(
    commandId: string,
    commandType: string,
    fp: string,
    automatic: boolean,
    eventType?: string,
  ) {
    assert(fingerprint(fp), 'ACTUAL_COMMAND_FINGERPRINT_REQUIRED');
    const step = record(await d.consumeOnce());
    assert(
      step.status === 'PROCESSED' &&
        step.commandId === commandId &&
        step.source === 'NEW_FINAL',
      'SOLE_QUEUE_HEAD_MUST_BE_THIS_STAGE',
    );
    const stored = await d.inspectStored(commandId),
      now = await d.readHead();
    checkHead(now);
    assert(
      stored.worldId === s.worldId &&
        stored.countryId === s.countryId &&
        stored.commandId === commandId &&
        stored.commandType === commandType &&
        stored.commandFingerprint === fp &&
        stored.outcome === 'COMMITTED' &&
        stored.receiptCount === 1,
      'ACTUAL_UNIQUE_COMMITTED_STAGE_REQUIRED',
    );
    assert(
      stored.officeId === (automatic ? null : 'INDUSTRY') &&
        stored.authorityKind ===
          (automatic ? 'VERSIONED_AUTOMATIC' : 'DISCRETIONARY_USER'),
      'EXACT_MANUAL_AUTOMATIC_BOUNDARY_REQUIRED',
    );
    assert(
      stored.worldVersionBefore === head.worldVersion &&
        BigInt(stored.worldVersionAfter) === BigInt(head.worldVersion) + 1n &&
        now.worldVersion === stored.worldVersionAfter,
      'NO_WORLD_QUEUE_SKIP_REQUIRED',
    );
    assert(
      stored.eventIds.length > 0 &&
        new Set(stored.eventIds).size === stored.eventIds.length &&
        stored.eventTypes.length === stored.eventIds.length &&
        stored.eventSequences.length === stored.eventIds.length,
      'ACTUAL_EVENT_SET_REQUIRED',
    );
    assert(
      stored.eventSequences.every(
        (seq, i) =>
          uint(seq) &&
          BigInt(seq) === BigInt(head.eventSequence) + BigInt(i) + 1n,
      ) &&
        BigInt(now.eventSequence) ===
          BigInt(head.eventSequence) + BigInt(stored.eventIds.length),
      'ACTUAL_EVENT_SEQUENCE_NOT_WORLD_VERSION_REQUIRED',
    );
    if (eventType)
      assert(
        stored.eventTypes.includes(eventType),
        'EXPECTED_CANONICAL_EVENT_REQUIRED',
      );
    if (
      commandType === INDUSTRY_RUN_SCHEDULE_COMMAND ||
      commandType === INDUSTRY_FIRST_DAY_WORK_COMMAND
    )
      assert(
        stored.financialBatchCount === 0 &&
          stored.financialLegCount === 0 &&
          stored.inventoryPostingCount === 0,
        'RUN_WORK_MUST_NOT_PAY_OR_PRODUCE',
      );
    if (commandType === INDUSTRY_OPERATING_WAGE_COMMAND)
      assert(
        stored.financialBatchCount > 0 &&
          stored.financialLegCount > 0 &&
          stored.inventoryPostingCount === 0,
        'ACTUAL_WAGE_JOURNAL_REQUIRED',
      );
    if (commandType === INDUSTRY_PRODUCTION_COMMAND)
      assert(
        stored.inventoryPostingCount > 0,
        'ACTUAL_PRODUCTION_INVENTORY_JOURNAL_REQUIRED',
      );
    head = now;
    stages.push(stored);
    return stored;
  }
  const run = manual(
      INDUSTRY_RUN_SCHEDULE_COMMAND,
      {
        schemaVersion: 'postwar-industry-run-schedule-v1',
        ...plan,
        facilityId: s.facilityId,
        policyVersion: s.policyVersion,
        sourceRef: s.sourceRef,
        sourceRawSha256: s.sourceRawSha256,
      },
      'RUN',
    ),
    runFp = await queue(run);
  await consume(
    run.request.commandId,
    INDUSTRY_RUN_SCHEDULE_COMMAND,
    runFp,
    false,
    INDUSTRY_RUN_SCHEDULED_EVENT,
  );
  const work = await d.publishWork(scope);
  await consume(
    work.commandId,
    INDUSTRY_FIRST_DAY_WORK_COMMAND,
    work.commandFingerprint,
    true,
    INDUSTRY_FIRST_DAY_WORK_EVENT,
  );
  const wage = await d.publishWage(scope);
  await consume(
    wage.commandId,
    INDUSTRY_OPERATING_WAGE_COMMAND,
    wage.commandFingerprint,
    true,
    INDUSTRY_OPERATING_WAGE_EVENT,
  );
  const production = manual(
      INDUSTRY_PRODUCTION_COMMAND,
      { facilityId: s.facilityId, runId: plan.runId },
      'PRODUCTION',
    ),
    productionFp = await queue(production);
  await consume(
    production.request.commandId,
    INDUSTRY_PRODUCTION_COMMAND,
    productionFp,
    false,
  );
  const recovered = await post('/v1/command-recovery', {
      schemaVersion: AUTHENTICATED_COMMAND_RECOVERY_SCHEMA,
      requestId: randomUUID(),
      request: {
        worldId: s.worldId,
        commandId: run.request.commandId,
        idempotencyKey: run.request.idempotencyKey,
        originalRequest: run,
        knownCommandFingerprint: runFp,
      },
    }),
    finalState = record(recovered.state),
    receipt = record(finalState.receipt);
  assert(
    recovered.ok === true &&
      finalState.status === 'FINAL' &&
      receipt.outcome === 'COMMITTED' &&
      receipt.commandId === run.request.commandId &&
      receipt.commandFingerprint === runFp,
    'ORIGINAL_RUN_FINAL_RECOVERY_REQUIRED',
  );
  const retry = await post('/v1/office-command', run),
    retryState = record(retry.state),
    last = await d.readHead();
  assert(
    retry.ok === true &&
      retryState.status === 'FINALIZED' &&
      retryState.source === 'EXISTING' &&
      retryState.submitted === false &&
      retryState.commandFingerprint === runFp &&
      last.worldVersion === head.worldVersion &&
      last.eventSequence === head.eventSequence,
    'RETRY_MUST_NOT_REPEAT_WORK_OR_PAY',
  );
  return Object.freeze({
    classification: 'ACTUAL_DRIVER_ASSERTIONS_NOT_PRODUCTION_APPROVAL' as const,
    scope,
    head,
    stages: Object.freeze(stages),
    manualRequests: Object.freeze([run, production]),
  });
}
