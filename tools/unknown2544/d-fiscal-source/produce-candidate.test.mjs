import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { digest } from './intake.mjs';
import {
  canonical,
  contentHash,
  produceCandidate,
  writeCandidate,
} from './produce-candidate.mjs';

function fixture(change = () => {}, mode = 'TEST_ONLY') {
  const directory = mkdtempSync(join(tmpdir(), 'econmind-d-source-candidate-'));
  const scope = {
    worldId: mode === 'TEST_ONLY' ? 'TEST_ONLY_WORLD' : 'WORLD_UNADMITTED',
    openingIdentity: 'UNADMITTED_OPENING_DECLARATION',
    scenarioId:
      mode === 'TEST_ONLY' ? 'TEST_ONLY_SCENARIO' : 'UNADMITTED_SCENARIO',
    countryId: mode === 'TEST_ONLY' ? 'TEST_ONLY_COUNTRY' : 'COUNTRY_01',
    entityRef:
      mode === 'TEST_ONLY' ? 'TEST_ONLY_ENTITY' : 'ENTITY_GOVERNMENT_01',
    currency: 'XAA',
    effectivePeriodRef: 'PERIOD_1',
    cutoff: { worldVersion: '1', eventSequence: '2', simTime: '0' },
  };
  const lineRef = 'TEST_OR_UNADMITTED_LINE';
  const leaves = {};
  const leaf = (ref, kind, body) =>
    (leaves[ref] = { kind, scope, lineRef, ...body });
  const payload = {
    operation: 'APPROVE_NEW_LINE',
    scope: {
      worldId: scope.worldId,
      countryId: scope.countryId,
      entityRef: scope.entityRef,
      envelopeRef: 'ENVELOPE_1',
      effectivePeriodRef: scope.effectivePeriodRef,
    },
    currency: scope.currency,
    amount: '100',
    envelopeRevisionRef: 'ENVELOPE_V1',
    lineRef,
    revisionRef: 'APPROPRIATION_V1',
    predecessorRevisionRef: null,
  };
  leaf('intent', 'BUDGET_INTENT', {
    intent: {
      schemaVersion: 'inert-budget-intent-v1',
      commandId: 'COMMAND_1',
      idempotencyKey: 'KEY_1',
      actorRef: 'ACTOR_1',
      authSubjectRef: 'SUBJECT_1',
      authorizationVersion: 'AUTH_V1',
      office: 'FINANCE',
      expectedHead: scope.cutoff,
      payload,
    },
    identityCoverage: {
      worldId: scope.worldId,
      commandIds: ['COMMAND_1'],
      idempotencyKeys: ['KEY_1'],
    },
    identities: [],
  });
  leaf('context', 'BUDGET_CONTEXT', {
    context: {
      head: scope.cutoff,
      policy: {
        classification: 'ORDINARY_DEPARTMENTAL',
        captain: 'NOT_REQUIRED',
        ruleRef: 'RULE_1',
        revision: 'RULE_V1',
        binding: payload,
      },
    },
  });
  leaf('approval', 'OFFICE_APPROVAL_EVIDENCE', {
    office: 'FINANCE',
    status: 'APPROVED',
    payloadHash: contentHash(payload),
    proposalVersion: 'APPROPRIATION_V1',
    ruleRef: 'RULE_1',
    ruleRevision: 'RULE_V1',
    authorizationRevision: 'AUTH_DECLARED_V1',
    originalApprovalLocator: 'TEST_ONLY_LOCATOR',
  });
  leaf('creation', 'BUDGET_LINE_CREATION', {
    origin: 'GENUINELY_NEW_LINE',
    predecessorLineRef: null,
    creationEventRef: 'CREATE_1',
  });
  leaf('initialization', 'BUDGET_LINE_INITIALIZATION', {
    creationEventRef: 'CREATE_1',
    initializationEventRef: 'INIT_1',
    explicitEmptyInventory: { paid: [], outstanding: [], reserved: [] },
  });
  leaf('precision', 'MONEY_PRECISION', { scale: '2', rounding: 'EXACT_ONLY' });
  leaf('attestation', 'COVERAGE_ATTESTATION', {
    declaredInventoryOwner: scope.entityRef,
  });
  leaf('coverage', 'REGISTER_COVERAGE', {
    bound: 'ONE_NEW_BUDGET_LINE',
    origin: 'NEW_LINE_CREATION',
    predecessorRef: null,
    terminalCutoff: scope.cutoff,
    inventoryRef: 'INVENTORY_1',
    inventoryRevision: 'V1',
    obligationIds: ['OBL_1'],
    componentIds: ['COMPONENT_1'],
    attestationSourceRef: 'attestation',
  });
  leaf('legal', 'LEGAL_BASIS', {
    obligationId: 'OBL_1',
    legalCategory: 'PUBLIC_PAYROLL',
    legallyEnforceable: 'YES',
    commitmentStatus: 'YES',
    originalLegalLocator: 'TEST_ONLY_LEGAL_LOCATOR',
  });
  leaf('classification', 'CLASSIFICATION', {
    obligationId: 'OBL_1',
    legalBasisSourceRef: 'legal',
    category: 'MANDATORY_NON_DEBT',
    ruleRef: 'FINANCE_U0243',
    ruleRevision: 'BASE_1A40309',
  });
  leaf('obligation', 'OBLIGATION', {
    obligationId: 'OBL_1',
    componentId: 'COMPONENT_1',
    revision: 'V1',
    payer: scope.entityRef,
    beneficiary: 'TEST_OR_UNADMITTED_PAYEE',
    dueRef: 'DUE_1',
    currency: scope.currency,
    periodRef: scope.effectivePeriodRef,
    originalAmount: '10.25',
    legalBasisSourceRef: 'legal',
    classificationSourceRef: 'classification',
    allocationSourceRefs: ['paid', 'released'],
  });
  leaf('paid', 'SETTLED_ALLOCATION', {
    obligationId: 'OBL_1',
    componentId: 'COMPONENT_1',
    operationId: 'OP_PAID',
    postingId: 'POST_PAID',
    portionId: 'PORTION_PAID',
    causationRef: 'RECEIPT_PAID',
    amount: '2.1',
    currency: scope.currency,
    periodRef: scope.effectivePeriodRef,
    effect: 'SETTLED',
  });
  leaf('released', 'SETTLED_ALLOCATION', {
    obligationId: 'OBL_1',
    componentId: 'COMPONENT_1',
    operationId: 'OP_RELEASED',
    postingId: 'POST_RELEASED',
    portionId: 'PORTION_RELEASED',
    causationRef: 'RECEIPT_RELEASED',
    amount: '1.05',
    currency: scope.currency,
    periodRef: scope.effectivePeriodRef,
    effect: 'RELEASED',
  });
  const input = {
    schemaVersion: 'd-fiscal-producer-input-v1',
    evidenceClass: mode,
    scope,
    lineRef,
    originKind: 'NEW_SCENARIO_PROPOSAL',
    operation: 'APPROVE_NEW_LINE',
    budgetClass: 'ORDINARY_DEPARTMENTAL',
    approvalMode: 'UNCONDITIONAL',
    appropriationMode: 'FULL',
    predecessor: null,
    bindings: {
      creation: 'creation',
      initialization: 'initialization',
      precision: 'precision',
      coverage: 'coverage',
      budgetIntent: 'intent',
      budgetContext: 'context',
    },
    approvalSourceRefs: ['approval'],
    obligationSourceRefs: ['obligation'],
    sourceIndex: [],
  };
  change({ input, leaves });
  const path = join(directory, 'source.json');
  const bytes = Buffer.from(JSON.stringify(leaves));
  writeFileSync(path, bytes);
  input.sourceIndex = Object.keys(leaves).map((ref) => ({
    ref,
    path,
    bytes: bytes.length,
    sha256: digest(bytes),
    pointer: `/${ref}`,
    ownerRef: scope.entityRef,
    schemaVersion: 'TEST_OR_UNADMITTED_V1',
    sourceRevision: 'V1',
    evidenceClass: mode === 'TEST_ONLY' ? 'TEST_ONLY' : 'CONSTRUCTED',
  }));
  return { input, leaves, directory };
}
const run = (change, mode) => produceCandidate(fixture(change, mode).input);
const codes = (result) => result.content.issues.map((i) => i.code);

test('1: pinned leaves produce exact isolated candidate, no actual money or closure', () => {
  const f = fixture();
  const result = produceCandidate(f.input);
  const inputPath = join(f.directory, 'TEST_ONLY_INPUT.json');
  writeFileSync(inputPath, JSON.stringify(f.input), { flag: 'wx' });
  console.log('TEST_ONLY_FIXTURE_EVIDENCE ' + JSON.stringify({ inputPath }));
  assert.equal(result.status, 'TEST_ONLY_CANDIDATE');
  assert.deepEqual(result.content.testOnlyTotals, {
    mandatoryNonDebtNative: '7.1',
    committedDiscretionaryNative: '0',
    debtServiceNative: '0',
  });
  assert.ok(
    Object.values(result.content.actualTotals).every((v) => v === null),
  );
  assert.equal(result.productionAuthority, false);
  assert.equal(result.content.originalClosuresProposed, 0);
  assert.ok(
    Object.values(result.content.originalFieldPhases).every(
      (v) => v === 'NOT_ESTABLISHED',
    ),
  );
});
test('1: bad source hash/pointer and duplicate source identity fail closed', () => {
  const f = fixture();
  f.input.sourceIndex[0].sha256 = '0'.repeat(64);
  assert.throws(() => produceCandidate(f.input), /SOURCE_HASH_MISMATCH/);
  const g = fixture();
  g.input.sourceIndex[0].pointer = '/missing';
  assert.throws(() => produceCandidate(g.input), /SOURCE_POINTER_MISSING/);
  const h = fixture();
  h.input.sourceIndex.push(h.input.sourceIndex[0]);
  assert.throws(
    () => produceCandidate(h.input),
    /DUPLICATE_OR_INVALID_SOURCE_REF/,
  );
});
test('2: perfect declarations and caller trusted/complete flags never authorize actual scope', () => {
  const result = run(({ input }) => {
    input.trusted = true;
    input.complete = true;
    input.approved = true;
  }, 'UNADMITTED_SOURCE_INPUT');
  assert.equal(result.status, 'BLOCKED_INPUT');
  assert.equal(result.content.testOnlyTotals, null);
  assert.ok(
    codes(result).includes('INDEPENDENT_SOURCE_PROVENANCE_NOT_VERIFIED'),
  );
  assert.ok(
    Object.values(result.content.actualTotals).every((v) => v === null),
  );
});
test('2: TEST_ONLY namespace cannot target original entity or actual source index', () => {
  const f = fixture();
  f.input.scope.entityRef = 'ENTITY_GOVERNMENT_01';
  assert.throws(() => produceCandidate(f.input), /TEST_NAMESPACE_REQUIRED/);
  const g = fixture(undefined, 'UNADMITTED_SOURCE_INPUT');
  g.input.sourceIndex[0].evidenceClass = 'TEST_ONLY';
  assert.throws(() => produceCandidate(g.input), /SOURCE_EVIDENCE_NAMESPACE/);
});
test('2: missing actual currency/period/cutoff stay null, never fabricated zero head', () => {
  const f = fixture(undefined, 'UNADMITTED_SOURCE_INPUT');
  f.input.scope = {
    ...f.input.scope,
    worldId: null,
    openingIdentity: null,
    currency: null,
    effectivePeriodRef: null,
    cutoff: null,
  };
  f.input.sourceIndex = [];
  f.input.obligationSourceRefs = [];
  f.input.approvalSourceRefs = [];
  const r = produceCandidate(f.input);
  assert.equal(r.status, 'BLOCKED_INPUT');
  assert.equal(r.content.scope.cutoff, null);
  assert.equal(r.content.scope.currency, null);
  assert.equal(r.content.scope.effectivePeriodRef, null);
  assert.ok(codes(r).includes('SOURCE_CUTOFF_MISSING'));
});
test('3: canonical deterministic write is immutable and idempotent', () => {
  const f = fixture();
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
  assert.equal(
    produceCandidate(f.input).candidateId,
    produceCandidate(f.input).candidateId,
  );
  const path = join(f.directory, 'input.json');
  const bytes = Buffer.from(JSON.stringify(f.input));
  writeFileSync(path, bytes);
  const pin = { path, sha256: digest(bytes), bytes: bytes.length };
  const first = writeCandidate(pin, f.directory);
  const again = writeCandidate(pin, f.directory);
  assert.deepEqual(first, again);
  writeFileSync(first.outputPath, '{}');
  assert.throws(
    () => writeCandidate(pin, f.directory),
    /SOURCE_SIZE_MISMATCH|SOURCE_HASH_MISMATCH/,
  );
});
test('3: changed payload invalidates prior approval target', () => {
  assert.ok(
    codes(
      run(({ leaves }) => {
        leaves.intent.intent.payload.amount = '101';
      }),
    ).includes('APPROVAL_DECLARATION_MISSING_REVOKED_OR_STALE'),
  );
});
test('3: predecessor requires exact scope and immutable original obligation identity', () => {
  const f = fixture();
  const prior = produceCandidate(f.input);
  const priorPath = join(f.directory, 'prior.json');
  const bytes = Buffer.from(canonical(prior));
  writeFileSync(priorPath, bytes);
  f.input.predecessor = {
    path: priorPath,
    bytes: bytes.length,
    sha256: digest(bytes),
  };
  const next = produceCandidate(f.input);
  assert.equal(next.content.version, '2');
  assert.equal(next.content.predecessorCandidateId, prior.candidateId);
  const g = fixture(({ leaves }) => {
    leaves.obligation.originalAmount = '11';
  });
  g.input.predecessor = f.input.predecessor;
  assert.ok(
    codes(produceCandidate(g.input)).includes(
      'MIGRATION_REQUIRED_ORIGINAL_OBLIGATION',
    ),
  );
});
test('4: subset coverage or wider entity register scope blocks all candidate totals', () => {
  assert.equal(
    run(({ leaves }) => {
      leaves.coverage.obligationIds.push('MISSING_OBLIGATION');
    }).content.testOnlyTotals,
    null,
  );
  assert.ok(
    codes(
      run(({ leaves }) => {
        leaves.coverage.bound = 'COMPLETE_ENTITY';
      }),
    ).includes('COVERAGE_ORIGIN_CHAIN_OR_BOUND_MISSING'),
  );
});
test('5: duplicate obligation/component blocks, never double counts', () => {
  const result = run(({ input }) => {
    input.obligationSourceRefs.push('obligation');
  });
  assert.ok(
    codes(result).includes('DUPLICATE_OR_INVALID_OBLIGATION_COMPONENT'),
  );
  assert.equal(result.content.testOnlyTotals, null);
});
test('5: mandatory committed payroll cannot be relabelled discretionary', () => {
  const result = run(({ leaves }) => {
    leaves.classification.category = 'COMMITTED_DISCRETIONARY';
  });
  assert.ok(codes(result).includes('MANDATORY_BASELINE_MISCLASSIFIED'));
  assert.equal(result.content.testOnlyTotals, null);
});
test('5: debt separate from mandatory non-debt', () => {
  const result = run(({ leaves }) => {
    leaves.legal.legalCategory = 'DEBT_INTEREST';
    leaves.classification.category = 'DEBT_SERVICE';
  });
  assert.deepEqual(result.content.testOnlyTotals, {
    mandatoryNonDebtNative: '0',
    committedDiscretionaryNative: '0',
    debtServiceNative: '7.1',
  });
});
test('5: duplicate paid/released portion and overpayment block', () => {
  assert.ok(
    codes(
      run(({ leaves }) => {
        leaves.released.portionId = leaves.paid.portionId;
      }),
    ).includes('DUPLICATE_OR_AMBIGUOUS_POSTING'),
  );
  assert.ok(
    codes(
      run(({ leaves }) => {
        leaves.paid.amount = '99';
      }),
    ).includes('OVERPAID_OR_OVERRELEASED'),
  );
});
test('5: missing legal status/basis, currency, period and precision never become zero', () => {
  const changes = [
    ({ leaves }) => {
      leaves.legal.legallyEnforceable = 'UNKNOWN';
    },
    ({ leaves }) => {
      leaves.legal.commitmentStatus = 'UNKNOWN';
    },
    ({ leaves }) => {
      delete leaves.obligation.legalBasisSourceRef;
    },
    ({ leaves }) => {
      leaves.obligation.currency = 'GCU';
    },
    ({ leaves }) => {
      leaves.obligation.periodRef = 'OTHER';
    },
    ({ leaves }) => {
      leaves.precision.scale = null;
    },
    ({ leaves }) => {
      leaves.obligation.originalAmount = '0.001';
    },
  ];
  for (const change of changes)
    assert.equal(run(change).content.testOnlyTotals, null);
});
test('6: explicit bounded empty baseline only, no archive/cache fallback', () => {
  const empty = ({ input, leaves }) => {
    input.obligationSourceRefs = [];
    leaves.coverage.obligationIds = [];
    leaves.coverage.componentIds = [];
  };
  const good = run(empty);
  assert.equal(good.status, 'TEST_ONLY_CANDIDATE');
  const bad = run((f) => {
    empty(f);
    f.input.bindings.initialization = null;
  });
  assert.ok(codes(bad).includes('EMPTY_ARCHIVE_IS_NOT_EMPTY_BASELINE'));
  assert.equal(bad.content.testOnlyTotals, null);
});
test('7: wrong source owner scope/head and absent/revoked/superseded approval block', () => {
  for (const status of ['REVOKED', 'SUPERSEDED', 'MISSING']) {
    const r = run(({ leaves }) => {
      leaves.approval.status = status;
    });
    assert.ok(
      codes(r).includes('APPROVAL_DECLARATION_MISSING_REVOKED_OR_STALE'),
    );
  }
  assert.ok(
    codes(
      run(({ input }) => {
        input.approvalSourceRefs = [];
      }),
    ).includes('REQUIRED_OFFICE_EVIDENCE_MISSING'),
  );
  assert.ok(
    codes(
      run(({ leaves }) => {
        leaves.legal.scope = { ...leaves.legal.scope, entityRef: 'OTHER' };
      }),
    ).includes('SOURCE_SCOPE_MISMATCH'),
  );
  assert.ok(
    codes(
      run(({ leaves }) => {
        leaves.coverage.terminalCutoff = {
          ...leaves.coverage.terminalCutoff,
          eventSequence: '999',
        };
      }),
    ).includes('COVERAGE_ORIGIN_CHAIN_OR_BOUND_MISSING'),
  );
});
test('7: legacy/project/conditional/partial are unsupported, no PR156 widening', () => {
  for (const [key, value] of [
    ['originKind', 'HISTORICAL_IMPORT'],
    ['budgetClass', 'PROJECT'],
    ['approvalMode', 'CONDITIONAL'],
    ['appropriationMode', 'PARTIAL'],
  ]) {
    assert.equal(
      run(({ input }) => {
        input[key] = value;
      }).status,
      'UNSUPPORTED',
    );
  }
});
test('8: outputs contain no admission/runtime/permission or original-ID acceptance grant', () => {
  const r = run();
  assert.equal(r.sourceAdmitted, false);
  assert.equal(r.runtimeConnected, false);
  assert.equal(r.content.candidateApprovalInputs.approvalsAuthenticated, false);
  assert.equal(r.content.existingPr156Validation, 'NOT_RUN_NO_READY_INFERENCE');
  assert.equal(
    r.content.declaredScope,
    'ONE_NEW_BUDGET_LINE_NOT_COMPLETE_ENTITY_OR_COUNTRY',
  );
});
