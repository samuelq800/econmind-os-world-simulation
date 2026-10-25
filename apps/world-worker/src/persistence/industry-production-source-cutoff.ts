import {
  Money,
  assertProductionFunding,
  bindAuthoritativeTransition,
  canonicalSerialize,
  rebuildV08LedgersFromLineage,
  validateFinalReceiptForCommand,
  type AuthoritativeTransition,
  type CanonicalCommand,
  type InventoryProductionPosting,
  type Sha256Hex,
} from '@econmind/core';
import {
  readValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from './validated-canonical-lineage.js';
import type { SqlExecutor } from './sql-database.js';
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
