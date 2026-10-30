/** Fixed native OMO source. Startup keeps a genuine H0 financial ledger only;
 * every fresh use rechecks the real custody and complete bounded SQL prefix.
 * This is not an activation, issuer, actor grant, Clock or consumer factory. */
import { createHash } from 'node:crypto';
import {
  CENTRAL_BANK_OMO_COMMAND,
  CENTRAL_BANK_OMO_CAPABILITY,
  CENTRAL_BANK_OMO_EVENT,
  canonicalSerialize,
  canonicalHashInput,
  canonicalSha256,
  isValidatedOpeningSeed,
  rebuildV08LedgersFromLineage,
  parseAuthoritativeEvent,
  createFinalCommandReceipt,
  parseCentralBankOmoIntent,
  prepareCentralBankOmoTransition,
  validateCentralBankOmoSource,
  centralBankOmoSourceHash,
  parseWorldWriterLease,
  createWorldWriterCommitAssertion,
  validateCanonicalCommand,
  isCommitAuthorizationProof,
  reauthorizeCommitAuthorizationProof,
  type OpeningSeed,
  type CanonicalCommand,
  type CommitAuthorizationProof,
  type DecisionResultHead,
  type AuthoritativeTransition,
  type FinancialPostingBatch,
  type CentralBankOmoSource,
  type CentralBankOmoSourceFacts,
} from '@econmind/core';
import {
  decodeDurableCanonicalCommandRow,
  decodeDurableFinancialPostingBatch,
} from './durable-v08-ledger-lineage-reader.js';
import {
  decodeDurableFinalReceiptRow,
  type AtomicTransitionCandidateFactory,
} from './atomic-transition-repository.js';
import {
  createCentralBankOmoCandidateFactory,
  type CentralBankOmoPreparation,
} from './central-bank-omo-candidate-source.js';
import {
  CENTRAL_BANK_OMO_SOURCE_READER,
  lockCentralBankOmoOriginalsFrom,
  invalidCentralBankOmoOriginal as invalid,
  exactOmoText as text,
  CentralBankOmoOriginalsMissing,
  type CentralBankOmoLockedOriginals,
  type CentralBankOmoCustodyBinding,
} from './postgres-central-bank-omo-originals.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import {
  prepareFinanceSocialLedger,
  replayPreparedFinanceSocialFxLedger,
  type PreparedFinanceSocialLedger,
} from '@econmind/core/finance-social-prepared-ledger';
import { decodeBoundedPostwarCanonicalPrefix } from './bounded-postwar-canonical-prefix.js';
import { decodeBoundedPostwarJournal } from './bounded-postwar-fx-postings.js';
import { readCentralBankOmoCommittedOriginalsFrom } from './postgres-central-bank-omo-history.js';
import {
  readPostwarSocialRuntimeFinancialReplayBase,
  type PostwarSocialRuntimeConnection,
} from '../runtime-preparation/social-runtime-connection.js';
import { consumePreparedPostwarSocialFinancialReplayBase } from './prepared-postwar-social-source.js';
import { projectPostwarOpeningFinancialEncumbrances } from './prepared-postwar-finance-social-fx-replay.js';
import { readPostwarBeneficialHousingRentMixedOriginalsForSocialBase } from './postwar-beneficial-housing-rent-mixed-source.js';

export const CENTRAL_BANK_OMO_SOURCE_PURPOSE =
  'CENTRAL_BANK_OMO_SOURCE_RECHECK_V1' as const;
export interface CentralBankOmoSourceCommitRequest {
  readonly phase: 'BEFORE_EVENTS';
  readonly purpose: typeof CENTRAL_BANK_OMO_SOURCE_PURPOSE;
  readonly command: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly financialPostingBatches: readonly FinancialPostingBatch[];
  readonly currentHead: DecisionResultHead;
  readonly observedAtReal: string;
  readonly readBinding: unknown;
  readonly commitAuthorization: CommitAuthorizationProof;
}
export interface CentralBankOmoSourceCommitAudit {
  readonly status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY';
  readonly purpose: typeof CENTRAL_BANK_OMO_SOURCE_PURPOSE;
  readonly commandFingerprint: string;
  readonly currentHead: DecisionResultHead;
  readonly readBindingFingerprint: string;
  readonly protectionMode: 'HELD_SOURCE_GUARDS';
}
export interface CentralBankOmoSourceCommitProtectionPort {
  assertCurrentFrom(
    tx: SqlExecutor,
    request: Readonly<CentralBankOmoSourceCommitRequest>,
  ): Promise<Readonly<CentralBankOmoSourceCommitAudit>>;
}
export interface CentralBankOmoSourceReadBinding {
  readonly schemaVersion: 'postwar-central-bank-omo-read-binding-v1';
  readonly commandFingerprint: string;
  readonly observedAtReal: string;
  readonly currentHead: DecisionResultHead;
  readonly custody: Readonly<CentralBankOmoCustodyBinding>;
  readonly sourceFingerprint: string;
  readonly authorizationTeamId: string;
  readonly authorizationVersion: string;
}
const runtimeInstances = new WeakSet<object>();
export function isPostwarCentralBankOmoRuntime(
  value: unknown,
): value is PostwarCentralBankOmoRuntime {
  return !!value && typeof value === 'object' && runtimeInstances.has(value);
}
const issued = new WeakSet<object>();
export function isPostwarCentralBankOmoSourceCommitProtectionPort(
  value: unknown,
): value is CentralBankOmoSourceCommitProtectionPort {
  return !!value && typeof value === 'object' && issued.has(value);
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
const uint = (v: unknown): string => {
  const s = text(v);
  if (!/^(0|[1-9][0-9]*)$/u.test(s)) invalid('CANONICAL_HEAD_REQUIRED');
  return s;
};
function rows(v: unknown): Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(v) || v.length > 256)
    invalid('COMPLETE_BOUNDED_ROWS_REQUIRED');
  return v.map((r) => {
    if (!r || typeof r !== 'object' || Array.isArray(r))
      invalid('ACTUAL_ROW_REQUIRED');
    return r as Readonly<Record<string, unknown>>;
  });
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
type Financial = ReturnType<typeof rebuildV08LedgersFromLineage>['financial'];
interface Prepared {
  readonly seedFingerprint: string;
  readonly rawSHA256: string;
  readonly financial: Financial;
  readonly mixedLedger: PreparedFinanceSocialLedger;
}
function trace(
  facts: CentralBankOmoSourceFacts,
  original: CentralBankOmoLockedOriginals,
): CentralBankOmoSource['trace'] {
  return {
    traceRef: `CB_OMO.${original.original.sourceRef}`,
    calculationVersion: 'CB1.V1',
    snapshot: {
      lineageRef: original.binding.adoptionRef,
      sourceVersion: `WORLD_VERSION.${facts.worldVersion}`,
      snapshotRef: original.original.sourceRef,
      snapshotHash: centralBankOmoSourceHash(facts, sha),
      predecessorSnapshotHash: null,
    },
    snapshotAt: { amount: facts.currentSimTime, unit: 'sim_millisecond' },
  };
}
function snapshots(
  original: CentralBankOmoLockedOriginals,
  financial: Financial,
) {
  const update = <T extends object>(
    template: T,
    map: Readonly<Record<string, string>>,
  ): T => {
    const result = { ...template } as Record<string, unknown>;
    for (const [field, id] of Object.entries(map)) {
      const account = financial.accounts.find((a) => a.accountId === id);
      if (!account) invalid('ORIGINAL_ACCOUNT_ABSENT');
      const position = financial.positions.find(
        (p) => p.account.accountId === id,
      );
      const amount = position?.netDebitBalance;
      result[field] = {
        amount: amount
          ? (account.accountClass === 'LIABILITY' ||
            account.accountClass === 'EQUITY'
              ? amount.amount.negated()
              : amount.amount
            ).toString()
          : '0',
        currency: account.currency,
      };
    }
    return result as T;
  };
  return {
    bank: update(original.original.bank, original.original.bankAccounts),
    centralBank: update(
      original.original.centralBank,
      original.original.centralBankAccounts,
    ),
  };
}
function sourceFrom(
  original: CentralBankOmoLockedOriginals,
  financial: Financial,
  holdings: CentralBankOmoSourceFacts['holdings'],
  sequence: string,
  simTime: string,
): CentralBankOmoSource {
  const o = original.original;
  const facts: CentralBankOmoSourceFacts = {
    worldId: o.worldId,
    countryId: o.countryId,
    worldVersion: financial.worldVersion,
    currentSimTime: simTime,
    currentEventSequence: sequence,
    domesticTreasuryRef: o.domesticTreasuryRef,
    ...snapshots(original, financial),
    bankAccounts: o.bankAccounts,
    centralBankAccounts: o.centralBankAccounts,
    holdings,
    quote: original.quote,
  };
  return { facts, trace: trace(facts, original), financialState: financial };
}
/** All events/receipts/postings are consumed, in original global order. This
 * first installer supports only same-country OMO; foreign/unknown domains deny. */
function replay(prepared: Prepared, original: CentralBankOmoLockedOriginals) {
  const r = original.row,
    es = rows(r.events),
    cs = rows(r.commands),
    rs = rows(r.receipts),
    bs = rows(r.financial_batches);
  const version = uint(r.world_version),
    sequence = uint(r.event_sequence);
  if (
    BigInt(version) > 256n ||
    version !== sequence ||
    es.length !== Number(sequence) ||
    cs.length !== es.length ||
    rs.length !== es.length ||
    bs.length !== es.length ||
    // SQL row metadata includes bounded JSON integer columns in addition to
    // their exact string aliases. This is a transport-byte limit only; the
    // economic payload bytes are independently canonical/Core-validated below.
    Buffer.byteLength(JSON.stringify({ es, cs, rs, bs })) > 1048576
  )
    invalid('COMPLETE_OMO_GLOBAL_PREFIX_REQUIRED');
  let financial = prepared.financial,
    holdings = original.original.holdings;
  const commands = new Map<string, CanonicalCommand>();
  for (const c of cs) {
    const cmd = decodeDurableCanonicalCommandRow(
      {
        command_actor_id: c.actor_id,
        command_auth_subject: c.auth_subject,
        command_canonical_payload: c.canonical_payload,
        command_country_id: c.country_id,
        command_expected_world_version: c.expected_world_version,
        command_fingerprint: c.command_fingerprint,
        command_id: c.command_id,
        command_idempotency_key: c.idempotency_key,
        command_office_id: c.office_id,
        command_payload_sha256: c.payload_sha256,
        command_schema_version: c.schema_version,
        command_sim_time: c.sim_time,
        command_submitted_at_real: c.submitted_at_real,
        command_type: c.command_type,
        command_world_id: c.world_id,
        correlation_id: c.correlation_id,
      },
      sha,
    );
    if (
      commands.has(cmd.commandId) ||
      cmd.commandType !== CENTRAL_BANK_OMO_COMMAND ||
      cmd.countryId !== original.original.countryId ||
      cmd.worldId !== original.original.worldId
    )
      invalid('UNKNOWN_OR_FOREIGN_OMO_PREFIX');
    commands.set(cmd.commandId, cmd);
  }
  let lastSimTime = 0n;
  for (const [i, e] of es.entries()) {
    const command = commands.get(text(e.causation_command_id));
    if (!command) invalid('PREFIX_COMMAND_REQUIRED');
    const body = JSON.parse(text(e.canonical_payload)) as {
      source: CentralBankOmoSourceFacts;
      trace: CentralBankOmoSource['trace'];
    };
    const event = parseAuthoritativeEvent(
      {
        schemaVersion: text(e.schema_version),
        eventId: text(e.event_id),
        eventType: text(e.event_type),
        worldId: text(e.world_id),
        causationCommandId: command.commandId,
        correlationId: text(e.correlation_id),
        worldVersion: uint(e.world_version),
        sequence: uint(e.sequence),
        simTime: uint(e.sim_time),
        recordedAtReal: text(e.recorded_at_real),
        correctsEventId:
          e.corrects_event_id === null ? null : text(e.corrects_event_id),
        payload: body,
      },
      sha,
    );
    if (
      event.eventType !== CENTRAL_BANK_OMO_EVENT ||
      event.sequence !== String(i + 1) ||
      event.fingerprint !== e.event_fingerprint ||
      event.payloadHash !== e.payload_sha256 ||
      canonicalSerialize(body) !== e.canonical_payload
    )
      invalid('EXACT_OMO_EVENT_REQUIRED');
    if (command.simTime.ticks < lastSimTime)
      invalid('PREFIX_SIM_TIME_REGRESSION');
    lastSimTime = command.simTime.ticks;
    const o = original.original,
      f = body.source;
    if (
      !same(f.holdings, holdings) ||
      f.domesticTreasuryRef !== o.domesticTreasuryRef ||
      !same(f.bankAccounts, o.bankAccounts) ||
      !same(f.centralBankAccounts, o.centralBankAccounts) ||
      f.bank.bankRef !== o.bank.bankRef ||
      f.centralBank.centralBankRef !== o.centralBank.centralBankRef ||
      f.bank.nonPerformingLoans.amount !== o.bank.nonPerformingLoans.amount
    )
      invalid('HISTORICAL_RIGHTS_OR_MAPPING_DIFFERS');
    const registered = rows(r.historical_quotes).find(
      (q) => q.quote_text === canonicalSerialize(f.quote),
    );
    if (
      !registered ||
      sha(text(registered.quote_text)) !== registered.quote_sha256
    )
      invalid('HISTORICAL_ADMITTED_QUOTE_REQUIRED');
    const batch = bs.find((b) => b.causation_command_id === command.commandId);
    if (!batch) invalid('EXACT_FINANCIAL_BATCH_REQUIRED');
    const priorSource: CentralBankOmoSource = {
      facts: f,
      trace: body.trace,
      financialState: financial,
    };
    const expected = prepareCentralBankOmoTransition({
      command,
      source: priorSource,
      eventId: event.eventId,
      eventSequence: event.sequence,
      financialBatchId: text(batch.batch_id),
      observedAtReal: event.recordedAtReal,
      sha256Hex: sha,
    });
    const actual = decodeDurableFinancialPostingBatch({
      command,
      transition: expected.transition,
      row: {
        canonical_payload: batch.canonical_payload,
        fingerprint: batch.fingerprint,
        causation_command_id: batch.causation_command_id,
      },
      sha256Hex: sha,
    });
    const receiptRow = rs.find((x) => x.command_id === command.commandId);
    if (!receiptRow) invalid('COMMITTED_RECEIPT_REQUIRED');
    const receipt = decodeDurableFinalReceiptRow(receiptRow, command);
    if (
      !same(event, expected.event) ||
      !same(actual, expected.posting) ||
      !receipt ||
      !same(
        receipt,
        createFinalCommandReceipt({
          command,
          outcome: 'COMMITTED',
          reasonCode: null,
          transition: expected.transition,
          simTime: command.simTime,
          recordedAtReal: receipt.recordedAtReal,
        }),
      )
    )
      invalid('FULL_CORE_OMO_HISTORY_DIFFERS');
    financial = expected.financial.state;
    holdings = expected.holdingsAfter;
  }
  if (financial.worldVersion !== version) invalid('ACTUAL_PREFIX_HEAD_DIFFERS');
  return { financial, holdings, sequence };
}
export interface PostwarCentralBankOmoRuntime {
  prepare(seed: Readonly<OpeningSeed>): Promise<void>;
  preflight(command: CanonicalCommand, observedAtReal: string): Promise<void>;
  readonly factory: Readonly<AtomicTransitionCandidateFactory>;
  readonly sourceCommitProtectionPort: Readonly<CentralBankOmoSourceCommitProtectionPort>;
}
export function createPostwarCentralBankOmoRuntime(config: {
  readonly database: SqlDatabase;
  readonly worldId: string;
  readonly countryId: string;
  readonly workerId: string;
  readonly workerRole: string;
  readonly mode: 'OFFICIAL_RUNTIME' | 'TEST_ONLY_LOCAL';
  /** Actual private, already prepared same-seed Social connection. No DTO,
   * source callback, request flag or copied preparation is accepted. */
  readonly mixedSocialConnection?: Readonly<PostwarSocialRuntimeConnection>;
}): Readonly<PostwarCentralBankOmoRuntime> {
  if (!['OFFICIAL_RUNTIME', 'TEST_ONLY_LOCAL'].includes(config.mode))
    invalid('EXPLICIT_SOURCE_MODE_REQUIRED');
  if (
    !/^[a-z][a-z0-9_]{0,62}$/u.test(config.workerRole) ||
    config.workerRole.startsWith('world_v2_') ||
    ['postgres', 'service_role', 'anon', 'authenticated'].includes(
      config.workerRole,
    )
  )
    invalid('SEPARATE_WORKER_ROLE_REQUIRED');
  let prepared: Prepared | null = null;
  async function inReader<T>(
    tx: SqlExecutor,
    consume: () => Promise<T>,
  ): Promise<T> {
    const check = await tx.query<
      Record<string, unknown>
    >(`select current_user as role_name,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication,
      current_setting('transaction_isolation') as isolation,current_setting('transaction_read_only') as read_only,
      pg_has_role(current_user,'world_v2_cb_omo_source_reader','MEMBER') as reader_member,
      pg_has_role(current_user,'world_v2_cb_omo_source_owner','MEMBER') as owner_member,
      pg_has_role(current_user,'world_v2_cb_omo_source_publisher','MEMBER') as publisher_member from pg_roles r where r.rolname=current_user`);
    const c = check.rows[0];
    if (
      check.rows.length !== 1 ||
      !c ||
      c.role_name !== config.workerRole ||
      c.rolsuper !== false ||
      c.rolbypassrls !== false ||
      c.rolcreaterole !== false ||
      c.rolcreatedb !== false ||
      c.rolreplication !== false ||
      c.reader_member !== true ||
      c.owner_member !== false ||
      c.publisher_member !== false ||
      c.read_only !== 'off' ||
      !['repeatable read', 'serializable'].includes(String(c.isolation))
    )
      invalid('FIXED_LOW_PRIVILEGE_STABLE_WORKER_REQUIRED');
    // A SQL custody rejection aborts the subtransaction. Roll it back before
    // restoring role so a secondary 25P02 cannot replace the actual denial.
    await tx.query('savepoint cb_omo_source_scope');
    try {
      await tx.query("select set_config('role',$1,true)", [
        CENTRAL_BANK_OMO_SOURCE_READER,
      ]);
      const value = await consume();
      await tx.query("select set_config('role',$1,true)", [config.workerRole]);
      await tx.query('release savepoint cb_omo_source_scope');
      return value;
    } catch (error: unknown) {
      try {
        await tx.query('rollback to savepoint cb_omo_source_scope');
        await tx.query("select set_config('role',$1,true)", [
          config.workerRole,
        ]);
        await tx.query('release savepoint cb_omo_source_scope');
      } catch (rollbackError: unknown) {
        throw new AggregateError(
          [error, rollbackError],
          'CB OMO source scope restoration failed',
          { cause: rollbackError },
        );
      }
      throw error;
    }
  }
  async function derive(
    tx: SqlExecutor,
    command: CanonicalCommand,
    at: string,
  ): Promise<{
    preparation: CentralBankOmoPreparation;
    binding: CentralBankOmoSourceReadBinding;
  }> {
    if (!prepared)
      throw new CentralBankOmoOriginalsMissing([
        'GENUINE_STORED_OPENING_NOT_PREPARED',
      ]);
    const intent = parseCentralBankOmoIntent(command, sha);
    if (
      command.worldId !== config.worldId ||
      command.countryId !== config.countryId
    )
      invalid('FIXED_COUNTRY_WORLD_REQUIRED');
    const original = await lockCentralBankOmoOriginalsFrom(tx, {
      worldId: config.worldId,
      countryId: config.countryId,
      securityRef: intent.securityRef,
      batchRef: intent.batchRef,
      workerId: config.workerId,
      observedAtReal: at,
      authSubject: command.authSubject,
      settlementSimTime: intent.settlementSimTime,
    });
    if (
      original.binding.seedFingerprint !== prepared.seedFingerprint ||
      original.binding.canonicalSeedSHA256 !== prepared.rawSHA256 ||
      (config.mode === 'OFFICIAL_RUNTIME' &&
        original.sourceClass !== 'ADMITTED_ORIGINAL')
    )
      invalid('EXACT_INDEPENDENT_SOURCE_ADOPTION_REQUIRED');
    const openingSnapshots = snapshots(original, prepared.financial);
    if (
      !same(openingSnapshots.bank, original.original.bank) ||
      !same(openingSnapshots.centralBank, original.original.centralBank)
    )
      invalid('ORIGINAL_OPENING_SNAPSHOT_DIFFERS_FROM_LEDGER');
    const eventRows = rows(original.row.events);
    if (eventRows.some((e) => BigInt(uint(e.sim_time)) > command.simTime.ticks))
      invalid('COMMAND_PRECEDES_ACTUAL_PREFIX');
    const foreign = rows(original.row.commands).some(
      (r) =>
        r.command_type !== CENTRAL_BANK_OMO_COMMAND ||
        r.country_id !== config.countryId,
    );
    const current = foreign
        ? await replayMixed(tx, prepared, original)
        : replay(prepared, original),
      source = sourceFrom(
        original,
        current.financial,
        current.holdings,
        current.sequence,
        intent.settlementSimTime,
      );
    validateCentralBankOmoSource({ command, source, sha256Hex: sha });
    const r = original.row;
    const lease = parseWorldWriterLease({
      schemaVersion: 'world-writer-lease-v1',
      worldId: command.worldId,
      holderId: config.workerId,
      fencingToken: text(r.fencing_token),
      acquiredAtReal: text(r.acquired_at_real),
      renewedAtReal: text(r.renewed_at_real),
      expiresAtReal: text(r.lease_expires_at_real),
    });
    const suffix = sha(command.commandId).toUpperCase();
    return {
      preparation: freeze({
        source,
        commitAssertion: createWorldWriterCommitAssertion(
          lease,
          current.financial.worldVersion,
        ),
        eventId: `EVENT_CB_OMO_${suffix}`,
        eventSequence: String(BigInt(current.sequence) + 1n),
        financialBatchId: `POSTING_CB_OMO_${suffix}`,
        outboxMessageId: `OUTBOX_CB_OMO_${suffix}`,
      }),
      binding: freeze({
        schemaVersion: 'postwar-central-bank-omo-read-binding-v1',
        commandFingerprint: command.fingerprint,
        observedAtReal: at,
        currentHead: {
          worldId: command.worldId,
          worldVersion: current.financial.worldVersion,
          eventSequence: current.sequence,
        },
        custody: original.binding,
        authorizationTeamId: text(original.row.team_id),
        authorizationVersion: text(original.row.authorization_version),
        sourceFingerprint: canonicalSha256(
          canonicalHashInput({ facts: source.facts, trace: source.trace }),
          sha,
        ),
      }),
    };
  }
  async function replayMixed(
    tx: SqlExecutor,
    base: Prepared,
    original: CentralBankOmoLockedOriginals,
  ) {
    const row = original.row,
      decoded = decodeBoundedPostwarCanonicalPrefix({
        worldId: config.worldId,
        prefixRow: row,
        journal: decodeBoundedPostwarJournal(row),
      });
    const b =
      config.mixedSocialConnection === undefined
        ? null
        : consumePreparedPostwarSocialFinancialReplayBase(
            readPostwarSocialRuntimeFinancialReplayBase(
              config.mixedSocialConnection,
              config.worldId,
            ),
          );
    if (
      b &&
      (b.pins.contentHash !== base.seedFingerprint ||
        b.pins.admissionRef !== original.binding.admissionRef ||
        b.pins.worldId !== config.worldId)
    )
      invalid('GENUINE_MIXED_BASE_SEED_ADMISSION_DIFFERS');
    const history = decoded.frames.some(
      (f) => f.command.commandType === CENTRAL_BANK_OMO_COMMAND,
    )
      ? await readCentralBankOmoCommittedOriginalsFrom(tx, {
          worldId: config.worldId,
          hostCountryId: config.countryId,
          officeId: 'CB_OMO',
          seedFingerprint: base.seedFingerprint,
          admissionRef: original.binding.admissionRef,
          expectedHead: decoded.head,
          mode: config.mode,
          frames: decoded.frames,
        })
      : null;
    const origins = (history?.countries ?? []).map((c) => ({
      ...c.original,
      quotes: c.quotes.map((q) => q.quote),
    }));
    const host = origins.find((c) => c.countryId === config.countryId);
    if (host) {
      if (!same({ ...host, quotes: [] }, { ...original.original, quotes: [] }))
        invalid('CURRENT_AND_HISTORICAL_OMO_ORIGIN_DIFFERS');
      if (!host.quotes.some((q) => q.quoteRef === original.quote.quoteRef))
        host.quotes.push(original.quote);
    } else origins.push({ ...original.original, quotes: [original.quote] });
    const beneficialHousingRentReceipts = b
      ? readPostwarBeneficialHousingRentMixedOriginalsForSocialBase(b)
      : undefined;
    const result = replayPreparedFinanceSocialFxLedger({
      prepared: b?.prepared ?? base.mixedLedger,
      frames: decoded.frames,
      socialCountries:
        b?.document.countries.map((c) => ({
          countryId: c.countryId,
          state: c.state,
          offers: c.offers,
        })) ?? [],
      openingEncumbrances: b
        ? projectPostwarOpeningFinancialEncumbrances(b.funding)
        : [],
      fxOriginals: [],
      omoOriginals: origins,
      ...(beneficialHousingRentReceipts === undefined
        ? {}
        : { beneficialHousingRentReceipts }),
      expectedHead: decoded.head,
      sha256Hex: sha,
    });
    const holdings = result.omoCountries?.find(
      (c) => c.countryId === config.countryId,
    )?.holdings;
    if (!holdings) invalid('CURRENT_OMO_RIGHTS_REPLAY_REQUIRED');
    return {
      financial: result.financial,
      holdings,
      sequence: decoded.head.eventSequence,
    };
  }
  async function authorize(
    command: CanonicalCommand,
    proof: CommitAuthorizationProof,
  ) {
    if (
      !isCommitAuthorizationProof(proof) ||
      proof.capability !== CENTRAL_BANK_OMO_CAPABILITY ||
      proof.officeId !== 'CENTRAL_BANK' ||
      proof.worldId !== command.worldId ||
      proof.countryId !== command.countryId ||
      proof.commandId !== command.commandId ||
      proof.commandFingerprint !== command.fingerprint ||
      proof.authSubject !== command.authSubject ||
      proof.actorId !== command.actorId
    )
      invalid('GENUINE_EXACT_CB_AUTHORIZATION_REQUIRED');
    await reauthorizeCommitAuthorizationProof(proof);
  }
  const factory: AtomicTransitionCandidateFactory = {
    async prepare(input) {
      const command = validateCanonicalCommand(input.command, sha);
      if (!input.commitAuthorization) invalid('COMMIT_AUTHORIZATION_REQUIRED');
      await authorize(command, input.commitAuthorization);
      const current = await config.database.transaction((tx) =>
        inReader(tx, () => derive(tx, command, input.observedAtReal)),
      );
      const draft = await createCentralBankOmoCandidateFactory({
        preparation: current.preparation,
        sha256Hex: sha,
      }).prepare(input);
      return Object.freeze({
        ...draft,
        officeOperatingSourceReadBinding: current.binding,
      });
    },
  };
  const guard: CentralBankOmoSourceCommitProtectionPort = Object.freeze({
    async assertCurrentFrom(
      tx: SqlExecutor,
      request: Readonly<CentralBankOmoSourceCommitRequest>,
    ): Promise<Readonly<CentralBankOmoSourceCommitAudit>> {
      const command = validateCanonicalCommand(request.command, sha);
      const binding = freeze(
        JSON.parse(canonicalSerialize(request.readBinding)),
      ) as CentralBankOmoSourceReadBinding;
      if (
        request.phase !== 'BEFORE_EVENTS' ||
        request.purpose !== CENTRAL_BANK_OMO_SOURCE_PURPOSE ||
        binding?.schemaVersion !== 'postwar-central-bank-omo-read-binding-v1' ||
        binding.commandFingerprint !== command.fingerprint ||
        !same(binding.currentHead, request.currentHead) ||
        binding.observedAtReal > request.observedAtReal ||
        command.expectedWorldVersion !== request.currentHead.worldVersion ||
        request.currentHead.worldId !== command.worldId
      )
        invalid('EXACT_FRESH_READ_BINDING_REQUIRED');
      if (
        binding.authorizationTeamId !== request.commitAuthorization.teamId ||
        binding.authorizationVersion !==
          request.commitAuthorization.authorizationVersion
      )
        invalid('EXACT_CURRENT_AUTHORIZATION_REVISION_REQUIRED');
      await authorize(command, request.commitAuthorization);
      await inReader(tx, async () => {
        const current = await derive(tx, command, request.observedAtReal);
        if (
          current.binding.authorizationTeamId !==
            request.commitAuthorization.teamId ||
          current.binding.authorizationVersion !==
            request.commitAuthorization.authorizationVersion
        )
          invalid('ACTUAL_CURRENT_AUTHORIZATION_REVISION_CHANGED');
        if (
          !same(current.binding.custody, binding.custody) ||
          current.binding.sourceFingerprint !== binding.sourceFingerprint ||
          !same(current.binding.currentHead, binding.currentHead)
        )
          invalid('SOURCE_QUOTE_OR_PREFIX_CHANGED');
        const event = request.transition.events[0],
          batch = request.financialPostingBatches[0];
        if (
          request.transition.events.length !== 1 ||
          !event ||
          request.financialPostingBatches.length !== 1 ||
          !batch
        )
          invalid('EXACT_OMO_EVENT_AND_BATCH_REQUIRED');
        const expected = prepareCentralBankOmoTransition({
          ...current.preparation,
          command,
          eventId: event.eventId,
          eventSequence: event.sequence,
          financialBatchId: batch.batchId,
          observedAtReal: binding.observedAtReal,
          sha256Hex: sha,
        });
        if (
          !same(expected.transition, request.transition) ||
          !same([expected.posting], request.financialPostingBatches)
        )
          invalid('CORE_EVENT_OR_ACTUAL_FINANCIAL_BATCH_DIFFERS');
        // The second read detects same-transaction mutation; native SHARE locks
        // remain owned by the outer Atomic transaction until COMMIT/ROLLBACK.
        const after = await derive(tx, command, request.observedAtReal);
        if (!same(after.binding, current.binding))
          invalid('SOURCE_CHANGED_WITHIN_CUTOFF');
      });
      await authorize(command, request.commitAuthorization);
      return Object.freeze({
        status: 'CURRENT_SOURCE_RECHECKED_NOT_AUTHORITY',
        purpose: CENTRAL_BANK_OMO_SOURCE_PURPOSE,
        commandFingerprint: command.fingerprint,
        currentHead: request.currentHead,
        readBindingFingerprint: canonicalSha256(
          canonicalHashInput(binding),
          sha,
        ),
        protectionMode: 'HELD_SOURCE_GUARDS',
      });
    },
  });
  issued.add(guard);
  const runtime: PostwarCentralBankOmoRuntime = Object.freeze({
    factory,
    sourceCommitProtectionPort: guard,
    async preflight(command: CanonicalCommand, observedAtReal: string) {
      await config.database.transaction((tx) =>
        inReader(tx, async () => {
          await derive(
            tx,
            validateCanonicalCommand(command, sha),
            observedAtReal,
          );
        }),
      );
    },
    async prepare(seed: Readonly<OpeningSeed>) {
      if (
        !isValidatedOpeningSeed(seed) ||
        seed.worldId !== config.worldId ||
        seed.openingWorldVersion !== '0' ||
        seed.sources.some((s) => s.sourceKind === 'TEST_FIXTURE')
      )
        invalid('GENUINE_SERVER_OPENING_REQUIRED');
      const { fingerprint, ...intent } = seed;
      const raw = canonicalSerialize(intent),
        rawSHA256 = sha(raw);
      if (fingerprint !== 'sha256:' + sha('SHA-256\n' + raw))
        invalid('ACTUAL_OPENING_SHA_REQUIRED');
      await config.database.transaction((tx) =>
        inReader(tx, async () => {
          const h = await tx.query<Record<string, unknown>>(
            'select * from world_v2.lock_central_bank_omo_startup_header($1,$2)',
            [config.worldId, config.countryId],
          );
          const r = h.rows[0];
          if (
            h.rows.length !== 1 ||
            !r ||
            r.seed_id !== seed.seedId ||
            r.seed_fingerprint !== fingerprint ||
            r.canonical_seed_sha256 !== rawSHA256 ||
            r.replay_binding !== canonicalSerialize(seed.replayBinding)
          )
            invalid('STORED_OPENING_HEADER_DIFFERS');
        }),
      );
      const financial = rebuildV08LedgersFromLineage({
        seed,
        sha256Hex: sha,
      }).financial;
      const next = {
        seedFingerprint: fingerprint,
        rawSHA256,
        financial,
        mixedLedger: prepareFinanceSocialLedger(financial),
      };
      if (
        prepared &&
        !same(
          { fp: prepared.seedFingerprint, raw: prepared.rawSHA256 },
          { fp: next.seedFingerprint, raw: next.rawSHA256 },
        )
      )
        invalid('RUNTIME_ALREADY_BOUND');
      prepared = next;
    },
  });
  runtimeInstances.add(runtime);
  return runtime;
}
