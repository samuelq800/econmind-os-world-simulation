/** Real selected-source financial preparation. New World only; no SQL, signer,
 * grants, runtime cash creation, historical reset or production admission. */
import {
  canonicalSerialize,
  canonicalDecimal,
  CURRENT_REPLAY_BINDING,
  Money,
  parseOpeningSeed,
  rebuildV08LedgersFromLineage,
  createInventoryAccount,
  countryId,
  worldId,
  commodityId,
  inventoryBatchId,
  inventoryLocationId,
  type OpeningSeed,
} from '@econmind/core';
import {
  CENTRAL_BANK_OPENING_CATEGORIES,
  isOwnerNonHostSourceAdoption,
  loadFinancialSupplementAdoption,
  type OwnerNonHostSourceAdoption,
  type FinancialSupplementAdoption,
  type FinancialSupplementRegistration,
} from './owner-non-host-source-adoption.js';
import {
  parseFormalFinancialOpeningContract,
  financialInputSha256,
  freezeFinancialInput,
  type FinancialCountryInput,
  type FinancialCbHolding,
  type FormalFinancialOpeningContract,
  type FinancialSourceReference,
} from './formal-financial-opening-contract.js';
import {
  produceFormalFinancialOpening,
  type FormalFinancialCandidate,
} from './formal-financial-opening-producer.js';
import {
  openingV2AssemblyIntentFingerprint,
  prepareFinancialSupplementOpeningSeed,
  type OpeningCanonicalSeedAssemblyV2,
} from './opening-canonical-seed-bridge.js';
import {
  consumePostwarMonetaryGenesis,
  postwarLocalBookValue,
  type PostwarMonetaryGenesis,
} from './postwar-monetary-genesis.js';

const sha = financialInputSha256;
const receiptReference = 'Sentinel_a619bdbe25588191aa05709db76c7567';
const authorizedAt = '2026-10-28T14:27:54.000Z';
const instruction =
  '保留现有国情与资源差异，补建工资、学生和医疗需求、住房与警务的开局规则，校验人口、资金和容量后再采用。';
const recordId = 'POSTWAR_FINANCIAL_GENESIS_20261028_V1';
export interface PostwarLiquidFundingAccount {
  readonly kind:
    'TREASURY_TGA' | 'OPERATOR_BANK_DEPOSIT' | 'HOUSEHOLD_BANK_DEPOSIT';
  readonly countryId: string;
  readonly accountId: string;
  readonly claimId: string;
  readonly issuerEntityId: string;
  readonly counterpartAccountId: string;
  readonly ownerId: string;
  readonly currency: string;
  readonly availableAmount: string;
  readonly sourceId: string;
}
/** Recognizes only exact original producer TGA/deposit claims, with both sides
 * present in the same source/batch and matching canonical issuer and value.
 * It never treats arbitrary ASSET classes, reserve claims or bank loans as cash. */
export function readPostwarLiquidFundingAccountsFromSeed(
  input: unknown,
): readonly PostwarLiquidFundingAccount[] {
  const seed = parseOpeningSeed(JSON.parse(canonicalSerialize(input)), sha);
  const ledger = rebuildV08LedgersFromLineage({ seed, sha256Hex: sha });
  const bindings: PostwarLiquidFundingAccount[] = [];
  for (const source of seed.sources) {
    const payload = JSON.parse(source.canonicalPayload) as Record<
      string,
      unknown
    > | null;
    if (payload?.schemaVersion !== 'adopted-financial-opening-source-v2')
      continue;
    if (source.sourceKind !== 'AUTHORITATIVE_DATASET')
      throw Error('POSTWAR_LIQUID_SOURCE_KIND_INVALID');
    const assembly = payload.assembly as OpeningCanonicalSeedAssemblyV2;
    const reconciliations = payload.reconciliations as readonly Readonly<{
      countryId: string;
      denominations: readonly Readonly<{
        field: string;
        localBookValue: { amount: string; currency: string };
      }>[];
    }>[];
    if (
      !assembly ||
      assembly.worldId !== seed.worldId ||
      !Array.isArray(assembly.countries) ||
      !Array.isArray(reconciliations)
    )
      throw Error('POSTWAR_LIQUID_SOURCE_ASSEMBLY_REQUIRED');
    for (const country of assembly.countries) {
      const reconciliation = reconciliations.find(
        (r) => r.countryId === country.countryId,
      );
      if (!reconciliation) throw Error('POSTWAR_LIQUID_SOURCE_VALUE_REQUIRED');
      for (const [kind, key, field, owner, issuer] of [
        [
          'TREASURY_TGA',
          'TGA',
          'treasuryCentralBankBalance',
          country.roster.government,
          country.roster.centralBank,
        ],
        [
          'OPERATOR_BANK_DEPOSIT',
          'BUSINESS_DEPOSIT',
          'businessBankDeposits',
          country.roster.operator,
          country.roster.bank,
        ],
        [
          'HOUSEHOLD_BANK_DEPOSIT',
          'HOUSEHOLD_DEPOSIT',
          'householdBankDeposits',
          country.roster.households,
          country.roster.bank,
        ],
      ] as const) {
        const expected = reconciliation.denominations.find(
          (
            d: Readonly<{
              field: string;
              localBookValue: Readonly<{ amount: string; currency: string }>;
            }>,
          ) => d.field === field,
        )?.localBookValue;
        if (!expected) throw Error('POSTWAR_LIQUID_SOURCE_VALUE_REQUIRED');
        const amount = Money.from(expected.amount, expected.currency);
        if (amount.amount.isZero()) continue;
        if (amount.amount.isNegative())
          throw Error('POSTWAR_LIQUID_SOURCE_VALUE_INVALID');
        const identity = (prefix: string, suffix: string) =>
          `${prefix}_${sha(canonicalSerialize([seed.worldId, country.countryId, suffix, expected.currency])).toUpperCase()}`;
        const accountId = identity('ACCOUNT', key + '_ASSET'),
          claimId = identity('CLAIM', key),
          counterpartAccountId = identity('ACCOUNT', key + '_LIABILITY');
        const asset = ledger.financial.positions.find(
          (p) => p.account.accountId === accountId,
        );
        const liability = ledger.financial.positions.find(
          (p) => p.account.accountId === counterpartAccountId,
        );
        const batches = seed.financialBatches.filter(
          (b) =>
            b.sourceId === source.sourceId &&
            b.legs.some((l) => l.account.accountId === accountId),
        );
        if (
          batches.length !== 1 ||
          !asset ||
          !liability ||
          asset.account.accountClass !== 'ASSET' ||
          liability.account.accountClass !== 'LIABILITY' ||
          asset.account.ownerId !== owner ||
          liability.account.ownerId !== issuer ||
          asset.account.countryId !== country.countryId ||
          liability.account.countryId !== country.countryId ||
          asset.account.claimId !== claimId ||
          liability.account.claimId !== claimId ||
          asset.account.counterpartyEntityId !== issuer ||
          liability.account.counterpartyEntityId !== owner ||
          asset.account.currency !== expected.currency ||
          liability.account.currency !== expected.currency ||
          !asset.netDebitBalance.amount.equals(amount.amount) ||
          !liability.netDebitBalance.amount.equals(amount.amount.negated())
        )
          throw Error('POSTWAR_LIQUID_EXACT_CLAIM_MIRROR_REQUIRED');
        const a = batches[0]!.legs.find(
            (l) => l.account.accountId === accountId,
          ),
          l = batches[0]!.legs.find(
            (l) => l.account.accountId === counterpartAccountId,
          );
        if (
          !a ||
          !l ||
          a.counterpartLegId !== l.legId ||
          l.counterpartLegId !== a.legId ||
          a.direction !== 'DEBIT' ||
          l.direction !== 'CREDIT' ||
          !a.amount.amount.equals(amount.amount) ||
          !l.amount.amount.equals(amount.amount)
        )
          throw Error('POSTWAR_LIQUID_EXACT_CLAIM_MIRROR_REQUIRED');
        bindings.push({
          kind,
          countryId: country.countryId,
          accountId,
          claimId,
          issuerEntityId: issuer,
          counterpartAccountId,
          ownerId: owner,
          currency: expected.currency,
          availableAmount: canonicalDecimal(amount.amount),
          sourceId: source.sourceId,
        });
      }
    }
  }
  if (new Set(bindings.map((b) => b.accountId)).size !== bindings.length)
    throw Error('POSTWAR_LIQUID_DUPLICATE_BINDING');
  return freezeFinancialInput(bindings);
}
export interface PostwarFinancialGenesis {
  readonly schemaVersion: 'postwar-financial-genesis-v1';
  readonly contract: FormalFinancialOpeningContract;
  readonly candidate: FormalFinancialCandidate;
  readonly assembly: OpeningCanonicalSeedAssemblyV2;
  readonly proof: FinancialSupplementAdoption;
  readonly baselineSeed: OpeningSeed;
  readonly registration: FinancialSupplementRegistration;
  readonly receiptBytes: string;
  readonly instructionBytes: string;
  readonly policyBytes: string;
  readonly fundingAccounts: readonly PostwarLiquidFundingAccount[];
  readonly admissionAllowed: false;
  readonly activationAllowed: false;
}

export function createPostwarFinancialGenesis(input: {
  readonly adoption: OwnerNonHostSourceAdoption;
  readonly monetary: PostwarMonetaryGenesis;
  readonly worldId: string;
  readonly seedId: string;
  readonly sourceId: string;
  readonly genesisVersion: string;
}): PostwarFinancialGenesis {
  const { adoption, monetary } = input;
  if (
    !isOwnerNonHostSourceAdoption(adoption) ||
    adoption.scope.environment !== 'NON_ACTIVATED_PREPARATION'
  )
    throw Error('POSTWAR_REAL_OWNER_SOURCE_ADOPTION_REQUIRED');
  consumePostwarMonetaryGenesis(monetary);
  worldId(input.worldId);
  if (!/^[A-Z][A-Z0-9_]{0,127}$/u.test(input.genesisVersion))
    throw Error('POSTWAR_GENESIS_VERSION_INVALID');
  const sourceVersion = input.genesisVersion;
  const valueDate = monetary.bindings[0]?.valueDate;
  if (
    !valueDate ||
    monetary.bindings.length !== 70 ||
    monetary.bindings.some((b) => b.valueDate !== valueDate)
  )
    throw Error('POSTWAR_EXACT_COMMON_VALUE_DATE_REQUIRED');
  const originals = adoption.source.financeOriginals;
  if (originals.length !== 70)
    throw Error('POSTWAR_FULL_SOURCE_FINANCE_REQUIRED');
  for (const original of originals) {
    if (
      !Array.isArray(original.existingContracts) ||
      original.existingContracts.length !== 0 ||
      !Array.isArray(original.historicalClaims) ||
      original.historicalClaims.length !== 0 ||
      original.publicDebt !== '0' ||
      original.bankLoanAssets !== '0'
    )
      throw Error('POSTWAR_EXISTING_DEBT_OR_CLAIMS_NEEDS_SOURCE_DRIVER');
  }
  const authorization = {
    reference: receiptReference,
    receivedAtReal: authorizedAt,
    instruction,
  };
  const policy = {
    schemaVersion: 'postwar-financial-instrument-policy-v1',
    provenanceKind: 'GENERATED_POLICY',
    version: sourceVersion,
    authorization,
    scope: 'NEW_WORLD_ONLY',
    sourcePins: adoption.ownerPolicy.sourcePins,
    monetaryPolicy: monetary.policy,
    monetaryPolicySHA256: monetary.policySHA256,
    unchangedSourceGcu: true,
    instrumentScope: 'SOURCE_TGA_AND_BANK_RESERVES_EXACT_CLAIMS_ONLY',
    absentInstrumentMeaning:
      'EXPLICIT_NEW_SCENARIO_NO_DECLARED_INSTRUMENT_NOT_OBSERVED_ZERO',
    absenceBasis:
      'ALL_70_PINNED_FINANCE_ROWS_EXPLICIT_EMPTY_EXISTING_CONTRACTS_AND_HISTORICAL_CLAIMS_AND_ZERO_PUBLIC_DEBT_AND_BANK_LOANS',
    reservedAccountNamesCreateHoldings: false,
    centralBankNetWorthRule:
      'EXISTING_D02_OPENING_ONCE_ASSETS_MINUS_LIABILITIES_NEGATIVE_ALLOWED',
    centralBankBalancingAssets: false,
    automaticRecapitalization: false,
    sourceEquitySubcomponents:
      'NOT_INVENTED_NO_DECLARED_HISTORICAL_CAPITAL_EARNINGS_OR_LOSSES',
    runningReset: false,
    newCash: false,
  };
  const policyBytes = canonicalSerialize(policy),
    policySha256 = sha(policyBytes);
  const rows: unknown[] = [];
  const ref = (value: unknown): FinancialSourceReference => {
    rows.push(value);
    return {
      documentId: 'POSTWAR_FINANCIAL_REGISTER',
      pointer: `/rows/${rows.length - 1}`,
    };
  };
  const openingEpoch = input.genesisVersion;
  const paramsHash = sha(
    canonicalSerialize({
      sourcePins: adoption.ownerPolicy.sourcePins,
      monetaryBindings: monetary.bindings,
      worldId: input.worldId,
      openingEpoch,
    }),
  );
  const origin = {
    sourceClass: 'CONSTRUCTED_SCENARIO' as const,
    version: sourceVersion,
    rulesHash: policySha256,
    paramsHash,
  };
  const originSource = ref({ ...origin, openingEpoch, valueDate });
  const fxDocuments: FormalFinancialOpeningContract['documents'][number][] = [];
  const countryInputs: FinancialCountryInput[] =
    adoption.manifest.countries.map((country) => {
      const binding = monetary.bindings.find(
        (b) => b.countryId === country.countryId,
      );
      if (!binding) throw Error('POSTWAR_MONETARY_COUNTRY_MISSING');
      const fxDocumentId = `POSTWAR_FX_${country.countryId}`;
      const quote = {
        countryId: country.countryId,
        localCurrency: binding.localCurrency,
        localCurrencyPerGcu: binding.localCurrencyPerGcu,
        version: binding.fxVersion,
        valueDate: binding.valueDate,
      };
      const bytes = canonicalSerialize({
        provenanceKind: binding.classification,
        quote,
        sourceReferences: binding.sourceReferences,
        policySHA256: monetary.policySHA256,
      });
      fxDocuments.push({
        documentId: fxDocumentId,
        sourcePath: `incoming/financial/documents/${fxDocumentId}.json`,
        sha256: sha(bytes),
        bytes,
        version: binding.fxVersion,
        valueDate,
      });
      const holdings: FinancialCbHolding[] = [];
      for (const [category, field, holder] of [
        [
          'COMMERCIAL_BANK_RESERVE_ACCOUNTS',
          'bankReserveAssets',
          country.holderRoster.bank,
        ],
        [
          'TREASURY_GOVERNMENT_DEPOSIT',
          'treasuryCentralBankBalance',
          country.holderRoster.treasury,
        ],
      ] as const) {
        const amount = postwarLocalBookValue(
          binding,
          country.rawFinance[field],
        );
        const body = {
          holdingId: `POSTWAR_${country.countryId}_${category}`,
          category,
          kind: 'CLAIM' as const,
          amount: amount.amount,
          currency: binding.localCurrency,
          localCurrencyPerUnit: '1',
          holderId: country.holderRoster.centralBank,
          counterpartyId: holder,
          usableStatus: 'EXACT_SOURCE_CLAIM_NOT_ADDITIONAL_CASH',
        };
        holdings.push({
          ...body,
          source: ref({ countryId: country.countryId, valueDate, ...body }),
        });
      }
      holdings.sort((a, b) => (a.holdingId < b.holdingId ? -1 : 1));
      const categories = CENTRAL_BANK_OPENING_CATEGORIES.map(([category]) => {
        const disposition = holdings.some((h) => h.category === category)
          ? ('DECLARED' as const)
          : ('NO_DECLARED_INSTRUMENT' as const);
        return {
          category,
          disposition,
          source: ref({ countryId: country.countryId, category, disposition }),
        };
      }).sort((a, b) => (a.category < b.category ? -1 : 1));
      const source = ref({
        countryId: country.countryId,
        version: sourceVersion,
        valueDate,
        categories: categories.map(({ category, disposition }) => ({
          category,
          disposition,
        })),
        holdingIds: holdings.map((h) => h.holdingId),
        crossCbHoldingIds: [],
      });
      return {
        countryId: country.countryId,
        localCurrency: binding.localCurrency,
        openingFx: {
          localCurrencyPerGcu: binding.localCurrencyPerGcu,
          version: binding.fxVersion,
          valueDate,
          source: { documentId: fxDocumentId, pointer: '/quote' },
        },
        cbRegister: {
          version: sourceVersion,
          valueDate,
          source,
          categories,
          holdings,
          crossCbMirrors: [],
        },
        bankLoans: [],
      };
    });
  const registerBytes = canonicalSerialize({
    schemaVersion: 'postwar-generated-financial-register-v1',
    provenanceKind: 'GENERATED_POLICY',
    authorization,
    policySha256,
    completeness: {
      countryIds: countryInputs.map((c) => c.countryId),
      categoryCount: '21',
      cbRegisterComplete: true,
      valueDate,
    },
    sourceFinanceOriginals: originals,
    monetaryBindings: monetary.bindings,
    rows,
    noDeclaredInstrumentIsNotObservedZero: true,
  });
  const documents = [
    {
      documentId: 'POSTWAR_FINANCIAL_POLICY',
      sourcePath: 'incoming/financial/documents/POSTWAR_FINANCIAL_POLICY.json',
      sha256: policySha256,
      bytes: policyBytes,
      version: sourceVersion,
      valueDate,
    },
    {
      documentId: 'POSTWAR_FINANCIAL_REGISTER',
      sourcePath:
        'incoming/financial/documents/POSTWAR_FINANCIAL_REGISTER.json',
      sha256: sha(registerBytes),
      bytes: registerBytes,
      version: sourceVersion,
      valueDate,
    },
    ...fxDocuments,
  ];
  const contract = parseFormalFinancialOpeningContract(
    {
      schemaVersion: 'formal-financial-opening-input-v2',
      evidenceKind: 'SOURCE_CANDIDATE',
      worldId: input.worldId,
      sourceId: input.sourceId,
      sourceVersion,
      valueDate,
      ownerReceiptSha256: adoption.ownerPolicy.receiptSha256,
      adoptionManifestFingerprint: adoption.manifestFingerprint,
      financeSha256: adoption.trustedSource.financeSha256,
      documents,
      countries: countryInputs,
      openingEpoch,
      scenarioOrigin: { ...origin, source: originSource },
      crossCbClaims: [],
    },
    adoption,
  );
  const produced = produceFormalFinancialOpening({ adoption, contract });
  const expected = new Set([
    'SUPPLEMENTAL_FINANCIAL_SOURCE_ADOPTION_UNRESOLVED',
    'FORMAL_WORLD_BINDING_UNRESOLVED',
  ]);
  if (
    !produced.candidate ||
    produced.blockers.some((b) => !expected.has(b.code)) ||
    produced.blockers.length !== 2
  )
    throw Error(
      'POSTWAR_ORIGINAL_FINANCIAL_PRODUCER_REJECTED:' +
        canonicalSerialize(produced.blockers),
    );
  const candidate = produced.candidate;
  const assembly: OpeningCanonicalSeedAssemblyV2 = {
    schemaVersion: 'opening-canonical-seed-assembly-v2',
    worldId: input.worldId,
    seedId: input.seedId,
    sourceId: input.sourceId,
    adoptionRecordId: recordId,
    parentReceiptSha256: adoption.ownerPolicy.receiptSha256,
    adoptionManifestFingerprint: adoption.manifestFingerprint,
    contractFingerprint: candidate.contractFingerprint,
    candidateFingerprint: candidate.fingerprint,
    replayBinding: CURRENT_REPLAY_BINDING,
    orchestratorVersion: sourceVersion,
    countries: adoption.manifest.countries.map((country) => ({
      countryId: country.countryId,
      adoptionRef: recordId,
      roster: {
        operator: country.holderRoster.operator,
        government: country.holderRoster.treasury,
        households: country.holderRoster.households,
        bank: country.holderRoster.bank,
        centralBank: country.holderRoster.centralBank,
      },
      inventoryEntries: adoption.manifest.stockRights
        .filter(
          (stock) => stock.countryId === country.countryId && stock.positive,
        )
        .map((stock) => ({
          entryId: stock.inventoryEntryId,
          account: createInventoryAccount({
            worldId: worldId(input.worldId),
            countryId: countryId(stock.countryId),
            commodityId: commodityId(stock.commodityId),
            batchId: inventoryBatchId(stock.batchId),
            physicalLocationId: inventoryLocationId(stock.locationId),
            unit: stock.unit,
            bucket: 'AVAILABLE',
            reservationId: null,
            shipmentId: null,
            titleHolderId: stock.titleHolderId,
            riskBearerId: stock.riskBearerId,
            economicRecognitionId: null,
          }),
          quantity: { amount: stock.available, unit: stock.unit },
        })),
      financialBatches: candidate.financialBatches.filter((batch) =>
        batch.legs.every((leg) => leg.account.countryId === country.countryId),
      ),
    })),
  };
  const assemblyIntentFingerprint =
    openingV2AssemblyIntentFingerprint(assembly);
  const instructionBytes = canonicalSerialize({
    schemaVersion: 'postwar-financial-genesis-user-instruction-v1',
    ...authorization,
    sourcePins: adoption.ownerPolicy.sourcePins,
    policySha256,
    registerSha256: sha(registerBytes),
    monetaryPolicySha256: monetary.policySHA256,
    contractFingerprint: candidate.contractFingerprint,
    candidateFingerprint: candidate.fingerprint,
    assemblyIntentFingerprint,
  });
  const record = {
    schemaVersion: 'financial-supplement-adoption-v1',
    recordId,
    purpose: 'ADOPT_FINANCIAL_SUPPLEMENT_FOR_NON_ACTIVATED_PREPARATION',
    ownerIdentity: `CURRENT_PROJECT_USER:${receiptReference}`,
    adoptedAtReal: authorizedAt,
    ownerInstructionSha256: sha(instructionBytes),
    parentReceiptSha256: adoption.ownerPolicy.receiptSha256,
    sourcePins: adoption.ownerPolicy.sourcePins,
    adoptionManifestFingerprint: adoption.manifestFingerprint,
    contractFingerprint: candidate.contractFingerprint,
    candidateFingerprint: candidate.fingerprint,
    assemblyIntentFingerprint,
    worldId: input.worldId,
    seedId: input.seedId,
    sourceId: input.sourceId,
    sourceVersion,
    valueDate,
    replayBinding: CURRENT_REPLAY_BINDING,
    orchestratorVersion: sourceVersion,
    documents: contract.documents.map((d) => ({
      documentId: d.documentId,
      sourcePath: d.sourcePath,
      sha256: d.sha256,
      bytes: String(Buffer.byteLength(d.bytes, 'utf8')),
      version: d.version,
      valueDate: d.valueDate,
    })),
    completeness: {
      documentId: 'POSTWAR_FINANCIAL_REGISTER',
      pointer: '/completeness',
    },
    exclusions: [
      'HOST_STARTUP',
      'SQL_SCHEMA_GRANTS',
      'IDENTITY_SEATS_NPC',
      'RUNTIME_ADMISSION',
      'RUNTIME_NET_WORTH_RESET',
      'WHOLE_LEGACY_E_PROPOSAL',
    ],
  };
  const receiptBytes = canonicalSerialize(record);
  const registration: FinancialSupplementRegistration = {
    recordId,
    ownerIdentity: record.ownerIdentity,
    expectedReceiptSha256: sha(receiptBytes),
    expectedInstructionSha256: sha(instructionBytes),
    retainedReference: `chat:${receiptReference}:sha256:${sha(receiptBytes)}`,
    channel: 'DIRECT_USER_MESSAGE_IN_CURRENT_ROOT_CHAT',
  };
  const proof = loadFinancialSupplementAdoption({
    registration,
    receiptBytes,
    instructionBytes,
    parent: adoption,
    contract,
    candidate,
    assemblyIntentFingerprint,
    seedId: input.seedId,
    orchestratorVersion: sourceVersion,
  });
  const baselineSeed = prepareFinancialSupplementOpeningSeed({
    assembly,
    proof,
    candidate,
  });
  const fundingAccounts =
    readPostwarLiquidFundingAccountsFromSeed(baselineSeed);
  if (fundingAccounts.length !== 210)
    throw Error('POSTWAR_70_COUNTRY_LIQUID_SOURCE_COVERAGE_REQUIRED');
  return freezeFinancialInput({
    schemaVersion: 'postwar-financial-genesis-v1',
    contract,
    candidate,
    assembly,
    proof,
    baselineSeed,
    registration,
    receiptBytes,
    instructionBytes,
    policyBytes,
    fundingAccounts,
    admissionAllowed: false,
    activationAllowed: false,
  });
}
