/** Deterministic D01/D02/D03 financial calculation. No SQL/admission/Clock,
 * signer, source-selection change, or importable OpeningSeed is returned.
 * Formal supplemental adoption + World authority are still unresolved at base.
 */
import {
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  Money,
  canonicalDecimal,
  canonicalSerialize,
  createFinancialAccount,
  createOpeningSeed,
  createOpeningSource,
  financialAccountId,
  financialClaimId,
  financialOpeningBatchId,
  financialOpeningLegId,
  countryId,
  legalEntityId,
  openingSourceId,
  openingSeedId,
  parseOpeningSeed,
  rebuildV08LedgersFromLineage,
  worldId,
  type FinancialAccount,
  type FinancialOpeningBatch,
} from '@econmind/core';
import {
  OPENING_FINANCE_FIELDS,
  openingBookMoney,
  openingCentralBankNetWorth,
  type OpeningFinanceField,
} from './opening-economic-decision.js';
import {
  CENTRAL_BANK_OPENING_CATEGORIES,
  isOwnerNonHostSourceAdoption,
  type OwnerNonHostSourceAdoption,
} from './owner-non-host-source-adoption.js';
import {
  FormalFinancialOpeningInvalid,
  financialInputSha256,
  freezeFinancialInput,
  isParsedFormalFinancialOpeningContract,
  requireFinancialInput,
  type FormalFinancialOpeningContract,
  type FinancialCrossCbMirror,
} from './formal-financial-opening-contract.js';

type CanonicalMoney = ReturnType<Money['toCanonicalValue']>;
export interface FormalFinancialReconciliation {
  readonly countryId: string;
  readonly valueDate: string;
  readonly original: OwnerNonHostSourceAdoption['manifest']['countries'][number]['rawFinance'];
  readonly denominations: readonly Readonly<{
    field: OpeningFinanceField;
    sourcePointer: string;
    sourceSha256: string;
    rawLexeme: string;
    rawUnit: 'GCU_SCENARIO_ACCOUNTING_UNIT';
    gcuEquivalent: CanonicalMoney;
    localBookValue: CanonicalMoney;
    fxVersion: string;
  }>[];
  readonly bankL: CanonicalMoney;
  readonly bankE: CanonicalMoney;
  readonly bankDeltaL: CanonicalMoney;
  readonly bankDeltaE: CanonicalMoney;
  readonly cbAssets: CanonicalMoney;
  readonly cbLiabilities: CanonicalMoney;
  readonly cbNetWorth: CanonicalMoney;
  readonly cbOriginalEquity: CanonicalMoney;
  readonly cbDeltaEquity: CanonicalMoney;
  readonly runtimeResetAllowed: false;
  readonly isCash: false;
}
export interface FormalFinancialCandidate {
  readonly provenance: 'UNADOPTED_FINANCIAL_CALCULATION_NOT_IMPORTABLE';
  readonly contractFingerprint: string;
  readonly fingerprint: string;
  readonly requestedWorldId: string;
  readonly financialBatches: readonly FinancialOpeningBatch[];
  readonly reconciliations: readonly FormalFinancialReconciliation[];
  readonly crossCbClaimEvidence?: readonly Readonly<{
    financialClaimId: string;
    canonicalSource: Readonly<{ documentId: string; pointer: string }>;
    mirrors: readonly FinancialCrossCbMirror[];
  }>[];
}
export interface FormalFinancialOpeningResult {
  readonly status: 'BLOCKED';
  readonly blockers: readonly Readonly<{ code: string; field: string }>[];
  readonly candidate: FormalFinancialCandidate | null;
  readonly seed: null;
  readonly admissionAllowed: false;
  readonly activationAllowed: false;
}
const fingerprint = (v: unknown) =>
  'sha256:' + financialInputSha256(canonicalSerialize(v));

export function produceFormalFinancialOpening(
  input: Readonly<{
    adoption: OwnerNonHostSourceAdoption;
    contract: FormalFinancialOpeningContract;
  }>,
): FormalFinancialOpeningResult {
  const { adoption, contract } = input;
  requireFinancialInput(
    isOwnerNonHostSourceAdoption(adoption) &&
      adoption.scope.environment === 'NON_ACTIVATED_PREPARATION',
    'REAL_NON_ACTIVATED_ADOPTION_REQUIRED',
    'adoption',
  );
  requireFinancialInput(
    isParsedFormalFinancialOpeningContract(contract),
    'PARSED_FINANCIAL_CONTRACT_REQUIRED',
    'contract',
  );
  requireFinancialInput(
    contract.adoptionManifestFingerprint === adoption.manifestFingerprint &&
      contract.ownerReceiptSha256 === adoption.ownerPolicy.receiptSha256 &&
      contract.financeSha256 === adoption.trustedSource.financeSha256,
    'SOURCE_ADOPTION_BINDING_MISMATCH',
    'contract',
  );
  const blockers = [
    {
      code: 'SUPPLEMENTAL_FINANCIAL_SOURCE_ADOPTION_UNRESOLVED',
      field: 'documents',
    },
    { code: 'FORMAL_WORLD_BINDING_UNRESOLVED', field: 'worldId' },
  ];
  if (contract.evidenceKind === 'MECHANISM_TEST_VECTOR')
    blockers.push({
      code: 'MECHANISM_VECTOR_NOT_FORMAL_SOURCE',
      field: 'evidenceKind',
    });
  const finish = (
    candidate: FormalFinancialCandidate | null,
  ): FormalFinancialOpeningResult =>
    freezeFinancialInput({
      status: 'BLOCKED',
      blockers,
      candidate,
      seed: null,
      admissionAllowed: false,
      activationAllowed: false,
    });
  const batches: FinancialOpeningBatch[] = [],
    reconciliations: FormalFinancialReconciliation[] = [];
  const v2 = contract.schemaVersion === 'formal-financial-opening-input-v2';
  const domesticLegs: FinancialOpeningBatch['legs'][number][] = [];
  try {
    for (const c of contract.countries) {
      const original = adoption.manifest.countries.find(
        (x) => x.countryId === c.countryId,
      )!;
      const cid = c.countryId,
        lc = c.localCurrency,
        roster = original.holderRoster;
      const deterministicId = (prefix: string, ...parts: string[]) =>
        prefix +
        '_' +
        financialInputSha256(
          canonicalSerialize([contract.worldId, cid, ...parts]),
        ).toUpperCase();
      const local = (field: OpeningFinanceField) =>
        openingBookMoney({
          rawAmount: original.rawFinance[field],
          denomination: 'GCU_EQUIVALENT',
          localCurrency: lc,
          localCurrencyPerGcu: c.openingFx.localCurrencyPerGcu,
        });
      const B = local('treasuryCentralBankBalance'),
        R = local('bankReserveAssets'),
        H = local('householdBankDeposits'),
        D = local('businessBankDeposits'),
        A = local('bankLoanAssets');
      requireFinancialInput(
        [B, R, H, D, A].every((m) => !m.amount.isNegative()),
        'NEGATIVE_ADOPTED_FINANCE_COMPONENT',
        cid,
      );
      const L = H.add(D),
        E = R.add(A).subtract(L);
      const legs: FinancialOpeningBatch['legs'][number][] = [];
      // Per-owner/native net positions produce opening equity only, never a
      // balancing asset/cash injection; source equity subcomponents stay audit.
      const netPositions = new Map<string, { owner: string; money: Money }>();
      const addLeg = (
        key: string,
        owner: string,
        kind: FinancialAccount['accountClass'],
        money: Money,
        claim: string | null = null,
        counterparty: string | null = null,
      ) => {
        if (money.amount.isZero()) return;
        const debit =
          kind === 'ASSET'
            ? !money.amount.isNegative()
            : money.amount.isNegative();
        const account = createFinancialAccount({
          worldId: worldId(contract.worldId),
          countryId: countryId(cid),
          accountId: financialAccountId(
            deterministicId('ACCOUNT', key, money.currency),
          ),
          ownerId: legalEntityId(owner),
          accountClass: kind,
          currency: money.currency,
          claimId: claim === null ? null : financialClaimId(claim),
          counterpartyEntityId:
            counterparty === null ? null : legalEntityId(counterparty),
        });
        legs.push({
          legId: financialOpeningLegId(
            deterministicId('LEG', key, money.currency),
          ),
          account,
          direction: debit ? 'DEBIT' : 'CREDIT',
          amount: Money.from(
            canonicalDecimal(money.amount.abs()),
            money.currency,
          ),
          counterpartLegId: financialOpeningLegId('PENDING_COUNTERPART'),
        });
        if (kind !== 'EQUITY') {
          const mapKey = owner + '/' + money.currency,
            prior =
              netPositions.get(mapKey)?.money ??
              Money.from('0', money.currency);
          netPositions.set(mapKey, {
            owner,
            money: kind === 'ASSET' ? prior.add(money) : prior.subtract(money),
          });
        }
      };
      const pair = (
        key: string,
        holder: string,
        issuer: string,
        money: Money,
      ) => {
        const claim = deterministicId('CLAIM', key, money.currency);
        addLeg(key + '_ASSET', holder, 'ASSET', money, claim, issuer);
        addLeg(key + '_LIABILITY', issuer, 'LIABILITY', money, claim, holder);
      };
      pair('TGA', roster.treasury, roster.centralBank, B);
      pair('RESERVE', roster.bank, roster.centralBank, R);
      pair('HOUSEHOLD_DEPOSIT', roster.households, roster.bank, H);
      pair('BUSINESS_DEPOSIT', roster.operator, roster.bank, D);
      let loanTotal = Money.from('0', lc);
      for (const loan of c.bankLoans) {
        const m = Money.from(loan.amount, lc);
        loanTotal = loanTotal.add(m);
        pair('BANK_LOAN_' + loan.loanId, roster.bank, loan.borrowerId, m);
      }
      requireFinancialInput(
        loanTotal.amount.equals(A.amount),
        'BANK_LOAN_SOURCE_TOTAL_MISMATCH',
        cid,
      );
      const assets: Money[] = [],
        liabilities: Money[] = [],
        originalEquity: Money[] = [];
      const pairTotals = new Map([
        ['COMMERCIAL_BANK_RESERVE_ACCOUNTS', Money.from('0', lc)],
        ['TREASURY_GOVERNMENT_DEPOSIT', Money.from('0', lc)],
      ]);
      for (const h of c.cbRegister.holdings) {
        const kind = CENTRAL_BANK_OPENING_CATEGORIES.find(
          ([cat]) => cat === h.category,
        )![1];
        const native = Money.from(h.amount, h.currency);
        const book =
          h.currency === lc
            ? native
            : openingBookMoney({
                rawAmount: h.amount,
                denomination: 'GCU_EQUIVALENT',
                localCurrency: lc,
                localCurrencyPerGcu: h.localCurrencyPerUnit,
              });
        if (kind === 'EQUITY') {
          originalEquity.push(book);
          continue;
        }
        (kind === 'ASSET' ? assets : liabilities).push(book);
        const prior = pairTotals.get(h.category);
        if (prior !== undefined) {
          const expectedHolder =
            h.category === 'COMMERCIAL_BANK_RESERVE_ACCOUNTS'
              ? roster.bank
              : roster.treasury;
          requireFinancialInput(
            h.kind === 'CLAIM' &&
              h.currency === lc &&
              h.counterpartyId === expectedHolder,
            'TGA_RESERVE_CLAIM_CONFLICT',
            h.holdingId,
          );
          pairTotals.set(h.category, prior.add(native));
          continue; // The exact adopted two-sided claim was emitted once above.
        }
        if (h.kind === 'CASH')
          addLeg('CB_' + h.holdingId, roster.centralBank, kind, native);
        else {
          requireFinancialInput(
            h.counterpartyId !== null && h.counterpartyId !== roster.bank,
            'UNREPRESENTED_BANK_OPENING_COMPONENT',
            h.holdingId,
          );
          if (kind === 'ASSET')
            pair(
              'CB_' + h.holdingId,
              roster.centralBank,
              h.counterpartyId,
              native,
            );
          else
            pair(
              'CB_' + h.holdingId,
              h.counterpartyId,
              roster.centralBank,
              native,
            );
        }
      }
      if (v2)
        for (const mirror of c.cbRegister.crossCbMirrors!) {
          const book = openingBookMoney({
            rawAmount: mirror.claim.openingOutstandingAmount,
            denomination: 'GCU_EQUIVALENT',
            localCurrency: lc,
            localCurrencyPerGcu: mirror.valuation.localCurrencyPerUnit,
          });
          (mirror.role === 'ASSET' ? assets : liabilities).push(book);
        }
      requireFinancialInput(
        c.cbRegister.categories.find(
          (x) => x.category === 'COMMERCIAL_BANK_RESERVE_ACCOUNTS',
        )?.disposition === 'DECLARED' &&
          c.cbRegister.categories.find(
            (x) => x.category === 'TREASURY_GOVERNMENT_DEPOSIT',
          )?.disposition === 'DECLARED' &&
          pairTotals
            .get('COMMERCIAL_BANK_RESERVE_ACCOUNTS')!
            .amount.equals(R.amount) &&
          pairTotals
            .get('TREASURY_GOVERNMENT_DEPOSIT')!
            .amount.equals(B.amount),
        'TGA_RESERVE_COMPLETE_SOURCE_REQUIRED',
        cid,
      );
      const sum = (values: readonly Money[]) =>
        values.reduce((a, b) => a.add(b), Money.from('0', lc));
      const netWorth = openingCentralBankNetWorth({
        assets,
        liabilities,
        localCurrency: lc,
        registerCompleteness: 'COMPLETE',
      });
      // Validate D03.5 against the actual emitted bank positions, not totals
      // balanced by a hidden adjustment account.
      requireFinancialInput(
        (
          netPositions.get(roster.bank + '/' + lc)?.money ?? Money.from('0', lc)
        ).amount.equals(E.amount),
        'BANK_OPENING_COMPONENT_CONFLICT',
        cid,
      );
      if (v2) domesticLegs.push(...legs);
      for (const [key, net] of (v2 ? [] : [...netPositions]).sort(([a], [b]) =>
        a < b ? -1 : 1,
      ))
        addLeg(
          'OPENING_NET_WORTH_' + key.replaceAll('/', '_'),
          net.owner,
          'EQUITY',
          net.money,
        );
      for (const currency of v2
        ? []
        : [...new Set(legs.map((x) => x.amount.currency))].sort()) {
        const group = legs
          .filter((l) => l.amount.currency === currency)
          .sort((a, b) => (a.legId < b.legId ? -1 : 1));
        const paired = group.map((l) => {
          const other =
            l.account.claimId === null
              ? group.find((x) => x.direction !== l.direction)
              : group.find(
                  (x) =>
                    x.account.claimId === l.account.claimId &&
                    x.legId !== l.legId,
                );
          requireFinancialInput(
            other &&
              other.direction !== l.direction &&
              (l.account.claimId === null ||
                (other.amount.amount.equals(l.amount.amount) &&
                  other.account.counterpartyEntityId === l.account.ownerId &&
                  l.account.counterpartyEntityId === other.account.ownerId)),
            'RECIPROCAL_OPENING_CLAIM_REQUIRED',
            l.legId,
          );
          return { ...l, counterpartLegId: other.legId };
        });
        batches.push({
          batchId: financialOpeningBatchId(deterministicId('BATCH', currency)),
          sourceId: openingSourceId(contract.sourceId),
          settlementCurrency: currency,
          legs: paired,
        });
      }
      requireFinancialInput(
        v2 ||
          batches.some(
            (b) =>
              b.settlementCurrency === lc &&
              b.legs.every((l) => l.account.countryId === cid),
          ),
        'LOCAL_CURRENCY_BATCH_MISSING',
        cid,
      );
      reconciliations.push({
        countryId: cid,
        valueDate: c.openingFx.valueDate,
        original: original.rawFinance,
        denominations: OPENING_FINANCE_FIELDS.map((field) => ({
          field,
          sourcePointer: original.sourceRowPointer + '/' + field,
          sourceSha256: contract.financeSha256,
          rawLexeme: original.rawFinance[field],
          rawUnit: 'GCU_SCENARIO_ACCOUNTING_UNIT',
          gcuEquivalent: Money.from(
            original.rawFinance[field],
            'GCU',
          ).toCanonicalValue(),
          localBookValue: local(field).toCanonicalValue(),
          fxVersion: c.openingFx.version,
        })),
        bankL: L.toCanonicalValue(),
        bankE: E.toCanonicalValue(),
        bankDeltaL: L.subtract(
          local('bankDepositLiabilities'),
        ).toCanonicalValue(),
        bankDeltaE: E.subtract(local('bankEquity')).toCanonicalValue(),
        cbAssets: sum(assets).toCanonicalValue(),
        cbLiabilities: sum(liabilities).toCanonicalValue(),
        cbNetWorth: netWorth.toCanonicalValue(),
        cbOriginalEquity: sum(originalEquity).toCanonicalValue(),
        cbDeltaEquity: netWorth
          .subtract(sum(originalEquity))
          .toCanonicalValue(),
        runtimeResetAllowed: false,
        isCash: false,
      });
    }
    const crossCbClaimEvidence = v2
      ? composeCrossCbBatches(
          contract,
          adoption,
          domesticLegs,
          reconciliations,
          batches,
        )
      : undefined;
    // Existing Core performs canonical batch/amount checks and real rebuild.
    // Its internal validation seed is explicitly TEST_FIXTURE and discarded;
    // callers receive no branded seed/source they could bootstrap or admit.
    const source = createOpeningSource(
      {
        schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
        sourceId: openingSourceId(contract.sourceId),
        sourceKind: 'TEST_FIXTURE',
        locator: 'UNADOPTED_FINANCIAL_CALCULATION_NOT_IMPORTABLE',
        sourceVersion: contract.sourceVersion,
        payload: { contractFingerprint: fingerprint(contract) },
      },
      financialInputSha256,
    );
    const seed = createOpeningSeed(
      {
        schemaVersion: OPENING_SEED_SCHEMA_VERSION,
        seedId: openingSeedId('SEED_FINANCIAL_VALIDATION_ONLY'),
        worldId: worldId(contract.worldId),
        openingWorldVersion: '0',
        replayBinding: CURRENT_REPLAY_BINDING,
        sources: [source],
        inventoryEntries: [],
        financialBatches: batches,
      },
      financialInputSha256,
    );
    const rehydrated = parseOpeningSeed(
      JSON.parse(canonicalSerialize(seed)) as unknown,
      financialInputSha256,
    );
    rebuildV08LedgersFromLineage({
      seed: rehydrated,
      sha256Hex: financialInputSha256,
    });
    const body = {
      provenance: 'UNADOPTED_FINANCIAL_CALCULATION_NOT_IMPORTABLE' as const,
      contractFingerprint: fingerprint(contract),
      requestedWorldId: contract.worldId,
      financialBatches: rehydrated.financialBatches,
      reconciliations,
      ...(v2 ? { crossCbClaimEvidence: crossCbClaimEvidence! } : {}),
    };
    return finish({ ...body, fingerprint: fingerprint(body) });
  } catch (error) {
    blockers.push({
      code:
        error instanceof FormalFinancialOpeningInvalid
          ? error.code
          : 'EXACT_FINANCIAL_OR_CORE_VALIDATION_FAILED',
      field:
        error instanceof FormalFinancialOpeningInvalid
          ? error.field
          : error instanceof Error
            ? error.message
            : 'financialBatches',
    });
    return finish(null); // No partially assembled country/ledger escapes.
  }
}

/** All source validation is complete before this pure v2 assembly. One native
 * partition is composed globally, then opening net worth is finalized once.
 * LC valuations are audit only: they never become additional native legs.
 */
function composeCrossCbBatches(
  contract: FormalFinancialOpeningContract,
  adoption: OwnerNonHostSourceAdoption,
  legs: FinancialOpeningBatch['legs'][number][],
  reconciliations: readonly FormalFinancialReconciliation[],
  batches: FinancialOpeningBatch[],
) {
  const compareCanonicalText = (a: string, b: string): number =>
    a < b ? -1 : a > b ? 1 : 0;
  const stable = (prefix: string, ...parts: string[]) =>
    prefix +
    '_' +
    financialInputSha256(
      canonicalSerialize([
        'CROSS_CB_V2',
        contract.worldId,
        contract.openingEpoch!,
        contract.sourceId,
        ...parts,
      ]),
    ).toUpperCase();
  const domesticClaims = new Set(
    legs.flatMap((l) =>
      l.account.claimId === null ? [] : [String(l.account.claimId)],
    ),
  );
  const mirrorIndex = new Map<string, FinancialCrossCbMirror[]>();
  for (const c of contract.countries)
    for (const mirror of c.cbRegister.crossCbMirrors!) {
      const values = mirrorIndex.get(mirror.financialClaimId) ?? [];
      values.push(mirror);
      mirrorIndex.set(mirror.financialClaimId, values);
    }
  const evidence = contract.crossCbClaims!.map((claim) => {
    requireFinancialInput(
      !domesticClaims.has(claim.financialClaimId),
      'CROSS_CB_CLAIM_CONFLICT',
      claim.financialClaimId,
    );
    const mirrors = [...(mirrorIndex.get(claim.financialClaimId) ?? [])].sort(
      (a, b) =>
        compareCanonicalText(a.role, b.role) ||
        compareCanonicalText(a.recordOwnerCb, b.recordOwnerCb) ||
        compareCanonicalText(a.holdingId, b.holdingId) ||
        compareCanonicalText(a.source.documentId, b.source.documentId) ||
        compareCanonicalText(a.source.pointer, b.source.pointer),
    );
    requireFinancialInput(
      mirrors.length === 2 &&
        mirrors[0]!.role === 'ASSET' &&
        mirrors[1]!.role === 'LIABILITY',
      'CROSS_CB_MIRROR_COVERAGE_INVALID',
      claim.financialClaimId,
    );
    const pair = (
      [
        [
          'ASSET',
          claim.creditorCountryId,
          claim.creditorEntityId,
          claim.issuerEntityId,
        ],
        [
          'LIABILITY',
          claim.issuerCountryId,
          claim.issuerEntityId,
          claim.creditorEntityId,
        ],
      ] as const
    ).map(([role, cid, owner, other]) => {
      const roster = adoption.manifest.countries.find(
        (c) => c.countryId === cid,
      );
      requireFinancialInput(
        roster?.holderRoster.centralBank === owner,
        'CROSS_CB_ENDPOINT_OR_ROLE_INVALID',
        claim.financialClaimId,
      );
      const identity = [
        claim.financialClaimId,
        cid,
        owner,
        role,
        claim.currency,
      ];
      return {
        legId: financialOpeningLegId(stable('LEG', ...identity)),
        account: createFinancialAccount({
          worldId: worldId(contract.worldId),
          countryId: countryId(cid),
          accountId: financialAccountId(stable('ACCOUNT', ...identity)),
          ownerId: legalEntityId(owner),
          accountClass: role,
          currency: claim.currency,
          claimId: financialClaimId(claim.financialClaimId),
          counterpartyEntityId: legalEntityId(other),
        }),
        direction: role === 'ASSET' ? ('DEBIT' as const) : ('CREDIT' as const),
        amount: Money.from(claim.openingOutstandingAmount, claim.currency),
        counterpartLegId: financialOpeningLegId('PENDING_COUNTERPART'),
      };
    });
    requireFinancialInput(
      pair[0]!.account.countryId !== pair[1]!.account.countryId &&
        pair[0]!.account.claimId === pair[1]!.account.claimId &&
        pair[0]!.account.counterpartyEntityId === pair[1]!.account.ownerId &&
        pair[1]!.account.counterpartyEntityId === pair[0]!.account.ownerId &&
        pair[0]!.amount.amount.equals(pair[1]!.amount.amount),
      'RECIPROCAL_OPENING_CLAIM_REQUIRED',
      claim.financialClaimId,
    );
    legs.push(...pair);
    return {
      financialClaimId: claim.financialClaimId,
      canonicalSource: claim.source,
      mirrors,
    };
  });
  const net = new Map<string, { cid: string; owner: string; money: Money }>();
  for (const leg of legs) {
    const cid = String(leg.account.countryId),
      owner = String(leg.account.ownerId),
      currency = leg.amount.currency;
    const key = canonicalSerialize([cid, owner, currency]);
    const prior = net.get(key)?.money ?? Money.from('0', currency);
    net.set(key, {
      cid,
      owner,
      money:
        leg.account.accountClass === 'ASSET'
          ? prior.add(leg.amount)
          : prior.subtract(leg.amount),
    });
  }
  // CB book A-L must equal the complete emitted native net worth valued once
  // with that same country's explicitly sourced per-native quote.
  for (const c of contract.countries) {
    const owner = adoption.manifest.countries.find(
      (x) => x.countryId === c.countryId,
    )!.holderRoster.centralBank;
    const rates = new Map<string, string>([
      [c.localCurrency, '1'],
      ['GCU', c.openingFx.localCurrencyPerGcu],
    ]);
    for (const h of c.cbRegister.holdings)
      rates.set(h.currency, h.localCurrencyPerUnit);
    for (const m of c.cbRegister.crossCbMirrors!)
      rates.set(m.claim.currency, m.valuation.localCurrencyPerUnit);
    let book = Money.from('0', c.localCurrency);
    for (const partition of net.values())
      if (partition.cid === c.countryId && partition.owner === owner) {
        const rate = rates.get(partition.money.currency);
        requireFinancialInput(
          rate !== undefined,
          'CROSS_CB_VALUATION_INVALID',
          c.countryId,
        );
        book = book.add(
          openingBookMoney({
            rawAmount: partition.money.toCanonicalValue().amount,
            denomination: 'GCU_EQUIVALENT',
            localCurrency: c.localCurrency,
            localCurrencyPerGcu: rate,
          }),
        );
      }
    requireFinancialInput(
      book.toCanonicalValue().amount ===
        reconciliations.find((x) => x.countryId === c.countryId)!.cbNetWorth
          .amount,
      'CROSS_CB_NATIVE_EQUITY_BOOK_MISMATCH',
      c.countryId,
    );
  }
  for (const [, partition] of [...net].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (partition.money.amount.isZero()) continue;
    const identity = [
      'OPENING_NET_WORTH',
      partition.cid,
      partition.owner,
      partition.money.currency,
    ];
    legs.push({
      legId: financialOpeningLegId(stable('LEG_EQUITY', ...identity)),
      account: createFinancialAccount({
        worldId: worldId(contract.worldId),
        countryId: countryId(partition.cid),
        accountId: financialAccountId(stable('ACCOUNT_EQUITY', ...identity)),
        ownerId: legalEntityId(partition.owner),
        accountClass: 'EQUITY',
        currency: partition.money.currency,
        claimId: null,
        counterpartyEntityId: null,
      }),
      direction: partition.money.amount.isNegative() ? 'DEBIT' : 'CREDIT',
      amount: Money.from(
        canonicalDecimal(partition.money.amount.abs()),
        partition.money.currency,
      ),
      counterpartLegId: financialOpeningLegId('PENDING_COUNTERPART'),
    });
  }
  requireFinancialInput(
    new Set(legs.map((l) => l.legId)).size === legs.length &&
      new Set(legs.map((l) => l.account.accountId)).size === legs.length,
    'DUPLICATE_FINANCIAL_IMPLEMENTATION_ID',
    'legs',
  );
  for (const currency of [
    ...new Set(legs.map((l) => l.amount.currency)),
  ].sort()) {
    const group = legs
      .filter((l) => l.amount.currency === currency)
      .sort((a, b) => (a.legId < b.legId ? -1 : 1));
    const claims = new Map<string, FinancialOpeningBatch['legs'][number][]>();
    for (const leg of group)
      if (leg.account.claimId !== null) {
        const values = claims.get(leg.account.claimId) ?? [];
        values.push(leg);
        claims.set(leg.account.claimId, values);
      }
    const firstDebit = group.find((l) => l.direction === 'DEBIT');
    const firstCredit = group.find((l) => l.direction === 'CREDIT');
    const paired = group.map((leg) => {
      const others =
        leg.account.claimId === null ? [] : claims.get(leg.account.claimId)!;
      const other =
        leg.account.claimId === null
          ? leg.direction === 'DEBIT'
            ? firstCredit
            : firstDebit
          : others.find((l) => l.legId !== leg.legId);
      requireFinancialInput(
        other &&
          other.direction !== leg.direction &&
          (leg.account.claimId === null ||
            (others.length === 2 &&
              other.amount.amount.equals(leg.amount.amount) &&
              other.account.counterpartyEntityId === leg.account.ownerId &&
              leg.account.counterpartyEntityId === other.account.ownerId)),
        'RECIPROCAL_OPENING_CLAIM_REQUIRED',
        leg.legId,
      );
      return { ...leg, counterpartLegId: other.legId };
    });
    batches.push({
      batchId: financialOpeningBatchId(stable('BATCH', currency)),
      sourceId: openingSourceId(contract.sourceId),
      settlementCurrency: currency,
      legs: paired,
    });
  }
  requireFinancialInput(
    new Set(batches.map((b) => b.batchId)).size === batches.length,
    'DUPLICATE_FINANCIAL_IMPLEMENTATION_ID',
    'batches',
  );
  return evidence;
}
