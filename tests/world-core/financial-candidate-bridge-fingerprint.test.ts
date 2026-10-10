/** F-B-01: real original producer output reaches the exact bridge predicate.
 * Generated mechanism values remain NON-FORMAL; no adoption proof is issued. */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  canonicalSerialize,
  canonicalSha256,
  canonicalHashInput,
} from '@econmind/core';
import {
  loadOwnerNonHostSourceAdoption,
  type FinancialSupplementAdoption,
} from '../../apps/world-worker/src/preparation/owner-non-host-source-adoption.js';
import { parseFormalFinancialOpeningContract } from '../../apps/world-worker/src/preparation/formal-financial-opening-contract.js';
import {
  produceFormalFinancialOpening,
  type FormalFinancialCandidate,
  type FormalFinancialOpeningResult,
} from '../../apps/world-worker/src/preparation/formal-financial-opening-producer.js';
import {
  hasOriginalFinancialCandidateFingerprint,
  prepareFinancialSupplementOpeningSeed,
} from '../../apps/world-worker/src/preparation/opening-canonical-seed-bridge.js';
import { financialCompositionVector } from '../support/financial-composition-vector.js';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const sha = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
let result: FormalFinancialOpeningResult, candidate: FormalFinancialCandidate;
beforeAll(async () => {
  const parent = await loadOwnerNonHostSourceAdoption({
    repositoryRoot,
    ownerDocumentPath: path.join(
      repositoryRoot,
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISIONS.original.md',
    ),
    rootReceiptPath: path.join(
      repositoryRoot,
      'docs/governance/owner-inputs/2026-10-07/OWNER_NON_HOST_DECISION_RECEIPT.json',
    ),
    scope: { environment: 'NON_ACTIVATED_PREPARATION', worldId: null },
  });
  const input = financialCompositionVector(parent);
  expect(input.evidenceKind).toBe('MECHANISM_TEST_VECTOR');
  result = produceFormalFinancialOpening({
    adoption: parent,
    contract: parseFormalFinancialOpeningContract(input, parent),
  });
  expect(result.candidate).not.toBeNull();
  candidate = result.candidate!;
});

describe('F-B-01 original producer / bridge fingerprint compatibility only', () => {
  it('accepts the actual original producer fingerprint without relabelling mechanism output', () => {
    const { fingerprint, ...body } = candidate;
    expect(fingerprint).toBe('sha256:' + sha(canonicalSerialize(body)));
    expect(hasOriginalFinancialCandidateFingerprint(candidate)).toBe(true);
    expect(candidate.provenance).toBe(
      'UNADOPTED_FINANCIAL_CALCULATION_NOT_IMPORTABLE',
    );
    expect(result).toMatchObject({
      status: 'BLOCKED',
      seed: null,
      admissionAllowed: false,
      activationAllowed: false,
    });
    expect(result.blockers.map((b) => b.code)).toEqual(
      expect.arrayContaining([
        'MECHANISM_VECTOR_NOT_FORMAL_SOURCE',
        'SUPPLEMENTAL_FINANCIAL_SOURCE_ADOPTION_UNRESOLVED',
        'FORMAL_WORLD_BINDING_UNRESOLVED',
      ]),
    );
  });
  it('rejects the domain-prefixed shared-hash protocol and other wrong fingerprints', () => {
    const { fingerprint, ...body } = candidate;
    const domainPrefixed = canonicalSha256(canonicalHashInput(body), sha);
    expect(domainPrefixed).not.toBe(fingerprint);
    for (const wrong of [
      domainPrefixed,
      'sha256:' + '0'.repeat(64),
      fingerprint.slice('sha256:'.length),
    ])
      expect(
        hasOriginalFinancialCandidateFingerprint({
          ...candidate,
          fingerprint: wrong,
        }),
      ).toBe(false);
  });
  it('rejects changed authoritative candidate content under its stale original fingerprint', () => {
    expect(
      hasOriginalFinancialCandidateFingerprint({
        ...candidate,
        requestedWorldId: candidate.requestedWorldId + '_CHANGED',
      }),
    ).toBe(false);
    expect(
      hasOriginalFinancialCandidateFingerprint({
        ...candidate,
        financialBatches: [],
      }),
    ).toBe(false);
    expect(
      hasOriginalFinancialCandidateFingerprint({
        ...candidate,
        contractFingerprint: 'sha256:' + '0'.repeat(64),
      }),
    ).toBe(false);
  });
  it('preserves canonical key/enumeration-order compatibility for the actual producer candidate', () => {
    const transported = JSON.parse(
      canonicalSerialize(candidate),
    ) as FormalFinancialCandidate;
    const reordered = Object.fromEntries(
      Object.entries(transported).reverse(),
    ) as unknown as FormalFinancialCandidate;
    expect(hasOriginalFinancialCandidateFingerprint(transported)).toBe(true);
    expect(hasOriginalFinancialCandidateFingerprint(reordered)).toBe(true);
  });
  it('a correct fingerprint still cannot replace the genuine adoption proof boundary', () => {
    expect(() =>
      prepareFinancialSupplementOpeningSeed({
        candidate,
        assembly: null,
        proof: {} as FinancialSupplementAdoption,
      }),
    ).toThrow('GENUINE_FINANCIAL_ADOPTION_REQUIRED');
  });
});
