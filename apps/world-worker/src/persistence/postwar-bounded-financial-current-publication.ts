/** Server-only finite derivation. No opening payload, financial authority,
 * command write, role enrollment or process-local prepared token is created. */
import { createHash } from 'node:crypto';
import {
  canonicalHashInput,
  canonicalSha256,
  Money,
  commandId as parseCommandId,
  workerId as parseWorkerId,
} from '@econmind/core';
import { parseBudgetSourcePayload } from '@econmind/core/finance-budget-conditional-contract';
import { readFinanceNativeBudgetMixedPrefix } from '@econmind/core/finance-budget-native';
import {
  parseFinanceBudgetCapacityData,
  readFinanceBudgetCapacityData,
} from '@econmind/core/finance-budget-capacity-data';
import { readFinalReceiptFrom } from './atomic-transition-repository.js';
import { readBoundedMixedOfficeHistoryFrom } from './bounded-mixed-office-history.js';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
const ports = new WeakSet<object>();
function fail(s: string): never {
  throw Error('BOUNDED_FINANCIAL_PUBLICATION:' + s);
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail('OBJECT_REQUIRED');
  return v as Record<string, unknown>;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v || v.trim() !== v) fail('TEXT_REQUIRED');
  return v;
}
function array(v: unknown): readonly unknown[] {
  if (!Array.isArray(v)) fail('ARRAY_REQUIRED');
  return v;
}
function rows(v: unknown, world: string, country: string) {
  const seen = new Set<string>();
  return array(v)
    .map((v) => {
      const r = object(v),
        a = object(r.account),
        m = object(r.netDebitBalance);
      if (
        a.worldId !== world ||
        a.countryId !== country ||
        seen.has(text(a.accountId)) ||
        m.currency !== a.currency ||
        typeof m.amount !== 'string' ||
        !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(m.amount)
      )
        fail('LEDGER_SCOPE_OR_AMOUNT');
      seen.add(text(a.accountId));
      return {
        account: a,
        netDebitBalance: Money.from(
          m.amount,
          text(m.currency),
        ).toCanonicalValue(),
      };
    })
    .sort((a, b) =>
      text(a.account.accountId).localeCompare(text(b.account.accountId)),
    );
}
export interface BoundedFinancialCurrentPublication {
  readonly classification: 'BOUNDED_CORE_AND_FIXED_SQL_DERIVATION_NOT_AUTHORITY';
  readonly commandId: string;
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
  readonly prefixFingerprint: string;
  readonly knownEffectsFingerprint: string;
  readonly originalsBytes: number;
  readonly prefixBytes: number;
  readonly countrySourceBytes: number;
  readonly documents: readonly Readonly<Record<string, unknown>>[];
}
export interface PostwarBoundedFinancialCurrentPublisher {
  publishCommittedCommand(
    commandId: string,
  ): Promise<BoundedFinancialCurrentPublication>;
}
export function isPostwarBoundedFinancialCurrentPublisher(
  v: unknown,
): v is PostwarBoundedFinancialCurrentPublisher {
  return !!v && typeof v === 'object' && ports.has(v);
}
export interface PostwarBoundedFinancialCurrentPublisherConfig {
  readonly sourceDatabase: SqlDatabase;
  readonly publicationDatabase: SqlDatabase;
  readonly worldId: string;
  readonly countryId: string;
  readonly workerId: string;
}
/** Both databases are trusted host-owned, distinct connection pools. The
 * publisher session must already hold the existing dedicated publisher role;
 * this factory never SET ROLE, grants membership or opens a connection. */
export function createPostwarBoundedFinancialCurrentPublisher(
  config: PostwarBoundedFinancialCurrentPublisherConfig,
): PostwarBoundedFinancialCurrentPublisher {
  if (
    !config.worldId ||
    !config.countryId ||
    config.workerId.length > 256 ||
    config.sourceDatabase === config.publicationDatabase
  )
    fail('SEPARATE_CONFIGURED_SOURCE_AND_PUBLISHER_REQUIRED');
  parseWorkerId(config.workerId);
  const reader = new DurableV08LedgerLineageReader({
    database: config.sourceDatabase,
    sha256Hex: sha,
  });
  const port: PostwarBoundedFinancialCurrentPublisher = Object.freeze({
    async publishCommittedCommand(
      commandId: string,
    ): Promise<BoundedFinancialCurrentPublication> {
      if (commandId.length > 256) fail('COMMAND_ID_REQUIRED');
      parseCommandId(commandId);
      return config.sourceDatabase.transaction(async (tx) => {
        const bounded = await tx.query<{ present: boolean }>(
          'select exists(select 1 from world_v2.command_submission where world_id=$1 and command_id=$2 and octet_length(canonical_payload)<=16384)as present',
          [config.worldId, commandId],
        );
        if (bounded.rows.length !== 1 || bounded.rows[0]!.present !== true)
          fail('BOUNDED_DURABLE_COMMAND_REQUIRED');
        const command = await reader.readCommandFrom(
          tx,
          config.worldId,
          commandId,
        );
        if (
          command.worldId !== config.worldId ||
          command.countryId !== config.countryId ||
          command.officeId !== 'FINANCE' ||
          command.commandType !== 'CORE_FINANCE_BUDGET_APPROPRIATION_V1'
        )
          fail('COMMITTED_BUDGET_SCOPE_REQUIRED');
        const receipt = await readFinalReceiptFrom(tx, command);
        if (!receipt || receipt.outcome !== 'COMMITTED')
          fail('COMMITTED_RECEIPT_REQUIRED');
        const outbox = await tx.query<Record<string, unknown>>(
          'select outbox_message_id,event_id,canonical_payload,payload_sha256 from world_v2.notification_outbox where world_id=$1 and command_id=$2 and outbox_message_id=$3 and octet_length(canonical_payload)<=16384',
          [
            config.worldId,
            commandId,
            'OUTBOX_NATIVE_BUDGET_' +
              command.fingerprint.slice(7).toUpperCase(),
          ],
        );
        if (outbox.rows.length !== 1) fail('DURABLE_OUTBOX_REQUIRED');
        const o = outbox.rows[0]!,
          payload = text(o.canonical_payload);
        if (
          o.outbox_message_id !==
            'OUTBOX_NATIVE_BUDGET_' +
              command.fingerprint.slice(7).toUpperCase() ||
          o.event_id !== receipt.eventIds[0] ||
          hash(JSON.parse(payload)) !== o.payload_sha256 ||
          hash(JSON.parse(payload)) !==
            hash({
              schemaVersion: 'finance-native-budget-outbox-v1',
              interpretation:
                'APPROVED_BUDGET_AUTHORITY_NOT_RESERVED_COMMITTED_OR_PAID',
            })
        )
          fail('DURABLE_OUTBOX_MISMATCH');
        const p = parseBudgetSourcePayload(
          JSON.parse(command.canonicalPayload),
        );
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
          command.authSubject,
        ]);
        const lock = async () => {
          const result = await tx.query<Record<string, unknown>>(
            'select * from world_v2.lock_finance_budget_policy($1,$2,$3,$4,$5,$6,$7::uuid)',
            [
              config.worldId,
              config.countryId,
              p.scope.envelopeRef,
              p.scope.effectivePeriodRef,
              config.workerId,
              new Date().toISOString(),
              command.authSubject,
            ],
          );
          if (result.rows.length !== 1) fail('ACTUAL_SOURCE_GUARDS_REQUIRED');
          return result.rows[0]!;
        };
        const source = await lock();
        const observedAtReal = new Date().toISOString();
        const capacity = await tx.query<Record<string, unknown>>(
          'select * from world_v2.read_finance_budget_capacity($1,$2,$3,$4,$5,$6::timestamptz)',
          [
            config.worldId,
            config.countryId,
            p.scope.envelopeRef,
            p.scope.effectivePeriodRef,
            config.workerId,
            observedAtReal,
          ],
        );
        if (capacity.rows.length !== 1) fail('CAPACITY_SOURCE_REQUIRED');
        const c = capacity.rows[0]!,
          bytes = text(c.source_text);
        if (Buffer.byteLength(bytes) > 65536 || sha(bytes) !== c.source_sha256)
          fail('CAPACITY_RAW_HASH');
        const data = readFinanceBudgetCapacityData(
          parseFinanceBudgetCapacityData(JSON.parse(bytes)),
        );
        if (
          data.worldId !== config.worldId ||
          data.countryId !== config.countryId ||
          data.seedId !== source.seed_id ||
          data.seedFingerprint !== source.seed_fingerprint ||
          data.admissionRef !== source.admission_ref ||
          data.canonicalSeedSha256 !== 'sha256:' + text(c.canonical_seed_sha256)
        )
          fail('ACTUAL_ADMISSION_PINS');
        const h = await tx.query<{
          world_version: string;
          event_sequence: string;
        }>(
          'select world_version::text,event_sequence::text from world_v2.world_head where world_id=$1 for share',
          [config.worldId],
        );
        if (h.rows.length !== 1) fail('ACTUAL_HEAD_REQUIRED');
        const head = h.rows[0]!;
        const prefix = await readBoundedMixedOfficeHistoryFrom({
          executor: tx,
          database: config.sourceDatabase,
          worldId: config.worldId,
          countryId: config.countryId,
          expectedWorldVersion: head.world_version,
          workerId: config.workerId,
          observedAtReal,
          envelopeRef: p.scope.envelopeRef,
          effectivePeriodRef: p.scope.effectivePeriodRef,
          sourcePins: {
            seedId: data.seedId,
            seedFingerprint: data.seedFingerprint,
            admissionRef: data.admissionRef,
            canonicalSeedSha256: data.canonicalSeedSha256,
          },
        });
        if (
          !prefix.frames.some(
            (f) => f.command.fingerprint === command.fingerprint,
          )
        )
          fail('COMMITTED_COMMAND_NOT_IN_COMPLETE_PREFIX');
        const replay = readFinanceNativeBudgetMixedPrefix(
          prefix.mixedPrefixEvidence,
          config.worldId,
          prefix.frames,
          sha,
        );
        const prefixFingerprint = hash({
          worldId: config.worldId,
          seedFingerprint: data.seedFingerprint,
          headWorldVersion: head.world_version,
          headEventSequence: head.event_sequence,
          frames: prefix.frames,
        });
        const effects = hash(
          prefix.frames.map((f) => ({
            commandId: f.command.commandId,
            countryId: f.command.countryId,
            commandType: f.command.commandType,
            transitionFingerprint: hash(f.transition),
            receiptFingerprint: hash(f.receipt),
            eventFingerprints: f.events.map((e) => e.fingerprint),
            worldVersionBefore: f.transition.worldVersionBefore,
            worldVersionAfter: f.transition.worldVersionAfter,
            events: f.events.map((e) => ({
              eventId: e.eventId,
              fingerprint: e.fingerprint,
              sequence: e.sequence,
              worldVersion: e.worldVersion,
            })),
          })),
        );
        const result = await config.publicationDatabase.transaction(
          async (pub: SqlExecutor) => {
            const originals = await pub.query<{
              originals_text: string;
              originals_sha256: string;
            }>(
              'select * from world_v2.read_postwar_financial_current_publication_originals($1,$2)',
              [config.worldId, config.countryId],
            );
            if (originals.rows.length !== 1) fail('SEALED_ORIGINALS_REQUIRED');
            const raw = originals.rows[0]!,
              originalBytes = Buffer.byteLength(raw.originals_text);
            if (
              originalBytes > 65536 ||
              sha(raw.originals_text) !== raw.originals_sha256
            )
              fail('ORIGINALS_RAW_HASH');
            const v = object(JSON.parse(raw.originals_text)),
              vh = object(v.head);
            if (
              v.schemaVersion !==
                'postwar-financial-current-publication-originals-v1' ||
              v.dataNature !== 'IMMUTABLE_ADMITTED_H0_FINANCIAL_DATA_ONLY' ||
              v.worldId !== config.worldId ||
              v.countryId !== config.countryId ||
              v.seedId !== data.seedId ||
              v.seedFingerprint !== data.seedFingerprint ||
              v.admissionRef !== data.admissionRef ||
              'sha256:' + text(v.canonicalSeedSha256) !==
                data.canonicalSeedSha256 ||
              vh.worldVersion !== head.world_version ||
              vh.eventSequence !== head.event_sequence ||
              array(v.originalDocuments).length !== 7
            )
              fail('ORIGINALS_ACTUAL_PINS_OR_HEAD');
            const funds = array(v.fundingAccounts);
            if (funds.length !== 1) fail('UNIQUE_GOV_FUND_REQUIRED');
            const fund = object(funds[0]),
              account = data.treasury.assetAccount,
              currency = account.currency;
            if (
              fund.countryId !== config.countryId ||
              fund.payerRole !== 'GOV' ||
              fund.accountRef !== account.accountId ||
              fund.claimId !== account.claimId ||
              fund.payerEntityId !== data.governmentEntityId ||
              fund.issuerEntityId !== data.centralBankEntityId ||
              fund.currency !== currency ||
              !Money.from(text(fund.availableAmount), currency).amount.equals(
                Money.from(data.treasury.assetAmount, currency).amount,
              ) ||
              !Money.from(text(fund.reservedAmount), currency).amount.equals(
                Money.from(data.openingFunding.totalAmount, currency).amount,
              )
            )
              fail('EXACT_GOV_FUNDING_MISMATCH');
            const finance = rows(
                v.financeLedgerRows,
                config.worldId,
                config.countryId,
              ),
              bank = rows(
                v.centralBankLedgerRows,
                config.worldId,
                config.countryId,
              );
            if (
              finance.some((r) => r.account.ownerId !== data.governmentEntityId)
            )
              fail('FINANCE_OWNER_SCOPE');
            const treasury = finance.filter(
                (r) => r.account.accountId === account.accountId,
              ),
              mirror = bank.filter(
                (r) =>
                  r.account.accountId ===
                  data.treasury.liabilityAccount.accountId,
              );
            if (
              treasury.length !== 1 ||
              mirror.length !== 1 ||
              hash(treasury[0]!.account) !== hash(account) ||
              hash(mirror[0]!.account) !==
                hash(data.treasury.liabilityAccount) ||
              treasury[0]!.netDebitBalance.amount !==
                data.treasury.assetAmount ||
              !Money.from(mirror[0]!.netDebitBalance.amount, currency)
                .add(Money.from(data.treasury.liabilityAmount, currency))
                .amount.isZero()
            )
              fail('RECIPROCAL_TREASURY_MISMATCH');
            const zero = Money.from('0', currency),
              opening = Money.from(data.openingFunding.totalAmount, currency);
            const budget = replay.budgetEncumbrances
              .filter((r) => r.countryId === config.countryId)
              .reduce((s, r) => {
                if (
                  r.accountId !== account.accountId ||
                  r.claimId !== account.claimId ||
                  r.currency !== currency ||
                  r.governmentEntityId !== data.governmentEntityId
                )
                  fail('BUDGET_RESERVATION_SCOPE');
                return s.add(Money.from(r.amount, currency));
              }, zero);
            const payroll = prefix.socialReservations
              .filter(
                (r) =>
                  r.countryId === config.countryId ||
                  r.accountId === account.accountId,
              )
              .reduce((s, r) => {
                if (
                  r.countryId !== config.countryId ||
                  r.accountId !== account.accountId ||
                  r.currency !== currency ||
                  r.employerId !== data.governmentEntityId
                )
                  fail('PAYROLL_RESERVATION_SCOPE');
                return s.add(Money.from(r.amount, currency));
              }, zero);
            const total = opening.add(budget).add(payroll),
              available = Money.from(
                data.treasury.assetAmount,
                currency,
              ).subtract(total);
            if (available.amount.isNegative()) fail('CAPACITY_OVERBOOKED');
            const currentRows = {
              FINANCE: {
                'ledger-balances': finance,
                'treasury-capacity': [
                  {
                    schemaVersion: 'postwar-treasury-capacity-row-v1',
                    countryId: config.countryId,
                    accountId: account.accountId,
                    claimId: account.claimId,
                    currency,
                    treasuryLedgerClaimBalance: data.treasury.assetAmount,
                    openingReservedCapacity: opening.toCanonicalValue().amount,
                    budgetEnvelopeCapacity: budget.toCanonicalValue().amount,
                    additionalPayrollReservedCapacity:
                      payroll.toCanonicalValue().amount,
                    totalReservedCapacity: total.toCanonicalValue().amount,
                    availableCapacity: available.toCanonicalValue().amount,
                    reservationNature: 'CAPACITY_RESERVED_NOT_PAID_OR_ACCRUED',
                    balanceNature: 'RECIPROCAL_LEDGER_CLAIM_NOT_CASH_WALLET',
                  },
                ],
              },
              CENTRAL_BANK: { 'ledger-balances': bank },
            };
            const published = await pub.query<Record<string, unknown>>(
              'select * from world_v2.publish_postwar_financial_current_projection($1,$2,$3,$4,$5)',
              [
                config.worldId,
                config.countryId,
                prefixFingerprint,
                effects,
                hash(currentRows),
              ],
            );
            if (
              published.rows.length !== 10 ||
              new Set(
                published.rows.map(
                  (r) => String(r.office_id) + ':' + String(r.dataset),
                ),
              ).size !== 10 ||
              published.rows.some(
                (r) =>
                  String(r.world_version) !== head.world_version ||
                  String(r.event_sequence) !== head.event_sequence ||
                  r.prefix_fingerprint !== prefixFingerprint ||
                  r.effects_fingerprint !== effects,
              )
            )
              fail('FIXED_SQL_DIFFERS_FROM_CORE');
            return { originalBytes, documents: published.rows };
          },
        );
        // Publication is independently committed derived data. A lost ack or
        // failed final guard is retryable; the world command is never resent.
        const final = await lock();
        if (
          final.policy_sha256 !== source.policy_sha256 ||
          final.admission_ref !== source.admission_ref
        )
          fail('SOURCE_CHANGED');
        return Object.freeze({
          classification: 'BOUNDED_CORE_AND_FIXED_SQL_DERIVATION_NOT_AUTHORITY',
          commandId,
          head: Object.freeze({
            worldVersion: head.world_version,
            eventSequence: head.event_sequence,
          }),
          prefixFingerprint,
          knownEffectsFingerprint: effects,
          originalsBytes: result.originalBytes,
          prefixBytes: prefix.prefixBytes,
          countrySourceBytes: prefix.sourceBytes,
          documents: Object.freeze(result.documents),
        });
      });
    },
  });
  ports.add(port);
  return port;
}
