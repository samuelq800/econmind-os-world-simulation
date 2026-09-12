import {
  canonicalSerialize,
  validateFinalReceiptForCommand,
  type CanonicalCommand,
  type CanonicalSha256,
  type FinalCommandReceipt,
} from '@econmind/core';

export const V10_4_ACCEPTANCE_RUNNER_STATUS =
  'CANDIDATE_NOT_EXECUTED_OR_GATE_APPROVED' as const;

export const V10_ACCEPTANCE_SCENARIOS = Object.freeze([
  'SUCCESSFUL_TWO_COUNTRY_DELIVERY',
  'INSUFFICIENT_FUNDS',
  'DUPLICATE_DELIVERY',
  'STALE_WORLD_VERSION',
  'REVOKED_SETTLEMENT_AUTHORITY',
  'LOST_RESPONSE_RETRY',
  'CRASH_RECOVERY',
  'DOUBLE_SELL_CONCURRENCY',
  'PROJECTION_REBUILD',
] as const);

export type V10AcceptanceScenario = (typeof V10_ACCEPTANCE_SCENARIOS)[number];
export type V10AcceptanceSurface =
  'LOCAL_ISOLATED' | 'CI_ISOLATED' | 'NONPRODUCTION_STAGING';
export type V10TracePhase = 'RESERVATION' | 'DISPATCH' | 'DELIVERY_SETTLEMENT';
export type V10AttemptResponse =
  | Readonly<{ kind: 'RECEIPT'; receipt: FinalCommandReceipt }>
  | Readonly<{ kind: 'RESPONSE_DROPPED' }>;
export type V10CampaignCaseResult =
  'STRUCTURALLY_VALID_NOT_GATE_B_PASS' | 'FAIL' | 'NOT_RUN';

export interface V10AuthoritativeTrace {
  readonly phase: V10TracePhase;
  readonly command: CanonicalCommand;
  readonly finalReceipt: FinalCommandReceipt;
  readonly attemptResponses: readonly V10AttemptResponse[];
  readonly beforeStateHash: CanonicalSha256;
  readonly afterStateHash: CanonicalSha256;
  readonly worldVersionBefore: string;
  readonly worldVersionAfter: string;
  readonly eventIds: readonly string[];
  readonly inventoryPostingFingerprints: readonly CanonicalSha256[];
  readonly financialPostingFingerprints: readonly CanonicalSha256[];
  readonly outboxMessageIds: readonly string[];
}

export interface V10ScenarioEvidence {
  readonly scenario: V10AcceptanceScenario;
  readonly traces: readonly V10AuthoritativeTrace[];
  readonly projection?: Readonly<{
    readonly authoritativeStateHashBefore: CanonicalSha256;
    readonly authoritativeStateHashAfter: CanonicalSha256;
    readonly projectionHashBefore: CanonicalSha256;
    readonly projectionHashAfterRebuild: CanonicalSha256;
  }>;
}

export interface V10AcceptanceDriver {
  readonly surface: V10AcceptanceSurface;
  readonly productionTarget: false;
  runScenario(scenario: V10AcceptanceScenario): Promise<V10ScenarioEvidence>;
}

export interface V10CampaignCase {
  readonly scenario: V10AcceptanceScenario;
  readonly result: V10CampaignCaseResult;
  readonly detail: string;
}

function invalid(message: string): never {
  throw new Error(`V10_ACCEPTANCE_EVIDENCE_INVALID: ${message}`);
}

function canonicalVersion(value: string, label: string): bigint {
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) {
    invalid(`${label} must be a canonical non-negative integer`);
  }
  return BigInt(value);
}

function sameReceipt(
  expected: FinalCommandReceipt,
  observed: FinalCommandReceipt,
): boolean {
  return canonicalSerialize(expected) === canonicalSerialize(observed);
}

function assertRetryResponses(trace: V10AuthoritativeTrace): void {
  if (trace.attemptResponses.length === 0) {
    invalid('Every trace requires at least one client attempt observation');
  }
  for (const response of trace.attemptResponses) {
    if (
      response.kind === 'RECEIPT' &&
      !sameReceipt(trace.finalReceipt, response.receipt)
    ) {
      invalid('A retry returned a different final receipt');
    }
  }
}

function assertZeroEffect(trace: V10AuthoritativeTrace): void {
  if (
    trace.finalReceipt.outcome === 'COMMITTED' ||
    trace.beforeStateHash !== trace.afterStateHash ||
    trace.worldVersionBefore !== trace.worldVersionAfter ||
    trace.eventIds.length !== 0 ||
    trace.inventoryPostingFingerprints.length !== 0 ||
    trace.financialPostingFingerprints.length !== 0 ||
    trace.outboxMessageIds.length !== 0
  ) {
    invalid('A rejected V10 command must have zero authoritative effect');
  }
}

function assertCommittedEffect(trace: V10AuthoritativeTrace): void {
  const receipt = validateFinalReceiptForCommand({
    command: trace.command,
    receipt: trace.finalReceipt,
  });
  if (
    receipt.outcome !== 'COMMITTED' ||
    trace.beforeStateHash === trace.afterStateHash ||
    canonicalVersion(trace.worldVersionAfter, 'worldVersionAfter') !==
      canonicalVersion(trace.worldVersionBefore, 'worldVersionBefore') + 1n ||
    trace.eventIds.length === 0 ||
    trace.eventIds.length !== receipt.eventIds.length ||
    trace.eventIds.some((eventId, index) => eventId !== receipt.eventIds[index])
  ) {
    invalid(
      'A committed V10 trace lacks one coherent authoritative transition',
    );
  }
  const expectedPostingShape: Record<
    V10TracePhase,
    readonly [inventory: number, financial: number]
  > = {
    RESERVATION: [1, 0],
    DISPATCH: [1, 0],
    DELIVERY_SETTLEMENT: [1, 1],
  };
  const [inventory, financial] = expectedPostingShape[trace.phase];
  if (
    trace.inventoryPostingFingerprints.length !== inventory ||
    trace.financialPostingFingerprints.length !== financial ||
    (trace.phase === 'DELIVERY_SETTLEMENT' &&
      trace.outboxMessageIds.length === 0)
  ) {
    invalid('V10 committed trace has an unexpected posting or outbox shape');
  }
}

function assertProjectionRebuild(evidence: V10ScenarioEvidence): void {
  const projection = evidence.projection;
  if (
    projection === undefined ||
    projection.authoritativeStateHashBefore !==
      projection.authoritativeStateHashAfter ||
    projection.projectionHashBefore !== projection.projectionHashAfterRebuild
  ) {
    invalid(
      'Projection rebuild must not change authority and must reproduce bytes',
    );
  }
}

/**
 * Validates evidence emitted by an already-authorized local/CI/staging driver.
 * It neither creates a browser/database connection nor substitutes a unit test
 * for real PostgreSQL, browser, crash, or staging evidence.
 */
export function assertV10ScenarioEvidence(evidence: V10ScenarioEvidence): void {
  if (!V10_ACCEPTANCE_SCENARIOS.includes(evidence.scenario)) {
    invalid('Unknown V10 acceptance scenario');
  }
  if (evidence.scenario === 'PROJECTION_REBUILD') {
    if (evidence.traces.length !== 0) {
      invalid(
        'Projection rebuild evidence must not claim a new economic command',
      );
    }
    assertProjectionRebuild(evidence);
    return;
  }
  if (evidence.projection !== undefined) {
    invalid(
      'Only the projection-rebuild scenario may include projection evidence',
    );
  }
  if (evidence.traces.length === 0) {
    invalid('A command scenario requires at least one authoritative trace');
  }
  for (const trace of evidence.traces) {
    assertRetryResponses(trace);
    if (trace.finalReceipt.outcome === 'COMMITTED') {
      assertCommittedEffect(trace);
    } else {
      validateFinalReceiptForCommand({
        command: trace.command,
        receipt: trace.finalReceipt,
      });
      assertZeroEffect(trace);
    }
  }
  const commits = evidence.traces.filter(
    (trace) => trace.finalReceipt.outcome === 'COMMITTED',
  );
  if (evidence.scenario === 'DOUBLE_SELL_CONCURRENCY') {
    if (commits.length > 1) {
      invalid(
        'Concurrent double-sell may commit at most one seller stock claim',
      );
    }
    return;
  }
  if (
    evidence.scenario === 'SUCCESSFUL_TWO_COUNTRY_DELIVERY' ||
    evidence.scenario === 'DUPLICATE_DELIVERY' ||
    evidence.scenario === 'LOST_RESPONSE_RETRY' ||
    evidence.scenario === 'CRASH_RECOVERY'
  ) {
    if (commits.length !== 1) {
      invalid(`${evidence.scenario} requires exactly one committed trace`);
    }
  } else if (commits.length !== 0) {
    invalid(`${evidence.scenario} requires zero committed traces`);
  }
}

export function planV10AcceptanceCampaign(): readonly V10CampaignCase[] {
  return Object.freeze(
    V10_ACCEPTANCE_SCENARIOS.map((scenario) =>
      Object.freeze({
        scenario,
        result: 'NOT_RUN' as const,
        detail: 'No authorized V10 runtime driver configured',
      }),
    ),
  );
}

export async function runV10AcceptanceCampaign(input: {
  readonly driver: V10AcceptanceDriver;
}): Promise<readonly V10CampaignCase[]> {
  if (input.driver.productionTarget !== false) {
    invalid('V10 acceptance runner refuses a production target');
  }
  const results: V10CampaignCase[] = [];
  for (const scenario of V10_ACCEPTANCE_SCENARIOS) {
    try {
      const evidence = await input.driver.runScenario(scenario);
      if (evidence.scenario !== scenario) {
        invalid('Driver returned evidence for a different scenario');
      }
      assertV10ScenarioEvidence(evidence);
      results.push(
        Object.freeze({
          scenario,
          result: 'STRUCTURALLY_VALID_NOT_GATE_B_PASS',
          detail: `${input.driver.surface}: evidence shape reconciled`,
        }),
      );
    } catch (error) {
      results.push(
        Object.freeze({
          scenario,
          result: 'FAIL',
          detail: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
    }
  }
  return Object.freeze(results);
}
