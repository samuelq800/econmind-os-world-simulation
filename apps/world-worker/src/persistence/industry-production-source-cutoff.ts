import {
  Money,
  assertProductionFunding,
  bindAuthoritativeTransition,
  canonicalSerialize,
  rebuildV08LedgersFromLineage,
  validateFinalReceiptForCommand,
  assertIndustryPersistenceSchemaBoundaryMatchesActual,
  classifyInventoryPersistenceSchemaPair,
  parseIndustryPersistenceSchemaBoundaryContext,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type InventoryProductionPosting,
  type Sha256Hex,
  type DecisionResultHead,
  type IndustryPersistenceSchemaReadContextV1,
  type IndustryPersistenceSchemaCommitContextV1,
  type IndustryPersistenceSchemaPostingIdentityV1,
} from '@econmind/core';
import {
  readValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from './validated-canonical-lineage.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import { withValidatedCanonicalLineageFrom } from './validated-canonical-lineage.js';
import { IndustryPersistenceCompatibilityProvider } from './industry-persistence-compatibility.js';
import {
  copyIndustrySourceData,
  decodeIndustryProductionRow,
  industryClosedRecord,
  industryInputInvalid,
} from './industry-production-row-decoder.js';

const originalKeys = [
  'issuerRef',
  'custodyRef',
  'qualificationRecordRef',
  'qualificationRevision',
  'sourceContentHash',
  'ruleRevision',
  'sourceRevision',
  'restrictionRevision',
  'worldId',
  'countryId',
  'operatorId',
  'commandId',
  'commandFingerprint',
  'batchId',
  'batchFingerprint',
  'costLegId',
  'cashAccountId',
  'expenseAccountId',
  'amount',
  'currency',
  'worldVersionBefore',
  'worldVersionAfter',
  'eventSequenceBefore',
  'eventSequenceAfter',
  'simTime',
  'scope',
  'disposition',
];
const currentKeys = [
  'issuerRef',
  'custodyRef',
  'decisionRef',
  'revision',
  'sourceContentHash',
  'sourceRevision',
  'correctionRevision',
  'withdrawalRevision',
  'ruleRevision',
  'worldId',
  'countryId',
  'operatorId',
  'commandId',
  'commandFingerprint',
  'worldVersion',
  'eventSequence',
  'simTime',
  'validFromTicks',
  'validUntilTicks',
  'fundingBatchId',
  'fundingFingerprint',
  'costLegId',
  'scope',
  'disposition',
  'originalApplicability',
];
const resourceKeys = [
  'targetDatabaseIdentity',
  'ownerDomainId',
  'resourceKind',
  'canonicalResourceKey',
  'aliasIdentity',
  'lockMode',
  'observationRevision',
  'protectedPredicateRef',
  'writerProtocolRevision',
  'revokerProtocolRevision',
  'postlockObservationRef',
];
type Data = Readonly<Record<string, string | null>>;
function ref(v: unknown): string {
  if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,511}$/u.test(v))
    industryInputInvalid('SOURCE_REFERENCE_REQUIRED');
  return v;
}
function integer(v: unknown): string {
  if (typeof v !== 'string' || v.length > 120 || !/^(?:0|[1-9]\d*)$/u.test(v))
    industryInputInvalid('CANONICAL_INTEGER_REQUIRED');
  return v;
}
function fields(
  v: unknown,
  keys: readonly string[],
  nullable: readonly string[] = [],
): Data {
  const r = industryClosedRecord(v, keys);
  return Object.freeze(
    Object.fromEntries(
      keys.map((k) => [
        k,
        nullable.includes(k) && r[k] === null ? null : ref(r[k]),
      ]),
    ),
  );
}
function sha(v: unknown) {
  if (typeof v !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(v))
    industryInputInvalid('CANONICAL_SHA_REQUIRED');
}
function equal(data: Data, expected: Readonly<Record<string, string>>) {
  for (const [k, v] of Object.entries(expected))
    if (data[k] !== v)
      industryInputInvalid('FUNDING_OR_CUTOFF_BINDING_MISMATCH');
}
function parse(v: unknown) {
  const p = industryClosedRecord(copyIndustrySourceData(v), [
    'schemaVersion',
    'original',
    'current',
    'resources',
  ]);
  if (p.schemaVersion !== 'industry-funding-source-input-v1')
    industryInputInvalid('UNSUPPORTED_SOURCE_SCHEMA');
  const original = fields(p.original, originalKeys),
    current = fields(p.current, currentKeys, [
      'correctionRevision',
      'withdrawalRevision',
    ]);
  equal(original, { scope: 'ORIGINAL_SETTLEMENT', disposition: 'ELIGIBLE' });
  equal(current, {
    scope: 'CURRENT_PRODUCTION_USE',
    disposition: 'ALLOWED',
    originalApplicability: 'PRESERVE_ORIGINAL',
  });
  for (const r of [original, current]) {
    sha(r.sourceContentHash);
    sha(r.commandFingerprint);
  }
  sha(original.batchFingerprint);
  sha(current.fundingFingerprint);
  for (const k of [
    'worldVersionBefore',
    'worldVersionAfter',
    'eventSequenceBefore',
    'eventSequenceAfter',
    'simTime',
  ])
    integer(original[k]);
  for (const k of [
    'worldVersion',
    'eventSequence',
    'simTime',
    'validFromTicks',
    'validUntilTicks',
  ])
    integer(current[k]);
  const amount = original.amount!;
  if (
    amount.replace(/[-.]/gu, '').length > 120 ||
    Money.from(amount, original.currency!).toCanonicalValue().amount !==
      amount ||
    !Money.from(amount, original.currency!).amount.greaterThan('0')
  )
    industryInputInvalid('POSITIVE_CANONICAL_FUNDING_REQUIRED');
  if (
    BigInt(current.validFromTicks!) >= BigInt(current.validUntilTicks!) ||
    BigInt(current.simTime!) < BigInt(current.validFromTicks!) ||
    BigInt(current.simTime!) >= BigInt(current.validUntilTicks!)
  )
    industryInputInvalid('CURRENT_USE_OUTSIDE_VALIDITY');
  if (
    !Array.isArray(p.resources) ||
    p.resources.length < 1 ||
    p.resources.length > 128
  )
    industryInputInvalid('RESOURCE_BOUND');
  const resources = p.resources.map((r) => fields(r, resourceKeys));
  const identities = new Set<string>(),
    aliases = new Set<string>();
  let previous = '';
  for (const r of resources) {
    if (!['SHARE', 'UPDATE'].includes(r.lockMode!))
      industryInputInvalid('LOCK_MODE_UNSUPPORTED');
    const key = [r.ownerDomainId, r.resourceKind, r.canonicalResourceKey].join(
      '\u0000',
    );
    if (
      identities.has(key) ||
      aliases.has(r.aliasIdentity!) ||
      key <= previous ||
      r.targetDatabaseIdentity !== resources[0]!.targetDatabaseIdentity
    )
      industryInputInvalid('RESOURCE_ALIAS_OR_ORDER_MISMATCH');
    identities.add(key);
    aliases.add(r.aliasIdentity!);
    previous = key;
  }
  return Object.freeze({
    original,
    current,
    resources: Object.freeze(resources),
  });
}

export interface IndustryFundingCutoffBinding {
  readonly schemaVersion: 'industry-prior-funding-data-binding-v1';
  readonly status: 'DATA_BINDING_MATCH_NOT_AUTHENTICATED';
  readonly originalEffect: Readonly<Record<string, unknown>>;
  readonly originalCutoff: Readonly<{
    beforeWorldVersion: string;
    afterWorldVersion: string;
    beforeEventSequence: string;
    afterEventSequence: string;
    simTime: string;
  }>;
  readonly checkedHead: Readonly<{
    worldId: string;
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly proposedWorldVersion: string;
  readonly source: ReturnType<typeof parse>;
  readonly productionAuthority: false;
  readonly sourceAdmitted: false;
  readonly runtimeReady: false;
}

/** Original/current SOURCE DATA binding only; no authentication, locks or grant. */
export function bindIndustryPriorFundingCutoffFrom(input: {
  readonly transaction: SqlExecutor;
  readonly view: ValidatedCanonicalLineageView;
  readonly targetCommand: CanonicalCommand;
  readonly targetTransition: AuthoritativeTransition;
  readonly productionPosting: InventoryProductionPosting;
  readonly sourceInput: unknown;
  readonly sha256Hex: Sha256Hex;
}): Readonly<IndustryFundingCutoffBinding> {
  const data = readValidatedCanonicalLineageFrom(input.transaction, input.view);
  if (data.transitions.length > 10000)
    industryInputInvalid('COMPLETE_PREFIX_BOUND');
  const source = parse(input.sourceInput),
    command = input.targetCommand,
    transition = input.targetTransition;
  const full = JSON.parse(
    canonicalSerialize(input.productionPosting),
  ) as Record<string, unknown>;
  const fingerprint = full.fingerprint;
  delete full.fingerprint;
  const posting = decodeIndustryProductionRow({
    row: {
      canonical_payload: full,
      causation_command_id: command.commandId,
      fingerprint,
    },
    command,
    transition,
    sha256Hex: input.sha256Hex,
  });
  if (
    command.worldId !== data.worldId ||
    command.expectedWorldVersion !== data.headWorldVersion ||
    transition.worldVersionBefore !== data.headWorldVersion ||
    transition.worldVersionAfter !==
      (BigInt(data.headWorldVersion) + 1n).toString() ||
    transition.events.length !== 1 ||
    transition.events[0]!.sequence !==
      (BigInt(data.headEventSequence) + 1n).toString()
  )
    industryInputInvalid('TARGET_IS_NOT_EXACT_NEXT_TRANSITION');
  const op = posting.evidence.operating.payload;
  const matches = data.transitions.flatMap((r, index) =>
    r.financialPostingBatches
      .filter(
        (b) =>
          b.batchId === op.fundingBatchId &&
          b.fingerprint === op.fundingFingerprint,
      )
      .map((batch) => ({ row: r, index, batch })),
  );
  if (matches.length !== 1)
    industryInputInvalid('EXACT_PRIOR_FUNDING_NOT_FOUND');
  const { row, index, batch } = matches[0]!;
  const receipt = validateFinalReceiptForCommand({
    command: row.command,
    receipt: row.receipt,
    transition: row.transition,
  });
  if (
    receipt.outcome !== 'COMMITTED' ||
    BigInt(row.transition.worldVersionAfter) >
      BigInt(transition.worldVersionBefore) ||
    row.command.simTime.ticks > command.simTime.ticks
  )
    industryInputInvalid('PRIOR_FUNDING_NOT_COMMITTED_BEFORE_TARGET');
  const before = rebuildV08LedgersFromLineage({
    seed: data.seed,
    transitions: data.transitions.slice(0, index),
    sha256Hex: input.sha256Hex,
  });
  const after = rebuildV08LedgersFromLineage({
    seed: data.seed,
    transitions: data.transitions.slice(0, index + 1),
    sha256Hex: input.sha256Hex,
  });
  // The original cash position is checked before any later replenishment.
  assertProductionFunding(posting, [batch], after.financial);
  const current = rebuildV08LedgersFromLineage({
    seed: data.seed,
    transitions: data.transitions,
    sha256Hex: input.sha256Hex,
  });
  const allBatches = data.transitions.flatMap((t) => t.financialPostingBatches);
  assertProductionFunding(posting, allBatches, current.financial);
  const proposed = rebuildV08LedgersFromLineage({
    seed: data.seed,
    transitions: [
      ...data.transitions,
      {
        command,
        transition,
        inventoryPostings: [posting],
        financialPostingBatches: [],
      },
    ],
    sha256Hex: input.sha256Hex,
  });
  const expense = batch.legs.find((l) => l.legId === op.costLegId)!;
  const cash = batch.legs.filter(
    (l) =>
      l.direction === 'CREDIT' &&
      ['CASH', 'DEPOSIT'].includes(l.account.accountClass) &&
      l.account.ownerId === op.operatorId &&
      l.account.countryId === posting.evidence.output.countryId &&
      l.amount.currency === op.settledCost.currency,
  );
  if (cash.length !== 1) industryInputInvalid('EXACT_FUNDING_CASH_REQUIRED');
  const events = row.transition.events;
  equal(source.original, {
    worldId: data.worldId,
    countryId: posting.evidence.output.countryId,
    operatorId: op.operatorId,
    commandId: row.command.commandId,
    commandFingerprint: row.command.fingerprint,
    batchId: batch.batchId,
    batchFingerprint: batch.fingerprint,
    costLegId: op.costLegId,
    cashAccountId: cash[0]!.account.accountId,
    expenseAccountId: expense.account.accountId,
    amount: op.settledCost.amount,
    currency: op.settledCost.currency,
    worldVersionBefore: before.worldVersion,
    worldVersionAfter: after.worldVersion,
    eventSequenceBefore: (BigInt(events[0]!.sequence) - 1n).toString(),
    eventSequenceAfter: events.at(-1)!.sequence,
    simTime: row.command.simTime.toCanonicalValue(),
  });
  equal(source.current, {
    worldId: data.worldId,
    countryId: posting.evidence.output.countryId,
    operatorId: op.operatorId,
    commandId: command.commandId,
    commandFingerprint: command.fingerprint,
    worldVersion: data.headWorldVersion,
    eventSequence: data.headEventSequence,
    simTime: command.simTime.toCanonicalValue(),
    fundingBatchId: batch.batchId,
    fundingFingerprint: batch.fingerprint,
    costLegId: op.costLegId,
  });
  return copyIndustrySourceData({
    schemaVersion: 'industry-prior-funding-data-binding-v1',
    status: 'DATA_BINDING_MATCH_NOT_AUTHENTICATED',
    originalEffect: {
      commandId: row.command.commandId,
      commandFingerprint: row.command.fingerprint,
      transitionBinding: JSON.parse(
        canonicalSerialize(
          bindAuthoritativeTransition(
            { command: row.command, transition: row.transition },
            input.sha256Hex,
          ),
        ),
      ),
      batchId: batch.batchId,
      batchFingerprint: batch.fingerprint,
      costLegId: op.costLegId,
      amount: op.settledCost.amount,
      currency: op.settledCost.currency,
      cashAccountId: cash[0]!.account.accountId,
      expenseAccountId: expense.account.accountId,
    },
    originalCutoff: {
      beforeWorldVersion: before.worldVersion,
      afterWorldVersion: after.worldVersion,
      beforeEventSequence: (BigInt(events[0]!.sequence) - 1n).toString(),
      afterEventSequence: events.at(-1)!.sequence,
      simTime: row.command.simTime.toCanonicalValue(),
    },
    checkedHead: {
      worldId: data.worldId,
      worldVersion: data.headWorldVersion,
      eventSequence: data.headEventSequence,
    },
    proposedWorldVersion: proposed.worldVersion,
    source,
    productionAuthority: false,
    sourceAdmitted: false,
    runtimeReady: false,
  }) as Readonly<IndustryFundingCutoffBinding>;
}

type ReadContext = Readonly<IndustryPersistenceSchemaReadContextV1>;
type Identity = IndustryPersistenceSchemaPostingIdentityV1;
type Resource = Readonly<Record<(typeof resourceKeys)[number], string>>;
type Decision = Readonly<{
  issuerRef: string;
  custodyRef: string;
  decisionRef: string;
  revision: string;
  sourceContentHash: string;
}>;
export interface IndustryProductionHistoricalReadRequest {
  readonly context: ReadContext;
  readonly actualHeldHead: Readonly<DecisionResultHead>;
  readonly groups: readonly Readonly<{
    command: CanonicalCommand;
    transition: AuthoritativeTransition;
    postingIdentities: readonly Identity[];
  }>[];
}
export interface IndustryProductionHistoricalReadObservation {
  readonly schemaVersion: 'industry-production-historical-read-observation-v1';
  readonly purpose: 'INDUSTRY_PRODUCTION_CANONICAL_HISTORY_READ';
  readonly worldId: string;
  readonly checkedHead: ReadContext['expectedHead'];
  readonly target: ReadContext['target'];
  readonly build: ReadContext['build'];
  readonly checkedGroups: readonly Readonly<{
    commandFingerprint: string;
    transitionBinding: unknown;
    postingIdentities: readonly Identity[];
  }>[];
  readonly representationDecision: Decision;
  readonly lockedResources: readonly Resource[];
}
/** Fixed native server composition only. Matching an audit is NOT permission. */
export interface IndustryProductionHistoricalReadGuard {
  assertReadFrom(
    executor: SqlExecutor,
    request: Readonly<IndustryProductionHistoricalReadRequest>,
  ): Promise<Readonly<IndustryProductionHistoricalReadObservation>>;
}
export interface IndustryProductionCutoffRequest {
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly posting: InventoryProductionPosting;
  readonly expectedHead: Readonly<{
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly fundingBatchId: string;
  readonly fundingFingerprint: string;
  readonly costLegId: string;
}
export interface IndustryProductionCutoffObservation {
  readonly schemaVersion: 'industry-production-cutoff-observation-v1';
  readonly targetBinding: unknown;
  readonly fundingBinding: unknown;
  readonly fundingMode: 'PRIOR_COMMITTED';
  readonly historicalEligibilityWitness: unknown;
  readonly currentProductionSourceObservations: unknown;
  readonly lockedResources: readonly Resource[];
  readonly targetPrefixBinding: unknown;
  readonly checkedHead: Readonly<DecisionResultHead>;
  readonly checkedCommandFingerprint: string;
}
export interface IndustryProductionCutoffGuard {
  assertCurrentFrom(
    executor: SqlExecutor,
    request: Readonly<IndustryProductionCutoffRequest>,
  ): Promise<Readonly<IndustryProductionCutoffObservation>>;
}

function same(a: unknown, b: unknown, reason: string): void {
  if (canonicalSerialize(a) !== canonicalSerialize(b))
    industryInputInvalid(reason);
}
function headOf(context: ReadContext): Readonly<DecisionResultHead> {
  return Object.freeze({ worldId: context.worldId, ...context.expectedHead });
}
function decision(value: unknown): Decision {
  const d = fields(value, [
    'issuerRef',
    'custodyRef',
    'decisionRef',
    'revision',
    'sourceContentHash',
  ]);
  sha(d.sourceContentHash);
  return d as Decision;
}
function resources(value: unknown, allowEmpty = false): readonly Resource[] {
  if (
    !Array.isArray(value) ||
    value.length > 128 ||
    (!allowEmpty && value.length === 0)
  )
    industryInputInvalid('RESOURCE_BOUND');
  const rows = value.map((v) => fields(v, resourceKeys) as Resource);
  let previous: Buffer | undefined;
  const aliases = new Set<string>();
  for (const row of rows) {
    const key = Buffer.from(
      [row.ownerDomainId, row.resourceKind, row.canonicalResourceKey].join(
        '\0',
      ),
      'utf8',
    );
    if (
      (previous !== undefined && Buffer.compare(previous, key) >= 0) ||
      aliases.has(row.aliasIdentity!) ||
      !['SHARE', 'UPDATE'].includes(row.lockMode!) ||
      row.targetDatabaseIdentity !== rows[0]!.targetDatabaseIdentity
    )
      industryInputInvalid('RESOURCE_ALIAS_OR_ORDER_MISMATCH');
    previous = key;
    aliases.add(row.aliasIdentity!);
  }
  return Object.freeze(rows);
}
/** SQL header identity only; C owns its finite schema/type/actual validation. */
export function industryPostingIdentity(
  payload: Readonly<Record<string, unknown>>,
  fingerprint: unknown,
): Identity {
  classifyInventoryPersistenceSchemaPair({
    schemaVersion: payload.schemaVersion,
    operation: payload.operation,
  });
  return Object.freeze({
    schemaVersion: payload.schemaVersion,
    operation: payload.operation,
    worldId: payload.worldId,
    causationCommandId: payload.causationCommandId,
    postingId: payload.postingId,
    fingerprint,
    worldVersionBefore: payload.worldVersionBefore,
    worldVersionAfter: payload.worldVersionAfter,
  }) as Identity;
}
function checkedGroups(
  request: Readonly<IndustryProductionHistoricalReadRequest>,
  sha256Hex: Sha256Hex,
) {
  return request.groups.map((group) => ({
    commandFingerprint: group.command.fingerprint,
    transitionBinding: transitionWire(group, sha256Hex),
    postingIdentities: group.postingIdentities,
  }));
}
/** Checks inert correspondence only, never authenticates the configured guard. */
export function assertIndustryHistoricalReadObservation(
  request: Readonly<IndustryProductionHistoricalReadRequest>,
  observed: unknown,
  sha256Hex: Sha256Hex,
): Readonly<IndustryProductionHistoricalReadObservation> {
  const context = parseIndustryPersistenceSchemaBoundaryContext(
    request.context,
  );
  if (context.purpose !== 'INDUSTRY_PRODUCTION_CANONICAL_HISTORY_READ')
    industryInputInvalid('HISTORICAL_READ_PURPOSE_REQUIRED');
  same(request.actualHeldHead, headOf(context), 'ACTUAL_READ_HEAD_MISMATCH');
  const p = industryClosedRecord(copyIndustrySourceData(observed), [
    'schemaVersion',
    'purpose',
    'worldId',
    'checkedHead',
    'target',
    'build',
    'checkedGroups',
    'representationDecision',
    'lockedResources',
  ]);
  for (const group of request.groups)
    assertIndustryPersistenceSchemaBoundaryMatchesActual(
      {
        context,
        actualHeldHead: request.actualHeldHead,
        actualTarget: p.target as ReadContext['target'],
        actualBuild: p.build as ReadContext['build'],
        ...group,
      },
      sha256Hex,
    );
  same(
    {
      schemaVersion: p.schemaVersion,
      purpose: p.purpose,
      worldId: p.worldId,
      checkedHead: p.checkedHead,
      target: p.target,
      build: p.build,
      checkedGroups: p.checkedGroups,
    },
    {
      schemaVersion: 'industry-production-historical-read-observation-v1',
      purpose: context.purpose,
      worldId: context.worldId,
      checkedHead: context.expectedHead,
      target: context.target,
      build: context.build,
      checkedGroups: checkedGroups(request, sha256Hex),
    },
    'HISTORICAL_READ_AUDIT_MISMATCH',
  );
  decision(p.representationDecision);
  const held = resources(p.lockedResources);
  if (
    held.some(
      (r) => r.targetDatabaseIdentity !== context.target.databaseIdentityRef,
    )
  )
    industryInputInvalid('RESOURCE_DATABASE_MISMATCH');
  return Object.freeze(
    p,
  ) as unknown as Readonly<IndustryProductionHistoricalReadObservation>;
}

function transitionWire(
  input: {
    readonly command: CanonicalCommand;
    readonly transition: AuthoritativeTransition;
  },
  sha256Hex: Sha256Hex,
): unknown {
  // Existing canonical binding wire: SimTime text, not a new hash domain.
  return JSON.parse(
    canonicalSerialize(bindAuthoritativeTransition(input, sha256Hex)),
  ) as unknown;
}

interface ProtectionPlan {
  readonly target: ReadContext['target'];
  readonly build: ReadContext['build'];
  readonly representationResources: readonly Resource[];
  readonly fundingResources: readonly Resource[];
}
interface ProtectionRequest {
  readonly context: ReadContext;
  readonly production: Readonly<IndustryProductionCutoffRequest> | null;
}
/**
 * Unimplemented supply boundary, not a default source or registration factory.
 * The fixed authentic native owner must map actual aliases/parent predicates and
 * ALL cooperating writers/revokers. Its initial plan includes schema_release,
 * admission/read-purpose and every later complete-prefix resource. No arbitrary
 * SQL/table selectors are accepted. Every method uses the passed transaction;
 * native protection lasts through its outer COMMIT/ROLLBACK, not this callback.
 * Types, returned descriptors and test doubles do not establish those facts.
 */
export interface IndustryProductionProtectedSourceAccessor {
  resolveProtectionFrom(
    tx: SqlExecutor,
    request: Readonly<ProtectionRequest>,
  ): Promise<Readonly<ProtectionPlan>>;
  acquireResourceFrom(
    tx: SqlExecutor,
    resource: Resource,
    rank: 'R' | 'F',
  ): Promise<void>;
  /** Re-read original protected catalog/parent/predicates, verify complete plan,
   * actual target/build and all-actor coverage. No late discovery/acquisition. */
  readProtectedPlanFrom(
    tx: SqlExecutor,
    request: Readonly<ProtectionRequest>,
  ): Promise<Readonly<ProtectionPlan>>;
  /** Independently authenticate actual original purpose-specific decision and
   * applicability. New-use ALLOWED or an audit echo is not representation-read. */
  readAuthenticatedRepresentationFrom(
    tx: SqlExecutor,
    context: ReadContext,
  ): Promise<
    Readonly<{
      context: ReadContext;
      decision: Decision;
    }>
  >;
  /** Authenticate retained own-cutoff qualification/current-use and every
   * operating source under the held plan; never derive legality from replay. */
  readAuthenticatedProductionFrom(
    tx: SqlExecutor,
    request: Readonly<IndustryProductionCutoffRequest>,
  ): Promise<
    Readonly<{
      /** Independent actual new-effect schema/admission/purpose observation,
       * never inferred from representation-read or original funding eligibility. */
      commitContext: Readonly<IndustryPersistenceSchemaCommitContextV1>;
      fundingSourceInput: unknown;
      productionEvidence: unknown;
    }>
  >;
}
function plan(value: unknown, context: ReadContext): Readonly<ProtectionPlan> {
  const p = industryClosedRecord(copyIndustrySourceData(value), [
    'target',
    'build',
    'representationResources',
    'fundingResources',
  ]);
  same(p.target, context.target, 'ACTUAL_TARGET_MISMATCH');
  same(p.build, context.build, 'ACTUAL_BUILD_MISMATCH');
  const r = resources(p.representationResources),
    f = resources(p.fundingResources, true);
  const all = [...r, ...f];
  if (
    all.length > 128 ||
    new Set(all.map((v) => v.aliasIdentity)).size !== all.length ||
    new Set(
      all.map((v) =>
        [v.ownerDomainId, v.resourceKind, v.canonicalResourceKey].join('\0'),
      ),
    ).size !== all.length ||
    all.some(
      (v) => v.targetDatabaseIdentity !== context.target.databaseIdentityRef,
    )
  )
    industryInputInvalid('COMPLETE_PLAN_ALIAS_OR_DATABASE_MISMATCH');
  return Object.freeze({
    target: context.target,
    build: context.build,
    representationResources: r,
    fundingResources: f,
  });
}
function planResources(p: ProtectionPlan): readonly Resource[] {
  // Audit global byte order; lock acquisition still retains R then F ranks.
  return resources(
    [...p.representationResources, ...p.fundingResources].sort((a, b) =>
      Buffer.compare(
        Buffer.from(
          [a.ownerDomainId, a.resourceKind, a.canonicalResourceKey].join('\0'),
        ),
        Buffer.from(
          [b.ownerDomainId, b.resourceKind, b.canonicalResourceKey].join('\0'),
        ),
      ),
    ),
  );
}

/** Real orchestration over one fixed native owner; no source implementation is
 * supplied here. Protocol doubles must never be reported as native admission. */
export class ProtectedIndustryProductionGuard
  implements
    IndustryProductionHistoricalReadGuard,
    IndustryProductionCutoffGuard
{
  readonly #accessor: IndustryProductionProtectedSourceAccessor;
  readonly #provider: IndustryPersistenceCompatibilityProvider;
  readonly #target: ReadContext['target'];
  readonly #build: ReadContext['build'];
  readonly #sha: Sha256Hex;
  readonly #reader: DurableV08LedgerLineageReader;
  readonly #active = new WeakMap<
    SqlExecutor,
    { request: ProtectionRequest; plan: Readonly<ProtectionPlan> }
  >();
  constructor(input: {
    readonly accessor: IndustryProductionProtectedSourceAccessor | null;
    readonly compatibilityProvider: IndustryPersistenceCompatibilityProvider;
    readonly expectedTarget: ReadContext['target'];
    readonly expectedBuild: ReadContext['build'];
    readonly database: SqlDatabase;
    readonly sha256Hex: Sha256Hex;
  }) {
    if (input.accessor === null) industryInputInvalid('SOURCE_NOT_SUPPLIED');
    this.#accessor = input.accessor;
    this.#provider = input.compatibilityProvider;
    this.#target = copyIndustrySourceData(
      input.expectedTarget,
    ) as ReadContext['target'];
    this.#build = copyIndustrySourceData(
      input.expectedBuild,
    ) as ReadContext['build'];
    this.#sha = input.sha256Hex;
    this.#reader = new DurableV08LedgerLineageReader({
      ...input,
      industryReadGuard: this,
    });
  }
  #contextAt(
    worldId: string,
    expectedHead: ReadContext['expectedHead'],
  ): ReadContext {
    // Fixed build/target, but never an ambient per-read Command/head/context.
    return parseIndustryPersistenceSchemaBoundaryContext({
      schemaVersion: 'industry-persistence-schema-read-context-v1',
      purpose: 'INDUSTRY_PRODUCTION_CANONICAL_HISTORY_READ',
      worldId,
      expectedHead,
      target: this.#target,
      build: this.#build,
    }) as ReadContext;
  }
  async #protect(
    tx: SqlExecutor,
    request: ProtectionRequest,
  ): Promise<Readonly<ProtectionPlan>> {
    const p = plan(
      await this.#accessor.resolveProtectionFrom(tx, request),
      request.context,
    );
    for (const r of p.representationResources)
      await this.#accessor.acquireResourceFrom(tx, r, 'R');
    for (const r of p.fundingResources)
      await this.#accessor.acquireResourceFrom(tx, r, 'F');
    same(
      plan(
        await this.#accessor.readProtectedPlanFrom(tx, request),
        request.context,
      ),
      p,
      'POSTLOCK_RESOURCE_PLAN_DRIFT',
    );
    return p;
  }
  async assertReadFrom(
    tx: SqlExecutor,
    request: Readonly<IndustryProductionHistoricalReadRequest>,
  ): Promise<Readonly<IndustryProductionHistoricalReadObservation>> {
    const context = this.#contextAt(
      request.context.worldId,
      request.context.expectedHead,
    );
    same(request.context, context, 'FIXED_READ_PROFILE_MISMATCH');
    same(request.actualHeldHead, headOf(context), 'ACTUAL_READ_HEAD_MISMATCH');
    const active = this.#active.get(tx);
    const protectionRequest =
      active?.request ?? Object.freeze({ context, production: null });
    if (active !== undefined)
      same(active.request.context, context, 'ACTIVE_PREFIX_CONTEXT_MISMATCH');
    const p = active?.plan ?? (await this.#protect(tx, protectionRequest));
    // Reentry after F rechecks EXACT already-held resources only. The native
    // owner must prove original-catalog inclusion, not return a plan hash.
    same(
      plan(
        await this.#accessor.readProtectedPlanFrom(tx, protectionRequest),
        context,
      ),
      p,
      'LATE_PREFIX_RESOURCE_DRIFT',
    );
    const actual = industryClosedRecord(
      copyIndustrySourceData(
        await this.#accessor.readAuthenticatedRepresentationFrom(tx, context),
      ),
      ['context', 'decision'],
    );
    same(actual.context, context, 'ACTUAL_REPRESENTATION_PURPOSE_MISMATCH');
    const originalDecision = decision(actual.decision);
    for (const group of request.groups) {
      await this.#provider.assertCurrentFrom(tx, {
        checkedFor: {
          worldId: context.worldId,
          commandId: group.command.commandId,
          commandFingerprint: group.command.fingerprint,
          head: context.expectedHead,
          simTime: group.command.simTime.toCanonicalValue(),
        },
        target: context.target,
        build: context.build,
      });
      assertIndustryPersistenceSchemaBoundaryMatchesActual(
        {
          context,
          actualHeldHead: request.actualHeldHead,
          actualTarget: p.target,
          actualBuild: p.build,
          ...group,
        },
        this.#sha,
      );
    }
    // The old provider requests only identical already-held R resources. Verify
    // the protected complete set again before allowing any decode/view.
    same(
      plan(
        await this.#accessor.readProtectedPlanFrom(tx, protectionRequest),
        context,
      ),
      p,
      'POST_PROVIDER_RESOURCE_DRIFT',
    );
    return assertIndustryHistoricalReadObservation(
      request,
      {
        schemaVersion: 'industry-production-historical-read-observation-v1',
        purpose: context.purpose,
        worldId: context.worldId,
        checkedHead: context.expectedHead,
        target: p.target,
        build: p.build,
        checkedGroups: checkedGroups(request, this.#sha),
        representationDecision: originalDecision,
        lockedResources: planResources(p),
      },
      this.#sha,
    );
  }
  async assertCurrentFrom(
    tx: SqlExecutor,
    request: Readonly<IndustryProductionCutoffRequest>,
  ): Promise<Readonly<IndustryProductionCutoffObservation>> {
    const op = request.posting.evidence.operating.payload;
    same(
      [request.fundingBatchId, request.fundingFingerprint, request.costLegId],
      [op.fundingBatchId, op.fundingFingerprint, op.costLegId],
      'FRESH_FUNDING_SELECTOR_MISMATCH',
    );
    const context = this.#contextAt(
      request.command.worldId,
      request.expectedHead,
    );
    const commitContext: Readonly<IndustryPersistenceSchemaCommitContextV1> = {
      ...context,
      schemaVersion: 'industry-persistence-schema-commit-context-v1',
      purpose: 'INDUSTRY_PRODUCTION_NEW_EFFECT_COMMIT',
      commandBinding: {
        commandId: request.command.commandId,
        commandFingerprint: request.command.fingerprint,
        simTime: request.command.simTime.toCanonicalValue(),
      },
    };
    if (this.#active.has(tx)) industryInputInvalid('REENTRANT_FRESH_GUARD');
    const protectionRequest = Object.freeze({ context, production: request });
    const p = await this.#protect(tx, protectionRequest);
    this.#active.set(tx, { request: protectionRequest, plan: p });
    try {
      await this.#provider.assertCurrentFrom(tx, {
        checkedFor: {
          worldId: context.worldId,
          commandId: request.command.commandId,
          commandFingerprint: request.command.fingerprint,
          head: context.expectedHead,
          simTime: request.command.simTime.toCanonicalValue(),
        },
        target: p.target,
        build: p.build,
      });
      same(
        plan(
          await this.#accessor.readProtectedPlanFrom(tx, protectionRequest),
          context,
        ),
        p,
        'FRESH_POST_PROVIDER_RESOURCE_DRIFT',
      );
      return await withValidatedCanonicalLineageFrom(
        {
          reader: this.#reader,
          executor: tx,
          worldId: context.worldId,
          industryReadContext: context,
        },
        async (view) => {
          const data = readValidatedCanonicalLineageFrom(tx, view);
          assertIndustryPersistenceSchemaBoundaryMatchesActual(
            {
              context: commitContext,
              actualHeldHead: {
                worldId: data.worldId,
                worldVersion: data.headWorldVersion,
                eventSequence: data.headEventSequence,
              },
              actualTarget: p.target,
              actualBuild: p.build,
              command: request.command,
              transition: request.transition,
              postingIdentities: [
                industryPostingIdentity(
                  request.posting as unknown as Record<string, unknown>,
                  request.posting.fingerprint,
                ),
              ],
            },
            this.#sha,
          );
          const actual = industryClosedRecord(
            copyIndustrySourceData(
              await this.#accessor.readAuthenticatedProductionFrom(tx, request),
            ),
            ['commitContext', 'fundingSourceInput', 'productionEvidence'],
          );
          same(
            actual.commitContext,
            commitContext,
            'ACTUAL_NEW_EFFECT_ADMISSION_PURPOSE_MISMATCH',
          );
          same(
            actual.productionEvidence,
            request.posting.evidence,
            'ACTUAL_PRODUCTION_SOURCE_MISMATCH',
          );
          const bound = bindIndustryPriorFundingCutoffFrom({
            transaction: tx,
            view,
            targetCommand: request.command,
            targetTransition: request.transition,
            productionPosting: request.posting,
            sourceInput: actual.fundingSourceInput,
            sha256Hex: this.#sha,
          });
          // Complete provenance is independently authenticated above. These
          // correspondences neither manufacture a historical witness nor grant it.
          const funding = parse(actual.fundingSourceInput);
          same(
            plan(
              await this.#accessor.readProtectedPlanFrom(tx, protectionRequest),
              context,
            ),
            p,
            'FRESH_POSTLOCK_RESOURCE_DRIFT',
          );
          same(
            funding.resources,
            planResources(p),
            'FUNDING_PROTECTION_SET_MISMATCH',
          );
          return cutoffAudit(request, bound, data, planResources(p), this.#sha);
        },
      );
    } finally {
      this.#active.delete(tx);
    }
  }
}

function targetBinding(
  request: Readonly<IndustryProductionCutoffRequest>,
  sha256Hex: Sha256Hex,
): unknown {
  const op = request.posting.evidence.operating.payload;
  return {
    worldId: request.command.worldId,
    countryId: request.posting.evidence.output.countryId,
    operatorId: op.operatorId,
    facilityRef: op.facilityRef,
    commandId: request.command.commandId,
    commandFingerprint: request.command.fingerprint,
    transitionBinding: transitionWire(request, sha256Hex),
    postingId: request.posting.postingId,
    postingFingerprint: request.posting.fingerprint,
    expectedHead: request.expectedHead,
    simTime: request.command.simTime.toCanonicalValue(),
  };
}
function cutoffAudit(
  request: Readonly<IndustryProductionCutoffRequest>,
  bound: Readonly<IndustryFundingCutoffBinding>,
  data: ReturnType<typeof readValidatedCanonicalLineageFrom>,
  held: readonly Resource[],
  sha256Hex: Sha256Hex,
): Readonly<IndustryProductionCutoffObservation> {
  // bindIndustryPriorFundingCutoffFrom already bound/reconstructed the complete
  // actual prefix; hashes/strings in this result are audit, not a second ledger.
  return copyIndustrySourceData({
    schemaVersion: 'industry-production-cutoff-observation-v1',
    targetBinding: targetBinding(request, sha256Hex),
    fundingBinding: bound.originalEffect,
    fundingMode: 'PRIOR_COMMITTED',
    historicalEligibilityWitness: {
      original: bound.source.original,
      current: bound.source.current,
      originalCutoff: bound.originalCutoff,
    },
    currentProductionSourceObservations: request.posting.evidence,
    lockedResources: held,
    targetPrefixBinding: {
      seedId: data.seed.seedId,
      seedFingerprint: data.seed.fingerprint,
      originalCutoff: bound.originalCutoff,
      checkedHead: bound.checkedHead,
      proposedWorldVersion: bound.proposedWorldVersion,
      financialBatches: data.transitions.flatMap((t) =>
        t.financialPostingBatches.map((b) => ({
          batchId: b.batchId,
          fingerprint: b.fingerprint,
        })),
      ),
    },
    checkedHead: bound.checkedHead,
    checkedCommandFingerprint: request.command.fingerprint,
  }) as Readonly<IndustryProductionCutoffObservation>;
}

export function assertIndustryProductionCutoffObservation(
  request: Readonly<IndustryProductionCutoffRequest>,
  observed: unknown,
  sha256Hex: Sha256Hex,
): void {
  const p = industryClosedRecord(copyIndustrySourceData(observed), [
    'schemaVersion',
    'targetBinding',
    'fundingBinding',
    'fundingMode',
    'historicalEligibilityWitness',
    'currentProductionSourceObservations',
    'lockedResources',
    'targetPrefixBinding',
    'checkedHead',
    'checkedCommandFingerprint',
  ]);
  if (
    p.schemaVersion !== 'industry-production-cutoff-observation-v1' ||
    p.fundingMode !== 'PRIOR_COMMITTED'
  )
    industryInputInvalid('UNSUPPORTED_FUNDING_MODE');
  same(
    p.targetBinding,
    targetBinding(request, sha256Hex),
    'FRESH_TARGET_AUDIT_MISMATCH',
  );
  same(
    p.checkedHead,
    { worldId: request.command.worldId, ...request.expectedHead },
    'FRESH_HEAD_AUDIT_MISMATCH',
  );
  same(
    p.checkedCommandFingerprint,
    request.command.fingerprint,
    'FRESH_COMMAND_AUDIT_MISMATCH',
  );
  same(
    p.currentProductionSourceObservations,
    request.posting.evidence,
    'FRESH_SOURCE_AUDIT_MISMATCH',
  );
  const witness = industryClosedRecord(p.historicalEligibilityWitness, [
    'original',
    'current',
    'originalCutoff',
  ]);
  // Reuse bounded original/current validation; balanced batch labels cannot
  // substitute for the real fixed guard's source authentication.
  const source = parse({
    schemaVersion: 'industry-funding-source-input-v1',
    original: witness.original,
    current: witness.current,
    resources: p.lockedResources,
  });
  const op = request.posting.evidence.operating.payload;
  equal(source.current, {
    worldId: request.command.worldId,
    countryId: request.posting.evidence.output.countryId,
    operatorId: op.operatorId,
    commandId: request.command.commandId,
    commandFingerprint: request.command.fingerprint,
    ...request.expectedHead,
    simTime: request.command.simTime.toCanonicalValue(),
    fundingBatchId: request.fundingBatchId,
    fundingFingerprint: request.fundingFingerprint,
    costLegId: request.costLegId,
  });
  equal(source.original, {
    worldId: request.command.worldId,
    countryId: request.posting.evidence.output.countryId,
    operatorId: op.operatorId,
    batchId: request.fundingBatchId,
    batchFingerprint: request.fundingFingerprint,
    costLegId: request.costLegId,
    amount: op.settledCost.amount,
    currency: op.settledCost.currency,
  });
  const cutoff = {
    beforeWorldVersion: source.original.worldVersionBefore,
    afterWorldVersion: source.original.worldVersionAfter,
    beforeEventSequence: source.original.eventSequenceBefore,
    afterEventSequence: source.original.eventSequenceAfter,
    simTime: source.original.simTime,
  };
  same(witness.originalCutoff, cutoff, 'ORIGINAL_CUTOFF_AUDIT_MISMATCH');
  if (
    BigInt(source.original.worldVersionAfter!) !==
      BigInt(source.original.worldVersionBefore!) + 1n ||
    BigInt(source.original.worldVersionAfter!) >
      BigInt(request.expectedHead.worldVersion) ||
    BigInt(source.original.eventSequenceBefore!) >=
      BigInt(source.original.eventSequenceAfter!) ||
    BigInt(source.original.eventSequenceAfter!) >
      BigInt(request.expectedHead.eventSequence) ||
    BigInt(source.original.simTime!) > request.command.simTime.ticks
  )
    industryInputInvalid('ORIGINAL_CUTOFF_OUTSIDE_PRIOR_PREFIX');
  const effect = industryClosedRecord(p.fundingBinding, [
    'commandId',
    'commandFingerprint',
    'transitionBinding',
    'batchId',
    'batchFingerprint',
    'costLegId',
    'amount',
    'currency',
    'cashAccountId',
    'expenseAccountId',
  ]);
  const { transitionBinding: originalTransition, ...effectFields } = effect;
  same(
    effectFields,
    Object.fromEntries(
      [
        'commandId',
        'commandFingerprint',
        'batchId',
        'batchFingerprint',
        'costLegId',
        'amount',
        'currency',
        'cashAccountId',
        'expenseAccountId',
      ].map((k) => [k, source.original[k]]),
    ),
    'ORIGINAL_EFFECT_AUDIT_MISMATCH',
  );
  const t = industryClosedRecord(originalTransition, [
    'schemaVersion',
    'transitionId',
    'worldId',
    'commandId',
    'commandFingerprint',
    'idempotencyKey',
    'expectedWorldVersion',
    'worldVersionBefore',
    'worldVersionAfter',
    'eventIds',
    'eventFingerprints',
    'simTime',
  ]);
  if (
    t.schemaVersion !== 'authoritative-transition-binding-v1' ||
    !Array.isArray(t.eventIds) ||
    !Array.isArray(t.eventFingerprints) ||
    t.eventIds.length === 0 ||
    t.eventIds.length !== t.eventFingerprints.length
  )
    industryInputInvalid('ORIGINAL_TRANSITION_AUDIT_REQUIRED');
  for (const id of t.eventIds) ref(id);
  for (const fingerprint of t.eventFingerprints) sha(fingerprint);
  same(
    {
      worldId: t.worldId,
      commandId: t.commandId,
      commandFingerprint: t.commandFingerprint,
      worldVersionBefore: t.worldVersionBefore,
      worldVersionAfter: t.worldVersionAfter,
      simTime: t.simTime,
    },
    Object.fromEntries(
      [
        'worldId',
        'commandId',
        'commandFingerprint',
        'worldVersionBefore',
        'worldVersionAfter',
        'simTime',
      ].map((k) => [k, source.original[k]]),
    ),
    'ORIGINAL_TRANSITION_AUDIT_MISMATCH',
  );
  ref(t.transitionId);
  if (t.idempotencyKey !== null) ref(t.idempotencyKey);
  if (
    t.expectedWorldVersion !== null &&
    t.expectedWorldVersion !== source.original.worldVersionBefore
  )
    industryInputInvalid('ORIGINAL_EXPECTED_VERSION_MISMATCH');
  const prefix = industryClosedRecord(p.targetPrefixBinding, [
    'seedId',
    'seedFingerprint',
    'originalCutoff',
    'checkedHead',
    'proposedWorldVersion',
    'financialBatches',
  ]);
  ref(prefix.seedId);
  sha(prefix.seedFingerprint);
  same(prefix.originalCutoff, cutoff, 'PREFIX_ORIGINAL_CUTOFF_MISMATCH');
  same(prefix.checkedHead, p.checkedHead, 'PREFIX_HELD_HEAD_MISMATCH');
  same(
    prefix.proposedWorldVersion,
    request.transition.worldVersionAfter,
    'PREFIX_PROPOSED_VERSION_MISMATCH',
  );
  if (
    !Array.isArray(prefix.financialBatches) ||
    prefix.financialBatches.length === 0
  )
    industryInputInvalid('COMPLETE_BATCH_IDENTITIES_REQUIRED');
  const ids = new Set<string>();
  let fundingMatches = 0;
  for (const raw of prefix.financialBatches) {
    const batch = industryClosedRecord(raw, ['batchId', 'fingerprint']);
    const id = ref(batch.batchId);
    sha(batch.fingerprint);
    if (ids.has(id)) industryInputInvalid('DUPLICATE_PREFIX_BATCH');
    ids.add(id);
    if (id === request.fundingBatchId) {
      same(
        batch.fingerprint,
        request.fundingFingerprint,
        'PREFIX_FUNDING_FINGERPRINT_MISMATCH',
      );
      fundingMatches++;
    }
  }
  if (fundingMatches !== 1)
    industryInputInvalid('EXACT_PRIOR_FUNDING_NOT_FOUND');
  resources(p.lockedResources);
}
