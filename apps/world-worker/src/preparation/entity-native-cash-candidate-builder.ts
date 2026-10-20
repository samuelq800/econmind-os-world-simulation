/** Offline B06/B07 source-to-candidate transform. Never mints account IDs,
 * funds, authority, source adoption, seed, or a second financial ledger. */
import {
  Money,
  canonicalSerialize,
  createFinancialAccount,
  legalEntityId,
  type FinancialAccount,
} from '@econmind/core';
import {
  exactFinancialDecimal,
  financialInputSha256,
  freezeFinancialInput,
} from './formal-financial-opening-contract.js';
import {
  parseFinancialRegistrySourceJson,
  registryArray,
  registryRow,
  registryString,
  selectFinancialRegistryJsonPointer,
} from './financial-opening-package-registry.js';
import {
  NativeCashCandidateInvalid,
  type NativeCashCandidateDocument,
  type NativeCashCandidateScope,
} from './native-cash-source-candidate.js';

export interface EntityCashSourcePointer {
  readonly documentId: string;
  readonly pointer: string;
}
export interface EntityCashSourceSelection {
  readonly entityId: string;
  readonly countryId: string;
  readonly nativeCurrency: string;
  readonly account: EntityCashSourcePointer;
  readonly cash: EntityCashSourcePointer | null;
}
export interface EntityCashBuilderInput {
  readonly expected: NativeCashCandidateScope;
  readonly documents: readonly NativeCashCandidateDocument[];
  readonly selections: readonly EntityCashSourceSelection[];
}
export type EntityCashCanonicalMoney = ReturnType<Money['toCanonicalValue']>;
export interface EntityCashSourceWitness extends EntityCashSourcePointer {
  readonly sha256: string;
  readonly sourceVersion: string;
  readonly asOf: string;
  readonly classification: 'SYNTHETIC_CANDIDATE' | 'CONSTRUCTED_CANDIDATE';
  readonly signatureStatus: 'NOT_VERIFIED_HASH_IS_NOT_SIGNATURE';
}
export interface EntityCashJournalWitness {
  readonly source: EntityCashSourceWitness;
  readonly periodStart: string;
  readonly opening: EntityCashCanonicalMoney;
  readonly settledInflows: EntityCashCanonicalMoney;
  readonly settledOutflows: EntityCashCanonicalMoney;
  readonly closing: EntityCashCanonicalMoney;
  readonly flowSetComplete: true;
  readonly restrictionCompleteness: 'DECLARED_NOT_INDEPENDENTLY_PROVEN';
}
export interface EntityCashCandidateWitness {
  readonly entityId: string;
  readonly countryId: string;
  readonly nativeCurrency: string;
  readonly sourceAccount: Readonly<FinancialAccount>;
  readonly issuerId: string;
  readonly purpose: string;
  readonly sourceHoldingKind: string;
  readonly accountSource: EntityCashSourceWitness;
  readonly accountCandidate: Readonly<FinancialAccount> | null;
  readonly cashCandidate: EntityCashJournalWitness | null;
  readonly reason: string;
}
export interface EntityCashBuilderResult {
  readonly document: NativeCashCandidateDocument;
  readonly witnesses: readonly EntityCashCandidateWitness[];
  readonly sourceAdoption: false;
  readonly actualUnknownClosed: 0;
  readonly admissionAllowed: false;
  readonly activationAllowed: false;
  readonly currentPermissionIssued: false;
}
function demand(v: unknown, code: string): asserts v {
  if (!v) throw new NativeCashCandidateInvalid(code);
}
function text(v: unknown, field: string): string {
  const s = registryString(v, field);
  demand(s.length <= 256 && /\S/u.test(s), 'NONEMPTY_SOURCE_STRING_REQUIRED');
  return s;
}
function money(v: unknown, currency: string) {
  const m = Money.from(exactFinancialDecimal(v, 'cash.amount'), currency);
  demand(!m.amount.isNegative(), 'NEGATIVE_CASH_COMPONENT');
  return m;
}
function array(v: unknown, field: string) {
  const a = registryArray(v, field);
  demand(a.length <= 2000, 'CANDIDATE_ARRAY_BUDGET');
  return a.map((x) => registryRow(x, field));
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Sources are declared SYNTHETIC/CONSTRUCTED candidates, not admitted records.
 * Hash/leaf equality only proves byte consistency. Source custodians, legal
 * admission, completeness and signatures still require independent acceptance.
 * Explicit opening + SETTLED inflows - SETTLED outflows must equal closing.
 * No FX conversion, balancing cash, claim conversion or implicit zero occurs. */
export function buildEntityNativeCashCandidate(
  input: EntityCashBuilderInput,
): EntityCashBuilderResult {
  const { expected } = input;
  text(expected.sourceVersion, 'expected.sourceVersion');
  demand(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(expected.asOf) &&
      Number.isFinite(Date.parse(expected.asOf)) &&
      new Date(expected.asOf).toISOString() === expected.asOf,
    'CANONICAL_ASOF_REQUIRED',
  );
  demand(
    input.documents.length <= 16 && input.selections.length <= 350,
    'ENTITY_SOURCE_BUDGET',
  );
  const documents = new Map<
    string,
    { document: NativeCashCandidateDocument; value: unknown }
  >();
  let totalBytes = 0;
  for (const document of input.documents) {
    text(document.documentId, 'documentId');
    text(document.sourceVersion, 'sourceVersion');
    totalBytes += Buffer.byteLength(document.bytes);
    demand(
      Buffer.byteLength(document.bytes) <= 2 * 1024 * 1024 &&
        totalBytes <= 8 * 1024 * 1024,
      'SOURCE_BYTES_BUDGET',
    );
    demand(!documents.has(document.documentId), 'DUPLICATE_DOCUMENT_ID');
    demand(
      document.classification === 'SYNTHETIC_CANDIDATE' ||
        document.classification === 'CONSTRUCTED_CANDIDATE',
      'CANDIDATE_CLASSIFICATION_REQUIRED',
    );
    demand(
      financialInputSha256(document.bytes) === document.sha256,
      'SOURCE_HASH_MISMATCH',
    );
    const value = registryRow(
      parseFinancialRegistrySourceJson(document.bytes),
      'source',
    );
    const raw = registryRow(JSON.parse(document.bytes), 'source');
    text(raw.sourceVersion, 'source.sourceVersion');
    demand(
      value.schemaVersion === 'entity-native-cash-source-v1' &&
        value.sourceVersion === document.sourceVersion &&
        document.sourceVersion === expected.sourceVersion &&
        value.asOf === document.asOf &&
        document.asOf === expected.asOf &&
        value.worldId === expected.worldId &&
        value.worldVersion === expected.worldVersion,
      'SOURCE_SCOPE_VERSION_ASOF_MISMATCH',
    );
    documents.set(document.documentId, { document, value });
  }
  const usedPointers = new Set<string>();
  const resolve = (reference: EntityCashSourcePointer) => {
    const found = documents.get(reference.documentId);
    demand(found, 'SELECTED_SOURCE_DOCUMENT_MISSING');
    demand(
      reference.pointer.length > 0 && reference.pointer.length <= 512,
      'SOURCE_LEAF_POINTER_REQUIRED',
    );
    const key = canonicalSerialize([reference.documentId, reference.pointer]);
    demand(!usedPointers.has(key), 'SOURCE_LEAF_REUSED');
    usedPointers.add(key);
    const value = registryRow(
      selectFinancialRegistryJsonPointer(found.value, reference.pointer),
      'selectedLeaf',
    );
    return {
      value,
      source: {
        ...reference,
        sha256: found.document.sha256,
        sourceVersion: found.document.sourceVersion,
        asOf: found.document.asOf,
        classification: found.document.classification,
        signatureStatus: 'NOT_VERIFIED_HASH_IS_NOT_SIGNATURE' as const,
      },
    };
  };
  const accounts: Readonly<FinancialAccount>[] = [];
  const balances: Record<string, unknown>[] = [];
  const entityBindings: Record<string, unknown>[] = [];
  const encumbranceAtoms: Record<string, unknown>[] = [];
  const restrictions: Record<string, unknown>[] = [];
  const entityIds = new Set<string>(),
    accountIds = new Set<string>(),
    flowIds = new Set<string>();
  const witnesses = [...input.selections]
    .sort((a, b) => compare(a.entityId, b.entityId))
    .map((selection) => {
      demand(!entityIds.has(selection.entityId), 'DUPLICATE_ENTITY_SELECTION');
      entityIds.add(selection.entityId);
      const accountLeaf = resolve(selection.account);
      const body = accountLeaf.value;
      const account = createFinancialAccount(
        registryRow(body.account, 'account') as unknown as FinancialAccount,
      );
      const issuerId = legalEntityId(text(body.issuerId, 'issuerId'));
      const purpose = text(body.purpose, 'purpose');
      demand(!accountIds.has(account.accountId), 'DUPLICATE_ACCOUNT_BINDING');
      accountIds.add(account.accountId);
      demand(
        account.worldId === expected.worldId &&
          account.ownerId === selection.entityId &&
          account.countryId === selection.countryId &&
          account.currency === selection.nativeCurrency,
        'ACCOUNT_OWNERSHIP_COUNTRY_CURRENCY_MISMATCH',
      );
      const base = {
        entityId: selection.entityId,
        countryId: selection.countryId,
        nativeCurrency: selection.nativeCurrency,
        sourceAccount: account,
        issuerId,
        purpose,
        sourceHoldingKind: text(body.sourceHoldingKind, 'sourceHoldingKind'),
        accountSource: accountLeaf.source,
      };
      const cashAccount =
        account.accountClass === 'CASH' &&
        account.claimId === null &&
        account.counterpartyEntityId === null &&
        body.sourceHoldingKind === 'CASH' &&
        ['CASH_ON_HAND', 'NATIVE_CASH_SETTLEMENT'].includes(purpose);
      if (!cashAccount)
        return {
          ...base,
          accountCandidate: null,
          cashCandidate: null,
          reason: 'NOT_NATIVE_CASH',
        };
      accounts.push(account);
      entityBindings.push({
        entityId: selection.entityId,
        accountId: account.accountId,
        sourceHoldingKind: 'CASH',
      });
      if (selection.cash === null)
        return {
          ...base,
          accountCandidate: account,
          cashCandidate: null,
          reason: 'EXPLICIT_CASH_SOURCE_NOT_SUPPLIED',
        };
      const cashLeaf = resolve(selection.cash),
        cash = cashLeaf.value;
      demand(
        cash.accountId === account.accountId &&
          cash.currency === account.currency &&
          cash.asOf === expected.asOf,
        'CASH_ACCOUNT_CURRENCY_ASOF_MISMATCH',
      );
      demand(
        cash.flowSetComplete === true &&
          typeof cash.periodStart === 'string' &&
          Number.isFinite(Date.parse(cash.periodStart)) &&
          new Date(cash.periodStart).toISOString() === cash.periodStart &&
          cash.periodStart <= expected.asOf,
        'CASH_FLOW_PERIOD_OR_COMPLETENESS_UNKNOWN',
      );
      const opening = money(cash.openingBalance, account.currency),
        closing = money(cash.closingBalance, account.currency);
      let inflows = Money.from('0', account.currency),
        outflows = Money.from('0', account.currency);
      for (const flow of array(cash.flows, 'flows')) {
        const id = text(flow.flowId, 'flowId');
        demand(!flowIds.has(id), 'DUPLICATE_CASH_FLOW');
        flowIds.add(id);
        demand(
          flow.accountId === account.accountId &&
            flow.currency === account.currency &&
            typeof flow.settlementTime === 'string' &&
            Number.isFinite(Date.parse(flow.settlementTime)) &&
            new Date(flow.settlementTime).toISOString() ===
              flow.settlementTime &&
            flow.settlementTime >= cash.periodStart &&
            flow.settlementTime <= expected.asOf,
          'FLOW_ACCOUNT_CURRENCY_PERIOD_MISMATCH',
        );
        demand(
          ['INFLOW', 'OUTFLOW'].includes(String(flow.direction)) &&
            ['SETTLED', 'UNSETTLED'].includes(String(flow.status)),
          'FLOW_DIRECTION_OR_SETTLEMENT_STATUS_INVALID',
        );
        const amount = money(flow.amount, account.currency);
        if (flow.status !== 'SETTLED') continue;
        if (flow.direction === 'INFLOW') inflows = inflows.add(amount);
        else outflows = outflows.add(amount);
      }
      demand(
        opening.add(inflows).subtract(outflows).amount.equals(closing.amount),
        'CASH_JOURNAL_NOT_RECONCILED',
      );
      demand(
        cash.restrictionsComplete === true &&
          cash.restrictionBasis === 'DECLARED_DISJOINT_CASH_ATOMS',
        'RESTRICTION_COMPLETENESS_OR_OVERLAP_UNKNOWN',
      );
      // Existing readback validates atom IDs, same-account scope, overlap union,
      // orphan atoms and available >= 0. Do not implement that ledger again.
      const cashAtoms = array(cash.encumbranceAtoms, 'encumbranceAtoms'),
        cashRestrictions = array(cash.restrictions, 'restrictions');
      demand(
        [...cashAtoms, ...cashRestrictions].every(
          (r) => r.accountId === account.accountId,
        ),
        'RESTRICTION_SOURCE_ACCOUNT_MISMATCH',
      );
      encumbranceAtoms.push(...cashAtoms);
      restrictions.push(...cashRestrictions);
      balances.push({
        accountId: account.accountId,
        amount: closing.toCanonicalValue().amount,
        currency: account.currency,
        asOf: expected.asOf,
      });
      return {
        ...base,
        accountCandidate: account,
        cashCandidate: {
          source: cashLeaf.source,
          periodStart: cash.periodStart,
          opening: opening.toCanonicalValue(),
          settledInflows: inflows.toCanonicalValue(),
          settledOutflows: outflows.toCanonicalValue(),
          closing: closing.toCanonicalValue(),
          flowSetComplete: true as const,
          restrictionCompleteness: 'DECLARED_NOT_INDEPENDENTLY_PROVEN' as const,
        },
        reason: 'DECLARED_CANDIDATE_NOT_ADOPTED',
      };
    });
  const bytes = canonicalSerialize({
    schemaVersion: 'native-cash-source-candidate-v1',
    ...expected,
    accounts,
    balances,
    entityBindings,
    encumbranceAtoms,
    restrictions,
    restrictionsComplete: true,
    restrictionBasis: 'DECLARED_DISJOINT_CASH_ATOMS',
  });
  demand(Buffer.byteLength(bytes) <= 2 * 1024 * 1024, 'SOURCE_BYTES_BUDGET');
  const document: NativeCashCandidateDocument = {
    documentId: 'ENTITY_NATIVE_CASH_DERIVED_CANDIDATE',
    classification: input.documents.some(
      (d) => d.classification === 'SYNTHETIC_CANDIDATE',
    )
      ? 'SYNTHETIC_CANDIDATE'
      : 'CONSTRUCTED_CANDIDATE',
    sourceVersion: expected.sourceVersion,
    asOf: expected.asOf,
    bytes,
    sha256: financialInputSha256(bytes),
  };
  return freezeFinancialInput({
    document,
    witnesses,
    sourceAdoption: false as const,
    actualUnknownClosed: 0 as const,
    admissionAllowed: false as const,
    activationAllowed: false as const,
    currentPermissionIssued: false as const,
  });
}
