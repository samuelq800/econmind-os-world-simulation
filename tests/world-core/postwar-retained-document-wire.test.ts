import assert from 'node:assert/strict';
import { expect, it } from 'vitest';
import { retainedOpeningDocumentWire } from '../support/postwar-retained-power-reuse.js';

it('compares pg timestamptz as the exact saved ISO wire value and retains every source pin', () => {
  const at = '2026-11-08T22:09:42.835Z';
  const evidence = {
    generated_at: at,
    document_ref: 'actual-doc',
    document_sha256: 'a'.repeat(64),
    total_rows: '14',
  };
  const pgRow = { ...evidence, generated_at: new Date(at) };
  expect(retainedOpeningDocumentWire(pgRow)).toEqual(evidence);
  expect(pgRow.generated_at).toBeInstanceOf(Date);
  expect(() =>
    assert.deepEqual(
      retainedOpeningDocumentWire({
        ...pgRow,
        generated_at: new Date('2026-11-08T22:09:42.836Z'),
      }),
      evidence,
    ),
  ).toThrow();
  expect(() =>
    assert.deepEqual(
      retainedOpeningDocumentWire({
        ...pgRow,
        document_sha256: 'b'.repeat(64),
      }),
      evidence,
    ),
  ).toThrow();
  expect(() =>
    retainedOpeningDocumentWire({
      ...pgRow,
      generated_at: new Date('invalid'),
    }),
  ).toThrow();
});
