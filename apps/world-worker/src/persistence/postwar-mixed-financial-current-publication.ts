/** Offline derived mapper over the single genuine, transaction-bound mixed
 * replay snapshot. No seed loader, authority constructor, or caller ledger. */
import { createHash } from 'node:crypto';
import {
  Money,
  canonicalHashInput,
  canonicalSerialize,
  canonicalSha256,
} from '@econmind/core';
import {
  POSTWAR_FINANCIAL_MIXED_COVERAGE_SCHEMA,
  POSTWAR_FINANCIAL_MIXED_REDUCER,
  parsePostwarFinancialMixedCoverage,
  parsePostwarMixedFinancialBalanceRow,
  parsePostwarMixedTreasuryCapacityRow,
  type PostwarMixedFinancialBalanceRow,
  type PostwarMixedTreasuryCapacityRow,
} from '@econmind/core/postwar-financial-mixed-current-contract';
import {
  consumePostwarMixedCurrentProjectionSnapshotFrom,
  isPostwarMixedCurrentProjectionSource,
  type PostwarMixedCurrentProjectionSnapshot,
  type PostwarMixedCurrentProjectionSource,
} from './postwar-mixed-current-projection-publication.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hash = (v: unknown) => canonicalSha256(canonicalHashInput(v), sha);
export const POSTWAR_MIXED_FINANCIAL_PUBLISH_QUERY =
  'select * from world_v2.publish_postwar_mixed_financial_current($1,$2,$3)';
export interface PostwarMixedFinancialCurrentRows {
  readonly FINANCE: Readonly<{
    'ledger-balances': readonly PostwarMixedFinancialBalanceRow[];
    'treasury-capacity': readonly PostwarMixedTreasuryCapacityRow[];
  }>;
  readonly CENTRAL_BANK: Readonly<{
    'ledger-balances': readonly PostwarMixedFinancialBalanceRow[];
  }>;
}
export function derivePostwarMixedFinancialCurrentFrom(
  tx: SqlExecutor,
  token: PostwarMixedCurrentProjectionSnapshot,
): Readonly<{
  rows: PostwarMixedFinancialCurrentRows;
  rowsHash: string;
  assertion: string;
}> {
  const f = consumePostwarMixedCurrentProjectionSnapshotFrom(tx, token),
    country = f.countryId;
  if (
    f.financial.worldId !== f.head.worldId ||
    f.financial.worldVersion !== f.head.worldVersion
  )
    throw Error('MIXED_CURRENT_GENUINE_FINANCIAL_HEAD_REQUIRED');
  const funds = f.document.inputs.fundingAccounts.filter(
      (a) => a.countryId === country,
    ),
    gov = funds.filter((a) => a.payerRole === 'GOV');
  if (gov.length !== 1)
    throw Error('MIXED_CURRENT_UNIQUE_GOV_FUNDING_REQUIRED');
  const fund = gov[0]!,
    positions = f.financial.positions.filter(
      (p) => p.account.countryId === country,
    );
  const treasury = positions.filter(
      (p) => p.account.accountId === fund.accountRef,
    ),
    mirrors = positions.filter(
      (p) =>
        p.account.ownerId === fund.issuerEntityId &&
        p.account.claimId === fund.claimId &&
        p.account.counterpartyEntityId === fund.payerEntityId &&
        p.account.accountClass === 'LIABILITY',
    );
  if (treasury.length !== 1 || mirrors.length !== 1)
    throw Error('MIXED_CURRENT_RECIPROCAL_TGA_REQUIRED');
  const tga = treasury[0]!,
    account = tga.account;
  if (
    account.worldId !== f.head.worldId ||
    account.ownerId !== fund.payerEntityId ||
    account.accountClass !== 'ASSET' ||
    account.currency !== fund.currency ||
    account.claimId !== fund.claimId ||
    account.counterpartyEntityId !== fund.issuerEntityId ||
    tga.netDebitBalance.amount.isNegative() ||
    !tga.netDebitBalance.add(mirrors[0]!.netDebitBalance).amount.isZero()
  )
    throw Error('MIXED_CURRENT_ACTUAL_TGA_MIRROR_MISMATCH');
  const zero = Money.from('0', fund.currency),
    opening = Money.from(fund.reservedAmount, fund.currency);
  const budget = f.shared.budget.encumbrances
    .filter((r) => r.countryId === country)
    .reduce((total, r) => {
      if (
        r.accountId !== account.accountId ||
        r.claimId !== account.claimId ||
        r.currency !== fund.currency
      )
        throw Error('MIXED_CURRENT_BUDGET_CLAIM_MISMATCH');
      return total.add(Money.from(r.amount, r.currency));
    }, zero);
  const payroll = f.shared.social.reservations
    .filter((r) => r.countryId === country)
    .reduce((total, r) => {
      if (
        r.accountId !== account.accountId ||
        r.employerId !== fund.payerEntityId ||
        r.currency !== fund.currency ||
        r.state !== 'RESERVED_NOT_PAID'
      )
        throw Error('MIXED_CURRENT_PAYROLL_CLAIM_MISMATCH');
      return total.add(Money.from(r.amount, r.currency));
    }, zero);
  const reserved = opening.add(budget).add(payroll),
    available = tga.netDebitBalance.subtract(reserved);
  if (available.amount.isNegative())
    throw Error('MIXED_CURRENT_REAL_TGA_CAPACITY_OVERBOOKED');
  const banks = new Set(
    funds.filter((a) => a.payerRole === 'OP').map((a) => a.issuerEntityId),
  );
  if (
    banks.size !== 1 ||
    banks.has(fund.payerEntityId) ||
    banks.has(fund.issuerEntityId)
  )
    throw Error('MIXED_CURRENT_ACTUAL_DISTINCT_BANK_ROSTER_REQUIRED');
  const govGcu = positions.filter(
    (p) =>
      p.account.ownerId === fund.payerEntityId &&
      p.account.accountClass === 'CASH' &&
      p.account.currency === 'GCU',
  );
  const gcu = govGcu.reduce(
    (sum, p) => sum.add(p.netDebitBalance),
    Money.from('0', 'GCU'),
  );
  const sort = (a: { accountId: string }, b: { accountId: string }) =>
    a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0;
  const balances = (
    office: 'FINANCE' | 'CENTRAL_BANK',
  ): readonly PostwarMixedFinancialBalanceRow[] =>
    Object.freeze(
      positions
        .filter((p) =>
          office === 'FINANCE'
            ? p.account.ownerId === fund.payerEntityId
            : p.account.ownerId === fund.issuerEntityId ||
              banks.has(p.account.ownerId),
        )
        .map((p) =>
          parsePostwarMixedFinancialBalanceRow(
            {
              schemaVersion: 'postwar-current-financial-balance-row-v2',
              countryId: country,
              accountId: p.account.accountId,
              ownerEntityId: p.account.ownerId,
              ownerKind:
                p.account.ownerId === fund.payerEntityId
                  ? 'GOV'
                  : p.account.ownerId === fund.issuerEntityId
                    ? 'CB'
                    : 'BANK',
              currency: p.account.currency,
              accountClass: p.account.accountClass,
              claimId: p.account.claimId,
              counterpartyEntityId: p.account.counterpartyEntityId,
              netDebitBalance: p.netDebitBalance.toCanonicalValue().amount,
              balanceNature:
                p.account.accountClass === 'CASH' &&
                p.account.currency === 'GCU'
                  ? 'GCU_CASH'
                  : p.account.claimId !== null &&
                      p.account.counterpartyEntityId !== null
                    ? 'RECIPROCAL_LEDGER_CLAIM'
                    : 'LEDGER_POSITION',
            },
            { countryId: country, officeId: office },
          ),
        )
        .sort(sort),
    );
  const capacity = parsePostwarMixedTreasuryCapacityRow(
    {
      schemaVersion: 'postwar-treasury-capacity-row-v2',
      countryId: country,
      accountId: account.accountId,
      claimId: account.claimId,
      currency: fund.currency,
      treasuryLedgerClaimBalance: tga.netDebitBalance.toCanonicalValue().amount,
      openingReservedCapacity: opening.toCanonicalValue().amount,
      budgetEnvelopeCapacity: budget.toCanonicalValue().amount,
      additionalPayrollReservedCapacity: payroll.toCanonicalValue().amount,
      totalReservedCapacity: reserved.toCanonicalValue().amount,
      availableCapacity: available.toCanonicalValue().amount,
      governmentGcuCurrency: 'GCU',
      governmentGcuCashBalance: gcu.toCanonicalValue().amount,
      governmentGcuAccountIds: govGcu.map((p) => p.account.accountId).sort(),
      reservationNature: 'CAPACITY_RESERVED_NOT_PAID_OR_ACCRUED',
      balanceNature: 'RECIPROCAL_LEDGER_CLAIM_NOT_CASH_WALLET',
      gcuBalanceNature: 'GOVERNMENT_OWNED_GCU_CASH_NOT_OFFICIAL_RESERVES',
    },
    country,
  );
  const rows: PostwarMixedFinancialCurrentRows = Object.freeze({
    FINANCE: Object.freeze({
      'ledger-balances': balances('FINANCE'),
      'treasury-capacity': Object.freeze([capacity]),
    }),
    CENTRAL_BANK: Object.freeze({
      'ledger-balances': balances('CENTRAL_BANK'),
    }),
  });
  const coverage = parsePostwarFinancialMixedCoverage(
    {
      schemaVersion: POSTWAR_FINANCIAL_MIXED_COVERAGE_SCHEMA,
      reducerVersion: POSTWAR_FINANCIAL_MIXED_REDUCER,
      countryId: country,
      coverageRef:
        'MIXED_FINANCIAL_' +
        hash({ head: f.head, country, prefix: f.coverage.prefixFingerprint })
          .slice(7, 55)
          .toUpperCase(),
      globalWorldVersion: f.head.worldVersion,
      globalEventSequence: f.head.eventSequence,
      ...f.coverage,
    },
    {
      countryId: country,
      worldVersion: f.head.worldVersion,
      eventSequence: f.head.eventSequence,
    },
  );
  const rowsHash = hash(rows),
    assertion = canonicalSerialize({
      coverage: f.coverage,
      head: f.head,
      seedPins: f.seedPins,
      currentRowsHash: rowsHash,
    });
  // Parsing the public coverage is a DATA check; SQL independently derives its
  // own coverageRef and rows from actual stored originals and posting prefix.
  if (coverage.financialPostingCount !== f.coverage.financialPostingCount)
    throw Error('MIXED_CURRENT_POSTING_COVERAGE_CHANGED');
  return Object.freeze({ rows, rowsHash, assertion });
}
export async function publishPostwarMixedFinancialCurrentFrom(input: {
  source: Readonly<PostwarMixedCurrentProjectionSource>;
  countryId: string;
  publicationDatabase: SqlDatabase;
}): Promise<readonly Readonly<Record<string, unknown>>[]> {
  if (!isPostwarMixedCurrentProjectionSource(input.source))
    throw Error('GENUINE_MIXED_CURRENT_PUBLICATION_SOURCE_REQUIRED');
  return input.source.withSnapshot(input.countryId, async (tx, token) => {
    const facts = consumePostwarMixedCurrentProjectionSnapshotFrom(tx, token),
      derived = derivePostwarMixedFinancialCurrentFrom(tx, token);
    return input.publicationDatabase.transaction(async (publication) => {
      const result = await publication.query(
        POSTWAR_MIXED_FINANCIAL_PUBLISH_QUERY,
        [facts.head.worldId, facts.countryId, derived.assertion],
      );
      if (
        result.rows.length !== 10 ||
        new Set(
          result.rows.map((r) => String(r.office_id) + ':' + String(r.dataset)),
        ).size !== 10 ||
        result.rows.some(
          (r) =>
            String(r.world_version) !== facts.head.worldVersion ||
            String(r.event_sequence) !== facts.head.eventSequence ||
            r.current_rows_hash !== derived.rowsHash,
        )
      )
        throw Error('MIXED_FINANCIAL_SQL_DIFFERS_FROM_HELD_CORE_SNAPSHOT');
      return Object.freeze(result.rows.map((r) => Object.freeze({ ...r })));
    });
  });
}
