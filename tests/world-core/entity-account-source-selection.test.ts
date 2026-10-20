/** B06 account-only mechanism regression using the existing synthetic fixture.
 * No actual account/title source, World/asOf, admission or original-field closure
 * is supplied or constructed here. Five economic entities are not six Offices. */
import { describe, expect, it } from 'vitest';
import { buildEntityNativeCashCandidate } from '../../apps/world-worker/src/preparation/entity-native-cash-candidate-builder.js';
import { financialInputSha256 } from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import {
  declaredEntityCashVector,
  entityRoles,
} from '../support/entity-native-cash-candidate-fixture.js';

function accountOnlyVector() {
  const vector = declaredEntityCashVector();
  const selections = vector.selections.map((selection) => ({
    ...selection,
    cash: null,
  }));
  return {
    ...vector,
    selections,
    input: () => ({ ...vector.input(), selections }),
  };
}

describe('B06 existing-builder account-only selection, synthetic mechanism not actual source', () => {
  it('accepts one documentId shared by five distinct account pointers in one batch', () => {
    const v = accountOnlyVector(),
      input = v.input();
    const before = JSON.stringify(input);
    expect(input.documents).toHaveLength(1);
    expect(input.documents[0]!.classification).toBe('SYNTHETIC_CANDIDATE');
    expect(input.expected.worldId).toBe('WORLD_SYNTHETIC_ENTITY_CASH_ONLY');
    expect(
      new Set(input.selections.map((s) => s.account.documentId)).size,
    ).toBe(1);
    expect(new Set(input.selections.map((s) => s.account.pointer)).size).toBe(
      5,
    );
    const result = buildEntityNativeCashCandidate(input);
    expect(result.witnesses.map((w) => w.entityId).sort()).toEqual(
      entityRoles.map(([role]) => `ENTITY_${role}_01`).sort(),
    );
    for (const witness of result.witnesses) {
      const supplied = v.source.rows.find(
        (r) => r.account.account.ownerId === witness.entityId,
      )!.account.account;
      expect(witness.accountCandidate).toEqual(supplied);
      expect(witness.cashCandidate).toBeNull();
      expect(witness.reason).toBe('EXPLICIT_CASH_SOURCE_NOT_SUPPLIED');
      expect(witness.accountSource.documentId).toBe(
        input.documents[0]!.documentId,
      );
      expect(witness.accountSource.sha256).toBe(input.documents[0]!.sha256);
      expect(witness.accountSource.signatureStatus).toBe(
        'NOT_VERIFIED_HASH_IS_NOT_SIGNATURE',
      );
    }
    const derived = JSON.parse(result.document.bytes);
    expect(derived.accounts).toHaveLength(5);
    expect(derived.entityBindings).toHaveLength(5);
    expect(derived.balances).toEqual([]);
    expect(derived.encumbranceAtoms).toEqual([]);
    expect(derived.restrictions).toEqual([]);
    expect(result.actualUnknownClosed).toBe(0);
    expect(
      result.sourceAdoption ||
        result.admissionAllowed ||
        result.activationAllowed ||
        result.currentPermissionIssued,
    ).toBe(false);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('retains all five account-only candidates after every B07 cash leaf is removed', () => {
    const v = accountOnlyVector(),
      input = v.input();
    const withUnselectedCash = buildEntityNativeCashCandidate(input);
    const bytes = JSON.stringify({
      ...v.source,
      rows: v.source.rows.map((row) => ({ account: row.account })),
    });
    const withoutCash = buildEntityNativeCashCandidate({
      ...input,
      documents: [
        { ...input.documents[0]!, bytes, sha256: financialInputSha256(bytes) },
      ],
    });
    expect(withoutCash.document.bytes).toBe(withUnselectedCash.document.bytes);
    expect(withoutCash.witnesses).toHaveLength(5);
    expect(
      withoutCash.witnesses.every(
        (w) => w.accountCandidate !== null && w.cashCandidate === null,
      ),
    ).toBe(true);
    expect(JSON.parse(withoutCash.document.bytes).balances).toEqual([]);
    expect(withoutCash.actualUnknownClosed).toBe(0);
  });

  it('rejects a reused account pointer across distinct entity rows, not the shared documentId', () => {
    const v = accountOnlyVector();
    // The first owner validates before the second sorted row reuses its leaf.
    const [first, second] = [...v.selections].sort((a, b) =>
      a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0,
    );
    const selections = v.selections.map((s) =>
      s.entityId === second!.entityId ? { ...s, account: first!.account } : s,
    );
    expect(() =>
      buildEntityNativeCashCandidate({ ...v.input(), selections }),
    ).toThrow('SOURCE_LEAF_REUSED');
  });

  it('rejects duplicate account identities across different source pointers and owners', () => {
    const v = accountOnlyVector();
    v.source.rows[1]!.account.account.accountId =
      v.source.rows[0]!.account.account.accountId;
    expect(() => buildEntityNativeCashCandidate(v.input())).toThrow(
      'DUPLICATE_ACCOUNT_BINDING',
    );
  });

  it('rejects duplicate entity selection even when no cash leaves are selected', () => {
    const v = accountOnlyVector();
    expect(() =>
      buildEntityNativeCashCandidate({
        ...v.input(),
        selections: [...v.selections, v.selections[0]!],
      }),
    ).toThrow('DUPLICATE_ENTITY_SELECTION');
  });

  it.each(entityRoles.map(([role], index) => [role, index] as const))(
    'rejects a partially missing %s account leaf instead of filling a placeholder',
    (_role, index) => {
      const v = accountOnlyVector(),
        input = v.input();
      const bytes = JSON.stringify({
        ...v.source,
        rows: v.source.rows.map((row, i) => (i === index ? {} : row)),
      });
      expect(() =>
        buildEntityNativeCashCandidate({
          ...input,
          documents: [
            {
              ...input.documents[0]!,
              bytes,
              sha256: financialInputSha256(bytes),
            },
          ],
        }),
      ).toThrow('JSON_POINTER_MISSING');
    },
  );

  it('rejects a row pointing to an unprovided document instead of borrowing another account', () => {
    const v = accountOnlyVector();
    const selections = v.selections.map((s, i) =>
      i === 0
        ? {
            ...s,
            account: {
              ...s.account,
              documentId: 'UNPROVIDED_MECHANISM_DOCUMENT',
            },
          }
        : s,
    );
    expect(() =>
      buildEntityNativeCashCandidate({ ...v.input(), selections }),
    ).toThrow('SELECTED_SOURCE_DOCUMENT_MISSING');
  });

  it.each([
    ['World', { worldId: 'WORLD_OTHER_SYNTHETIC_ONLY' }],
    ['head', { worldVersion: '1' }],
    ['source version', { sourceVersion: 'OTHER_SYNTHETIC_SOURCE_VERSION' }],
    ['asOf', { asOf: '2026-10-18T00:00:00.001Z' }],
  ] as const)('rejects account-only source %s mismatch', (_name, change) => {
    const v = accountOnlyVector(),
      input = v.input();
    expect(() =>
      buildEntityNativeCashCandidate({
        ...input,
        expected: { ...input.expected, ...change },
      }),
    ).toThrow('SOURCE_SCOPE_VERSION_ASOF_MISMATCH');
  });

  it.each([
    ['owner', { ownerId: 'ENTITY_OPERATOR_01' }],
    ['country', { countryId: 'COUNTRY_02' }],
    ['currency', { currency: 'GCU' }],
  ] as const)(
    'rejects account-only %s mismatch without granting permissions',
    (_name, change) => {
      const v = accountOnlyVector();
      Object.assign(v.source.rows[0]!.account.account, change);
      expect(() => buildEntityNativeCashCandidate(v.input())).toThrow(
        'ACCOUNT_OWNERSHIP_COUNTRY_CURRENCY_MISMATCH',
      );
    },
  );
});
