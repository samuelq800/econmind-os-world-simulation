import {
  CAPTAIN_POLITICAL_CAPITAL_EVENT,
  CENTRAL_BANK_OMO_EVENT,
  SOCIAL_SERVICE_PLAN_EVENT,
  SOCIAL_JOB_MATCH_EVENT,
  PRODUCTION_SETTLED_EVENT_TYPE,
  WORLD_DECIMAL_OPERAND_MAX_DIGITS,
  OFFICE_DECISION_RESULT_SCHEMA,
  DOMAIN_ERROR_CODES,
  DomainError,
  Quantity,
  calculateOpenMarketOperation,
  centralBankOmoSourceHash,
  createFoundationFact,
  canonicalSha256,
  canonicalSerialize,
  parseCanonicalCommand,
  parseCentralBankOmoIntent,
  parseSocialEmploymentServiceCommand,
  replayCaptainPoliticalCapitalAllocation,
  validateAuthoritativeEvent,
  validateCanonicalCommand,
  validateAuthoritativeTransition,
  validateFinalReceiptForCommand,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type FinalCommandReceipt,
  type CaptainPoliticalCapitalSourceSnapshot,
  type CentralBankOmoSourceFacts,
  type FoundationTraceRequest,
  type Sha256Hex,
  type DecisionResultOffice,
  type DecisionResultHead,
  type DecisionResultMetric,
  type OfficeDecisionResult,
  type CountryDecisionResultSummary,
  type EconomicReadScope,
  type IndustryProductionResultDisclosure,
  type DecisionResultCause,
} from '@econmind/core';
import type { EconomicReadVisibilitySnapshot } from './economic-read-visibility-source.js';
import type { SqlExecutor } from '../persistence/sql-database.js';
import {
  readValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from '../persistence/validated-canonical-lineage.js';
import { readIndustryProductionSourceFrom } from './industry-production-source-port.js';
import {
  readIndustryProductionGoverningFrom,
  type IndustryGoverningCustodyPort,
  type IndustryProductionGoverningResult,
} from './industry-production-governing-source.js';
import { requireIndustryIsolatedTestRuntime } from './industry-production-result-evidence.js';

export interface CommittedOfficeDecisionTransition {
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly receipt: FinalCommandReceipt;
}
const OFFICES: readonly DecisionResultOffice[] = [
  'CAPTAIN',
  'CENTRAL_BANK',
  'SOCIAL',
  'INDUSTRY',
];
type RecordValue = Record<string, unknown>;
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `Decision projection: ${message}`,
  );
}
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid('Required canonical record missing');
  return value as RecordValue;
}
function integer(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(value))
    invalid('Required exact integer missing');
  return value;
}
function keys(value: RecordValue, expected: readonly string[]): void {
  if (
    canonicalSerialize(Object.keys(value).sort()) !==
    canonicalSerialize([...expected].sort())
  )
    invalid('Missing or unknown domain fields');
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function delta(
  key: string,
  before: { amount: string; unit: string },
  after: { amount: string; unit: string },
): DecisionResultMetric {
  const a = Quantity.from(before.amount, before.unit),
    b = Quantity.from(after.amount, after.unit);
  if (
    a.toCanonicalValue().amount !== before.amount ||
    b.toCanonicalValue().amount !== after.amount
  )
    invalid('Noncanonical result quantity');
  return freeze({
    key,
    unit: before.unit,
    status: 'EXACT_CHANGE',
    before: before.amount,
    delta: b.subtract(a).toCanonicalValue().amount,
    after: after.amount,
  });
}

/** Validates the complete held global stream, not just the last event of an office.
 * A trusted server reads these immutable records; this function issues no authority.
 */
export function validateCommittedDecisionLineage(input: {
  readonly sourceHead: DecisionResultHead;
  readonly transitions: readonly CommittedOfficeDecisionTransition[];
  readonly sha256Hex: Sha256Hex;
}): void {
  integer(input.sourceHead.worldVersion);
  integer(input.sourceHead.eventSequence);
  let version = 0n,
    sequence = 0n;
  const commands = new Set<string>(),
    events = new Set<string>();
  for (const value of input.transitions) {
    const { command, transition, receipt } = value;
    validateCanonicalCommand(command, input.sha256Hex);
    validateAuthoritativeTransition(transition);
    validateFinalReceiptForCommand({ command, transition, receipt });
    if (
      receipt.outcome !== 'COMMITTED' ||
      receipt.commandId !== command.commandId ||
      receipt.idempotencyKey !== command.idempotencyKey ||
      command.worldId !== input.sourceHead.worldId ||
      transition.commandId !== command.commandId ||
      transition.commandFingerprint !== command.fingerprint ||
      transition.worldId !== command.worldId ||
      transition.worldVersionBefore !== version.toString() ||
      (command.expectedWorldVersion !== null &&
        command.expectedWorldVersion !== transition.worldVersionBefore) ||
      commands.has(command.commandId) ||
      receipt.simTime.ticks !== command.simTime.ticks ||
      receipt.reasonCode !== null
    )
      invalid('Committed lineage identity/head/receipt mismatch');
    commands.add(command.commandId);
    for (const event of transition.events) {
      validateAuthoritativeEvent(event, input.sha256Hex);
      if (
        event.sequence !== (++sequence).toString() ||
        events.has(event.eventId) ||
        event.causationCommandId !== command.commandId ||
        event.correlationId !== command.correlationId ||
        event.simTime.ticks !== command.simTime.ticks
      )
        invalid('Event sequence/causality mismatch');
      events.add(event.eventId);
    }
    version++;
  }
  if (
    version.toString() !== input.sourceHead.worldVersion ||
    sequence.toString() !== input.sourceHead.eventSequence
  )
    invalid('Lineage does not terminate at the exact held head');
}

export function projectCountryDecisionResultSummary(
  countryId: string,
  sourceHead: DecisionResultHead,
): CountryDecisionResultSummary {
  return freeze({
    schemaVersion: OFFICE_DECISION_RESULT_SCHEMA,
    classification: 'COUNTRY',
    countryId,
    sourceHead: { ...sourceHead },
    status: 'NOT_AUTHORIZED',
    reason: 'OFFICE_DECISION_DETAIL_PRIVATE',
  });
}

const INDUSTRY_PURPOSE =
  'INDUSTRY_COMMITTED_PRODUCTION_OUTPUT_AFTER_ONLY' as const;
export interface IndustryDecisionProjectionData {
  readonly decisionResult: OfficeDecisionResult;
  readonly industryProductionResult: IndustryProductionResultDisclosure;
}
interface IndustryMapperSource {
  readonly countryId: string;
  readonly head: DecisionResultHead;
  readonly cause: DecisionResultCause;
  readonly output: Readonly<{ amount: string; unit: string }>;
}
function industryHead(value: unknown): DecisionResultHead {
  const r = record(value);
  keys(r, ['worldId', 'worldVersion', 'eventSequence']);
  if (
    typeof r.worldId !== 'string' ||
    !/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(r.worldId) ||
    r.worldId.length > 128
  )
    invalid('Industry World required');
  for (const key of ['worldVersion', 'eventSequence']) {
    const v = integer(r[key]);
    if (v.length > 19 || BigInt(v) > 9_223_372_036_854_775_807n)
      invalid('Industry bounded head required');
  }
  return {
    worldId: r.worldId,
    worldVersion: r.worldVersion as string,
    eventSequence: r.eventSequence as string,
  };
}
function industryScope(
  value: unknown,
  head: DecisionResultHead,
): EconomicReadScope {
  const r = record(value);
  keys(r, ['worldId', 'countryId', 'officeId', 'classification']);
  if (
    r.worldId !== head.worldId ||
    typeof r.countryId !== 'string' ||
    !/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(r.countryId) ||
    r.countryId.length > 128 ||
    r.officeId !== 'INDUSTRY' ||
    r.classification !== 'OFFICE_PRIVATE'
  )
    invalid('Exact private Industry scope required');
  return freeze({
    worldId: head.worldId,
    countryId: r.countryId,
    officeId: 'INDUSTRY',
    classification: 'OFFICE_PRIVATE',
  });
}
function industryEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (canonicalSerialize(actual) !== canonicalSerialize(expected))
    invalid(message);
}
function industryEmpty(
  head: DecisionResultHead,
  scope: EconomicReadScope,
  unauthorized = false,
): IndustryDecisionProjectionData {
  return freeze({
    decisionResult: {
      schemaVersion: OFFICE_DECISION_RESULT_SCHEMA,
      classification: 'OFFICE_PRIVATE',
      countryId: scope.countryId,
      officeId: 'INDUSTRY',
      sourceHead: { ...head },
      semantics: 'COMMITTED_EVENT_RESULT_NOT_CURRENT_POSITION',
      source: null,
      afterState: null,
      status: unauthorized ? 'NOT_AUTHORIZED' : 'SOURCE_UNAVAILABLE',
      reason: unauthorized
        ? 'SCOPE_NOT_AUTHORIZED'
        : 'COMMITTED_PRODUCTION_SOURCE_UNAVAILABLE',
      businessState: null,
      cause: null,
      metrics: [],
    },
    industryProductionResult: { status: 'NOT_AUTHORIZED' },
  });
}
function industryGoverningShape(value: IndustryProductionGoverningResult): {
  disclosure: RecordValue;
  summary: RecordValue;
} {
  const r = record(value);
  keys(r, ['disclosure', 'resultSummary']);
  const disclosure = record(r.disclosure),
    summary = record(r.resultSummary);
  if (disclosure.status === 'NOT_AUTHORIZED') {
    keys(disclosure, ['status', 'reason']);
    keys(summary, ['status']);
    if (
      summary.status !== 'NOT_AUTHORIZED' ||
      ![
        'ADMITTED_SOURCE_UNAVAILABLE',
        'OWNER_MAPPING_UNAVAILABLE',
        'SCOPE_NOT_AUTHORIZED',
      ].includes(String(disclosure.reason))
    )
      invalid('Industry denied pair differs');
  } else {
    keys(disclosure, ['status', 'sourceUnits']);
    keys(summary, ['status', 'purpose', 'sourceHead', 'causeBinding']);
    if (
      disclosure.status !== 'AUTHORIZED' ||
      !Array.isArray(disclosure.sourceUnits) ||
      !disclosure.sourceUnits.length ||
      disclosure.sourceUnits.length > 10000 ||
      disclosure.sourceUnits.some(
        (u) => typeof u !== 'string' || !u.length || u.length > 512,
      ) ||
      new Set(disclosure.sourceUnits).size !== disclosure.sourceUnits.length
    )
      invalid('Industry actual disclosure required');
    if (
      summary.status !== 'AUTHORIZED_RESULT_ONLY' ||
      summary.purpose !== INDUSTRY_PURPOSE
    )
      invalid('Industry result-only purpose required');
    industryHead(summary.sourceHead);
    const binding = record(summary.causeBinding);
    keys(binding, [
      'commandId',
      'commandFingerprint',
      'eventId',
      'eventFingerprint',
    ]);
    for (const key of ['commandId', 'eventId'])
      if (
        typeof binding[key] !== 'string' ||
        !/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(binding[key] as string) ||
        (binding[key] as string).length > 128
      )
        invalid('Industry cause identity required');
    for (const key of ['commandFingerprint', 'eventFingerprint'])
      if (
        typeof binding[key] !== 'string' ||
        !/^sha256:[0-9a-f]{64}$/u.test(binding[key] as string)
      )
        invalid('Industry cause fingerprint required');
  }
  return { disclosure, summary };
}
/** Finite display mapper only. Real callers have already run A and C; the
 * isolated test entry below supplies explicitly untrusted inert mechanism data. */
function mapIndustryDecision(
  source: IndustryMapperSource | null,
  head: DecisionResultHead,
  scope: EconomicReadScope,
  governing: IndustryProductionGoverningResult | null,
): IndustryDecisionProjectionData {
  const parsedGoverning = governing ? industryGoverningShape(governing) : null;
  if (source === null) return industryEmpty(head, scope);
  if (source.countryId !== scope.countryId)
    invalid('Industry source/scope country differs');
  industryEqual(source.head, head, 'Industry source/publication head differs');
  const c = source.cause;
  if (
    c.eventType !== PRODUCTION_SETTLED_EVENT_TYPE ||
    c.planCommandId !== null ||
    BigInt(integer(c.worldVersionBefore)) + 1n !==
      BigInt(integer(c.worldVersionAfter)) ||
    BigInt(c.worldVersionAfter) > BigInt(head.worldVersion) ||
    BigInt(integer(c.eventSequence)) > BigInt(head.eventSequence)
  )
    invalid('Industry cause/version differs');
  if (integer(c.simTime).length > 120)
    invalid('Industry bounded SimTime required');
  for (const key of ['commandId', 'eventId'] as const)
    if (
      !/^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u.test(c[key]) ||
      c[key].length > 128
    )
      invalid('Industry cause identity required');
  for (const key of ['commandFingerprint', 'eventFingerprint'] as const)
    if (!/^sha256:[0-9a-f]{64}$/u.test(c[key]))
      invalid('Industry cause fingerprint required');
  if (!parsedGoverning) return industryEmpty(head, scope);
  const { disclosure, summary } = parsedGoverning;
  if (disclosure.status === 'NOT_AUTHORIZED') {
    return industryEmpty(
      head,
      scope,
      disclosure.reason !== 'ADMITTED_SOURCE_UNAVAILABLE',
    );
  }
  industryEqual(
    industryHead(summary.sourceHead),
    head,
    'Industry governing/publication head differs',
  );
  industryEqual(
    summary.causeBinding,
    {
      commandId: c.commandId,
      commandFingerprint: c.commandFingerprint,
      eventId: c.eventId,
      eventFingerprint: c.eventFingerprint,
    },
    'Industry four-cause differs',
  );
  if (
    source.output.unit !== 'tonne' ||
    typeof source.output.amount !== 'string' ||
    !/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(source.output.amount) ||
    source.output.amount === '0' ||
    source.output.amount.replace('.', '').length >
      WORLD_DECIMAL_OPERAND_MAX_DIGITS
  )
    invalid('Industry finite canonical positive tonne result required');
  return freeze({
    decisionResult: {
      schemaVersion: OFFICE_DECISION_RESULT_SCHEMA,
      classification: 'OFFICE_PRIVATE',
      countryId: scope.countryId,
      officeId: 'INDUSTRY',
      sourceHead: { ...head },
      semantics: 'COMMITTED_EVENT_RESULT_NOT_CURRENT_POSITION',
      source: 'COMMITTED_EVENT_RESULT',
      afterState: null,
      status: 'COMMITTED',
      reason: null,
      businessState: 'APPLIED',
      cause: { ...c },
      metrics: [
        {
          key: 'PRODUCTION_OUTPUT',
          unit: 'tonne',
          status: 'AFTER_ONLY',
          before: null,
          delta: null,
          after: source.output.amount,
          reason: 'PREDECESSOR_STATE_NOT_CARRIED',
        },
      ],
    },
    industryProductionResult: {
      status: 'AUTHORIZED_RESULT_ONLY',
      purpose: INDUSTRY_PURPOSE,
      sourceHead: { ...head },
      causeBinding: {
        commandId: c.commandId,
        commandFingerprint: c.commandFingerprint,
        eventId: c.eventId,
        eventFingerprint: c.eventFingerprint,
      },
    },
  });
}

/** Official server reader; no source/output/disclosure callback or fixture DTO.
 * Actual C custody and its native protection require separate adapter evidence. */
export async function readIndustryOfficeDecisionResultFrom(input: {
  readonly executor: SqlExecutor;
  readonly view: ValidatedCanonicalLineageView;
  readonly scope: EconomicReadScope;
  readonly custody: IndustryGoverningCustodyPort;
  readonly sha256Hex: Sha256Hex;
}): Promise<Readonly<IndustryDecisionProjectionData>> {
  const data = readValidatedCanonicalLineageFrom(input.executor, input.view);
  const head = {
    worldId: data.worldId,
    worldVersion: data.headWorldVersion,
    eventSequence: data.headEventSequence,
  };
  const scope = industryScope(
    JSON.parse(canonicalSerialize(input.scope)) as unknown,
    head,
  );
  if (!input.custody || typeof input.custody.withSnapshotFrom !== 'function')
    invalid('Actual Industry custody dependency required');
  // Preserve the source port's correction refusal before a later manual
  // activity can take the ordinary nonprojectable/unavailable branch.
  const productionEventIds = new Set(
    data.transitions
      .filter((row) => row.command.countryId === scope.countryId)
      .flatMap((row) => row.transition.events)
      .filter((event) => event.eventType === PRODUCTION_SETTLED_EVENT_TYPE)
      .map((event) => event.eventId),
  );
  for (const row of data.transitions) {
    for (const event of row.transition.events) {
      if (
        event.correctsEventId !== null &&
        (productionEventIds.has(event.correctsEventId) ||
          (row.command.countryId === scope.countryId &&
            event.eventType === PRODUCTION_SETTLED_EVENT_TYPE))
      )
        invalid('Industry production correction is unsupported');
    }
  }
  // Latest recognized Industry activity, not the latest old success. The actual
  // reader has constructor-validated every posting and rebuilt the full prefix.
  let selected:
    | {
        row: (typeof data.transitions)[number];
        event: (typeof data.transitions)[number]['transition']['events'][number];
      }
    | undefined;
  for (const row of data.transitions) {
    if (row.command.countryId !== scope.countryId) continue;
    for (const event of row.transition.events) {
      const manual = row.command.officeId === 'INDUSTRY';
      const automatic =
        row.command.officeId === null &&
        event.eventType === PRODUCTION_SETTLED_EVENT_TYPE;
      if (manual || automatic) selected = { row, event };
    }
  }
  if (!selected || selected.event.eventType !== PRODUCTION_SETTLED_EVENT_TYPE)
    return industryEmpty(head, scope);
  const postings = selected.row.inventoryPostings.filter(
    (p) => p.operation === 'PRODUCE_AND_CONSUME',
  );
  if (postings.length !== 1)
    invalid('Industry exact production posting required');
  const selectors = {
    worldId: selected.row.command.worldId,
    countryId: selected.row.command.countryId,
    commandId: selected.row.command.commandId,
    eventId: selected.event.eventId,
    postingId: postings[0]!.postingId,
    expectedPublicationHead: head,
  };
  const source = readIndustryProductionSourceFrom(
    input.executor,
    input.view,
    selectors,
    input.sha256Hex,
  );
  if (source.kind === 'SOURCE_UNAVAILABLE') return industryEmpty(head, scope);
  const governing = await readIndustryProductionGoverningFrom(
    input.executor,
    input.view,
    selectors,
    scope,
    input.custody,
  );
  if (readValidatedCanonicalLineageFrom(input.executor, input.view) !== data)
    invalid('Industry lineage changed after governing read');
  return mapIndustryDecision(
    {
      countryId: source.targetCommand.countryId,
      head: source.publicationHead,
      cause: source.immutableSourceWitnesses.cause,
      output: source.immutableSourceWitnesses.actualOutput,
    },
    head,
    scope,
    governing,
  );
}

/** Inert TEST_ONLY mapper acceptance, never a genuine-view/source entry. */
export function evaluateIndustryDecisionProjectionForTestOnly(input: unknown) {
  requireIndustryIsolatedTestRuntime();
  const serialized = canonicalSerialize(input);
  if (Buffer.byteLength(serialized, 'utf8') > 1_000_000)
    invalid('Industry test mechanism capacity exceeded');
  const r = record(JSON.parse(serialized) as unknown);
  keys(r, ['schemaVersion', 'scope', 'sourceCandidate', 'governingCandidate']);
  if (r.schemaVersion !== 'g-industry-decision-test-input-v1')
    invalid('Industry test schema required');
  const a = record(r.sourceCandidate);
  keys(a, [
    'schemaVersion',
    'kind',
    'admission',
    'productionAuthority',
    'sourceAdmitted',
    'runtimeConnected',
    'result',
  ]);
  if (
    a.schemaVersion !== 'industry-production-prefix-test-candidate-v1' ||
    a.kind !== 'INDUSTRY_PREFIX_TEST_CANDIDATE' ||
    a.admission !== 'ISOLATED_TEST_ONLY_NOT_ADMITTED' ||
    a.productionAuthority !== false ||
    a.sourceAdmitted !== false ||
    a.runtimeConnected !== false
  )
    invalid('Inert A test candidate required');
  const g = record(r.governingCandidate);
  keys(g, ['kind', 'sourceAdmitted', 'productionAuthority', 'result']);
  if (
    g.kind !== 'EVALUATED_TEST_ONLY' ||
    g.sourceAdmitted !== false ||
    g.productionAuthority !== false
  )
    invalid('Inert C test candidate required');
  const cr = record(g.result);
  keys(cr, ['disclosure', 'resultSummary']);
  const s = record(a.result),
    head = industryHead(s.publicationHead),
    scope = industryScope(r.scope, head);
  let source: IndustryMapperSource | null = null;
  if (s.status === 'SOURCE_UNAVAILABLE') {
    keys(s, ['status', 'reason', 'publicationHead']);
    if (s.reason !== 'PRODUCTION_TARGET_NOT_FOUND')
      invalid('A missing test source reason differs');
  } else {
    keys(s, [
      'status',
      'publicationHead',
      'targetCutoff',
      'cause',
      'actualOutput',
      'inventoryAccountWitnesses',
    ]);
    if (s.status !== 'EVALUATED_TEST_ONLY')
      invalid('A test-only evaluation required');
    industryHead(s.targetCutoff);
    const c = record(s.cause);
    keys(c, [
      'commandId',
      'commandFingerprint',
      'eventId',
      'eventFingerprint',
      'eventType',
      'eventSequence',
      'worldVersionBefore',
      'worldVersionAfter',
      'simTime',
      'planCommandId',
    ]);
    const output = record(s.actualOutput);
    keys(output, ['amount', 'unit']);
    if (
      !Array.isArray(s.inventoryAccountWitnesses) ||
      s.inventoryAccountWitnesses.length < 1 ||
      s.inventoryAccountWitnesses.length > 10000
    )
      invalid('Bounded test witness array required');
    for (const account of s.inventoryAccountWitnesses) {
      const row = record(account);
      keys(row, [
        'worldId',
        'countryId',
        'commodityId',
        'batchId',
        'physicalLocationId',
        'titleHolderId',
        'riskBearerId',
        'bucket',
        'unit',
        'economicRecognitionId',
        'reservationId',
        'shipmentId',
      ]);
      if (Object.values(row).some((v) => v !== null && typeof v !== 'string'))
        invalid('Inert tuple scalar required');
    }
    // No cast to A's official source type or genuine-view wrapper is made.
    source = {
      countryId: record(s.inventoryAccountWitnesses[0]).countryId as string,
      head,
      cause: c as unknown as DecisionResultCause,
      output: output as unknown as { amount: string; unit: string },
    };
  }
  const result = mapIndustryDecision(
    source,
    head,
    scope,
    cr as unknown as IndustryProductionGoverningResult,
  );
  return freeze({
    schemaVersion: 'g-industry-decision-test-evaluation-v1' as const,
    kind: 'G_INDUSTRY_DECISION_PROJECTION_TEST_ONLY' as const,
    sourceAdmitted: false as const,
    productionAuthority: false as const,
    runtimeConnected: false as const,
    result,
  });
}

export interface OfficeDecisionProjectionInput {
  readonly countryId: string;
  readonly officeId: string;
  readonly sourceHead: DecisionResultHead;
  readonly transitions: readonly CommittedOfficeDecisionTransition[];
  readonly visibility: EconomicReadVisibilitySnapshot;
  readonly sha256Hex: Sha256Hex;
}
/** Projection scope must come from current server authorization, never a browser choice. */
export function projectOfficeDecisionResult(
  input: OfficeDecisionProjectionInput,
): OfficeDecisionResult | null {
  validateCommittedDecisionLineage(input);
  return projectOfficeDecisionResultFromCheckedLineage(input);
}

/** Batch publication validates the global stream once, not once per active office.
 * The private helper is not an admission token or a separately exported authority API.
 */
export function projectOfficeDecisionResults(
  input: Omit<OfficeDecisionProjectionInput, 'countryId' | 'officeId'> & {
    readonly scopes: readonly Readonly<{
      countryId: string;
      officeId: string;
    }>[];
  },
): ReadonlyMap<string, OfficeDecisionResult | null> {
  validateCommittedDecisionLineage(input);
  return new Map(
    input.scopes.map((scope) => [
      canonicalSerialize([scope.countryId, scope.officeId]),
      projectOfficeDecisionResultFromCheckedLineage({ ...input, ...scope }),
    ]),
  );
}

function projectOfficeDecisionResultFromCheckedLineage(
  input: OfficeDecisionProjectionInput,
): OfficeDecisionResult | null {
  if (!OFFICES.includes(input.officeId as DecisionResultOffice)) return null;
  const office = input.officeId as DecisionResultOffice;
  if (
    input.visibility.worldId !== input.sourceHead.worldId ||
    input.visibility.worldVersion !== input.sourceHead.worldVersion ||
    input.visibility.eventSequence !== input.sourceHead.eventSequence
  )
    invalid('Disclosure and publication head differ');
  const empty = (
    reason: string,
    status: 'SOURCE_UNAVAILABLE' | 'NOT_AUTHORIZED' = 'SOURCE_UNAVAILABLE',
  ): OfficeDecisionResult =>
    freeze({
      schemaVersion: OFFICE_DECISION_RESULT_SCHEMA,
      classification: 'OFFICE_PRIVATE',
      countryId: input.countryId,
      officeId: office,
      sourceHead: { ...input.sourceHead },
      semantics: 'COMMITTED_EVENT_RESULT_NOT_CURRENT_POSITION',
      source: null,
      afterState: null,
      status,
      reason,
      businessState: null,
      cause: null,
      metrics: [],
    });
  if (office === 'INDUSTRY')
    return empty('COMMITTED_PRODUCTION_SOURCE_UNAVAILABLE');
  // Social due commands have no human office; only the registered family maps to SOCIAL.
  const candidates = input.transitions
    .flatMap((value) =>
      value.transition.events.map((event) => ({ ...value, event })),
    )
    .filter(
      (value) =>
        value.command.countryId === input.countryId &&
        (value.command.officeId === office ||
          (office === 'SOCIAL' &&
            value.event.eventType === SOCIAL_JOB_MATCH_EVENT)),
    );
  const latest = candidates.at(-1);
  if (!latest) return empty('NO_COMMITTED_DOMAIN_RESULT');
  const { event, command, transition } = latest;
  if (
    (
      [
        CAPTAIN_POLITICAL_CAPITAL_EVENT,
        CENTRAL_BANK_OMO_EVENT,
        SOCIAL_SERVICE_PLAN_EVENT,
        SOCIAL_JOB_MATCH_EVENT,
      ] as readonly string[]
    ).includes(event.eventType) &&
    (event.correctsEventId !== null || transition.events.length !== 1)
  )
    invalid(
      'Known office result requires the existing one-event non-correction transition',
    );
  const payload = record(JSON.parse(event.canonicalPayload));
  let metrics: readonly DecisionResultMetric[],
    state: OfficeDecisionResult['businessState'] = 'APPLIED';
  let planCommandId: string | null = null,
    partial = false;
  if (office === 'CAPTAIN') {
    if (event.eventType !== CAPTAIN_POLITICAL_CAPITAL_EVENT)
      return empty('UNSUPPORTED_EVENT_TYPE');
    const source = payload.source as CaptainPoliticalCapitalSourceSnapshot;
    const embedded = parseCanonicalCommand(payload.command, input.sha256Hex);
    if (
      embedded.fingerprint !== command.fingerprint ||
      embedded.commandId !== command.commandId
    )
      invalid('Captain event is not the committed command');
    const replay = replayCaptainPoliticalCapitalAllocation({
      state: {
        worldId: command.worldId,
        countryId: command.countryId,
        worldVersion: transition.worldVersionBefore,
        lastEventSequence: (BigInt(event.sequence) - 1n).toString(),
        capital: source.capitalFact.payload,
        applied: [],
      },
      event,
      sha256Hex: input.sha256Hex,
    });
    metrics = source.capitalFact.payload.buckets.map((before, index) => {
      const after = replay.capital.buckets[index]!;
      if (before.bucket !== after.bucket) invalid('Bucket identity differs');
      return delta(
        `POLITICAL_CAPITAL.${before.bucket}`,
        before.balance,
        after.balance,
      );
    });
  } else if (office === 'CENTRAL_BANK') {
    if (event.eventType !== CENTRAL_BANK_OMO_EVENT)
      return empty('UNSUPPORTED_EVENT_TYPE');
    keys(payload, [
      'schemaVersion',
      'commandFingerprint',
      'intent',
      'source',
      'trace',
      'rights',
      'kernelReplayHash',
    ]);
    const facts = payload.source as CentralBankOmoSourceFacts,
      trace = payload.trace as FoundationTraceRequest;
    const intent = parseCentralBankOmoIntent(command, input.sha256Hex);
    if (
      payload.schemaVersion !== 'central-bank-omo-settlement-v1' ||
      payload.commandFingerprint !== command.fingerprint ||
      canonicalSerialize(payload.intent) !== canonicalSerialize(intent) ||
      facts.worldId !== command.worldId ||
      facts.countryId !== command.countryId ||
      facts.worldVersion !== transition.worldVersionBefore ||
      facts.currentEventSequence !== (BigInt(event.sequence) - 1n).toString() ||
      facts.currentSimTime !== command.simTime.toCanonicalValue() ||
      trace.snapshot.snapshotHash !==
        centralBankOmoSourceHash(facts, input.sha256Hex) ||
      trace.snapshot.sourceVersion !== `WORLD_VERSION.${facts.worldVersion}` ||
      trace.snapshotAt.amount !== facts.currentSimTime ||
      trace.snapshotAt.unit !== 'sim_millisecond'
    )
      invalid('OMO source/intent/head binding mismatch');
    const scope = {
      worldId: command.worldId,
      countryId: command.countryId,
      officeId: office,
      classification: 'OFFICE_PRIVATE' as const,
    };
    if (
      input.visibility.summary(scope).financialDetail !== 'AUTHORIZED_FILTERED'
    )
      return empty('SCOPE_NOT_AUTHORIZED', 'NOT_AUTHORIZED');
    for (const key of [
      'governmentSecurities',
      'commercialBankReserves',
    ] as const) {
      const disclosure = input.visibility.financial(
        {
          worldId: command.worldId,
          countryId: command.countryId,
          ownerId: facts.centralBank.centralBankRef,
          accountId: facts.centralBankAccounts[key],
          currency: facts.centralBank.currency,
        },
        scope,
      );
      if (disclosure.status !== 'AUTHORIZED')
        return empty('SCOPE_NOT_AUTHORIZED', 'NOT_AUTHORIZED');
    }
    const settlementAmount = record(
      record(payload.rights).settlementAmount,
    ) as unknown as { amount: string; currency: string };
    const fact = <T>(kind: string, value: T) =>
      createFoundationFact({
        trace,
        factRef: `CB1.${kind}`,
        sourceRef: trace.snapshot.snapshotRef,
        predecessorFactRefs: [trace.snapshot.lineageRef],
        payload: value,
      });
    const kernel = calculateOpenMarketOperation({
      trace,
      commercialBankFact: fact('Bank', facts.bank),
      centralBankFact: fact('CentralBank', facts.centralBank),
      operationFact: fact('Operation', {
        bankRef: facts.bank.bankRef,
        centralBankRef: facts.centralBank.centralBankRef,
        operationRef: command.commandId,
        securityRef: intent.securityRef,
        direction: intent.direction,
        settlementAmount,
      }),
      outputRef: 'CB1.Output',
    });
    if (
      payload.kernelReplayHash !==
      canonicalSha256(kernel.replayProof.hashInput, input.sha256Hex)
    )
      invalid('OMO kernel replay differs');
    // Only the central bank's own two traces. Never publish commercial bank traces or holdings.
    metrics = kernel.centralBankTraces.map((value, i) =>
      delta(
        i === 0 ? 'CB_GOVERNMENT_SECURITIES' : 'CB_COMMERCIAL_BANK_RESERVES',
        { amount: value.before.amount, unit: value.before.currency },
        { amount: value.after.amount, unit: value.after.currency },
      ),
    );
  } else {
    if (
      !(
        [SOCIAL_SERVICE_PLAN_EVENT, SOCIAL_JOB_MATCH_EVENT] as readonly string[]
      ).includes(event.eventType)
    )
      return empty('UNSUPPORTED_EVENT_TYPE');
    keys(payload, [
      'schemaVersion',
      'command',
      'readFacts',
      'beforeStateHash',
      'afterStateHash',
      'result',
    ]);
    const embedded = parseCanonicalCommand(payload.command, input.sha256Hex),
      parsed = parseSocialEmploymentServiceCommand(command, input.sha256Hex);
    if (
      embedded.commandId !== command.commandId ||
      embedded.fingerprint !== command.fingerprint ||
      payload.schemaVersion !== 'social-employment-service-event-v1' ||
      event.eventType !==
        (parsed.kind === 'PLAN'
          ? SOCIAL_SERVICE_PLAN_EVENT
          : SOCIAL_JOB_MATCH_EVENT) ||
      !/^sha256:[0-9a-f]{64}$/u.test(String(payload.beforeStateHash)) ||
      !/^sha256:[0-9a-f]{64}$/u.test(String(payload.afterStateHash))
    )
      invalid('Social event command/type/hash mismatch');
    const result = record(payload.result),
      facts = record(payload.readFacts),
      offer = record(facts.offer),
      floor = record(facts.minimumWage);
    keys(result, [
      'kind',
      'planCommandId',
      'servicePoolId',
      'positionId',
      'allocatedSlots',
      'matched',
      'remainingUnemployed',
      'remainingVacancies',
      'remainingFreeServiceSlots',
      'reason',
    ]);
    if (
      result.kind !== parsed.kind ||
      offer.countryId !== command.countryId ||
      floor.countryId !== command.countryId ||
      offer.positionId !== result.positionId ||
      facts.simTime !== command.simTime.toCanonicalValue()
    )
      invalid('Social country/position/time mismatch');
    if (parsed.kind === 'PLAN') {
      if (
        result.planCommandId !== command.commandId ||
        result.servicePoolId !== parsed.intent.servicePoolId ||
        result.positionId !== parsed.intent.positionId ||
        result.allocatedSlots !== parsed.intent.requestedMatches ||
        result.matched !== '0'
      )
        invalid('Social plan result differs from intent');
      planCommandId = command.commandId;
      state = 'PLAN_PENDING';
    } else {
      planCommandId = parsed.intent.planCommandId;
      const plan = input.transitions.find(
        (value) => value.command.commandId === planCommandId,
      );
      if (
        !plan ||
        plan.command.countryId !== command.countryId ||
        plan.command.fingerprint !== parsed.intent.planFingerprint ||
        BigInt(plan.transition.worldVersionAfter) >=
          BigInt(transition.worldVersionAfter) ||
        !plan.transition.events.some(
          (value) => value.eventType === SOCIAL_SERVICE_PLAN_EVENT,
        )
      )
        invalid('Social settlement has no earlier same-country committed plan');
      const original = parseSocialEmploymentServiceCommand(
        plan.command,
        input.sha256Hex,
      );
      if (
        original.kind !== 'PLAN' ||
        result.planCommandId !== planCommandId ||
        result.positionId !== original.intent.positionId ||
        result.servicePoolId !== original.intent.servicePoolId ||
        result.allocatedSlots !== original.intent.requestedMatches ||
        parsed.intent.dueDayIndex !== original.intent.dueDayIndex ||
        integer(record(facts.boundary).dayIndex) !== parsed.intent.dueDayIndex
      )
        invalid('Social settlement is not bound to original plan');
      state = 'MATCH_SETTLED';
    }
    if (
      BigInt(integer(result.matched)) > BigInt(integer(result.allocatedSlots))
    )
      invalid('Matches exceed committed allocation');
    // Hashes are not predecessor state. Report only the quantities actually carried by the event.
    metrics = [
      'matched',
      'remainingUnemployed',
      'remainingVacancies',
      'remainingFreeServiceSlots',
    ].map((key) =>
      freeze({
        key: `SOCIAL.${key}`,
        unit: key === 'remainingFreeServiceSlots' ? 'service_slot' : 'person',
        status: 'AFTER_ONLY' as const,
        before: null,
        delta: null,
        after: integer(result[key]),
        reason: 'PREDECESSOR_STATE_NOT_CARRIED' as const,
      }),
    );
    partial = true;
  }
  return freeze({
    schemaVersion: OFFICE_DECISION_RESULT_SCHEMA,
    classification: 'OFFICE_PRIVATE',
    countryId: input.countryId,
    officeId: office,
    sourceHead: { ...input.sourceHead },
    semantics: 'COMMITTED_EVENT_RESULT_NOT_CURRENT_POSITION',
    source: 'COMMITTED_EVENT_RESULT',
    afterState: null,
    status: 'COMMITTED',
    reason: partial ? 'PREDECESSOR_STATE_NOT_CARRIED' : null,
    businessState: state,
    cause: {
      commandId: command.commandId,
      commandFingerprint: command.fingerprint,
      eventId: event.eventId,
      eventFingerprint: event.fingerprint,
      eventType: event.eventType,
      eventSequence: event.sequence,
      worldVersionBefore: transition.worldVersionBefore,
      worldVersionAfter: transition.worldVersionAfter,
      simTime: event.simTime.toCanonicalValue(),
      planCommandId,
    },
    metrics,
  });
}
