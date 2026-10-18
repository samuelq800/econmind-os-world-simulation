import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  deriveBrandPage,
  publishBrandShell,
  verifyBrandRecord,
  verifyDerivedBrandPage,
  verifyBrandSourceDelta,
  verifyBrandAdaptedSource,
  brandSourceDeltaSha256,
  brandRecordSha256,
  countryRecordSha256,
  sha256,
} from '../../scripts/publish-brand-shell.mjs';

const recordPath = 'docs/reports/brand-shell-20261010/SOURCE.json';
const recordBytes = await readFile(recordPath);
const record = verifyBrandRecord(recordBytes);
const countryRecordPath = 'docs/reports/country-context-20261010/SOURCE.json';
const countryRecord = JSON.parse(await readFile(countryRecordPath, 'utf8'));
const deltaRecordPath =
  'docs/reports/G_SCENE_LAKE_REPAIR_20261018/BRAND_SOURCE_DELTA_V2.json';
const previousDeltaRecordPath =
  'docs/reports/G_SCENE_LAKE_REPAIR_20261018/BRAND_SOURCE_DELTA.json';
const deltaBytes = await readFile(deltaRecordPath);
const owned: string[] = [];
afterEach(async () => {
  await Promise.all(
    owned.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'econmind-brand-test-'));
  owned.push(root);
  async function copy(from: string, to = from) {
    const destination = path.join(root, to);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(from));
  }
  await copy(recordPath);
  await copy(countryRecordPath);
  await copy(deltaRecordPath);
  await copy(previousDeltaRecordPath);
  for (const file of [
    ...countryRecord.immutableInputs,
    ...countryRecord.adaptedSources,
  ])
    await copy(file.path);
  for (const file of record.adaptedSources) await copy(file.path);
  for (const page of record.immutablePageInputs) {
    await copy(`apps/world-web/public/${page.path}`);
    await copy(
      `apps/world-web/public/${page.path}`,
      `apps/world-web/dist/${page.path}`,
    );
  }
  await writeFile(
    path.join(root, 'apps/world-web/dist/brand-shell.js'),
    'export {};',
  );
  return root;
}

describe('pinned public brand shell derivation', () => {
  it('binds only exact fixed source postimages and retains the pinned historical records', async () => {
    const proof = verifyBrandSourceDelta(deltaBytes);
    const delta = JSON.parse(deltaBytes.toString('utf8'));
    expect(delta.rows).toHaveLength(5);
    expect(sha256(await readFile(previousDeltaRecordPath))).toBe(
      delta.previousDeltaRecordSha256,
    );
    expect(sha256(recordBytes)).toBe(brandRecordSha256);
    expect(sha256(await readFile(countryRecordPath))).toBe(countryRecordSha256);
    const unchanged = record.adaptedSources.find(
      (f) => !delta.rows.some((r) => r.path === f.path),
    );
    expect(() =>
      verifyBrandAdaptedSource(
        readFileSync(unchanged.path),
        unchanged,
        recordPath,
        proof,
      ),
    ).not.toThrow();
    expect(() =>
      verifyBrandSourceDelta(Buffer.concat([deltaBytes, Buffer.from(' ')])),
    ).toThrow('BRAND_SOURCE_DELTA_RECORD_HASH_MISMATCH');
    for (const row of delta.rows) {
      const source = row.sourceRecord === recordPath ? record : countryRecord;
      const file = source.adaptedSources.find((r) => r.path === row.path);
      const bytes = await readFile(row.path);
      expect(() =>
        verifyBrandAdaptedSource(bytes, file, row.sourceRecord, proof),
      ).not.toThrow();
      expect(() =>
        verifyBrandAdaptedSource(
          Buffer.concat([bytes, Buffer.from(' ')]),
          file,
          row.sourceRecord,
          proof,
        ),
      ).toThrow('SOURCE_HASH_MISMATCH');
      expect(() =>
        verifyBrandAdaptedSource(bytes, file, row.sourceRecord, {}),
      ).toThrow('BRAND_SOURCE_DELTA_PROOF_REQUIRED');
      expect(() =>
        verifyBrandAdaptedSource(
          bytes,
          { ...file, sha256: '0'.repeat(64) },
          row.sourceRecord,
          proof,
        ),
      ).toThrow('BRAND_SOURCE_DELTA_HISTORY_MISMATCH');
      expect(() =>
        verifyBrandAdaptedSource(
          bytes,
          { ...file, path: 'unselected.ts' },
          row.sourceRecord,
          proof,
        ),
      ).toThrow('SOURCE_HASH_MISMATCH');
    }
  });
  it('reconstructs each exact selected HTML source and rejects extra content', async () => {
    for (const page of record.immutablePageInputs) {
      const original = await readFile(`apps/world-web/public/${page.path}`);
      const output = deriveBrandPage(page.path, original, record);
      expect(output.toString()).toContain('data-econmind-brand-mount');
      expect(() =>
        verifyDerivedBrandPage(page.path, original, output, record),
      ).not.toThrow();
      expect(() =>
        verifyDerivedBrandPage(
          page.path,
          original,
          Buffer.concat([output, Buffer.from('<script>void 0</script>')]),
          record,
        ),
      ).toThrow('BRAND_DERIVED_PAGE_HASH_MISMATCH');
      expect(() =>
        deriveBrandPage(
          page.path,
          Buffer.concat([original, Buffer.from(' ')]),
          record,
        ),
      ).toThrow('BRAND_PAGE_INPUT_HASH_MISMATCH');
    }
    expect(() =>
      deriveBrandPage('unselected.html', Buffer.from(''), record),
    ).toThrow('BRAND_PAGE_NOT_SELECTED');
    expect(() =>
      verifyBrandRecord(Buffer.concat([recordBytes, Buffer.from(' ')])),
    ).toThrow('BRAND_SOURCE_RECORD_HASH_MISMATCH');
  });
  it('publishes all selected mounts with traceable compiled-entry and page hashes', async () => {
    const root = await fixture();
    expect(await publishBrandShell(root)).toMatchObject({
      status: 'PASS',
      pages: record.immutablePageInputs.length,
      sourceArchivesChanged: false,
    });
    const evidence = JSON.parse(
      await readFile(
        path.join(root, 'apps/world-web/dist/brand-shell-provenance.json'),
        'utf8',
      ),
    );
    expect(evidence.sourceCommit).toBe(record.sourceCommit);
    expect(evidence.sourceDeltaRecordSha256).toBe(brandSourceDeltaSha256);
    expect(evidence.entry.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.pages).toHaveLength(record.immutablePageInputs.length);
    for (const page of record.immutablePageInputs) {
      const original = await readFile(
        path.join(root, 'apps/world-web/public', page.path),
      );
      const output = await readFile(
        path.join(root, 'apps/world-web/dist', page.path),
      );
      verifyDerivedBrandPage(page.path, original, output, record);
    }
  });
  it.each([
    'asset',
    'second-page',
    'map-source',
    'map-record',
    'delta-record',
    'previous-delta-record',
  ] as const)(
    'fails before writing either page when the %s input differs',
    async (kind) => {
      const root = await fixture();
      const first = path.join(
        root,
        'apps/world-web/dist',
        record.immutablePageInputs[0].path,
      );
      const before = await readFile(first);
      const changed =
        kind === 'asset'
          ? record.adaptedSources[0].path
          : kind === 'map-source'
            ? countryRecord.immutableInputs[0].path
            : kind === 'map-record'
              ? countryRecordPath
              : kind === 'delta-record'
                ? deltaRecordPath
                : kind === 'previous-delta-record'
                  ? previousDeltaRecordPath
                  : `apps/world-web/dist/${record.immutablePageInputs[1].path}`;
      await writeFile(path.join(root, changed), 'changed');
      await expect(publishBrandShell(root)).rejects.toThrow(
        kind === 'asset'
          ? 'BRAND_ADAPTED_SOURCE_HASH_MISMATCH'
          : kind === 'map-source'
            ? 'COUNTRY_CONTEXT_SOURCE_HASH_MISMATCH'
            : kind === 'map-record'
              ? 'COUNTRY_CONTEXT_RECORD_HASH_MISMATCH'
              : kind === 'delta-record'
                ? 'BRAND_SOURCE_DELTA_RECORD_HASH_MISMATCH'
                : kind === 'previous-delta-record'
                  ? 'BRAND_PREVIOUS_SOURCE_DELTA_HASH_MISMATCH'
                  : 'BRAND_BUILD_INPUT_NOT_SOURCE',
      );
      expect(await readFile(first)).toEqual(before);
    },
  );
});
