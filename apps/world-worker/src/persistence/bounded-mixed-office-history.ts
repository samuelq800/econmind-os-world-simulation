/** Complete bounded Budget/Social replay, DATA_ONLY. No seed hydration, skipped
 * frame, admission, authorization or commit capability is created here. Call
 * only inside the existing Finance custody/lease/head transaction through its
 * final source recheck. Country originals come from fixed SQL, never requests. */
import { createHash } from 'node:crypto';
import {
  DomainError,
  DOMAIN_ERROR_CODES,
  canonicalSerialize,
  Money,
  parseAuthoritativeEvent,
  createAuthoritativeTransition,
  validateFinalReceiptForCommand,
  type CanonicalCommand,
  type SocialEmploymentServiceState,
  type SocialEmploymentWageOffer,
} from '@econmind/core';
import {
  FINANCE_NATIVE_BUDGET_EVENT_TYPES,
  prepareFinanceNativeBudgetMixedPrefix,
  readFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetCanonicalFrame,
} from '@econmind/core/finance-budget-native';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import { readFinalReceiptFrom } from './atomic-transition-repository.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';

export const BOUNDED_MIXED_OFFICE_LIMITS = Object.freeze({
  events: 256,
  eventBytes: 65536,
  commandBytes: 16384,
  prefixBytes: 1048576,
  countryBytes: 262144,
  totalCountryBytes: 1048576,
});
export const BOUNDED_MIXED_SOCIAL_SOURCE_SCHEMA =
  'finance-budget-mixed-social-source-v1';
const socialTypes = new Map([
  [
    'SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATED_V1',
    'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1',
  ],
  [
    'SOCIAL_EMPLOYMENT_SERVICE_PLANNED_V1',
    'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
  ],
  ['SOCIAL_JOB_MATCH_SETTLED_V1', 'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1'],
]);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(message: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Bounded mixed prefix: ' + message,
  );
}
const text = (v: unknown): string => {
  if (typeof v !== 'string' || !v || v.trim() !== v)
    invalid('noncanonical durable field');
  return v;
};
const integer = (v: unknown): string => {
  const s =
    typeof v === 'bigint' || typeof v === 'number' ? String(v) : text(v);
  if (!/^(?:0|[1-9]\d*)$/u.test(s)) invalid('noncanonical cursor');
  return s;
};
const timestamp = (v: unknown) =>
  v instanceof Date ? v.toISOString() : text(v);
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('sealed source object required');
  return v as Record<string, unknown>;
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
export interface BoundedMixedOfficeSourcePins {
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly canonicalSeedSha256: string;
}
export interface BoundedMixedOfficeFundingAccount {
  readonly countryId: string;
  readonly accountRef: string;
  readonly claimId: string;
  readonly payerEntityId: string;
  readonly issuerEntityId: string;
  readonly payerRole: 'GOV';
  readonly currency: string;
  readonly availableAmount: string;
  readonly reservedAmount: string;
}
export async function readBoundedMixedOfficeHistoryFrom(input: {
  readonly executor: SqlExecutor;
  readonly database: SqlDatabase;
  readonly worldId: string;
  readonly countryId: string;
  readonly expectedWorldVersion: string | null;
  readonly workerId: string;
  readonly observedAtReal: string;
  readonly envelopeRef: string;
  readonly effectivePeriodRef: string;
  readonly sourcePins: BoundedMixedOfficeSourcePins;
}) {
  const tx = input.executor,
    limit = BOUNDED_MIXED_OFFICE_LIMITS;
  const h = await tx.query<{ world_version: string; event_sequence: string }>(
    'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1 for share',
    [input.worldId],
  );
  if (h.rows.length !== 1) invalid('actual head required');
  const head = h.rows[0]!;
  if (
    integer(head.world_version) !== input.expectedWorldVersion ||
    BigInt(integer(head.event_sequence)) > BigInt(limit.events) ||
    BigInt(head.world_version) > BigInt(limit.events)
  )
    invalid('stale head or bounded replay capacity exceeded');
  const effects = await tx.query<{ financial: boolean; inventory: boolean }>(
    'select exists(select 1 from world_v2.financial_posting_batch where world_id=$1)as financial,exists(select 1 from world_v2.inventory_posting where world_id=$1)as inventory',
    [input.worldId],
  );
  if (
    effects.rows.length !== 1 ||
    effects.rows[0]!.financial !== false ||
    effects.rows[0]!.inventory !== false
  )
    invalid('unsupported financial or inventory posting effect');
  const e = await tx.query<Record<string, unknown>>(
    'select event_id,event_type,schema_version,world_id,causation_command_id,correlation_id,world_version::text,event_sequence::text as sequence,sim_time::text,recorded_at_real,corrects_event_id,canonical_payload,payload_sha256,event_fingerprint from world_v2.authoritative_event where world_id=$1 and octet_length(canonical_payload)<=65536 order by event_sequence limit 257',
    [input.worldId],
  );
  if (
    e.rows.length !== Number(head.event_sequence) ||
    e.rows.length > limit.events
  )
    invalid('complete bounded event prefix required');
  let prefixBytes = 0;
  const reader = new DurableV08LedgerLineageReader({
    database: input.database,
    sha256Hex: sha,
  });
  const groups = new Map<
    string,
    {
      command: CanonicalCommand;
      events: ReturnType<typeof parseAuthoritativeEvent>[];
    }
  >();
  const participants = new Set<string>([input.countryId]);
  for (const row of e.rows) {
    const eventType = text(row.event_type),
      socialCommand = socialTypes.get(eventType);
    if (
      !FINANCE_NATIVE_BUDGET_EVENT_TYPES.some((t) => t === eventType) &&
      !socialCommand
    )
      invalid('unknown intervening family');
    const id = text(row.causation_command_id);
    let group = groups.get(id);
    if (!group) {
      const bounded = await tx.query<{ present: boolean }>(
        'select exists(select 1 from world_v2.command_submission where world_id=$1 and command_id=$2 and octet_length(canonical_payload)<=16384)as present',
        [input.worldId, id],
      );
      if (bounded.rows.length !== 1 || bounded.rows[0]!.present !== true)
        invalid('bounded canonical command required');
      const command = await reader.readCommandFrom(tx, input.worldId, id);
      if (Buffer.byteLength(command.canonicalPayload) > limit.commandBytes)
        invalid('bounded canonical command required');
      prefixBytes += Buffer.byteLength(command.canonicalPayload);
      group = { command, events: [] };
      groups.set(id, group);
    }
    if (
      group.command.commandType !==
      (socialCommand ?? 'CORE_FINANCE_BUDGET_APPROPRIATION_V1')
    )
      invalid('event/command family mismatch');
    participants.add(group.command.countryId);
    const bytes = text(row.canonical_payload);
    prefixBytes += Buffer.byteLength(bytes);
    if (
      Buffer.byteLength(bytes) > limit.eventBytes ||
      prefixBytes > limit.prefixBytes
    )
      invalid('complete prefix byte capacity exceeded');
    const body: unknown = JSON.parse(bytes);
    if (canonicalSerialize(body) !== bytes) invalid('noncanonical event bytes');
    const event = parseAuthoritativeEvent(
      {
        schemaVersion: text(row.schema_version),
        eventId: text(row.event_id),
        eventType,
        worldId: text(row.world_id),
        causationCommandId: id,
        correlationId: text(row.correlation_id),
        worldVersion: integer(row.world_version),
        sequence: integer(row.sequence),
        simTime: integer(row.sim_time),
        recordedAtReal: timestamp(row.recorded_at_real),
        correctsEventId:
          row.corrects_event_id === null ? null : text(row.corrects_event_id),
        payload: body,
      },
      sha,
    );
    if (
      event.payloadHash !== row.payload_sha256 ||
      event.fingerprint !== row.event_fingerprint
    )
      invalid('event hashes mismatch');
    group.events.push(event);
  }
  const frames: FinanceNativeBudgetCanonicalFrame[] = [];
  for (const group of groups.values()) {
    const transition = createAuthoritativeTransition({
      command: group.command,
      events: group.events,
      worldVersionBefore: group.command.expectedWorldVersion!,
      worldVersionAfter: group.events[0]!.worldVersion,
    });
    const receipt = await readFinalReceiptFrom(tx, group.command);
    if (!receipt || receipt.outcome !== 'COMMITTED')
      invalid('committed receipt missing');
    validateFinalReceiptForCommand({
      command: group.command,
      transition,
      receipt,
    });
    frames.push({
      ...group,
      transition,
      receipt,
      financialPostingBatches: [],
      inventoryPostings: [],
    });
  }
  const committed = await tx.query<{ command_id: string }>(
    "select command_id from world_v2.command_receipt where world_id=$1 and outcome='COMMITTED'order by world_version_after,command_id limit 257",
    [input.worldId],
  );
  if (
    committed.rows.length !== frames.length ||
    new Set(committed.rows.map((r) => r.command_id)).size !== frames.length ||
    frames.some(
      (f) => !committed.rows.some((r) => r.command_id === f.command.commandId),
    )
  )
    invalid('receipt set differs from complete prefix');
  let sourceBytes = 0;
  const countries: {
      countryId: string;
      state: SocialEmploymentServiceState;
      offers: readonly SocialEmploymentWageOffer[];
    }[] = [],
    funding: BoundedMixedOfficeFundingAccount[] = [],
    sourceBindings: {
      countryId: string;
      sourceSha256: string;
      sourceRef: string;
    }[] = [];
  for (const country of [...participants].sort()) {
    const rows = await tx.query<{
      source_ref: string;
      source_text: string;
      source_sha256: string;
    }>(
      'select * from world_v2.read_finance_budget_mixed_social_original($1,$2,$3,$4,$5,$6,$7::timestamptz)',
      [
        input.worldId,
        input.countryId,
        country,
        input.envelopeRef,
        input.effectivePeriodRef,
        input.workerId,
        input.observedAtReal,
      ],
    );
    if (rows.rows.length !== 1)
      invalid('sealed participant country source required');
    const row = rows.rows[0]!,
      bytes = text(row.source_text);
    sourceBytes += Buffer.byteLength(bytes);
    if (
      Buffer.byteLength(bytes) > limit.countryBytes ||
      sourceBytes > limit.totalCountryBytes ||
      sha(bytes) !== row.source_sha256
    )
      invalid('sealed country bytes/hash capacity mismatch');
    const p = object(JSON.parse(bytes));
    if (
      p.schemaVersion !== BOUNDED_MIXED_SOCIAL_SOURCE_SCHEMA ||
      p.worldId !== input.worldId ||
      p.countryId !== country ||
      p.seedId !== input.sourcePins.seedId ||
      p.seedFingerprint !== input.sourcePins.seedFingerprint ||
      p.admissionRef !== input.sourcePins.admissionRef ||
      p.canonicalSeedSha256 !== input.sourcePins.canonicalSeedSha256 ||
      !Array.isArray(p.offers) ||
      !Array.isArray(p.fundingAccounts)
    )
      invalid('sealed source admission/scope mismatch');
    const state = object(p.state);
    if (
      state.schemaVersion !== 'social-employment-service-state-v1' ||
      state.worldId !== input.worldId ||
      !Array.isArray(state.plans) ||
      state.plans.length !== 0 ||
      !Array.isArray(state.appliedOperations) ||
      state.appliedOperations.length !== 0
    )
      invalid('genuine H0 country state required');
    countries.push({
      countryId: country,
      state: state as unknown as SocialEmploymentServiceState,
      offers: p.offers as unknown as readonly SocialEmploymentWageOffer[],
    });
    for (const raw of p.fundingAccounts) {
      const a = object(raw);
      if (
        a.countryId !== country ||
        a.payerRole !== 'GOV' ||
        funding.some(
          (f) => f.accountRef === a.accountRef || f.claimId === a.claimId,
        )
      )
        invalid('unique actual GOV country account required');
      for (const key of [
        'accountRef',
        'claimId',
        'payerEntityId',
        'issuerEntityId',
        'currency',
      ])
        text(a[key]);
      for (const key of ['availableAmount', 'reservedAmount']) {
        const raw = text(a[key]);
        if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(raw))
          invalid('canonical actual account capacity required');
        const amount = Money.from(raw, text(a.currency));
        if (amount.amount.isNegative())
          invalid('canonical actual account capacity required');
        // The immutable original may retain cents ("18174961792.80").
        // Normalize its exact decimal value for the calculation DTO only;
        // source_text/source_sha256 and the original provenance stay intact.
        a[key] = amount.toCanonicalValue().amount;
      }
      funding.push(a as unknown as BoundedMixedOfficeFundingAccount);
    }
    sourceBindings.push({
      countryId: country,
      sourceSha256: text(row.source_sha256),
      sourceRef: text(row.source_ref),
    });
  }
  const mixedPrefixEvidence = prepareFinanceNativeBudgetMixedPrefix(
    { worldId: input.worldId, frames, socialCountries: countries },
    sha,
  );
  const result = readFinanceNativeBudgetMixedPrefix(
    mixedPrefixEvidence,
    input.worldId,
    frames,
    sha,
  );
  if (
    result.budgetState.worldVersion !== head.world_version ||
    result.budgetState.eventSequence !== head.event_sequence
  )
    invalid('computed complete prefix differs from actual head');
  const totals = new Map(
    funding.map((a) => [
      a.accountRef,
      Money.from(a.reservedAmount, a.currency),
    ]),
  );
  for (const c of [
    ...result.budgetEncumbrances.map((c) => ({
      ...c,
      ownerId: c.governmentEntityId,
    })),
    ...result.socialReservations.map((r) => ({
      ...r,
      ownerId: r.employerId,
      claimId: null,
    })),
  ]) {
    const a = funding.find(
      (a) =>
        a.accountRef === c.accountId &&
        a.countryId === c.countryId &&
        a.payerEntityId === c.ownerId &&
        a.currency === c.currency &&
        (c.claimId === null || a.claimId === c.claimId),
    );
    if (!a) invalid('exact actual capacity account/owner/claim required');
    totals.set(
      a.accountRef,
      totals.get(a.accountRef)!.add(Money.from(c.amount, c.currency)),
    );
  }
  for (const a of funding)
    if (
      totals
        .get(a.accountRef)!
        .amount.greaterThan(Money.from(a.availableAmount, a.currency).amount)
    )
      invalid('global fiscal capacity overbooked');
  return freeze({
    classification: 'COMPLETE_BOUNDED_CORE_REPLAY_DATA_ONLY' as const,
    head,
    frames,
    state: result.budgetState,
    mixedPrefixEvidence,
    socialReservations: result.socialReservations,
    sourceBindings,
    fundingAccounts: funding,
    prefixBytes,
    sourceBytes,
  });
}
