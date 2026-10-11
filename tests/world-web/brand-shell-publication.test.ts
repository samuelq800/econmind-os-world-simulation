import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  deriveBrandPage,
  publishBrandShell,
  verifyBrandRecord,
  verifyDerivedBrandPage,
} from '../../scripts/publish-brand-shell.mjs';

const recordPath = 'docs/reports/brand-shell-20261010/SOURCE.json';
const recordBytes = await readFile(recordPath);
const record = verifyBrandRecord(recordBytes);
const countryRecordPath = 'docs/reports/country-context-20261010/SOURCE.json';
const countryRecord = JSON.parse(await readFile(countryRecordPath, 'utf8'));
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
  it.each(['asset', 'second-page', 'map-source', 'map-record'] as const)(
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
              : `apps/world-web/dist/${record.immutablePageInputs[1].path}`;
      await writeFile(path.join(root, changed), 'changed');
      await expect(publishBrandShell(root)).rejects.toThrow(
        kind === 'asset'
          ? 'BRAND_ADAPTED_SOURCE_HASH_MISMATCH'
          : kind === 'map-source'
            ? 'COUNTRY_CONTEXT_SOURCE_HASH_MISMATCH'
            : kind === 'map-record'
              ? 'COUNTRY_CONTEXT_RECORD_HASH_MISMATCH'
              : 'BRAND_BUILD_INPUT_NOT_SOURCE',
      );
      expect(await readFile(first)).toEqual(before);
    },
  );
});
