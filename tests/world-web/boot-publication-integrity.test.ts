import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  verifyBootPublicationBytes,
  verifyBootPublicationRecord,
  verifyVisualOrOriginalBytes,
} from '../../scripts/verify-authoritative-ui-publication.mjs';

const recordBytes = readFileSync(
  'docs/reports/D_BOOT_PUBLICATION_PROVENANCE/SOURCE.json',
);
const manifestBytes = readFileSync(
  'artifacts/ui-authority/20260928T134420Z/MANIFEST.json',
);
const packageBytes = readFileSync(
  'artifacts/ui-authority/20260928T134420Z/PACKAGE.json',
);
const selection = JSON.parse(readFileSync('status/ui-selection.json', 'utf8'));
const record = JSON.parse(recordBytes.toString('utf8'));
const manifest = JSON.parse(manifestBytes.toString('utf8'));
type SourceFile = {
  sourcePath: string;
  original: { bytes: number; sha256: string };
  adaptedOutput: { path: string; bytes: number; sha256: string };
};
const files: SourceFile[] = record.files;
const recordInput = { recordBytes, manifestBytes, packageBytes, selection };
const proof = verifyBootPublicationRecord(recordInput);
function input(file = files[0]) {
  return {
    proof,
    sourcePath: file.sourcePath,
    publishedPath: file.adaptedOutput.path,
    bytes: readFileSync(file.adaptedOutput.path),
    entry: manifest.files.find(
      (row: { path: string }) => row.path === file.sourcePath,
    ),
  };
}
const replace = (bytes: Buffer, from: string, to: string) => {
  const text = bytes.toString('utf8');
  if (!text.includes(from)) throw Error(`Invalid mutation: ${from}`);
  return Buffer.from(text.replace(from, to));
};

describe('exact formal boot publication provenance', () => {
  it.each(files)('accepts only exact $sourcePath source bytes', (file) => {
    expect(verifyBootPublicationBytes(input(file))).toBe('boot');
  });

  it.each([
    ['source commit', record.sourceCommit, '0'.repeat(40)],
    ['source tree', record.sourceTree, '0'.repeat(40)],
    ['source parent', record.sourceParent, '0'.repeat(40)],
    ['integration base', record.integrationBase, '0'.repeat(40)],
    ['archive identity', record.archive.sha256, '0'.repeat(64)],
    ['manifest identity', record.archive.manifestSha256, '0'.repeat(64)],
    ['original hash', files[0].original.sha256, '0'.repeat(64)],
    ['adapted hash', files[0].adaptedOutput.sha256, '0'.repeat(64)],
    ['adapted byte count', '20941', '20942'],
    ['original byte count', '20820', '20821'],
    ['source path', files[0].sourcePath, files[0].sourcePath + '.other'],
    [
      'published path',
      files[0].adaptedOutput.path,
      'apps/world-web/public/other.js',
    ],
  ])(
    'rejects altered %s even with a self-consistent JSON record',
    (_label, from, to) => {
      expect(() =>
        verifyBootPublicationRecord({
          ...recordInput,
          recordBytes: replace(recordBytes, from, to),
        }),
      ).toThrow('UI_BOOT_RECORD_HASH_MISMATCH');
    },
  );

  it.each(['extra file', 'duplicate file', 'missing file'])(
    'rejects %s in the record',
    (change) => {
      const changed = JSON.parse(recordBytes.toString('utf8'));
      if (change === 'missing file') changed.files.pop();
      else
        changed.files.push(
          change === 'duplicate file'
            ? changed.files[0]
            : {
                ...changed.files[0],
                sourcePath: 'role-prototypes/shared/extra.js',
              },
        );
      expect(() =>
        verifyBootPublicationRecord({
          ...recordInput,
          recordBytes: Buffer.from(JSON.stringify(changed)),
        }),
      ).toThrow('UI_BOOT_RECORD_HASH_MISMATCH');
    },
  );

  it.each(['manifestBytes', 'packageBytes'] as const)(
    'rejects changed original %s before granting provenance',
    (key) => {
      expect(() =>
        verifyBootPublicationRecord({
          ...recordInput,
          [key]: Buffer.concat([recordInput[key], Buffer.from('\n')]),
        }),
      ).toThrow('UI_BOOT_ARCHIVE_RECORD_HASH_MISMATCH');
    },
  );

  it('rejects an altered original manifest row', () => {
    expect(() =>
      verifyBootPublicationRecord({
        ...recordInput,
        manifestBytes: replace(
          manifestBytes,
          files[0].original.sha256,
          '0'.repeat(64),
        ),
      }),
    ).toThrow('UI_BOOT_ARCHIVE_RECORD_HASH_MISMATCH');
  });

  it.each(['selectionId', 'archiveSha256', 'sourcePayloadFiles'])(
    'rejects changed selection %s',
    (key) => {
      expect(() =>
        verifyBootPublicationRecord({
          ...recordInput,
          selection: { ...selection, [key]: 'unknown' },
        }),
      ).toThrow('UI_BOOT_ARCHIVE_IDENTITY_MISMATCH');
    },
  );

  it.each(files)(
    'rejects changed, empty and appended $sourcePath bytes',
    (file) => {
      const original = input(file);
      const changed = Buffer.from(original.bytes);
      changed[0] ^= 1;
      for (const bytes of [
        changed,
        Buffer.alloc(0),
        Buffer.concat([original.bytes, Buffer.from('\n')]),
      ]) {
        expect(() =>
          verifyBootPublicationBytes({ ...original, bytes }),
        ).toThrow('UI_BOOT_FILE_HASH_MISMATCH');
      }
    },
  );

  it('rejects absent or fabricated proof objects', () => {
    for (const forged of [undefined, {}, { ...proof }, record]) {
      expect(() =>
        verifyBootPublicationBytes({ ...input(), proof: forged }),
      ).toThrow('UI_BOOT_PROVENANCE_NOT_VALIDATED');
    }
  });

  it('rejects an unknown JS path and path aliases', () => {
    for (const sourcePath of [
      'role-prototypes/shared/extra.js',
      files[0].sourcePath + '.other',
      files[0].sourcePath.replace('/journey', '/./journey'),
    ]) {
      expect(() =>
        verifyBootPublicationBytes({ ...input(), sourcePath }),
      ).toThrow('UI_BOOT_FILE_PATH_MISMATCH');
    }
    expect(() =>
      verifyBootPublicationBytes({
        ...input(),
        publishedPath: files[1].adaptedOutput.path,
      }),
    ).toThrow('UI_BOOT_FILE_PATH_MISMATCH');
  });

  it('rejects missing and changed original entries at the byte verifier', () => {
    const original = input();
    for (const entry of [
      undefined,
      { ...original.entry, bytes: original.entry.bytes + 1 },
      { ...original.entry, sha256: '0'.repeat(64) },
      { ...original.entry, path: files[1].sourcePath },
    ]) {
      expect(() => verifyBootPublicationBytes({ ...original, entry })).toThrow(
        'UI_BOOT_ORIGINAL_IDENTITY_MISMATCH',
      );
    }
  });

  it('does not turn non-boot JS into a derived exception', () => {
    const sourcePath = 'role-prototypes/shared/season1-bridge.js';
    const bytes = readFileSync(
      'apps/world-web/public/shared/season1-bridge.js',
    );
    const entry = manifest.files.find(
      (row: { path: string }) => row.path === sourcePath,
    );
    expect(
      verifyVisualOrOriginalBytes({
        sourcePath,
        bytes,
        entry,
        adaptedOutput: undefined,
      }),
    ).toBe('original');
    expect(() =>
      verifyVisualOrOriginalBytes({
        sourcePath,
        bytes: Buffer.concat([bytes, Buffer.from('\n')]),
        entry,
        adaptedOutput: undefined,
      }),
    ).toThrow('UI_FILE_HASH_MISMATCH');
    expect(() =>
      verifyVisualOrOriginalBytes({
        sourcePath: 'role-prototypes/shared/unknown.js',
        bytes,
        entry: undefined,
        adaptedOutput: undefined,
      }),
    ).toThrow('UI_FILE_NOT_IN_SOURCE_MANIFEST');
  });
});
