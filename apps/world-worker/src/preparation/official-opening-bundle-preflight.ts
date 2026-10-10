/** P0 read-only composition. This module cannot bootstrap, publish admission,
 * access a database, issue authority, start a Worker or change source pins. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  parseOpeningSeed,
  rebuildV08LedgersFromLineage,
} from '@econmind/core';
import {
  isLoadedOfficialOpeningBundle,
  isOfficialOpeningBundleV2,
  type LoadedOfficialOpeningBundle,
} from './official-opening-bundle-loader.js';
import {
  prepareOfficialOpeningBundleCandidate,
  type OfficialOpeningV2Candidate,
} from './official-opening-candidate-composition.js';
import {
  inspectOfficialOpeningDecisionSource,
  reconcileOfficialOpeningDecision,
  officialOpeningTrustedDecisionSource,
} from './official-opening-decision-reconciliation.js';
import { inspectOfficialWorldOpeningAdmission } from './official-world-opening-admission.js';
import { prepareOpeningCanonicalSeed } from './opening-canonical-seed-bridge.js';

type Stage =
  'source' | 'admission' | 'decision' | 'bridge' | 'core' | 'financial';
export interface OfficialOpeningBundlePreflightBlocker {
  readonly stage: Stage;
  readonly code: string;
  readonly field: string;
  readonly countryId: string | null;
}
export interface OfficialOpeningBundlePreflight {
  readonly status: 'PREFLIGHT_BLOCKED' | 'VALIDATED_CANDIDATE_NOT_ADMITTED';
  readonly sourcePackageId: string;
  readonly validatedFileCount: number;
  readonly structuredDatasetCount: number;
  readonly sourceBundleSha256: string | null;
  readonly decisionOrigin:
    'INCOMING_FILE' | 'EXISTING_VALIDATOR_UNRESOLVED_DIAGNOSTIC';
  readonly sourceStatus: string;
  readonly admissionStatus: string;
  readonly decisionStatus: string;
  readonly bridgeStatus: string;
  readonly coreValidation:
    'NOT_RUN_NO_SEED' | 'PARSED_AND_REBUILT' | 'REJECTED';
  readonly seedFingerprint: string | null;
  readonly seedWorldId: string | null;
  readonly blockers: readonly OfficialOpeningBundlePreflightBlocker[];
  readonly realFinancialProducer:
    | 'NOT_CONNECTED_IN_CURRENT_BASE'
    | 'CALLED_ORIGINAL_PRODUCER'
    | 'NOT_RUN_INPUT_REJECTED';
  readonly producerGap: Readonly<{
    legacyBridge: 'ONE_GCU_BATCH_PER_COUNTRY';
    officialConsumer: 'LC_BATCH_PER_COUNTRY_OPTIONAL_ADDITIONAL_GCU';
    coreInterface: 'OpeningSeed.financialBatches: FinancialOpeningBatch[]';
    missingContract: 'FORMAL_LC_FX_AND_COMPLETE_CB_REGISTER_PRODUCER';
  }> | null;
  readonly implementationGaps: readonly string[];
  readonly financialComposition?: OfficialOpeningV2Candidate;
  readonly activationAllowed: false;
  readonly admissionEvaluated: false;
}
const sha = (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex');
function parse(bytes: string): unknown {
  return JSON.parse(bytes) as unknown;
}

/** Accepts only a snapshot returned by the actual private loader, not request
 * JSON or a caller's READY/approved/verified report. No validator callbacks. */
export function preflightOfficialOpeningBundle(
  loaded: LoadedOfficialOpeningBundle,
): OfficialOpeningBundlePreflight {
  if (!isLoadedOfficialOpeningBundle(loaded))
    throw new Error('OPENING_BUNDLE_LOADER_SNAPSHOT_REQUIRED');
  if (loaded.bundle && isOfficialOpeningBundleV2(loaded.bundle)) {
    const composed = prepareOfficialOpeningBundleCandidate(loaded);
    return Object.freeze({
      status: composed.status,
      sourcePackageId: 'BALANCED_2026_09_28_V1',
      validatedFileCount: loaded.validatedFiles.length,
      structuredDatasetCount: Object.keys(loaded.inputs.source.datasets).length,
      sourceBundleSha256: composed.sourceBundleSha256,
      decisionOrigin: 'INCOMING_FILE',
      sourceStatus: composed.sourceStatus,
      admissionStatus:
        composed.status === 'PREFLIGHT_BLOCKED'
          ? 'BLOCKED'
          : 'SOURCE_READY_NOT_APPROVAL',
      decisionStatus: composed.sourceAdoptionStatus,
      bridgeStatus: composed.bridgeStatus,
      coreValidation:
        composed.bridgeStatus === 'CORE_PARSED_AND_REBUILT_NOT_ADMITTED'
          ? 'PARSED_AND_REBUILT'
          : 'NOT_RUN_NO_SEED',
      seedFingerprint: composed.seed?.fingerprint ?? null,
      seedWorldId: composed.seed?.worldId ?? null,
      blockers: composed.blockers,
      realFinancialProducer: composed.rawFinancialResult
        ? 'CALLED_ORIGINAL_PRODUCER'
        : 'NOT_RUN_INPUT_REJECTED',
      producerGap: null,
      implementationGaps: Object.freeze([]),
      financialComposition: composed,
      activationAllowed: false,
      admissionEvaluated: false,
    });
  }
  const { inputs, bundle } = loaded;
  const blockers: OfficialOpeningBundlePreflightBlocker[] = [];
  const add = (
    stage: Stage,
    code: string,
    field: string,
    countryId: string | null = null,
  ) => blockers.push(Object.freeze({ stage, code, field, countryId }));
  const checked = inspectOfficialOpeningDecisionSource(inputs.source);
  let admissionStatus = 'NOT_RUN_SOURCE_INVALID';
  let decisionStatus = 'NOT_RUN_SOURCE_INVALID';
  let bridgeStatus = 'NOT_RUN_SOURCE_INVALID';
  let coreValidation: OfficialOpeningBundlePreflight['coreValidation'] =
    'NOT_RUN_NO_SEED';
  let seedFingerprint: string | null = null;
  let seedWorldId: string | null = null;
  for (const blocker of checked.blockers)
    add('source', blocker.code, blocker.field, blocker.countryId);
  if (checked.source) {
    let currentStage: 'decision' | 'bridge' | 'core' = 'decision';
    try {
      const admission = inspectOfficialWorldOpeningAdmission({
        selectionBytes: inputs.selectionBytes,
        checksumsBytes: inputs.source.checksumsBytes,
        mapManifestBytes: inputs.mapManifestBytes,
        regionsBytes: inputs.regionsBytes,
        mapping: parse(inputs.source.mappingBytes),
        gaps: parse(inputs.gapsBytes),
        coverage: parse(inputs.source.coverageBytes),
        sha256Hex: sha,
      });
      admissionStatus = admission.status;
      for (const code of [
        ...admission.blockerCodes,
        ...admission.deferredCodes,
      ])
        add('admission', code, 'source.admission');
    } catch (error) {
      admissionStatus = 'REJECTED';
      add(
        'admission',
        'OFFICIAL_ADMISSION_CONTRACT_REJECTED',
        error instanceof Error ? error.message : 'source.admission',
      );
    }
    try {
      // No new unresolved decision is synthesized. In the absence of real
      // incoming files, use E's existing explicit diagnostic; its candidate is
      // never persisted, approved or represented as an incoming owner record.
      const decision = bundle ? parse(bundle.decisionBytes) : undefined;
      const ownerRecords = bundle
        ? bundle.ownerRecords.map((row) => ({
            reference: row.reference,
            record: parse(row.recordBytes),
          }))
        : [];
      const reconciled = reconcileOfficialOpeningDecision(
        {
          sourceBytes: inputs.source,
          ...(decision === undefined ? {} : { decision }),
        },
        ownerRecords,
      );
      decisionStatus = reconciled.status;
      for (const blocker of reconciled.blockers)
        add('decision', blocker.code, blocker.field, blocker.countryId);
      if (reconciled.decisionInspection) {
        currentStage = 'bridge';
        const prepared = prepareOpeningCanonicalSeed({
          decision: decision ?? reconciled.decisionInspection.candidate.body,
          trusted: {
            source: officialOpeningTrustedDecisionSource(checked.source),
            ownerRecords,
          },
          frozenMappingBytes: inputs.source.mappingBytes,
          assembly: bundle ? parse(bundle.assemblyBytes) : null,
        });
        bridgeStatus = prepared.status;
        for (const blocker of prepared.blockers)
          add('bridge', blocker.code, blocker.field, blocker.countryId);
        if (prepared.seed) {
          currentStage = 'core';
          const seed = parseOpeningSeed(
            parse(canonicalSerialize(prepared.seed)),
            sha,
          );
          rebuildV08LedgersFromLineage({ seed, sha256Hex: sha });
          coreValidation = 'PARSED_AND_REBUILT';
          seedFingerprint = seed.fingerprint;
          seedWorldId = seed.worldId;
        }
      } else {
        bridgeStatus = 'NOT_RUN_DECISION_REJECTED';
      }
    } catch (error) {
      // Invalid incoming JSON or a throwing existing Core validator is not a
      // successful stage. Preserve the fault instead of manufacturing a seed.
      if (currentStage === 'decision') {
        decisionStatus = 'REJECTED';
        bridgeStatus = 'NOT_RUN_DECISION_REJECTED';
        add(
          'decision',
          'INCOMING_DECISION_OR_OWNER_JSON_REJECTED',
          error instanceof Error ? error.message : 'incoming',
        );
      } else if (currentStage === 'bridge') {
        bridgeStatus = 'REJECTED';
        add(
          'bridge',
          'INCOMING_ASSEMBLY_OR_BRIDGE_REJECTED',
          error instanceof Error ? error.message : 'assembly',
        );
      } else {
        coreValidation = 'REJECTED';
        seedFingerprint = null;
        seedWorldId = null;
        add(
          'core',
          'CORE_SEED_VALIDATION_REJECTED',
          error instanceof Error ? error.message : 'seed',
        );
      }
    }
  }
  if (!bundle) {
    add(
      'decision',
      'INCOMING_DECISION_FILE_NOT_PROVISIONED',
      'incoming/decision.json',
    );
    add(
      'bridge',
      'INCOMING_ASSEMBLY_FILE_NOT_PROVISIONED',
      'incoming/assembly.json',
    );
  }
  // This is a real code/contract gap, not a claim that supplying numerical data
  // alone closes it. Core already supports multiple currency batches; the old
  // bridge and the formal LC/FX/CB producer are not connected to that consumer.
  return Object.freeze({
    status: blockers.length
      ? 'PREFLIGHT_BLOCKED'
      : 'VALIDATED_CANDIDATE_NOT_ADMITTED',
    sourcePackageId: checked.source?.pins.packageId ?? 'BALANCED_2026_09_28_V1',
    validatedFileCount: loaded.validatedFiles.length,
    structuredDatasetCount: Object.keys(inputs.source.datasets).length,
    sourceBundleSha256: loaded.sourceBundleSha256,
    decisionOrigin: bundle
      ? 'INCOMING_FILE'
      : 'EXISTING_VALIDATOR_UNRESOLVED_DIAGNOSTIC',
    sourceStatus: checked.status,
    admissionStatus,
    decisionStatus,
    bridgeStatus,
    coreValidation,
    seedFingerprint,
    seedWorldId,
    blockers: Object.freeze(blockers),
    realFinancialProducer: 'NOT_CONNECTED_IN_CURRENT_BASE',
    producerGap: Object.freeze({
      legacyBridge: 'ONE_GCU_BATCH_PER_COUNTRY',
      officialConsumer: 'LC_BATCH_PER_COUNTRY_OPTIONAL_ADDITIONAL_GCU',
      coreInterface: 'OpeningSeed.financialBatches: FinancialOpeningBatch[]',
      missingContract: 'FORMAL_LC_FX_AND_COMPLETE_CB_REGISTER_PRODUCER',
    }),
    implementationGaps: Object.freeze([
      'REAL_FINANCIAL_PRODUCER_NOT_CONNECTED',
    ] as const),
    activationAllowed: false,
    admissionEvaluated: false,
  });
}
