import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifyVisualOrOriginalBytes } from '../../scripts/verify-authoritative-ui-publication.mjs';

const manifest = JSON.parse(
  readFileSync('artifacts/ui-authority/20260928T134420Z/MANIFEST.json', 'utf8'),
);
const sourcePath = 'role-prototypes/season1-immersive/index.html';
const entry = manifest.files.find(
  (row: { path: string }) => row.path === sourcePath,
);
const html = readFileSync(
  'apps/world-web/public/season1-immersive/index.html',
  'utf8',
);
const mount = '<link rel="stylesheet" href="../shared/econmind-os-visual.css">';
const { adaptedOutput } = JSON.parse(
  readFileSync('docs/reports/world-shared-visual/SOURCE.json', 'utf8'),
);
const css = readFileSync(adaptedOutput.path);
const visualSourcePath = 'role-prototypes/shared/econmind-os-visual.css';
const checkHtml = (text: string) =>
  verifyVisualOrOriginalBytes({
    sourcePath,
    bytes: Buffer.from(text),
    entry,
    adaptedOutput,
  });
const checkCss = (bytes: Buffer, output = adaptedOutput) =>
  verifyVisualOrOriginalBytes({
    sourcePath: visualSourcePath,
    bytes,
    entry: undefined,
    adaptedOutput: output,
  });

describe('review-bound visual publication integrity', () => {
  it('accepts the exact mounted original and the hash-bound derived CSS', () => {
    expect(checkHtml(html)).toBe('visual');
    expect(checkCss(css)).toBe('visual');
  });

  it.each([
    [
      'extra script',
      html.replace('</head>', '<script src="unexpected.js"></script></head>'),
    ],
    ['arbitrary HTML edit', html.replace('North Harbour', 'Other country')],
    ['whitespace drift', html.replace('</head>', '\n</head>')],
    [
      'different stylesheet target',
      html.replace(mount, mount.replace('econmind-os-visual.css', 'other.css')),
    ],
    ['duplicate mount', html.replace(mount, mount + mount)],
    ['missing mount', html.replace(mount, '')],
    [
      'mount outside head',
      html.replace(mount, '').replace('</body>', mount + '</body>'),
    ],
  ])(
    'rejects %s while preserving the immutable original check',
    (_label, changed) => {
      expect(() => checkHtml(changed)).toThrow(
        /UI_FILE_HASH_MISMATCH|UI_VISUAL_MOUNT/,
      );
    },
  );

  it('rejects a changed CSS byte even when the length remains the same', () => {
    const changed = Buffer.from(css);
    changed[changed.length - 1] ^= 1;
    expect(() => checkCss(changed)).toThrow('UI_VISUAL_ARTIFACT_HASH_MISMATCH');
    expect(() =>
      checkCss(Buffer.concat([css, Buffer.from('/* extra */')])),
    ).toThrow('UI_VISUAL_ARTIFACT_HASH_MISMATCH');
  });

  it.each([
    { ...adaptedOutput, path: 'apps/world-web/public/shared/other.css' },
    { ...adaptedOutput, bytes: 0 },
    { ...adaptedOutput, sha256: 'not-a-hash' },
  ])('rejects an invalid derived artifact record', (record) => {
    expect(() => checkCss(css, record)).toThrow(
      'UI_VISUAL_ARTIFACT_RECORD_INVALID',
    );
  });

  it('rejects unknown shared files instead of extending a general allowlist', () => {
    expect(() =>
      verifyVisualOrOriginalBytes({
        sourcePath: 'role-prototypes/shared/unknown.css',
        bytes: css,
        entry: undefined,
        adaptedOutput,
      }),
    ).toThrow('UI_FILE_NOT_IN_SOURCE_MANIFEST');
  });

  it('continues checking ordinary archived shared files by original bytes and hash', () => {
    const sourcePath = 'role-prototypes/shared/season1-bridge.js';
    const entry = manifest.files.find(
      (row: { path: string }) => row.path === sourcePath,
    );
    const bytes = readFileSync(
      'apps/world-web/public/shared/season1-bridge.js',
    );
    expect(
      verifyVisualOrOriginalBytes({ sourcePath, bytes, entry, adaptedOutput }),
    ).toBe('original');
    expect(() =>
      verifyVisualOrOriginalBytes({
        sourcePath,
        bytes: Buffer.concat([bytes, Buffer.from('\n')]),
        entry,
        adaptedOutput,
      }),
    ).toThrow('UI_FILE_HASH_MISMATCH');
  });
});
