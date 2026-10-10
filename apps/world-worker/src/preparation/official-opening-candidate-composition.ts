/** Sole read-only V2 assembler. No SQL, signer, authority callback or runtime
 * registration. Financial success never means admission or all Offices ready. */
import { canonicalSerialize, type OpeningSeed } from '@econmind/core';
import {
  isLoadedOfficialOpeningBundle,
  isOfficialOpeningBundleV2,
  type LoadedOfficialOpeningBundle,
} from './official-opening-bundle-loader.js';
import { inspectOfficialOpeningDecisionSource } from './official-opening-decision-reconciliation.js';
import { inspectOfficialWorldOpeningAdmission } from './official-world-opening-admission.js';
import {
  parseFormalFinancialOpeningContract,
  financialInputSha256,
  freezeFinancialInput,
} from './formal-financial-opening-contract.js';
import {
  produceFormalFinancialOpening,
  type FormalFinancialOpeningResult,
} from './formal-financial-opening-producer.js';
import {
  produceOwnerNonHostSourceAdoption,
  loadFinancialSupplementAdoption,
} from './owner-non-host-source-adoption.js';
import {
  openingV2AssemblyIntentFingerprint,
  prepareFinancialSupplementOpeningSeed,
  type OpeningCanonicalSeedAssemblyV2,
} from './opening-canonical-seed-bridge.js';

export interface OfficialOpeningCandidateBlocker {
  readonly stage:
    'source' | 'admission' | 'decision' | 'bridge' | 'core' | 'financial';
  readonly code: string;
  readonly field: string;
  readonly countryId: string | null;
}
export interface OfficialOpeningV2Candidate {
  readonly status: 'PREFLIGHT_BLOCKED' | 'VALIDATED_CANDIDATE_NOT_ADMITTED';
  readonly seed: OpeningSeed | null;
  readonly sourceBundleSha256: string | null;
  readonly sourceStatus: string;
  readonly sourceAdoptionStatus: string;
  readonly financialStatus: string;
  readonly bridgeStatus: string;
  readonly rawFinancialResult: FormalFinancialOpeningResult | null;
  readonly resolvedObligations: readonly Readonly<{
    code: string;
    recordId: string;
    receiptSha256: string;
  }>[];
  readonly gapOverlay: readonly Readonly<{
    code: string;
    countryId: string | null;
    blockingTarget: string;
    resolvedBy: string | null;
  }>[];
  readonly blockers: readonly OfficialOpeningCandidateBlocker[];
  readonly admissionAllowed: false;
  readonly activationAllowed: false;
}
const OBLIGATIONS = Object.freeze([
  'SUPPLEMENTAL_FINANCIAL_SOURCE_ADOPTION_UNRESOLVED',
  'FORMAL_WORLD_BINDING_UNRESOLVED',
]);
export function prepareOfficialOpeningBundleCandidate(
  loaded: LoadedOfficialOpeningBundle,
): OfficialOpeningV2Candidate {
  if (!isLoadedOfficialOpeningBundle(loaded))
    throw Error('OPENING_BUNDLE_LOADER_SNAPSHOT_REQUIRED');
  const bundle = loaded.bundle;
  if (
    !bundle ||
    !isOfficialOpeningBundleV2(bundle) ||
    !loaded.financialProvenance
  )
    throw Error('GENUINE_V2_LOADER_SNAPSHOT_REQUIRED');
  const blockers: OfficialOpeningCandidateBlocker[] = [];
  const add = (
    stage: OfficialOpeningCandidateBlocker['stage'],
    code: string,
    field: string,
    countryId: string | null = null,
  ) => blockers.push({ stage, code, field, countryId });
  const checked = inspectOfficialOpeningDecisionSource(loaded.inputs.source);
  for (const b of checked.blockers) add('source', b.code, b.field, b.countryId);
  let sourceAdoptionStatus = 'NOT_RUN_SOURCE_INVALID',
    financialStatus = 'NOT_RUN_SOURCE_INVALID',
    bridgeStatus = 'NOT_RUN_NO_FINANCIAL_CANDIDATE',
    seed: OpeningSeed | null = null,
    rawFinancialResult: FormalFinancialOpeningResult | null = null;
  const resolvedObligations: {
    code: string;
    recordId: string;
    receiptSha256: string;
  }[] = [];
  const gapOverlay: {
    code: string;
    countryId: string | null;
    blockingTarget: string;
    resolvedBy: string | null;
  }[] = [];
  const finish = (): OfficialOpeningV2Candidate =>
    freezeFinancialInput({
      status: blockers.length
        ? 'PREFLIGHT_BLOCKED'
        : 'VALIDATED_CANDIDATE_NOT_ADMITTED',
      seed: blockers.length ? null : seed,
      sourceBundleSha256: loaded.sourceBundleSha256,
      sourceStatus: checked.status,
      sourceAdoptionStatus,
      financialStatus,
      bridgeStatus,
      rawFinancialResult,
      resolvedObligations,
      gapOverlay,
      blockers,
      admissionAllowed: false,
      activationAllowed: false,
    });
  if (!checked.source) return finish();
  const baseline = inspectOfficialWorldOpeningAdmission({
    selectionBytes: bundle.selectionBytes,
    checksumsBytes: bundle.source.checksumsBytes,
    mapManifestBytes: bundle.mapManifestBytes,
    regionsBytes: bundle.regionsBytes,
    mapping: JSON.parse(bundle.source.mappingBytes),
    gaps: JSON.parse(bundle.gapsBytes),
    coverage: JSON.parse(bundle.source.coverageBytes),
    sha256Hex: financialInputSha256,
  });
  // The frozen audit stays intact. Overlay resolutions below are per exact
  // code/country/target; no broad filtering of UNRESOLVED/deferred codes.
  const gaps = JSON.parse(bundle.gapsBytes) as {
    globalGaps: { code: string; blockingTarget: string }[];
    countries: {
      coreCountryId: string;
      gaps: { code: string; blockingTarget: string }[];
    }[];
  };
  for (const g of gaps.globalGaps)
    gapOverlay.push({ ...g, countryId: null, resolvedBy: null });
  for (const c of gaps.countries)
    for (const g of c.gaps)
      gapOverlay.push({ ...g, countryId: c.coreCountryId, resolvedBy: null });
  try {
    const parent = produceOwnerNonHostSourceAdoption({
      source: checked.source,
      ownerPolicy: loaded.financialProvenance.parentPolicy,
      scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
    });
    sourceAdoptionStatus = 'FINANCIAL_ADOPTION_NOT_VERIFIED';
    financialStatus = 'NOT_RUN_INPUT_REJECTED';
    // Only these pre-existing parent obligations can be discharged by the
    // scoped financial record. Future/unknown source gaps remain blockers.
    const parentObligations = [
      'OPENING_LC_CODE_SOURCE_MISSING',
      'OPENING_FX_SOURCE_MISSING',
      'CB_OPENING_HOLDING_REGISTER_COMPLETENESS_NOT_ESTABLISHED',
      'WORLD_BINDING_NOT_VERIFIED_NO_SEED',
    ];
    for (const gap of parent.manifest.gaps)
      if (!parentObligations.includes(gap.code))
        add('financial', gap.code, 'parent.manifest.gaps');
    const contract = parseFormalFinancialOpeningContract(
      JSON.parse(bundle.financial.inputBytes),
      parent,
    );
    const actual = bundle.financial.documents;
    if (
      contract.documents.length !== actual.length ||
      contract.documents.some((d) => {
        const matching = actual.find((x) => x.documentId === d.documentId);
        return (
          !matching ||
          matching.sourcePath !== d.sourcePath ||
          matching.bytes !== d.bytes
        );
      })
    )
      throw Error('FINANCIAL_DOCUMENT_SET_DIFFERS_FROM_LOADER_BYTES');
    rawFinancialResult = produceFormalFinancialOpening({
      adoption: parent,
      contract,
    });
    if (
      rawFinancialResult.status !== 'BLOCKED' ||
      rawFinancialResult.seed !== null ||
      rawFinancialResult.admissionAllowed !== false ||
      rawFinancialResult.activationAllowed !== false ||
      OBLIGATIONS.some(
        (code) =>
          rawFinancialResult!.blockers.filter((b) => b.code === code).length !==
          1,
      )
    )
      throw Error('ORIGINAL_FINANCIAL_AUTHORITY_BOUNDARY_CHANGED');
    financialStatus = rawFinancialResult.candidate
      ? 'ORIGINAL_PRODUCER_CALCULATED_NOT_ADOPTED'
      : 'ORIGINAL_PRODUCER_REJECTED';
    const candidate = rawFinancialResult.candidate;
    // Original result remains unchanged, including its two authority obligations.
    const extra = rawFinancialResult.blockers.filter(
      (b) => !OBLIGATIONS.includes(b.code),
    );
    for (const b of extra) add('financial', b.code, b.field);
    if (!candidate || extra.length) {
      for (const b of rawFinancialResult.blockers.filter((b) =>
        OBLIGATIONS.includes(b.code),
      ))
        add('financial', b.code, b.field);
      return finishWithUnresolved();
    }
    const { fingerprint, ...candidateBody } = candidate;
    if (
      fingerprint !==
        'sha256:' + financialInputSha256(canonicalSerialize(candidateBody)) ||
      candidate.contractFingerprint !==
        'sha256:' + financialInputSha256(canonicalSerialize(contract))
    )
      throw Error('ORIGINAL_FINANCIAL_FINGERPRINT_MISMATCH');
    const registration = loaded.financialProvenance.registration;
    if (!registration) {
      sourceAdoptionStatus = 'FINANCIAL_ADOPTION_REGISTRATION_NOT_PROVISIONED';
      add(
        'financial',
        sourceAdoptionStatus,
        'deployment.financialAdoptionRegistration',
      );
      for (const b of rawFinancialResult.blockers)
        add('financial', b.code, b.field);
      return finishWithUnresolved();
    }
    const assembly = JSON.parse(
      bundle.assemblyBytes,
    ) as OpeningCanonicalSeedAssemblyV2;
    const proof = loadFinancialSupplementAdoption({
      registration,
      parent,
      contract,
      candidate,
      receiptBytes: bundle.financial.adoptionReceiptBytes,
      instructionBytes: bundle.financial.ownerInstructionBytes,
      assemblyIntentFingerprint: openingV2AssemblyIntentFingerprint(assembly),
      seedId: assembly.seedId,
      orchestratorVersion: assembly.orchestratorVersion,
    });
    if (bundle.financial.registeredReference !== proof.retainedReference)
      throw Error('REGISTERED_REFERENCE_DIFFERS_FROM_LOADER');
    sourceAdoptionStatus = 'SCOPED_FINANCIAL_SOURCE_ADOPTED_NOT_ADMITTED';
    for (const code of OBLIGATIONS)
      resolvedObligations.push({
        code,
        recordId: proof.recordId,
        receiptSha256: proof.receiptSha256,
      });
    financialStatus = 'ORIGINAL_PRODUCER_OUTPUT_AND_SCOPED_ADOPTION_VERIFIED';
    bridgeStatus = 'V2_ASSEMBLY_VALIDATION_IN_PROGRESS';
    seed = prepareFinancialSupplementOpeningSeed({
      assembly,
      proof,
      candidate,
    });
    bridgeStatus = 'CORE_PARSED_AND_REBUILT_NOT_ADMITTED';
    const financialTargets: Record<string, string> = {
      SCENARIO_CURRENCY_CORE_BINDING_REQUIRED: 'OPENING_SEED_FINANCE',
      TREASURY_CENTRAL_BANK_SPLIT_REQUIRED: 'OPENING_SEED_FINANCE',
      SOURCE_BANK_DEPOSIT_LIABILITY_RECONCILIATION_REQUIRED:
        'OPENING_SEED_FINANCE',
      SOURCE_BANK_EQUITY_RECONCILIATION_REQUIRED: 'OPENING_SEED_FINANCE',
    };
    for (const g of gapOverlay) {
      if (
        (g.code === 'WORLD_ID_BINDING_REQUIRED' &&
          g.countryId === null &&
          g.blockingTarget === 'OPENING_SEED') ||
        (g.countryId !== null &&
          contract.countries.some((c) => c.countryId === g.countryId) &&
          ((financialTargets[g.code] !== undefined &&
            financialTargets[g.code] === g.blockingTarget) ||
            (g.code === 'OWNER_LEGAL_ENTITY_BINDING_REQUIRED' &&
              g.blockingTarget === 'OPENING_SEED_INVENTORY')))
      )
        g.resolvedBy = proof.recordId;
    }
    // Deferred identity/facility/water/power/labour/social gates are untouched.
    for (const code of [...baseline.blockerCodes, ...baseline.deferredCodes])
      if (!gapOverlay.some((g) => g.code === code))
        add('admission', code, 'source.admission');
    return finishWithUnresolved();
  } catch (error) {
    if (bridgeStatus === 'V2_ASSEMBLY_VALIDATION_IN_PROGRESS')
      bridgeStatus = 'REJECTED';
    else sourceAdoptionStatus = 'REJECTED';
    add(
      'financial',
      'FINANCIAL_SUPPLEMENT_CONTRACT_OR_ADOPTION_REJECTED',
      error instanceof Error ? error.message : 'financial',
    );
    return finishWithUnresolved();
  }
  function finishWithUnresolved(): OfficialOpeningV2Candidate {
    for (const g of gapOverlay)
      if (g.resolvedBy === null)
        add('admission', g.code, g.blockingTarget, g.countryId);
    return finish();
  }
}
