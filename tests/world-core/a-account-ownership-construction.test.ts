import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildAccountOwnershipCandidateV2,
  verifyAccountConstructionSource,
} from '../../tools/unknown2544-a-accounts/construct.mjs';

const root = new URL('../../', import.meta.url);
const pins = JSON.parse(
  readFileSync(
    new URL('tools/unknown2544-a-accounts/source-pins.json', root),
    'utf8',
  ),
);
const sha = (bytes: string | Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

describe('offline AW V2 declarations, not actual accounts or grants', () => {
  it('reproduces all three exact frozen byte/hash outputs deterministically', () => {
    const first = buildAccountOwnershipCandidateV2();
    expect(buildAccountOwnershipCandidateV2()).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.keys(first)).toHaveLength(3);
    for (const pin of pins.expectedOutputs) {
      const bytes = first[pin.name];
      expect(Buffer.byteLength(bytes)).toBe(pin.bytes);
      expect(sha(bytes)).toBe(pin.sha256);
      expect(bytes.endsWith('\n')).toBe(true);
      expect(bytes.includes('/Users/')).toBe(false);
    }
  });

  it('covers exactly the original 350/420 IDs and 353 unique declarations', () => {
    const out = buildAccountOwnershipCandidateV2();
    const records = JSON.parse(out['SCENARIO_ACCOUNT_RECORDS.json']);
    const b06 = JSON.parse(out['B06_COVERAGE_BY_ORIGINAL_ID.json']);
    const b16 = JSON.parse(out['B16_ADMISSION_INPUT_REQUIREMENTS.json']);
    const plan = JSON.parse(
      readFileSync(
        new URL(
          'data/scenario-candidates/unknown2544/approved17/execution_batches.v1.json',
          root,
        ),
        'utf8',
      ),
    );
    expect(records.accounts).toHaveLength(353);
    expect(records.registers).toHaveLength(350);
    expect(
      new Set(records.accounts.map((x: { accountId: string }) => x.accountId))
        .size,
    ).toBe(353);
    for (const [batchId, rows] of [
      ['B06', b06.rows],
      ['B16', b16.rows],
    ] as const) {
      expect(
        rows.map((x: { originalId: string }) => x.originalId).sort(),
      ).toEqual(
        plan
          .find((x: { batchId: string }) => x.batchId === batchId)
          .stableIds.toSorted(),
      );
    }
  });

  it('keeps only eight C01 typed endpoints and reciprocal own/mirror roles', () => {
    const doc = JSON.parse(
      buildAccountOwnershipCandidateV2()['SCENARIO_ACCOUNT_RECORDS.json'],
    );
    const typed = doc.accounts.filter(
      (x: { countryId: string }) => x.countryId === 'COUNTRY_01',
    );
    expect(typed).toHaveLength(8);
    for (const a of typed) {
      const b = typed.find(
        (x: { accountId: string }) => x.accountId === a.mirrorDeclarationKey,
      );
      expect(b.mirrorDeclarationKey).toBe(a.accountId);
      expect(b.claimId).toBe(a.claimId);
      expect(b.currency).toBe(a.currency);
      expect(b.valueDate).toBe(a.valueDate);
      expect(b.ownerId).toBe(a.counterpartyEntityId);
    }
    const legacy = doc.accounts.filter(
      (x: { countryId: string }) => x.countryId !== 'COUNTRY_01',
    );
    expect(legacy).toHaveLength(345);
    for (const a of legacy) {
      expect(a.accountClass).toBe('CASH');
      for (const k of [
        'claimId',
        'counterpartyEntityId',
        'mirrorDeclarationKey',
        'worldId',
        'issuerId',
        'valueDate',
      ]) {
        expect(a[k]).toBeNull();
      }
    }
    for (const r of doc.registers) {
      for (const key of [
        ...r.ownDeclarationKeys,
        ...r.necessaryMirrorDeclarationKeys,
      ]) {
        expect(
          doc.accounts.some((a: { accountId: string }) => a.accountId === key),
        ).toBe(true);
      }
    }
  });

  it('never turns construction/requirements into actual source or authorization', () => {
    const out = buildAccountOwnershipCandidateV2();
    const records = JSON.parse(out['SCENARIO_ACCOUNT_RECORDS.json']);
    expect(records.sourceAdopted).toBe(false);
    expect(records.accountIdsIssued).toBe(0);
    expect(records.originalClosures).toBe(0);
    for (const a of records.accounts) {
      expect(a.accountId.startsWith('SCENARIO_DECL_AW_V2_')).toBe(true);
      for (const k of [
        'actualAccountId',
        'actualCurrency',
        'actualOpening',
        'actualAdmission',
        'actualBalance',
      ])
        expect(a[k]).toBeNull();
      expect(a.accountIssued).toBe(false);
    }
    for (const a of JSON.parse(out['B16_ADMISSION_INPUT_REQUIREMENTS.json'])
      .rows) {
      expect(a.actualAuthSubject).toBeNull();
      expect(a.actualGrants).toBeNull();
      expect(a.currentPermission).toBe('UNKNOWN');
      expect(a.currentPermissionIssued).toBe(false);
      expect(Object.values(a.originalFieldStages)).toEqual([
        false,
        false,
        false,
        false,
      ]);
    }
  });

  it('rejects changed bytes, wrong source identity and unknown sources', () => {
    const pin = pins.sources.find((x: { id: string }) => x.id === '17_batches');
    const bytes = readFileSync(new URL(pin.path, root));
    const before = sha(bytes);
    const changed = Buffer.from(bytes);
    changed[changed.length - 1] ^= 1;
    expect(() => verifyAccountConstructionSource(pin.id, changed)).toThrow(
      'ACCOUNT_CONSTRUCTION_SOURCE_PIN_MISMATCH',
    );
    expect(() =>
      verifyAccountConstructionSource('economic_entities', bytes),
    ).toThrow('ACCOUNT_CONSTRUCTION_SOURCE_PIN_MISMATCH');
    expect(() =>
      verifyAccountConstructionSource('UNREGISTERED', bytes),
    ).toThrow('ACCOUNT_CONSTRUCTION_SOURCE_PIN_MISMATCH');
    expect(sha(bytes)).toBe(before);
  });

  it('reads module-relative sources from outside the checkout without writing outputs', () => {
    const cli = fileURLToPath(
      new URL('tools/unknown2544-a-accounts/construct.mjs', root),
    );
    const result = JSON.parse(
      execFileSync(process.execPath, [cli, '--check'], {
        cwd: tmpdir(),
        encoding: 'utf8',
      }),
    );
    expect(result.outputs).toEqual(pins.expectedOutputs);
    expect(result.sourceAdopted).toBe(false);
    expect(result.accountIdsIssued).toBe(0);
    expect(result.currentPermissionIssued).toBe(false);
    expect(result.originalClosures).toBe(0);
  });
});
