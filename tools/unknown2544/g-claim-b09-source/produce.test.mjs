import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compileClaimCandidate } from '../../g-claim-source-candidate.mjs';
import {
  produceB09Packet,
  validateB09Relations,
  validateD48Relations,
} from './produce.mjs';

// Explicit local source-audit invocation, using the existing compiler's pins.
const config = JSON.parse(
  readFileSync(process.env.G_CLAIM_SOURCE_CONFIG, 'utf8'),
);
const raw = Object.fromEntries(
  Object.entries(config).map(([key, path]) => [key, readFileSync(path)]),
);
const comparison = readFileSync(process.env.G_CLAIM_COMPARISON_SOURCE);
const supportConfig = JSON.parse(
  readFileSync(process.env.G_CLAIM_SUPPORT_CONFIG, 'utf8'),
);
const support = Object.fromEntries(
  Object.entries(supportConfig).map(([key, path]) => [key, readFileSync(path)]),
);

test('four real source associations preserve original nulls and eight opposite legs', () => {
  const output = produceB09Packet(raw, comparison, support);
  assert.equal(output.rows.length, 4);
  assert.equal(new Set(output.rows.map((r) => r.stableId)).size, 4);
  for (const r of output.rows) {
    assert.equal(r.field, 'actualLegalHolderIssuer');
    assert.deepEqual(r.candidateActualValue, r.before);
    assert.equal(r.before.unit, 'REGISTER');
    assert.equal(r.before.value, null);
    assert.equal(r.actualAdoptionEvidence, null);
    assert.equal(r.closureProposed, false);
    assert.equal(r.candidateAssociation.principalCount, 1);
    assert.equal(r.candidateAssociation.registrationCount, 2);
    assert.equal(r.candidateAssociation.d48.sourceLeaves.length, 12);
  }
  assert.equal(output.statistics.originalClosuresProposed, 0);
  assert.ok(Object.values(output.authority).every((v) => v === false));
});

test('serialized packet resolves all four local associations and preserves external source bases', () => {
  const packet = JSON.parse(
    JSON.stringify(produceB09Packet(raw, comparison, support)),
  );
  const resolvePointer = (document, pointer) =>
    pointer
      .split('/')
      .slice(1)
      .reduce(
        (value, key) =>
          value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')],
        document,
      );
  const documents = Object.fromEntries(
    Object.entries(raw).map(([key, bytes]) => [key, JSON.parse(bytes)]),
  );
  for (const [index, row] of packet.rows.entries()) {
    assert.equal(Object.hasOwn(row, 'scenarioTemplatePointer'), false);
    assert.equal(row.candidateAssociationPointerBase, 'THIS_PACKET');
    assert.equal(
      row.candidateAssociationPointer,
      `/rows/${index}/candidateAssociation`,
    );
    const association = resolvePointer(packet, row.candidateAssociationPointer);
    assert.equal(association, row.candidateAssociation);
    assert.ok(
      association.legs.every(
        (leg) => leg.proposedRegistration.canonicalClaimId === row.ownerId,
      ),
    );
    assert.equal(
      resolvePointer(
        documents[row.originalRecord.source],
        row.originalRecord.pointer,
      ).stableId,
      row.stableId,
    );
    assert.equal(
      resolvePointer(documents[row.sourceField.source], row.sourceField.pointer)
        .value,
      null,
    );
    const terms = resolvePointer(
      documents[association.instrument.source.source],
      association.instrument.source.pointer,
    );
    assert.equal(terms.canonicalClaimId, row.ownerId);
    assert.equal(terms.issuerCBEntityId, association.instrument.issuerId);
    assert.equal(terms.creditorCBEntityId, association.instrument.holderId);
    assert.equal(terms.nativePrincipal, association.instrument.principal);
    assert.equal(
      resolvePointer(JSON.parse(comparison), association.comparison.pointer)
        .canonicalClaimId,
      row.ownerId,
    );
    assert.equal(
      resolvePointer(JSON.parse(support.d48), association.d48.pointer).stableId,
      row.stableId,
    );
  }
});

const cases = [
  [
    'duplicate claim',
    (c) => (c.scenarios[1] = c.scenarios[0]),
    /DUPLICATE_CLAIM/,
  ],
  [
    'third leg',
    (c) =>
      c.scenarios[0].pairedRegistrations.push(
        c.scenarios[0].pairedRegistrations[0],
      ),
    /EXACT_TWO_LEGS/,
  ],
  [
    'two liability legs',
    (c) =>
      (c.scenarios[0].pairedRegistrations[1].proposedRegistration.role =
        'LIABILITY'),
    /OPPOSITE_LEGS/,
  ],
  [
    'liability owner used as creditor',
    (c) =>
      (c.scenarios[0].proposedInstrument.holderId =
        c.scenarios[0].proposedInstrument.issuerId),
    /LEGAL_ROLE_DIRECTION/,
  ],
  [
    'foreign instrument',
    (c) =>
      (c.scenarios[0].pairedRegistrations[0].proposedRegistration.canonicalClaimId =
        c.scenarios[1].originalClaimSelector),
    /SAME_INSTRUMENT_TERMS_POINTER/,
  ],
  [
    'foreign terms pointer',
    (c) =>
      (c.scenarios[0].pairedRegistrations[0].proposedRegistration.termsPointer =
        '/terms/1'),
    /SAME_INSTRUMENT_TERMS_POINTER/,
  ],
  [
    'LC valuation used as denomination',
    (c) =>
      (c.scenarios[0].pairedRegistrations[0].proposedRegistration.nativeCurrency =
        'LC09'),
    /SAME_NATIVE_AMOUNT_AND_CURRENCY/,
  ],
  [
    'doubled principal from mirrors',
    (c) => (c.scenarios[0].proposedInstrument.principal = '999000000'),
    /SAME_NATIVE_AMOUNT_AND_CURRENCY/,
  ],
];
for (const [name, mutate, expected] of cases) {
  test(`source relation rejects ${name}`, () => {
    const c = compileClaimCandidate(raw);
    mutate(c);
    assert.throws(() => validateB09Relations(c), expected);
  });
}

test('untrusted changed raw source or comparison cannot enter the packet', () => {
  assert.throws(
    () =>
      produceB09Packet(
        { ...raw, annual: Buffer.concat([raw.annual, Buffer.from(' ')]) },
        comparison,
        support,
      ),
    /PIN_MISMATCH:annual/,
  );
  assert.throws(
    () =>
      produceB09Packet(
        raw,
        Buffer.concat([comparison, Buffer.from(' ')]),
        support,
      ),
    /COMPARISON_PIN_MISMATCH/,
  );
  assert.throws(
    () =>
      produceB09Packet(raw, comparison, {
        ...support,
        d48: Buffer.concat([support.d48, Buffer.from(' ')]),
      }),
    /SUPPORT_PIN_MISMATCH:d48/,
  );
});

for (const [name, mutate, expected] of [
  [
    'D48 counterparty reversed',
    (d) =>
      (d.records[0].reusedMirrorRows[0].counterpartyId =
        'ENTITY_CENTRAL_BANK_24'),
    /D48_LEGAL_ROLE_DIRECTION/,
  ],
  [
    'D48 duplicate source leaf',
    (d) => (d.sourceFieldDelta[1] = d.sourceFieldDelta[0]),
    /D48_DUPLICATE_POINTER/,
  ],
  [
    'D48 title promotion',
    (d) => (d.records[0].eligibleForClosure = true),
    /D48_NOT_TITLE/,
  ],
  [
    'D48 book used as native cash',
    (d) =>
      (d.records[0].reusedMirrorRows[0].nativeAmount =
        d.records[0].reusedMirrorRows[0].book.amount),
    /D48_NATIVE_AMOUNT_CURRENCY/,
  ],
]) {
  test(`source relation rejects ${name}`, () => {
    const d = JSON.parse(support.d48);
    mutate(d);
    assert.throws(
      () =>
        validateD48Relations(
          compileClaimCandidate(raw),
          d,
          JSON.parse(support.positions),
        ),
      expected,
    );
  });
}
