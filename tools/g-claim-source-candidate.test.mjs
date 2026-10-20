import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  compileClaimCandidate,
  SOURCE_PINS,
  validateSourceRelations,
} from './g-claim-source-candidate.mjs';

const config = JSON.parse(
  readFileSync(process.env.G_CLAIM_SOURCE_CONFIG, 'utf8'),
);
const raw = Object.fromEntries(
  Object.keys(SOURCE_PINS).map((key) => [key, readFileSync(config[key])]),
);
const documents = () =>
  Object.fromEntries(
    Object.entries(raw).map(([k, b]) => [k, JSON.parse(b.toString('utf8'))]),
  );
const originalBytes = Object.fromEntries(
  Object.entries(raw).map(([k, b]) => [k, Buffer.from(b)]),
);

test('fixed sources compile all 24 original IDs into six actual plan batches without changing values', () => {
  const result = compileClaimCandidate(raw);
  assert.equal(result.fieldMappings.length, 24);
  assert.equal(new Set(result.fieldMappings.map((r) => r.stableId)).size, 24);
  for (const id of ['B01', 'B05', 'B09', 'B14', 'B15', 'B17']) {
    assert.equal(
      result.fieldMappings.filter((r) => r.adoptedPlanBatch === id).length,
      4,
    );
  }
  for (const r of result.fieldMappings) {
    assert.deepEqual(r.before, r.candidateActualValue);
    for (const stage of [
      'sourceComplete',
      'engineeringWired',
      'validationPassed',
      'formallyAdopted',
      'closureProposed',
    ]) {
      assert.equal(r[stage], false);
    }
    assert.equal(r.candidateActualValue.value, null);
    assert.equal(r.scenarioTemplateIsActualFieldCompletion, false);
  }
  assert.equal(result.statistics.originalClosuresProposed, 0);
});

test('separate scenario namespace retains one principal and two equal, correctly directed registrations', () => {
  const result = compileClaimCandidate(raw);
  assert.equal(result.scenarios.length, 4);
  for (const s of result.scenarios) {
    assert.equal(s.sourceClass, 'CONSTRUCTED_SCENARIO');
    assert.ok(s.scenarioId.startsWith('DRAFT_SCENARIO_20261018::'));
    assert.equal(s.principalCount, 1);
    const [liability, asset] = s.pairedRegistrations.map(
      (r) => r.proposedRegistration,
    );
    assert.equal(liability.role, 'LIABILITY');
    assert.equal(asset.role, 'ASSET');
    assert.equal(liability.holderId, s.proposedInstrument.issuerId);
    assert.equal(asset.holderId, s.proposedInstrument.holderId);
    assert.equal(liability.nativeAmount, s.proposedInstrument.principal);
    assert.equal(asset.nativeAmount, s.proposedInstrument.principal);
    assert.equal(liability.nativeCurrency, asset.nativeCurrency);
    assert.equal(s.proposedInstrument.legalTitleVerified, false);
  }
});

test('both proposal calendars retain exact full source terms with no chosen term, epoch or Day0 due', () => {
  const result = compileClaimCandidate(raw);
  const docs = documents();
  for (const s of result.scenarios) {
    assert.deepEqual(
      s.alternatives.map((a) => a.relativePrincipalDueSimDay),
      [140, 360],
    );
    assert.deepEqual(
      s.alternatives[0].completeOriginalProposal,
      docs.short.terms.find(
        (r) => r.canonicalClaimId === s.originalClaimSelector,
      ),
    );
    assert.deepEqual(
      s.alternatives[1].completeOriginalProposal,
      docs.annual.terms.find(
        (r) => r.canonicalClaimId === s.originalClaimSelector,
      ),
    );
    assert.ok(
      s.alternatives.every((a) => a.adopted === false && a.selected === false),
    );
    assert.equal(s.temporalBinding.openingEpoch, null);
    assert.equal(s.temporalBinding.actualDue, null);
    assert.equal(s.temporalBinding.accrualComputed, false);
    assert.equal(s.temporalBinding.day0PaymentComputed, false);
  }
});

test('missing cash, fees and route remain unresolved, never converted into a calculation declaration', () => {
  const result = compileClaimCandidate(raw);
  for (const s of result.scenarios) {
    assert.equal(s.accountBinding.issuerCash, null);
    assert.equal(s.accountBinding.holderCash, null);
    assert.equal(s.accountBinding.availableNativeCash, null);
    assert.equal(s.atomicRoute.status, 'PORT_NOT_INSTALLED');
    assert.equal(s.atomicRoute.formalPaymentAllowed, false);
    assert.equal(s.atomicRoute.calculationDtoEmitted, false);
    assert.equal(
      s.alternatives[1].completeOriginalProposal.paymentFeeRule,
      'UNKNOWN_OWNER_SOURCE_RULE_REQUIRED',
    );
  }
  assert.ok(Object.values(result.authority).every((value) => value === false));
});

for (const key of Object.keys(SOURCE_PINS)) {
  test(`byte pin rejects replaced ${key} source, even valid JSON with the same meaning`, () => {
    assert.throws(
      () =>
        compileClaimCandidate({
          ...raw,
          [key]: Buffer.concat([raw[key], Buffer.from(' ')]),
        }),
      new RegExp(`PIN_MISMATCH:${key}`),
    );
  });
}

const corruptions = [
  [
    'missing original stableID',
    (d) => {
      d.ledger.records = d.ledger.records.filter(
        (r) =>
          r.stableId !== 'U2544::CLAIM::SCENE_CLEARING_09_24_V2::actualTerms',
      );
    },
  ],
  [
    'duplicate original stableID',
    (d) => {
      d.ledger.records.push(
        structuredClone(d.ledger.records.find((r) => r.scope === 'CLAIM')),
      );
    },
  ],
  [
    'foreign stableID',
    (d) => {
      d.ledger.records.find((r) => r.scope === 'CLAIM').stableId += '_FOREIGN';
    },
  ],
  [
    'wrong batch root cause',
    (d) => {
      d.batches.find((b) => b.batchId === 'B05').rootCause = 'RC_OTHER';
    },
  ],
  [
    'default zero in an original field',
    (d) => {
      d.claims.claims[0].actualDue.value = 0;
    },
  ],
  [
    'constructed GCU promoted to historical denomination',
    (d) => {
      d.claims.claims[0].originalHistoricalNativeCurrency = {
        status: 'KNOWN',
        value: 'GCU',
        currency: 'GCU',
      };
    },
  ],
  [
    'changed principal',
    (d) => {
      d.annual.terms[0].nativePrincipal = '0';
    },
  ],
  [
    'native LC substituted for GCU mirror',
    (d) => {
      d.annual.pairedExistingPositions[0].nativeCurrency = 'XAA';
    },
  ],
  [
    'second mirror amount mismatch',
    (d) => {
      d.annual.pairedExistingPositions[1].nativeAmount = '499500001';
    },
  ],
  [
    'reversed legal roles',
    (d) => {
      d.annual.pairedExistingPositions[0].holderId =
        d.annual.terms[0].creditorCBEntityId;
    },
  ],
  [
    'two liability mirrors',
    (d) => {
      d.annual.pairedExistingPositions[1].role = 'LIABILITY';
    },
  ],
  [
    'extra mirror double counting',
    (d) => {
      d.annual.pairedExistingPositions.push(
        structuredClone(d.annual.pairedExistingPositions[0]),
      );
    },
  ],
  [
    'proposal adoption flag',
    (d) => {
      d.annual.terms[0].newTermsAdopted = true;
    },
  ],
  [
    'first-year due accelerated to Day0',
    (d) => {
      d.annual.terms[0].firstPrincipalDueSimDay = 0;
    },
  ],
  [
    'history recovery assertion without evidence',
    (d) => {
      d.history.records[0].actualValueRecovered = true;
    },
  ],
];
for (const [name, mutate] of corruptions) {
  test(`relation check rejects ${name}`, () => {
    const d = documents();
    mutate(d);
    assert.throws(() => validateSourceRelations(d));
  });
}

test('compilation is deterministic and neither mutates source buffers nor aliases result documents', () => {
  const a = compileClaimCandidate(raw);
  const b = compileClaimCandidate(raw);
  assert.deepEqual(a, b);
  a.scenarios[0].alternatives[1].completeOriginalProposal.nativePrincipal =
    'BAD';
  assert.equal(
    b.scenarios[0].alternatives[1].completeOriginalProposal.nativePrincipal,
    '499500000',
  );
  for (const key of Object.keys(raw))
    assert.deepEqual(raw[key], originalBytes[key]);
});
