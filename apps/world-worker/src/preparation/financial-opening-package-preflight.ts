/** Offline diagnostics only. No full V2 composer, adoption, seed assembly,
 * SQL, Atomic.commit, permission issuer or authoritative balance state. */
import path from 'node:path';
import {
  Money,
  createFinancialAccount,
  type FinancialAccount,
} from '@econmind/core';
import {
  loadOwnerNonHostSourceAdoption,
  type OwnerNonHostSourceAdoption,
} from './owner-non-host-source-adoption.js';
import {
  freezeFinancialInput,
  parseFormalFinancialOpeningContract,
} from './formal-financial-opening-contract.js';
import {
  produceFormalFinancialOpening,
  type FormalFinancialOpeningResult,
} from './formal-financial-opening-producer.js';
import {
  isLoadedFinancialOpeningPackageRegistry,
  registryArray,
  registryRow,
  registryString,
  resolveFinancialRegistrySource,
  type LoadedFinancialOpeningPackageRegistry,
} from './financial-opening-package-registry.js';

export interface FinancialPackageBlocker {
  readonly stage: 'source' | 'financial' | 'funding' | 'terms' | 'route';
  readonly code: string;
  readonly field: string;
  readonly countryId: string | null;
  readonly ownerLabel: string | null;
}
/** Same genuine original chain for finite mechanism controls. Input bytes
 * are not an adoption/World API; original authority blockers remain intact. */
export function calculateFinancialPackageCarrier(
  input: Readonly<{
    adoption: OwnerNonHostSourceAdoption;
    inputBytes: string;
  }>,
): FormalFinancialOpeningResult {
  return produceFormalFinancialOpening({
    adoption: input.adoption,
    contract: parseFormalFinancialOpeningContract(
      JSON.parse(input.inputBytes) as unknown,
      input.adoption,
    ),
  });
}
export interface DeclaredCashDiagnostic {
  readonly account: FinancialAccount;
  readonly sourceHoldingKind: 'CASH' | 'CLAIM' | 'UNKNOWN';
  readonly sourceNativeCurrency: string;
  readonly sourceOwnerId: string | null;
  readonly availableAmount: string | null;
  readonly restrictedAmount: string | null;
  readonly permissionKnown: boolean;
}
export interface GrossDiagnosticObligation {
  readonly flowId: string;
  readonly ownerId: string;
  readonly accountId: string;
  readonly currency: string;
  readonly dueBucket: string;
  readonly amount: string;
  readonly fee: string | null;
}
/** A constraint diagnostic, not a ledger or funding issuer. No incoming
 * reference/promised amount is accepted as available money. Every obligation
 * in the same owner/account/currency/bucket shares ONE bound candidate budget. */
export function diagnoseFinancialPackageGross(
  input: Readonly<{
    cash: DeclaredCashDiagnostic | null;
    obligations: readonly GrossDiagnosticObligation[];
  }>,
): Readonly<{
  status:
    | 'UNKNOWN'
    | 'NOT_SETTLEMENT_CASH'
    | 'INSUFFICIENT_DECLARED_CANDIDATE'
    | 'DECLARED_CANDIDATE_SUFFICIENT_NOT_ADOPTED';
  grossByBucket: readonly Readonly<{ bucket: string; gross: string | null }>[];
  seed: null;
  admissionAllowed: false;
  activationAllowed: false;
  runtimeExecuted: false;
}> {
  if (input.obligations.length > 20000)
    throw Error('GROSS_OBLIGATION_BUDGET_EXCEEDED');
  const ids = new Set<string>();
  const totals = new Map<string, Money | null>();
  for (const o of input.obligations) {
    if (
      !o.flowId ||
      ids.has(o.flowId) ||
      !o.ownerId ||
      !o.accountId ||
      !o.dueBucket
    )
      throw Error('GROSS_IDENTITY_INVALID');
    ids.add(o.flowId);
    const amount = Money.from(o.amount, o.currency);
    if (amount.amount.isNegative()) throw Error('NEGATIVE_GROSS_OBLIGATION');
    const bucket = [o.ownerId, o.accountId, o.currency, o.dueBucket].join('/');
    if (o.fee === null || (totals.has(bucket) && totals.get(bucket) === null)) {
      totals.set(bucket, null);
      continue;
    }
    const fee = Money.from(o.fee, o.currency);
    if (fee.amount.isNegative()) throw Error('NEGATIVE_FEE');
    totals.set(
      bucket,
      (totals.get(bucket) ?? Money.from('0', o.currency)).add(amount).add(fee),
    );
  }
  let status:
    | 'UNKNOWN'
    | 'NOT_SETTLEMENT_CASH'
    | 'INSUFFICIENT_DECLARED_CANDIDATE'
    | 'DECLARED_CANDIDATE_SUFFICIENT_NOT_ADOPTED' = 'UNKNOWN';
  const cash = input.cash;
  if (cash) {
    const account = createFinancialAccount(cash.account);
    if (
      cash.sourceHoldingKind !== 'CASH' ||
      cash.sourceNativeCurrency !== 'GCU' ||
      account.currency !== 'GCU' ||
      cash.sourceOwnerId !== account.ownerId ||
      account.claimId !== null ||
      !['CASH', 'ASSET'].includes(account.accountClass)
    )
      status = 'NOT_SETTLEMENT_CASH';
    else if (
      cash.availableAmount !== null &&
      cash.restrictedAmount !== null &&
      cash.permissionKnown &&
      [...totals.values()].every((v) => v !== null)
    ) {
      const available = Money.from(cash.availableAmount, 'GCU');
      const restricted = Money.from(cash.restrictedAmount, 'GCU');
      if (available.amount.isNegative() || restricted.amount.isNegative())
        throw Error('NEGATIVE_CASH_COMPONENT');
      // Available is already the explicitly source-bound spendable amount;
      // restricted is disclosed separately, never added to it.
      const scopeMatches = input.obligations.every(
        (o) =>
          o.ownerId === account.ownerId &&
          o.accountId === account.accountId &&
          o.currency === account.currency,
      );
      const buckets = new Set(input.obligations.map((o) => o.dueBucket));
      // No schedule/receipt model is invented to re-use cash over time.
      if (scopeMatches && buckets.size <= 1)
        status = [...totals.values()].some((v) =>
          v!.amount.greaterThan(available.amount),
        )
          ? 'INSUFFICIENT_DECLARED_CANDIDATE'
          : 'DECLARED_CANDIDATE_SUFFICIENT_NOT_ADOPTED';
    }
  }
  return freezeFinancialInput({
    status,
    grossByBucket: [...totals].map(([bucket, gross]) => ({
      bucket,
      gross: gross?.toCanonicalValue().amount ?? null,
    })),
    seed: null,
    admissionAllowed: false,
    activationAllowed: false,
    runtimeExecuted: false,
  });
}

export async function preflightFinancialOpeningPackage(
  input: Readonly<{
    registry: LoadedFinancialOpeningPackageRegistry;
    repositoryRoot: string;
  }>,
) {
  if (
    Object.keys(input).length !== 2 ||
    !Object.hasOwn(input, 'registry') ||
    !Object.hasOwn(input, 'repositoryRoot') ||
    !path.isAbsolute(input.repositoryRoot)
  )
    throw Error('PRIVATE_COMPOSITION_INPUT_INVALID');
  const loaded = input.registry;
  if (!isLoadedFinancialOpeningPackageRegistry(loaded))
    throw Error('GENUINE_REGISTRY_REQUIRED');
  const root = path.resolve(input.repositoryRoot);
  const parent = await loadOwnerNonHostSourceAdoption({
    repositoryRoot: root,
    ownerDocumentPath: path.join(
      root,
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
    ),
    rootReceiptPath: path.join(
      root,
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
    ),
    scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
  });
  const blockers: FinancialPackageBlocker[] = [];
  const add = (
    stage: FinancialPackageBlocker['stage'],
    code: string,
    field: string,
    countryId: string | null = null,
    ownerLabel: string | null = null,
  ) => blockers.push({ stage, code, field, countryId, ownerLabel });
  for (const gap of parent.manifest.gaps)
    add('source', gap.code, gap.field, gap.countryId, gap.objectId);
  for (const gap of loaded.sourceGaps) add('source', gap.code, gap.field);
  // Required original authority obligations, not a forged producer result.
  add(
    'financial',
    'SUPPLEMENTAL_FINANCIAL_SOURCE_ADOPTION_UNRESOLVED',
    'financial.sourceAdoption',
  );
  add('financial', 'FORMAL_WORLD_BINDING_UNRESOLVED', 'financial.worldId');
  add(
    'financial',
    'FINANCIAL_CONTRACT_INPUT_NOT_PROVISIONED',
    'registry.formalFinancialInputSourceId',
  );
  const nativeRows = resolveFinancialRegistrySource(loaded, {
    sourceId: 'native_lc',
    selector: { kind: 'JSON_POINTER', pointer: '/countries' },
  });
  if (nativeRows.status !== 'VERIFIED_LEAF')
    throw Error('NATIVE_COUNTRY_SOURCE_REQUIRED');
  const native = registryArray(nativeRows.value, 'native.countries').map((v) =>
    registryRow(v, 'native.country'),
  );
  const seen = new Set<string>();
  for (const country of loaded.countries) {
    const id = registryString(country.countryId, 'countryId');
    const original = parent.manifest.countries.find((c) => c.countryId === id);
    if (!original || seen.has(id))
      throw Error('COUNTRY_PARENT_IDENTITY_MISMATCH');
    seen.add(id);
    const source = native.find((c) => c.countryId === id);
    const cross = registryRow(country.identityCrosswalk, 'identityCrosswalk');
    const legacy = resolveFinancialRegistrySource(loaded, {
      sourceId: cross.legacyFinanceSourceId,
      selector: { kind: 'JSON_POINTER', pointer: cross.legacyPointer },
    });
    const sourceCountry = resolveFinancialRegistrySource(loaded, {
      sourceId: 'native_lc',
      selector: { kind: 'JSON_POINTER', pointer: cross.nativePointer },
    });
    if (
      !source ||
      source.currencyCode !== country.nativeCurrency ||
      legacy.status !== 'VERIFIED_LEAF' ||
      legacy.value !== cross.legacyCountryId ||
      sourceCountry.status !== 'VERIFIED_LEAF' ||
      sourceCountry.value !== id ||
      cross.legacyPointer !== original.sourceRowPointer + '/countryId'
    )
      throw Error('COUNTRY_CURRENCY_CROSSWALK_MISMATCH');
    if (registryArray(country.adoptedFacts, 'adoptedFacts').length)
      throw Error('REGISTRY_ADOPTION_NOT_ALLOWED');
    const cash = registryRow(country.gcuCash, 'gcuCash');
    if (cash.countryId !== id || cash.currency !== 'GCU')
      throw Error('CASH_COUNTRY_SCOPE_MISMATCH');
    const fx = registryRow(country.fx, 'fx');
    if (
      fx.netIncomingAgainstOutgoingAllowed !== false ||
      fx.receivableIsCash !== false
    )
      throw Error('GROSS_OR_CASH_BOUNDARY_CHANGED');
  }
  if (seen.size !== parent.manifest.countries.length)
    throw Error('COUNTRY_PARENT_COVERAGE_MISMATCH');
  for (const located of loaded.facts) {
    if (located.fact.status === 'UNKNOWN')
      add(
        'funding',
        registryString(located.fact.gapId, 'gapId'),
        located.field,
        located.countryId,
        located.ownerLabel,
      );
    else if (located.fact.value === null)
      add(
        'funding',
        'KNOWN_NULL_IS_NOT_FUNDING_OR_TERMS',
        located.field,
        located.countryId,
        located.ownerLabel,
      );
  }
  const claims = registryArray(loaded.clearingIndex.claims, 'claims').map((v) =>
    registryRow(v, 'claim'),
  );
  const flowIds = new Set<string>(),
    claimIds = new Set<string>();
  const termsDiagnostics = loaded.terms.map((term) => {
    const flowId = registryString(term.flowId, 'flowId'),
      claimId = registryString(term.canonicalClaimId, 'claimId');
    const claim = claims.find((c) => c.canonicalClaimId === claimId);
    if (
      !claim ||
      flowIds.has(flowId) ||
      claimIds.has(claimId) ||
      term.status !== 'KNOWN_PROPOSED_NOT_ADOPTED'
    )
      throw Error('CLEARING_IDENTITY_OR_STATUS_INVALID');
    flowIds.add(flowId);
    claimIds.add(claimId);
    const payer = registryRow(term.payer, 'payer'),
      payee = registryRow(term.payee, 'payee');
    if (
      payer.countryId === payee.countryId ||
      !seen.has(String(payer.countryId)) ||
      !seen.has(String(payee.countryId))
    )
      throw Error('CLEARING_ENDPOINT_INVALID');
    const amount = registryRow(term.amountFact, 'amountFact');
    if (
      amount.valueKind !== 'DECIMAL_STRING' ||
      amount.currency !== 'GCU' ||
      amount.unit !== 'GCU'
    )
      throw Error('CLEARING_NATIVE_AMOUNT_INVALID');
    const proposed = registryRow(claim.proposedTerms, 'proposedTerms');
    if (
      !Money.from(registryString(amount.value, 'amount'), 'GCU').amount.equals(
        registryString(
          registryRow(proposed.nativePrincipal, 'principal').value,
          'principal',
        ),
      )
    )
      throw Error('CLEARING_PRINCIPAL_CHANGED');
    const owners = registryRow(
      claim.originalKnownReference,
      'originalKnownReference',
    );
    if (
      payer.candidateOwnerId !== registryRow(owners.issuerId, 'issuer').value ||
      payee.candidateOwnerId !==
        registryRow(owners.assetHolderId, 'holder').value
    )
      throw Error('CLEARING_OWNER_ENDPOINT_CHANGED');
    add(
      'terms',
      'CLEARING_TERMS_NOT_ADOPTED',
      'terms/' + flowId,
      String(payer.countryId),
      String(payer.candidateOwnerId),
    );
    add(
      'route',
      'SETTLEMENT_PATH_NOT_IMPLEMENTED',
      'terms/' + flowId + '/genericClearingWriter',
      String(payer.countryId),
      String(payer.candidateOwnerId),
    );
    return {
      flowId,
      claimId,
      payerCountryId: payer.countryId,
      payeeCountryId: payee.countryId,
      nativeAmount: amount.value,
      currency: 'GCU',
      grossAvailability: 'UNKNOWN_NO_ACTUAL_CASH_ACCOUNT',
      status: 'PROPOSED_NOT_ADOPTED',
    };
  });
  return freezeFinancialInput({
    status: 'PREFLIGHT_BLOCKED' as const,
    packageManifestSha256: loaded.packageManifestSha256,
    schemaSha256: loaded.schemaSha256,
    sourceIdentities: loaded.sourceRegistry.sources,
    guardComposition: loaded.sourceRegistry.consumerComposition,
    selectedSourceIds: loaded.selectedSourceIds,
    archiveOnlySourceIds: loaded.archiveOnlySourceIds,
    sourceStatus: 'ARCHIVE_INTEGRITY_VALIDATED_NOT_ADOPTION' as const,
    originalParentManifestFingerprint: parent.manifestFingerprint,
    originalSourceGaps: parent.manifest.gaps,
    originalCarrierStatus: 'NOT_RUN_INPUT_NOT_PROVISIONED' as const,
    originalCarrierResult: null,
    originalCarrierInputSourceId: null,
    nativeCoverage: {
      countries: seen.size,
      ownerLeaves: loaded.nativeLeaves.filter((l) => l.ownerLabel !== null)
        .length,
      summaryLeaves: loaded.nativeLeaves.filter((l) => l.ownerLabel === null)
        .length,
      spendableCash: false,
    },
    countryFunding: loaded.countries.map((c) => ({
      countryId: c.countryId,
      actualGcuCash: 'UNKNOWN',
      actualOwnerAccount: 'UNKNOWN',
      grossCannotBeNetted: true,
    })),
    termsDiagnostics,
    blockers,
    seed: null,
    admissionAllowed: false,
    activationAllowed: false,
    runtimeExecuted: false,
  });
}
