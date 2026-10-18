/** No adoption issuer is installed. The explicit mechanism helper cannot enter actual composition. */
import { canonicalSerialize } from '@econmind/core';
import {
  parseFormalFinancialOpeningContract,
  isParsedFormalFinancialOpeningContract,
  type FormalFinancialOpeningContract,
  type FinancialSourceDocument,
  type FinancialSourceReference,
  type FinancialCrossCbClaim,
  type FinancialCrossCbClaimBody,
  type FinancialCrossCbMirror,
} from './formal-financial-opening-contract.js';
import {
  produceFormalFinancialOpening,
  type FormalFinancialOpeningResult,
} from './formal-financial-opening-producer.js';
import { type OwnerNonHostSourceAdoption } from './owner-non-host-source-adoption.js';
import {
  isClaimScenarioSourceCandidate,
  type ClaimScenarioSourceCandidate,
} from './claim-scenario-source-producer.js';
import {
  claimSourceHash,
  freezeClaimSource,
  requireClaimSource,
} from './claim-scenario-source-contract.js';

export interface ClaimActualCompositionResult {
  readonly status: 'BLOCKED';
  readonly reason: 'APPROVAL_EVIDENCE_UNAVAILABLE';
  readonly source: null;
  readonly replacementContract: null;
  readonly sourceAdopted: false;
  readonly actualAdoptionMatched: false;
  readonly formalPaymentAllowed: false;
  readonly actualSettlement: false;
}
/** There is no real same-scope adoption record or trusted provisioning in this slice.
 * Ignore ALL caller input, including Proxy/getters/callbacks and alleged evidence.
 * A future genuine evidence integration is a separately reviewed seam, not a flag. */
export function composeClaimScenarioSource(
  ..._untrusted: readonly unknown[]
): ClaimActualCompositionResult {
  void _untrusted;
  return Object.freeze({
    status: 'BLOCKED',
    reason: 'APPROVAL_EVIDENCE_UNAVAILABLE',
    source: null,
    replacementContract: null,
    sourceAdopted: false,
    actualAdoptionMatched: false,
    formalPaymentAllowed: false,
    actualSettlement: false,
  });
}
export interface ClaimScenarioMechanismResult {
  readonly classification: 'TEST_ONLY_MECHANISM_NOT_ADOPTION';
  readonly actualAdoptionMatched: false;
  readonly formalPaymentAllowed: false;
  readonly Fcash: null;
  readonly contract: FormalFinancialOpeningContract;
  readonly calculation: FormalFinancialOpeningResult;
}
/** Enrich an already parsed complete baseline for TEST_ONLY non-admitted calculation.
 * The genuine Owner object supplies existing baseline rules, NEVER the new terms/title.
 * No injectable callbacks, database, account creator, private authority or writer. */
export function calculateClaimScenarioSourceMechanism(
  input: Readonly<{
    classification: 'TEST_ONLY_MECHANISM_NOT_ADOPTION';
    source: ClaimScenarioSourceCandidate;
    baseline: FormalFinancialOpeningContract;
    baselineRuleAdoption: OwnerNonHostSourceAdoption;
  }>,
): ClaimScenarioMechanismResult {
  requireClaimSource(
    input.classification === 'TEST_ONLY_MECHANISM_NOT_ADOPTION' &&
      isClaimScenarioSourceCandidate(input.source) &&
      input.source.status === 'COMPLETE_SOURCE_CANDIDATE' &&
      isParsedFormalFinancialOpeningContract(input.baseline) &&
      input.baseline.schemaVersion === 'formal-financial-opening-input-v1' &&
      input.baseline.evidenceKind === 'MECHANISM_TEST_VECTOR',
    'MECHANISM_INPUT_REQUIRED',
  );
  const source = input.source,
    opening = source.draft.input.inactiveOpening!;
  requireClaimSource(
    opening.worldId === input.baseline.worldId &&
      opening.valueDate === input.baseline.valueDate,
    'OPENING_BASELINE_MISMATCH',
  );
  const versions = new Map<string, { id: string; rows: unknown[] }>();
  const occupied = new Set(input.baseline.documents.map((d) => d.documentId));
  function reference(version: string, body: unknown): FinancialSourceReference {
    let doc = versions.get(version);
    if (!doc) {
      const id =
        'G_SCENARIO_' +
        claimSourceHash(canonicalSerialize([source.sourceHash, version]))
          .slice(0, 32)
          .toUpperCase();
      requireClaimSource(!occupied.has(id), 'SOURCE_DOCUMENT_ID_CONFLICT');
      occupied.add(id);
      doc = { id, rows: [] };
      versions.set(version, doc);
    }
    doc.rows.push(body);
    return { documentId: doc.id, pointer: '/' + (doc.rows.length - 1) };
  }
  const version = source.draft.input.sourceVersion;
  const originBody = {
    sourceClass: 'MECHANISM_TEST_VECTOR' as const,
    version,
    rulesHash: source.lifecycleHash,
    paramsHash: source.sourceHash,
    openingEpoch: opening.openingEpoch,
    valueDate: opening.valueDate,
  };
  const origin = {
    sourceClass: originBody.sourceClass,
    version,
    rulesHash: originBody.rulesHash,
    paramsHash: originBody.paramsHash,
    source: reference(version, originBody),
  };
  // Retain the full lifecycle/legal declarations, not merely their hashes.
  reference(version, {
    classification: 'TEST_ONLY_MECHANISM_NOT_ADOPTION',
    sourceBytes: source.sourceBytes,
    sourceHash: source.sourceHash,
    legalRoleHash: source.legalRoleHash,
  });
  const claims: FinancialCrossCbClaim[] = source.draft.input.claims.map((c) => {
    const body: FinancialCrossCbClaimBody = {
      financialClaimId: c.financialClaimId!,
      instrumentCode: c.instrumentCode!,
      assetCategory: 'OTHER_CENTRAL_BANK_ASSETS',
      liabilityCategory: 'OTHER_CENTRAL_BANK_LIABILITIES',
      creditorCountryId: 'COUNTRY_' + c.legalHolder.entityId.slice(-2),
      creditorEntityId: c.legalHolder.entityId,
      issuerCountryId: 'COUNTRY_' + c.legalIssuer.entityId.slice(-2),
      issuerEntityId: c.legalIssuer.entityId,
      openingOutstandingAmount: c.principal,
      currency: c.currency,
      openingEpoch: opening.openingEpoch,
      valueDate: opening.valueDate,
      expiryDate: null,
    };
    return {
      ...body,
      source: reference(version, {
        ...body,
        sourceClass: origin.sourceClass,
        rulesHash: origin.rulesHash,
        paramsHash: origin.paramsHash,
      }),
    };
  });
  const countries = input.baseline.countries.map((country) => {
    const mirrors: FinancialCrossCbMirror[] = [];
    for (const [i, c] of source.draft.input.claims.entries()) {
      const canonical = claims[i]!;
      const { source: claimSource, ...body } = canonical;
      void claimSource;
      for (const m of c.mirrors.filter(
        (m) =>
          m.ownerId === `ENTITY_CENTRAL_BANK_${country.countryId.slice(-2)}`,
      )) {
        const category =
          m.role === 'ASSET'
            ? canonical.assetCategory
            : canonical.liabilityCategory;
        const valuation = {
          nativeCurrency: c.currency,
          bookCurrency: country.localCurrency,
          localCurrencyPerUnit: country.openingFx.localCurrencyPerGcu,
          quoteDirection: 'BOOK_LC_PER_NATIVE_UNIT' as const,
          version: country.openingFx.version,
          valueDate: opening.valueDate,
        };
        mirrors.push({
          holdingId: m.holdingId!,
          financialClaimId: canonical.financialClaimId,
          recordOwnerCb: m.ownerId,
          role: m.role,
          category,
          claim: body,
          valuation: {
            ...valuation,
            source: reference(valuation.version, {
              ...valuation,
              countryId: country.countryId,
              financialClaimId: canonical.financialClaimId,
              openingEpoch: opening.openingEpoch,
              sourceClass: origin.sourceClass,
              rulesHash: origin.rulesHash,
              paramsHash: origin.paramsHash,
            }),
          },
          source: reference(country.cbRegister.version, {
            countryId: country.countryId,
            valueDate: opening.valueDate,
            openingEpoch: opening.openingEpoch,
            holdingId: m.holdingId,
            financialClaimId: canonical.financialClaimId,
            recordOwnerCb: m.ownerId,
            role: m.role,
            category,
            claim: body,
            valuation,
            sourceClass: origin.sourceClass,
            rulesHash: origin.rulesHash,
            paramsHash: origin.paramsHash,
          }),
        });
      }
    }
    const categories = country.cbRegister.categories.map((cat) => {
      const disposition = mirrors.some((m) => m.category === cat.category)
        ? ('DECLARED' as const)
        : cat.disposition;
      return {
        category: cat.category,
        disposition,
        source: reference(country.cbRegister.version, {
          countryId: country.countryId,
          category: cat.category,
          disposition,
        }),
      };
    });
    const summary = {
      countryId: country.countryId,
      version: country.cbRegister.version,
      valueDate: opening.valueDate,
      categories: categories.map(({ category, disposition }) => ({
        category,
        disposition,
      })),
      holdingIds: country.cbRegister.holdings.map((h) => h.holdingId),
      crossCbHoldingIds: mirrors.map((m) => m.holdingId).sort(),
    };
    return {
      ...country,
      cbRegister: {
        ...country.cbRegister,
        categories,
        crossCbMirrors: mirrors,
        source: reference(country.cbRegister.version, summary),
      },
    };
  });
  const documents: FinancialSourceDocument[] = [...versions].map(([v, doc]) => {
    const bytes = canonicalSerialize(doc.rows);
    return {
      documentId: doc.id,
      sourcePath: `test-only/${doc.id}.json`,
      sha256: claimSourceHash(bytes),
      version: v,
      valueDate: opening.valueDate,
      bytes,
    };
  });
  const contract = parseFormalFinancialOpeningContract(
    {
      ...input.baseline,
      schemaVersion: 'formal-financial-opening-input-v2',
      openingEpoch: opening.openingEpoch,
      scenarioOrigin: origin,
      crossCbClaims: claims,
      documents: [...input.baseline.documents, ...documents],
      countries,
    },
    input.baselineRuleAdoption,
  );
  const calculation = produceFormalFinancialOpening({
    contract,
    adoption: input.baselineRuleAdoption,
  });
  return freezeClaimSource({
    classification: 'TEST_ONLY_MECHANISM_NOT_ADOPTION',
    actualAdoptionMatched: false,
    formalPaymentAllowed: false,
    Fcash: null,
    contract,
    calculation,
  });
}
