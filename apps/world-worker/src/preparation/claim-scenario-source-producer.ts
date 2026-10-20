/** Pure source version preparation. It creates neither claims in World State nor cash. */
import {
  claimRecord,
  claimSourceHash,
  freezeClaimSource,
  isParsedClaimScenarioDraft,
  requireClaimSource,
  snapshotClaimSource,
  type ParsedClaimScenarioDraft,
} from './claim-scenario-source-contract.js';
import { canonicalSerialize } from '@econmind/core';

export interface ClaimScenarioSourceCandidate {
  readonly status: 'DRAFT_INCOMPLETE' | 'COMPLETE_SOURCE_CANDIDATE';
  readonly disposition: 'NEW_UNADOPTED_CANDIDATE' | 'IDENTICAL_CANDIDATE_RETRY';
  readonly draft: ParsedClaimScenarioDraft;
  readonly sourceBytes: string;
  readonly sourceHash: string;
  readonly lifecycleHash: string;
  readonly legalRoleHash: string;
  readonly blockers: readonly string[];
  readonly selectionMeaning: 'UNVERIFIED_PREPARATION_DECLARATION_ONLY';
  readonly sourceAdopted: false;
  readonly legalTitleVerified: false;
  readonly actualOpeningVerified: false;
  readonly formalPaymentAllowed: false;
  readonly sourceCompleteOriginalIds: readonly string[];
}
const candidates = new WeakSet<object>();
export function isClaimScenarioSourceCandidate(
  v: unknown,
): v is ClaimScenarioSourceCandidate {
  return typeof v === 'object' && v !== null && candidates.has(v);
}
export function produceClaimScenarioSource(
  draft: ParsedClaimScenarioDraft,
  selection: unknown = {
    status: 'UNKNOWN',
    observedSourceVersion: null,
    observedSourceHash: null,
    existingVersionBytes: null,
  },
): ClaimScenarioSourceCandidate {
  requireClaimSource(
    isParsedClaimScenarioDraft(draft),
    'PARSED_SOURCE_REQUIRED',
  );
  const observed = claimRecord(snapshotClaimSource(selection), [
    'status',
    'observedSourceVersion',
    'observedSourceHash',
    'existingVersionBytes',
  ]);
  requireClaimSource(
    [
      'UNKNOWN',
      'DECLARED_UNADOPTED',
      'ADMITTED',
      'ACTIVATED',
      'POSTED',
    ].includes(String(observed.status)),
    'SELECTION_STATUS_INVALID',
  );
  requireClaimSource(
    !['ADMITTED', 'ACTIVATED', 'POSTED'].includes(String(observed.status)),
    'EXISTING_ADMITTED_CLAIM_REQUIRES_SEPARATE_GOVERNED_CHANGE',
  );
  const blockers = [...draft.blockers];
  if (observed.status === 'UNKNOWN')
    blockers.push('PRIOR_SELECTION_OR_ADMISSION_UNPROVEN');
  const version = observed.observedSourceVersion,
    hash = observed.observedSourceHash;
  requireClaimSource(
    (version === null && hash === null) ||
      (typeof version === 'string' &&
        version.length > 0 &&
        typeof hash === 'string' &&
        /^[0-9a-f]{64}$/u.test(hash)),
    'SELECTION_IDENTITY_INCOMPLETE',
  );
  let disposition: ClaimScenarioSourceCandidate['disposition'] =
    'NEW_UNADOPTED_CANDIDATE';
  if (version === draft.input.sourceVersion && hash !== null) {
    requireClaimSource(
      hash === draft.fingerprint,
      'IMMUTABLE_VERSION_CONFLICT',
    );
    disposition = 'IDENTICAL_CANDIDATE_RETRY';
  } else if (version !== null || draft.input.previousVersionHash !== null) {
    if (observed.status === 'UNKNOWN') blockers.push('PREDECESSOR_UNPROVEN');
    else
      requireClaimSource(
        hash !== null &&
          draft.input.previousVersionHash === hash &&
          version !== draft.input.sourceVersion,
        'EXPLICIT_PREDECESSOR_REQUIRED',
      );
  }
  if (observed.existingVersionBytes !== null) {
    requireClaimSource(
      typeof observed.existingVersionBytes === 'string' &&
        observed.existingVersionBytes.length <= 262144,
      'VERSION_BYTES_INVALID',
    );
    requireClaimSource(
      hash !== null && claimSourceHash(observed.existingVersionBytes) === hash,
      'VERSION_BYTES_HASH_MISMATCH',
    );
    if (version === draft.input.sourceVersion)
      requireClaimSource(
        observed.existingVersionBytes === draft.canonicalBytes,
        'IMMUTABLE_VERSION_CONFLICT',
      );
  }
  const sourceBytes = draft.canonicalBytes;
  const result: ClaimScenarioSourceCandidate = freezeClaimSource({
    status: blockers.length ? 'DRAFT_INCOMPLETE' : 'COMPLETE_SOURCE_CANDIDATE',
    disposition,
    draft,
    sourceBytes,
    sourceHash: draft.fingerprint,
    lifecycleHash: claimSourceHash(
      canonicalSerialize(draft.input.claims.map((c) => c.lifecycle)),
    ),
    legalRoleHash: claimSourceHash(
      canonicalSerialize(
        draft.input.claims.map((c) => [c.legalIssuer, c.legalHolder]),
      ),
    ),
    blockers: [...new Set(blockers)].sort(),
    selectionMeaning: 'UNVERIFIED_PREPARATION_DECLARATION_ONLY',
    sourceAdopted: false,
    legalTitleVerified: false,
    actualOpeningVerified: false,
    formalPaymentAllowed: false,
    sourceCompleteOriginalIds: [],
  });
  candidates.add(result);
  return result;
}
