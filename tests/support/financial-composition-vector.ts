/** Generated mechanism-only input. Never an adopted financial source. */
import { canonicalSerialize } from '@econmind/core';
import {
  CENTRAL_BANK_OPENING_CATEGORIES,
  type OwnerNonHostSourceAdoption,
} from '../../apps/world-worker/src/preparation/owner-non-host-source-adoption.js';
import {
  financialInputSha256,
  type FinancialCbHolding,
  type FinancialCountryInput,
  type FinancialSourceReference,
  type FormalFinancialOpeningContract,
} from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import { openingBookMoney } from '../../apps/world-worker/src/preparation/opening-economic-decision.js';

export function financialCompositionVector(
  parent: OwnerNonHostSourceAdoption,
): FormalFinancialOpeningContract {
  const rows: unknown[] = [];
  const valueDate = '2026-10-10',
    version = 'MECHANISM_ONLY_NO_ADOPTION';
  const ref = (value: unknown): FinancialSourceReference => {
    rows.push(value);
    return { documentId: 'VECTOR_DOCUMENT', pointer: '/' + (rows.length - 1) };
  };
  const countries = parent.manifest.countries.map(
    (c, index): FinancialCountryInput => {
      const countryId = c.countryId;
      const localCurrency =
        'L' +
        String.fromCharCode(65 + Math.floor(index / 26)) +
        String.fromCharCode(65 + (index % 26));
      const local = (rawAmount: string) =>
        openingBookMoney({
          rawAmount,
          denomination: 'GCU_EQUIVALENT',
          localCurrency,
          localCurrencyPerGcu: '2',
        }).toCanonicalValue().amount;
      const holdings: FinancialCbHolding[] = [];
      for (const [category, raw, counterpartyId] of [
        [
          'TREASURY_GOVERNMENT_DEPOSIT',
          c.rawFinance.treasuryCentralBankBalance,
          c.holderRoster.treasury,
        ],
        [
          'COMMERCIAL_BANK_RESERVE_ACCOUNTS',
          c.rawFinance.bankReserveAssets,
          c.holderRoster.bank,
        ],
      ] as const) {
        const body = {
          holdingId: 'HOLDING_' + countryId + '_' + category,
          category,
          kind: 'CLAIM' as const,
          amount: local(raw),
          currency: localCurrency,
          localCurrencyPerUnit: '1',
          holderId: c.holderRoster.centralBank,
          counterpartyId,
          usableStatus: 'MECHANISM_ONLY',
        };
        holdings.push({
          ...body,
          source: ref({ countryId, valueDate, ...body }),
        });
      }
      const categories = CENTRAL_BANK_OPENING_CATEGORIES.map(([category]) => {
        const disposition = holdings.some((h) => h.category === category)
          ? ('DECLARED' as const)
          : ('NO_DECLARED_INSTRUMENT' as const);
        return {
          category,
          disposition,
          source: ref({ countryId, category, disposition }),
        };
      });
      const amount = local(c.rawFinance.bankLoanAssets),
        loanId = 'LOAN_' + countryId,
        borrowerId = c.holderRoster.operator;
      return {
        countryId,
        localCurrency,
        openingFx: {
          localCurrencyPerGcu: '2',
          version,
          valueDate,
          source: ref({
            countryId,
            localCurrency,
            localCurrencyPerGcu: '2',
            version,
            valueDate,
          }),
        },
        cbRegister: {
          version,
          valueDate,
          categories,
          holdings,
          source: ref({
            countryId,
            version,
            valueDate,
            categories: categories
              .map(({ category, disposition }) => ({ category, disposition }))
              .sort((a, b) => (a.category < b.category ? -1 : 1)),
            holdingIds: holdings.map((h) => h.holdingId).sort(),
          }),
        },
        bankLoans:
          amount === '0'
            ? []
            : [
                {
                  loanId,
                  borrowerId,
                  amount,
                  currency: localCurrency,
                  source: ref({
                    countryId,
                    valueDate,
                    loanId,
                    borrowerId,
                    amount,
                    currency: localCurrency,
                  }),
                },
              ],
      };
    },
  );
  // Explicit completeness is still only generated mechanism evidence.
  rows.push({
    countryIds: countries.map((c) => c.countryId),
    categoryCount: '21',
    cbRegisterComplete: true,
    valueDate,
  });
  const bytes = canonicalSerialize(rows);
  return {
    schemaVersion: 'formal-financial-opening-input-v1',
    evidenceKind: 'MECHANISM_TEST_VECTOR',
    worldId: 'WORLD_TEST_ONLY_FINANCIAL_COMPOSITION',
    sourceId: 'SOURCE_FINANCIAL_COMPOSITION_VECTOR',
    sourceVersion: version,
    valueDate,
    ownerReceiptSha256: parent.ownerPolicy.receiptSha256,
    adoptionManifestFingerprint: parent.manifestFingerprint,
    financeSha256: parent.trustedSource.financeSha256,
    documents: [
      {
        documentId: 'VECTOR_DOCUMENT',
        sourcePath: 'incoming/financial/documents/VECTOR_DOCUMENT.json',
        version,
        valueDate,
        bytes,
        sha256: financialInputSha256(bytes),
      },
    ],
    countries,
  };
}
