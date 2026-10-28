/** Offline only: complete Core replay and scalar pins to fixed SQL. No HTTP import. */
import { createHash } from 'node:crypto';
import {
  canonicalHashInput,
  canonicalSha256,
  Money,
  countryId,
  worldId,
} from '@econmind/core';
import { readPostwarOperatingGenesisFromSeed } from '../preparation/postwar-operating-genesis-adoption.js';
import { DurableV08LedgerLineageReader } from './durable-v08-ledger-lineage-reader.js';
import {
  withValidatedCanonicalLineageFrom,
  readValidatedCanonicalLineageFrom,
} from './validated-canonical-lineage.js';
import {
  replayPostwarSharedOfficePrefix,
  consumePostwarSharedOfficePrefix,
} from './postwar-shared-office-prefix.js';
import type { SqlExecutor } from './sql-database.js';
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), digest);
export const POSTWAR_FINANCIAL_CURRENT_PUBLISH_QUERY =
  'select * from world_v2.publish_postwar_financial_current_projection($1,$2,$3,$4,$5)';
export interface PostwarFinancialCurrentPublication {
  readonly classification: 'COMPLETE_CORE_REPLAY_AND_FIXED_SQL_PUBLICATION_NOT_ADMISSION';
  readonly head: Readonly<{
    worldId: string;
    worldVersion: string;
    eventSequence: string;
  }>;
  readonly seed: Readonly<{ seedId: string; fingerprint: string }>;
  readonly countryId: string;
  readonly prefixFingerprint: string;
  readonly knownEffectsFingerprint: string;
  readonly currentRowsHash: string;
  readonly documents: readonly Readonly<Record<string, unknown>>[];
}
export async function publishPostwarFinancialCurrentProjectionFrom(
  executor: SqlExecutor,
  input: {
    reader: DurableV08LedgerLineageReader;
    worldId: string;
    countryId: string;
  },
): Promise<PostwarFinancialCurrentPublication> {
  const world = worldId(input.worldId),
    country = countryId(input.countryId);
  const locks = await executor.query<Record<string, unknown>>(
    'select * from world_v2.lock_postwar_financial_current_publication($1,$2)',
    [world, country],
  );
  if (locks.rows.length !== 1) throw Error('FINANCIAL_ACTUAL_LOCK_REQUIRED');
  return withValidatedCanonicalLineageFrom(
    { reader: input.reader, executor, worldId: world },
    async (view) => {
      const lineage = readValidatedCanonicalLineageFrom(executor, view),
        opening = readPostwarOperatingGenesisFromSeed(lineage.seed);
      if (!opening.socialEmployment)
        throw Error('FINANCIAL_FULL_E03_ORIGINAL_REQUIRED');
      const document = opening.socialEmployment,
        shared = consumePostwarSharedOfficePrefix(
          replayPostwarSharedOfficePrefix({ lineage, document }),
        ),
        lock = locks.rows[0]!;
      if (
        shared.head.worldVersion !== lock.world_version ||
        shared.head.eventSequence !== lock.event_sequence ||
        shared.seed.fingerprint !== lock.seed_fingerprint
      )
        throw Error('FINANCIAL_ACTUAL_HEAD_CHANGED');
      const funds = document.inputs.fundingAccounts.filter(
        (a) => a.countryId === country && a.payerRole === 'GOV',
      );
      if (funds.length !== 1)
        throw Error('FINANCIAL_EXACT_GOV_FUNDING_REQUIRED');
      const fund = funds[0]!,
        all = lineage.ledgers.financial.positions;
      const treasury = all.filter(
        (p) => p.account.accountId === fund.accountRef,
      );
      const mirrors = all.filter(
        (p) =>
          p.account.countryId === country &&
          p.account.ownerId === fund.issuerEntityId &&
          p.account.claimId === fund.claimId &&
          p.account.counterpartyEntityId === fund.payerEntityId &&
          p.account.accountClass === 'LIABILITY',
      );
      if (treasury.length !== 1 || mirrors.length !== 1)
        throw Error('FINANCIAL_EXACT_RECIPROCAL_CLAIM_REQUIRED');
      const position = treasury[0]!,
        account = position.account;
      if (
        account.accountClass !== 'ASSET' ||
        account.countryId !== country ||
        account.ownerId !== fund.payerEntityId ||
        account.claimId !== fund.claimId ||
        account.currency !== fund.currency ||
        account.counterpartyEntityId !== fund.issuerEntityId ||
        !position.netDebitBalance.amount.equals(
          Money.from(fund.availableAmount, fund.currency).amount,
        ) ||
        !position.netDebitBalance
          .add(mirrors[0]!.netDebitBalance)
          .amount.isZero()
      )
        throw Error('FINANCIAL_LEDGER_FUNDING_MIRROR_MISMATCH');
      const openingReserved = Money.from(fund.reservedAmount, fund.currency),
        zero = Money.from('0', fund.currency);
      const budget = shared.budget.encumbrances
        .filter((r) => r.countryId === country)
        .reduce((total, r) => {
          if (
            r.accountId !== account.accountId ||
            r.claimId !== account.claimId ||
            r.currency !== fund.currency
          )
            throw Error('FINANCIAL_BUDGET_ACCOUNT_MISMATCH');
          return total.add(Money.from(r.amount, r.currency));
        }, zero);
      const payroll = shared.social.reservations
        .filter((r) => r.countryId === country)
        .reduce((total, r) => {
          if (r.accountId !== account.accountId || r.currency !== fund.currency)
            throw Error('FINANCIAL_PAYROLL_ACCOUNT_MISMATCH');
          return total.add(Money.from(r.amount, r.currency));
        }, zero);
      const total = openingReserved.add(budget).add(payroll),
        available = position.netDebitBalance.subtract(total);
      if (available.amount.isNegative())
        throw Error('FINANCIAL_CURRENT_CAPACITY_OVERBOOKED');
      // Country source roster comes from the verified E03 labour originals. Its CB
      // issuer and BANK are distinct legal owners, never a numeric account alias.
      const bankOwners = new Set(
        document.inputs.fundingAccounts
          .filter((e) => e.countryId === country)
          .map((e) => e.issuerEntityId),
      );
      const rows = (owners: ReadonlySet<string>) =>
        all
          .filter(
            (p) =>
              p.account.countryId === country && owners.has(p.account.ownerId),
          )
          .map((p) => ({
            account: p.account,
            netDebitBalance: p.netDebitBalance.toCanonicalValue(),
          }))
          .sort((a, b) =>
            a.account.accountId.localeCompare(b.account.accountId),
          );
      const currentRows = {
        FINANCE: {
          'ledger-balances': rows(new Set([fund.payerEntityId])),
          'treasury-capacity': [
            {
              schemaVersion: 'postwar-treasury-capacity-row-v1',
              countryId: country,
              accountId: fund.accountRef,
              claimId: fund.claimId,
              currency: fund.currency,
              treasuryLedgerClaimBalance:
                position.netDebitBalance.toCanonicalValue().amount,
              openingReservedCapacity:
                openingReserved.toCanonicalValue().amount,
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
        CENTRAL_BANK: { 'ledger-balances': rows(bankOwners) },
      };
      const effects = hash(shared.frames),
        rowsHash = hash(currentRows);
      const result = await executor.query<Record<string, unknown>>(
        POSTWAR_FINANCIAL_CURRENT_PUBLISH_QUERY,
        [world, country, shared.prefixFingerprint, effects, rowsHash],
      );
      if (
        result.rows.length !== 10 ||
        new Set(
          result.rows.map((r) => String(r.office_id) + ':' + String(r.dataset)),
        ).size !== 10 ||
        result.rows.some(
          (r) =>
            String(r.world_version) !== shared.head.worldVersion ||
            String(r.event_sequence) !== shared.head.eventSequence ||
            r.prefix_fingerprint !== shared.prefixFingerprint ||
            r.effects_fingerprint !== effects,
        )
      )
        throw Error('FINANCIAL_SQL_DIFFERS_FROM_COMPLETE_CORE_REPLAY');
      return Object.freeze({
        classification:
          'COMPLETE_CORE_REPLAY_AND_FIXED_SQL_PUBLICATION_NOT_ADMISSION' as const,
        head: shared.head,
        seed: shared.seed,
        countryId: country,
        prefixFingerprint: shared.prefixFingerprint,
        knownEffectsFingerprint: effects,
        currentRowsHash: rowsHash,
        documents: Object.freeze(result.rows),
      });
    },
  );
}
