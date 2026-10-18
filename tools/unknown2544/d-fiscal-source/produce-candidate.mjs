import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { atPointer, digest, readPinnedJson } from './intake.mjs';

const FLAGS = Object.freeze({
  productionAuthority: false,
  sourceAdmitted: false,
  runtimeConnected: false,
});
const MODES = ['TEST_ONLY', 'UNADMITTED_SOURCE_INPUT'];
const MANDATORY = new Set([
  'PENSION',
  'WELFARE',
  'PUBLIC_PAYROLL',
  'VALID_CONTRACT',
  'PROJECT_COMMITMENT',
  'TRIGGERED_GUARANTEE',
  'PROTECTED_SERVICE',
]);
const DEBT = new Set(['DEBT_PRINCIPAL', 'DEBT_INTEREST']);
const equal = (a, b) => canonical(a) === canonical(b);
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export function canonical(value) {
  if (value === null || typeof value !== 'object') {
    if (
      !['string', 'boolean', 'number'].includes(typeof value) &&
      value !== null
    )
      throw new Error('NON_JSON_CONTENT');
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new Error('NON_JSON_NUMBER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
}
export const contentHash = (value) => digest(Buffer.from(canonical(value)));
const text = (v) => typeof v === 'string' && v.length > 0 && v.length <= 256;
const integer = (v) => typeof v === 'string' && /^(0|[1-9]\d{0,30})$/.test(v);
const scopeKeys = [
  'worldId',
  'openingIdentity',
  'scenarioId',
  'countryId',
  'entityRef',
  'currency',
  'effectivePeriodRef',
  'cutoff',
];

/** Writes source-derived offline candidates only; no authority implementation or
 * injectable trust callback exists. All actual aggregates therefore remain null. */
export function produceCandidate(input) {
  const issues = [];
  const issue = (code, path) => issues.push({ code, path });
  const identity = { ...FLAGS, schemaVersion: 'd-fiscal-source-candidate-v1' };
  if (
    !input ||
    typeof input !== 'object' ||
    input.schemaVersion !== 'd-fiscal-producer-input-v1' ||
    !MODES.includes(input.evidenceClass)
  )
    throw new Error('CANDIDATE_INPUT_MODE_REQUIRED');
  const testOnly = input.evidenceClass === 'TEST_ONLY';
  const scope = input.scope;
  if (!scope || scopeKeys.some((k) => !Object.hasOwn(scope, k)))
    throw new Error('EXPLICIT_SCOPE_FIELDS_REQUIRED');
  for (const key of ['countryId', 'entityRef'])
    if (!text(scope[key])) throw new Error(`INVALID_SCOPE_${key}`);
  for (const key of ['currency', 'effectivePeriodRef']) {
    if (scope[key] === null && !testOnly)
      issue('SCOPE_SOURCE_VALUE_MISSING', `scope.${key}`);
    else if (!text(scope[key])) throw new Error(`INVALID_SCOPE_${key}`);
  }
  if (scope.cutoff === null && !testOnly)
    issue('SOURCE_CUTOFF_MISSING', 'scope.cutoff');
  else if (
    !scope.cutoff ||
    ['worldVersion', 'eventSequence', 'simTime'].some(
      (k) => !integer(scope.cutoff[k]),
    )
  )
    throw new Error('EXPLICIT_CUTOFF_REQUIRED');
  if (
    testOnly &&
    [scope.worldId, scope.scenarioId, scope.countryId, scope.entityRef].some(
      (v) => !text(v) || !v.startsWith('TEST_ONLY_'),
    )
  )
    throw new Error('TEST_NAMESPACE_REQUIRED');
  if (
    !testOnly &&
    Object.values(scope).some(
      (v) => typeof v === 'string' && v.startsWith('TEST_ONLY_'),
    )
  )
    throw new Error('TEST_SOURCE_ON_ACTUAL_SCOPE');
  if (!text(scope.worldId) || !text(scope.openingIdentity))
    issue('ACTUAL_WORLD_OPENING_NOT_PROVEN', 'scope');
  if (scope.scenarioId !== null && !text(scope.scenarioId))
    throw new Error('INVALID_SCENARIO_ID');
  if (!text(input.lineRef)) throw new Error('LINE_ID_REQUIRED');
  let unsupported =
    input.originKind !== 'NEW_SCENARIO_PROPOSAL' ||
    input.operation !== 'APPROVE_NEW_LINE' ||
    input.budgetClass !== 'ORDINARY_DEPARTMENTAL' ||
    input.approvalMode !== 'UNCONDITIONAL' ||
    input.appropriationMode !== 'FULL';
  if (unsupported)
    issue(
      'UNSUPPORTED_BRANCH',
      'originKind/operation/budgetClass/approvalMode/appropriationMode',
    );

  if (!Array.isArray(input.sourceIndex) || input.sourceIndex.length > 2048)
    throw new Error('BOUNDED_SOURCE_INDEX_REQUIRED');
  const leaves = new Map(),
    sourcePins = [];
  // Only exact pinned leaves are inputs; caller result/complete/approval flags are
  // neither consulted nor promoted to a trust root.
  for (const s of [...input.sourceIndex].sort((a, b) =>
    compare(String(a.ref), String(b.ref)),
  )) {
    if (!text(s.ref) || leaves.has(s.ref))
      throw new Error('DUPLICATE_OR_INVALID_SOURCE_REF');
    if (
      !text(s.ownerRef) ||
      !text(s.schemaVersion) ||
      !text(s.sourceRevision) ||
      !Number.isSafeInteger(s.bytes) ||
      s.bytes < 0
    )
      throw new Error('SOURCE_METADATA_REQUIRED');
    if (
      testOnly
        ? s.evidenceClass !== 'TEST_ONLY'
        : !['ORIGINAL', 'REFERENCE', 'CONSTRUCTED'].includes(s.evidenceClass)
    )
      throw new Error('SOURCE_EVIDENCE_NAMESPACE');
    const leaf = atPointer(
      readPinnedJson(s.path, s.sha256, s.bytes),
      s.pointer,
    );
    leaves.set(s.ref, leaf);
    sourcePins.push({
      ref: s.ref,
      path: s.path,
      bytes: s.bytes,
      sha256: s.sha256,
      pointer: s.pointer,
      ownerRef: s.ownerRef,
      schemaVersion: s.schemaVersion,
      sourceRevision: s.sourceRevision,
      evidenceClass: s.evidenceClass,
    });
  }
  const get = (ref, kind, path) => {
    if (!text(ref) || !leaves.has(ref)) {
      issue('SOURCE_LEAF_MISSING', path);
      return null;
    }
    const leaf = leaves.get(ref);
    if (!leaf || leaf.kind !== kind) {
      issue('SOURCE_KIND_MISMATCH', path);
      return null;
    }
    if (!equal(leaf.scope, scope) || leaf.lineRef !== input.lineRef) {
      issue('SOURCE_SCOPE_MISMATCH', path);
      return null;
    }
    return leaf;
  };
  const bindings = input.bindings ?? {};
  const creation = get(
    bindings.creation,
    'BUDGET_LINE_CREATION',
    'bindings.creation',
  );
  const initialization = get(
    bindings.initialization,
    'BUDGET_LINE_INITIALIZATION',
    'bindings.initialization',
  );
  if (
    creation &&
    (creation.origin !== 'GENUINELY_NEW_LINE' ||
      creation.predecessorLineRef !== null ||
      !text(creation.creationEventRef))
  )
    issue('NEW_LINE_ORIGIN_MISSING', 'creation');
  if (
    initialization &&
    (!creation ||
      initialization.creationEventRef !== creation.creationEventRef ||
      !text(initialization.initializationEventRef))
  )
    issue('INITIALIZATION_CAUSATION_MISMATCH', 'initialization');
  const coverage = get(
    bindings.coverage,
    'REGISTER_COVERAGE',
    'bindings.coverage',
  );
  if (
    coverage &&
    (coverage.bound !== 'ONE_NEW_BUDGET_LINE' ||
      coverage.origin !== 'NEW_LINE_CREATION' ||
      coverage.predecessorRef !== null ||
      !equal(coverage.terminalCutoff, scope.cutoff) ||
      !text(coverage.inventoryRef) ||
      !text(coverage.inventoryRevision) ||
      !Array.isArray(coverage.obligationIds) ||
      !Array.isArray(coverage.componentIds))
  )
    issue('COVERAGE_ORIGIN_CHAIN_OR_BOUND_MISSING', 'coverage');
  if (coverage)
    get(
      coverage.attestationSourceRef,
      'COVERAGE_ATTESTATION',
      'coverage.attestationSourceRef',
    );
  const precision = get(
    bindings.precision,
    'MONEY_PRECISION',
    'bindings.precision',
  );
  const scaleValid =
    precision &&
    integer(precision.scale) &&
    Number(precision.scale) <= 12 &&
    precision.rounding === 'EXACT_ONLY';
  if (!scaleValid) issue('SOURCED_EXACT_PRECISION_REQUIRED', 'precision');
  const scale = scaleValid ? Number(precision.scale) : null;
  const amount = (value, path) => {
    if (
      scale === null ||
      typeof value !== 'string' ||
      value.length > 80 ||
      !/^(0|[1-9]\d*)(\.\d+)?$/.test(value)
    ) {
      issue('EXACT_NATIVE_AMOUNT_REQUIRED', path);
      return null;
    }
    const [whole, fraction = ''] = value.split('.');
    if (fraction.length > scale) {
      issue('UNSUPPORTED_PRECISION_OR_ROUNDING', path);
      return null;
    }
    return BigInt(whole + fraction.padEnd(scale, '0'));
  };
  const render = (v) => {
    if (scale === 0) return String(v);
    const s = String(v).padStart(scale + 1, '0');
    return `${s.slice(0, -scale)}.${s.slice(-scale)}`.replace(/\.?0+$/, '');
  };
  const intent = get(
    bindings.budgetIntent,
    'BUDGET_INTENT',
    'bindings.budgetIntent',
  );
  const contextLeaf = get(
    bindings.budgetContext,
    'BUDGET_CONTEXT',
    'bindings.budgetContext',
  );
  const proposedIntent = intent?.intent ?? null;
  const payload = proposedIntent?.payload ?? null;
  const context = contextLeaf?.context ?? null;
  if (
    context?.policy?.classification === 'PROJECT' ||
    ['CONDITIONAL', 'PARTIAL'].includes(context?.approval?.status)
  ) {
    unsupported = true;
    issue('UNSUPPORTED_PR156_SOURCE_BRANCH', 'context');
  }
  if (payload) {
    const expected = {
      worldId: scope.worldId,
      countryId: scope.countryId,
      entityRef: scope.entityRef,
      envelopeRef: payload.scope?.envelopeRef,
      effectivePeriodRef: scope.effectivePeriodRef,
    };
    if (
      payload.operation !== 'APPROVE_NEW_LINE' ||
      payload.lineRef !== input.lineRef ||
      payload.predecessorRevisionRef !== null ||
      !equal(payload.scope, expected) ||
      payload.currency !== scope.currency ||
      !text(payload.revisionRef) ||
      !text(payload.envelopeRevisionRef) ||
      !equal(proposedIntent.expectedHead, scope.cutoff)
    )
      issue('BUDGET_INTENT_BINDING_MISMATCH', 'budgetIntent.intent');
    amount(payload.amount, 'budgetIntent.intent.payload.amount');
  } else
    issue('ORIGINAL_BUDGET_INTENT_REQUIRED', 'budgetIntent.intent.payload');
  if (!intent?.identityCoverage || !Array.isArray(intent.identities))
    issue(
      'PR156_IDENTITY_COVERAGE_REQUIRED',
      'budgetIntent.identityCoverage/identities',
    );
  if (
    !context ||
    !equal(context.head, scope.cutoff) ||
    context.policy?.classification !== 'ORDINARY_DEPARTMENTAL' ||
    !text(context.policy?.ruleRef) ||
    !text(context.policy?.revision) ||
    !equal(context.policy?.binding, payload)
  )
    issue('PR156_CONTEXT_BINDING_MISSING', 'budgetContext.context');
  const payloadHash = payload ? contentHash(payload) : null;
  const requiredOffices =
    context?.policy?.captain === 'REQUIRED'
      ? ['FINANCE', 'CAPTAIN']
      : ['FINANCE'];
  if (!['REQUIRED', 'NOT_REQUIRED'].includes(context?.policy?.captain))
    issue('CAPTAIN_RULE_MISSING', 'context.policy.captain');
  if (!Array.isArray(input.approvalSourceRefs))
    issue('APPROVAL_LOCATORS_REQUIRED', 'approvalSourceRefs');
  const approvals = [];
  const offices = new Set();
  for (const ref of input.approvalSourceRefs ?? []) {
    const a = get(ref, 'OFFICE_APPROVAL_EVIDENCE', `approvalSourceRefs.${ref}`);
    if (!a) continue;
    if (!requiredOffices.includes(a.office) || offices.has(a.office))
      issue('APPROVAL_OFFICE_SET', ref);
    offices.add(a.office);
    if (
      a.payloadHash !== payloadHash ||
      a.proposalVersion !== payload?.revisionRef ||
      a.ruleRef !== context?.policy?.ruleRef ||
      a.ruleRevision !== context?.policy?.revision ||
      a.status !== 'APPROVED' ||
      !text(a.authorizationRevision) ||
      !text(a.originalApprovalLocator)
    )
      issue('APPROVAL_DECLARATION_MISSING_REVOKED_OR_STALE', ref);
    approvals.push({
      sourceRef: ref,
      declaredOffice: a.office,
      declaredStatus: a.status,
      payloadHash: a.payloadHash ?? null,
      proposalVersion: a.proposalVersion ?? null,
      locator: a.originalApprovalLocator ?? null,
      authenticated: false,
    });
  }
  if (!equal([...offices].sort(), [...requiredOffices].sort()))
    issue('REQUIRED_OFFICE_EVIDENCE_MISSING', 'approvalSourceRefs');

  const obligationIds = new Set(),
    componentIds = new Set(),
    operationIds = new Set();
  const normalizedObligations = [];
  const sums = {
    mandatoryNonDebtNative: 0n,
    committedDiscretionaryNative: 0n,
    debtServiceNative: 0n,
  };
  if (!Array.isArray(input.obligationSourceRefs))
    issue('OBLIGATION_INVENTORY_MISSING', 'obligationSourceRefs');
  for (const ref of input.obligationSourceRefs ?? []) {
    const o = get(ref, 'OBLIGATION', `obligationSourceRefs.${ref}`);
    if (!o) continue;
    if (
      !text(o.obligationId) ||
      obligationIds.has(o.obligationId) ||
      !text(o.componentId) ||
      componentIds.has(o.componentId)
    ) {
      issue('DUPLICATE_OR_INVALID_OBLIGATION_COMPONENT', ref);
      continue;
    }
    obligationIds.add(o.obligationId);
    componentIds.add(o.componentId);
    if (
      o.payer !== scope.entityRef ||
      !text(o.beneficiary) ||
      !text(o.revision) ||
      !text(o.dueRef) ||
      o.currency !== scope.currency ||
      o.periodRef !== scope.effectivePeriodRef
    )
      issue('OBLIGATION_PARTY_CURRENCY_PERIOD_MISMATCH', ref);
    const legal = get(
      o.legalBasisSourceRef,
      'LEGAL_BASIS',
      `${ref}.legalBasisSourceRef`,
    );
    const classification = get(
      o.classificationSourceRef,
      'CLASSIFICATION',
      `${ref}.classificationSourceRef`,
    );
    if (
      !legal ||
      !classification ||
      legal.obligationId !== o.obligationId ||
      classification.obligationId !== o.obligationId ||
      classification.legalBasisSourceRef !== o.legalBasisSourceRef ||
      !text(legal.originalLegalLocator) ||
      !text(classification.ruleRef) ||
      !text(classification.ruleRevision)
    )
      issue('LEGAL_CLASSIFICATION_BINDING_MISSING', ref);
    if (
      !['YES', 'NO'].includes(legal?.commitmentStatus) ||
      !['YES', 'NO'].includes(legal?.legallyEnforceable)
    )
      issue('LEGAL_COMMITMENT_STATUS_UNKNOWN', ref);
    const category = classification?.category;
    const legalCategory = legal?.legalCategory;
    if (DEBT.has(legalCategory)) {
      if (category !== 'DEBT_SERVICE' || legal.legallyEnforceable !== 'YES')
        issue('DEBT_CLASSIFICATION_MISMATCH', ref);
    } else if (MANDATORY.has(legalCategory)) {
      if (
        category !== 'MANDATORY_NON_DEBT' ||
        legal.legallyEnforceable !== 'YES'
      )
        issue('MANDATORY_BASELINE_MISCLASSIFIED', ref);
    } else if (
      legalCategory !== 'OPTIONAL_NONLEGAL' ||
      category !== 'COMMITTED_DISCRETIONARY' ||
      legal?.legallyEnforceable !== 'NO' ||
      legal?.commitmentStatus !== 'YES'
    )
      issue('UNKNOWN_OR_UNSUPPORTED_LEGAL_CLASSIFICATION', ref);
    const original = amount(o.originalAmount, `${ref}.originalAmount`);
    let reduction = 0n;
    if (!Array.isArray(o.allocationSourceRefs))
      issue('SETTLEMENT_RELEASE_INVENTORY_MISSING', ref);
    for (const allocationRef of o.allocationSourceRefs ?? []) {
      const a = get(
        allocationRef,
        'SETTLED_ALLOCATION',
        `${ref}.${allocationRef}`,
      );
      if (!a) continue;
      if (
        !text(a.operationId) ||
        !text(a.postingId) ||
        !text(a.causationRef) ||
        !text(a.portionId) ||
        operationIds.has(a.operationId) ||
        operationIds.has(a.postingId) ||
        operationIds.has(a.portionId)
      ) {
        issue('DUPLICATE_OR_AMBIGUOUS_POSTING', allocationRef);
        continue;
      }
      operationIds.add(a.operationId);
      operationIds.add(a.postingId);
      operationIds.add(a.portionId);
      if (
        a.obligationId !== o.obligationId ||
        a.componentId !== o.componentId ||
        a.currency !== scope.currency ||
        a.periodRef !== scope.effectivePeriodRef ||
        !['SETTLED', 'RELEASED'].includes(a.effect)
      )
        issue('ALLOCATION_BINDING_MISMATCH', allocationRef);
      const n = amount(a.amount, `${allocationRef}.amount`);
      if (n !== null) reduction += n;
    }
    const remaining = original === null ? null : original - reduction;
    if (remaining !== null && remaining < 0n)
      issue('OVERPAID_OR_OVERRELEASED', ref);
    const field = {
      MANDATORY_NON_DEBT: 'mandatoryNonDebtNative',
      COMMITTED_DISCRETIONARY: 'committedDiscretionaryNative',
      DEBT_SERVICE: 'debtServiceNative',
    }[category];
    if (field && remaining !== null && remaining >= 0n)
      sums[field] += remaining;
    normalizedObligations.push({
      sourceRef: ref,
      obligationId: o.obligationId,
      componentId: o.componentId,
      revision: o.revision ?? null,
      payer: o.payer ?? null,
      beneficiary: o.beneficiary ?? null,
      currency: o.currency ?? null,
      periodRef: o.periodRef ?? null,
      dueRef: o.dueRef ?? null,
      originalAmount: o.originalAmount ?? null,
      legalBasisSourceRef: o.legalBasisSourceRef ?? null,
      classificationSourceRef: o.classificationSourceRef ?? null,
      declaredCategory: category ?? null,
      allocationSourceRefs: o.allocationSourceRefs ?? null,
      candidateRemainingNative:
        remaining !== null && remaining >= 0n ? render(remaining) : null,
    });
  }
  normalizedObligations.sort((a, b) => compare(a.obligationId, b.obligationId));
  if (
    !coverage ||
    !equal(
      [...(coverage.obligationIds ?? [])].sort(),
      [...obligationIds].sort(),
    ) ||
    !equal([...(coverage.componentIds ?? [])].sort(), [...componentIds].sort())
  )
    issue('BOUNDED_COVERAGE_SET_MISMATCH', 'coverage');
  if (
    obligationIds.size === 0 &&
    (!creation ||
      !initialization ||
      !coverage ||
      !equal(initialization.explicitEmptyInventory, {
        paid: [],
        outstanding: [],
        reserved: [],
      }))
  )
    issue(
      'EMPTY_ARCHIVE_IS_NOT_EMPTY_BASELINE',
      'initialization.explicitEmptyInventory',
    );

  const previous =
    input.predecessor === null
      ? null
      : readPinnedJson(
          input.predecessor?.path,
          input.predecessor?.sha256,
          input.predecessor?.bytes,
        );
  if (previous) {
    if (
      previous.schemaVersion !== 'd-fiscal-source-candidate-v1' ||
      previous.candidateId !== contentHash(previous.content)
    )
      throw new Error('PREDECESSOR_CONTENT_INVALID');
    if (
      !equal(previous.content.scope, scope) ||
      previous.content.lineRef !== input.lineRef ||
      previous.content.evidenceClass !== input.evidenceClass
    )
      issue('MIGRATION_REQUIRED_SCOPE_IDENTITY', 'predecessor');
    for (const old of previous.content.obligations) {
      const current = normalizedObligations.find(
        (o) => o.obligationId === old.obligationId,
      );
      const keys = [
        'obligationId',
        'componentId',
        'payer',
        'beneficiary',
        'currency',
        'periodRef',
        'dueRef',
        'originalAmount',
      ];
      if (!current || keys.some((k) => !equal(current[k], old[k])))
        issue('MIGRATION_REQUIRED_ORIGINAL_OBLIGATION', old.obligationId);
    }
  }
  const declaredIssues = [...issues];
  // No trusted source issuer/admission verifier is part of this two-file scope.
  // Even perfect declarations, hashes and test fixtures cannot unlock actual totals.
  if (!testOnly) {
    issue('INDEPENDENT_SOURCE_PROVENANCE_NOT_VERIFIED', 'sourceIndex');
    issue('SOURCE_OWNED_COMPLETENESS_NOT_INDEPENDENTLY_VERIFIED', 'coverage');
    issue('OFFICE_APPROVAL_AUTHENTICITY_NOT_VERIFIED', 'approvalSourceRefs');
  }
  const content = {
    schemaVersion: 'd-fiscal-candidate-content-v1',
    evidenceClass: input.evidenceClass,
    scope,
    lineRef: input.lineRef,
    originKind: input.originKind ?? null,
    version: previous ? String(BigInt(previous.content.version) + 1n) : '1',
    predecessorCandidateId: previous?.candidateId ?? null,
    sourcePins,
    budgetRequest: {
      schemaVersion: 'inert-budget-plan-v1',
      evidenceClass: testOnly ? 'TEST_ONLY' : 'UNADMITTED_INERT_INPUT',
      intent: proposedIntent,
      identityCoverage: intent?.identityCoverage ?? null,
      identities: intent?.identities ?? null,
      context,
    },
    existingPr156Validation: 'NOT_RUN_NO_READY_INFERENCE',
    candidateApprovalInputs: {
      proposedPayloadHash: payloadHash,
      requiredOffices,
      evidenceDeclarations: approvals,
      approvalsAuthenticated: false,
    },
    obligations: normalizedObligations,
    coverageSourceRef: bindings.coverage ?? null,
    declaredScope: 'ONE_NEW_BUDGET_LINE_NOT_COMPLETE_ENTITY_OR_COUNTRY',
    testOnlyTotals:
      testOnly && declaredIssues.length === 0
        ? Object.fromEntries(
            Object.entries(sums).map(([k, v]) => [k, render(v)]),
          )
        : null,
    actualTotals: {
      mandatoryNonDebtNative: null,
      committedDiscretionaryNative: null,
      debtServiceNative: null,
    },
    originalFieldPhases: {
      sourceComplete: 'NOT_ESTABLISHED',
      engineeringWired: 'NOT_ESTABLISHED',
      validationPassed: 'NOT_ESTABLISHED',
      formallyAdopted: 'NOT_ESTABLISHED',
    },
    originalClosuresProposed: 0,
    issues,
  };
  return {
    ...identity,
    candidateId: contentHash(content),
    status: unsupported
      ? 'UNSUPPORTED'
      : issues.length
        ? 'BLOCKED_INPUT'
        : 'TEST_ONLY_CANDIDATE',
    content,
  };
}

export function writeCandidate(inputPin, outputDirectory) {
  const input = readPinnedJson(inputPin.path, inputPin.sha256, inputPin.bytes);
  const candidate = produceCandidate(input);
  const bytes = Buffer.from(`${canonical(candidate)}\n`);
  const outputPath = resolve(
    outputDirectory,
    `candidate-${candidate.candidateId}.json`,
  );
  try {
    writeFileSync(outputPath, bytes, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    readPinnedJson(outputPath, digest(bytes), bytes.length);
  }
  return {
    outputPath,
    sha256: digest(bytes),
    bytes: bytes.length,
    candidateId: candidate.candidateId,
    status: candidate.status,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv.length !== 6)
    throw new Error(
      'USAGE: node produce-candidate.mjs INPUT SHA256 BYTES EXISTING_OUTPUT_DIRECTORY',
    );
  console.log(
    JSON.stringify(
      writeCandidate(
        {
          path: process.argv[2],
          sha256: process.argv[3],
          bytes: Number(process.argv[4]),
        },
        process.argv[5],
      ),
      null,
      2,
    ),
  );
}
