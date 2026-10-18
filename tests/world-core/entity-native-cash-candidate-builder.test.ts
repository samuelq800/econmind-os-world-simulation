import { describe, expect, it } from 'vitest';
import { buildEntityNativeCashCandidate } from '../../apps/world-worker/src/preparation/entity-native-cash-candidate-builder.js';
import {
  declaredEntityCashVector,
  cashScope,
} from '../support/entity-native-cash-candidate-fixture.js';
import { financialInputSha256 } from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';

describe('B06/B07 declared-source builder, not authority', () => {
  it('constructs all five economic entity types from source-owned identities, not Finance alone', () => {
    const v = declaredEntityCashVector(),
      r = buildEntityNativeCashCandidate(v.input());
    expect(r.witnesses).toHaveLength(5);
    expect(r.witnesses.map((w) => w.sourceAccount.accountId).sort()).toEqual(
      v.source.rows.map((row) => row.account.account.accountId).sort(),
    );
    for (const w of r.witnesses) {
      expect(w.accountCandidate).not.toBeNull();
      expect(w.cashCandidate?.closing).toEqual({
        amount: '100.5',
        currency: 'XAA',
      });
      expect(w.cashCandidate?.settledInflows.amount).toBe('1.25');
      expect(w.cashCandidate?.settledOutflows.amount).toBe('0.75');
      expect(w.issuerId).toBe('ENTITY_CENTRAL_BANK_01');
      expect(w.accountSource.sha256).toBe(v.document().sha256);
      expect(w.accountSource.signatureStatus).toBe(
        'NOT_VERIFIED_HASH_IS_NOT_SIGNATURE',
      );
    }
    expect(r.actualUnknownClosed).toBe(0);
    expect(
      r.sourceAdoption ||
        r.activationAllowed ||
        r.admissionAllowed ||
        r.currentPermissionIssued,
    ).toBe(false);
    expect(Object.isFrozen(r.witnesses)).toBe(true);
  });
  it('is deterministic when source selections are reordered', () => {
    const v = declaredEntityCashVector();
    expect(buildEntityNativeCashCandidate(v.input())).toEqual(
      buildEntityNativeCashCandidate({
        ...v.input(),
        selections: [...v.selections].reverse(),
      }),
    );
  });
  it('keeps account-only candidate when cash evidence is missing, without default zero', () => {
    const v = declaredEntityCashVector();
    const r = buildEntityNativeCashCandidate({
      ...v.input(),
      selections: [{ ...v.selections[0]!, cash: null }],
    });
    expect(r.witnesses[0]!.accountCandidate).not.toBeNull();
    expect(r.witnesses[0]!.cashCandidate).toBeNull();
    expect(JSON.parse(r.document.bytes).balances).toEqual([]);
  });
  it('preserves exact decimal lexemes above safe integer range', () => {
    const v = declaredEntityCashVector();
    const cash = v.source.rows[0]!.cash;
    cash.openingBalance = '90071992547409931234567890.125';
    cash.closingBalance = '90071992547409931234567890.625';
    const r = buildEntityNativeCashCandidate(v.input());
    expect(
      r.witnesses.find((w) => w.entityId === 'ENTITY_GOVERNMENT_01')!
        .cashCandidate!.closing.amount,
    ).toBe(cash.closingBalance);
  });
  for (const purpose of ['TGA_CLAIM', 'CB_RESERVE_CLAIM', 'DEPOSIT_CLAIM'])
    it(`never promotes ${purpose} to native cash`, () => {
      const v = declaredEntityCashVector();
      v.source.rows[0]!.account.purpose = purpose;
      const r = buildEntityNativeCashCandidate(v.input());
      expect(
        r.witnesses.find((w) => w.entityId === 'ENTITY_GOVERNMENT_01')!.reason,
      ).toBe('NOT_NATIVE_CASH');
      expect(JSON.parse(r.document.bytes).accounts).toHaveLength(4);
    });
  it.each([
    [
      'unbalanced journal',
      'CASH_JOURNAL_NOT_RECONCILED',
      (v: ReturnType<typeof declaredEntityCashVector>) => {
        v.source.rows[0]!.cash.closingBalance = '101';
      },
    ],
    [
      'unknown flow set',
      'CASH_FLOW_PERIOD_OR_COMPLETENESS_UNKNOWN',
      (v: ReturnType<typeof declaredEntityCashVector>) => {
        v.source.rows[0]!.cash.flowSetComplete = false;
      },
    ],
    [
      'unknown restrictions',
      'RESTRICTION_COMPLETENESS_OR_OVERLAP_UNKNOWN',
      (v: ReturnType<typeof declaredEntityCashVector>) => {
        v.source.rows[0]!.cash.restrictionsComplete = false;
      },
    ],
    [
      'wrong flow currency',
      'FLOW_ACCOUNT_CURRENCY_PERIOD_MISMATCH',
      (v: ReturnType<typeof declaredEntityCashVector>) => {
        v.source.rows[0]!.cash.flows[0]!.currency = 'GCU';
      },
    ],
    [
      'future flow',
      'FLOW_ACCOUNT_CURRENCY_PERIOD_MISMATCH',
      (v: ReturnType<typeof declaredEntityCashVector>) => {
        v.source.rows[0]!.cash.flows[0]!.settlementTime =
          '2026-10-19T00:00:00.000Z';
      },
    ],
    [
      'duplicate flow',
      'DUPLICATE_CASH_FLOW',
      (v: ReturnType<typeof declaredEntityCashVector>) => {
        v.source.rows[0]!.cash.flows.push(v.source.rows[0]!.cash.flows[0]!);
      },
    ],
    [
      'wrong owner',
      'ACCOUNT_OWNERSHIP_COUNTRY_CURRENCY_MISMATCH',
      (v: ReturnType<typeof declaredEntityCashVector>) => {
        v.source.rows[0]!.account.account.ownerId = 'ENTITY_BANK_01';
      },
    ],
    [
      'negative cash',
      'NEGATIVE_CASH_COMPONENT',
      (v: ReturnType<typeof declaredEntityCashVector>) => {
        v.source.rows[0]!.cash.openingBalance = '-1';
      },
    ],
    [
      'wrong restriction account',
      'RESTRICTION_SOURCE_ACCOUNT_MISMATCH',
      (v: ReturnType<typeof declaredEntityCashVector>) => {
        v.source.rows[0]!.cash.encumbranceAtoms[0]!.accountId = 'ACCOUNT_OTHER';
      },
    ],
  ] as const)('rejects %s', (_name, code, change) => {
    const v = declaredEntityCashVector();
    change(v);
    expect(() => buildEntityNativeCashCandidate(v.input())).toThrow(code);
  });
  it('rejects tampered bytes, duplicate sources and numeric sourceVersion', () => {
    const v = declaredEntityCashVector(),
      d = v.document();
    expect(() =>
      buildEntityNativeCashCandidate({
        ...v.input(),
        documents: [{ ...d, bytes: d.bytes + ' ' }],
      }),
    ).toThrow('SOURCE_HASH_MISMATCH');
    expect(() =>
      buildEntityNativeCashCandidate({ ...v.input(), documents: [d, d] }),
    ).toThrow('DUPLICATE_DOCUMENT_ID');
    const bytes = d.bytes.replace(
      `"sourceVersion":"${cashScope.sourceVersion}"`,
      '"sourceVersion":123',
    );
    const updated = { ...d, bytes, sha256: financialInputSha256(bytes) };
    expect(() =>
      buildEntityNativeCashCandidate({
        ...v.input(),
        expected: { ...cashScope, sourceVersion: ' ' },
      }),
    ).toThrow('NONEMPTY_SOURCE_STRING_REQUIRED');
    expect(() =>
      buildEntityNativeCashCandidate({ ...v.input(), documents: [updated] }),
    ).toThrow('BOUNDED_STRING_REQUIRED');
  });
  it('reads unquoted exact numeric tokens losslessly, without Number conversion', () => {
    const v = declaredEntityCashVector();
    v.source.rows[0]!.cash.openingBalance = '90071992547409931234567890.125';
    v.source.rows[0]!.cash.closingBalance = '90071992547409931234567890.625';
    const d = v.document();
    const bytes = d.bytes
      .replace(
        '"90071992547409931234567890.125"',
        '90071992547409931234567890.125',
      )
      .replace(
        '"90071992547409931234567890.625"',
        '90071992547409931234567890.625',
      );
    const r = buildEntityNativeCashCandidate({
      ...v.input(),
      documents: [{ ...d, bytes, sha256: financialInputSha256(bytes) }],
    });
    expect(
      r.witnesses.find((w) => w.entityId === 'ENTITY_GOVERNMENT_01')!
        .cashCandidate!.closing.amount,
    ).toBe('90071992547409931234567890.625');
  });
});
