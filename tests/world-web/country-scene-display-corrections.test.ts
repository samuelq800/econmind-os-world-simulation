import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  correctedCountries,
  displaySha256,
  loadDisplayCorrections,
  inspectCorrectionRecords,
  preflightDisplayCorrectionPublication,
  verifyCorrectionPng,
  type DisplayCorrectionProof,
} from '../../scripts/country-scene-display-corrections.mjs';
import {
  countrySceneDisplayRecord,
  countrySceneUrls,
} from '../../apps/world-web/src/map-explorer/country-scene-urls.js';
import {
  publicCountryScene,
  publicSceneLabelsFor,
} from '../../apps/world-web/src/world-preview/PublicWorldMap.js';
import { countries } from '../../apps/world-web/src/world-preview/geography.js';

const folder =
  'apps/world-web/src/assets/country-scene-corrections/lake-repair-20261018-v1';
const manifest = readFileSync(`${folder}/manifest.json`),
  review = readFileSync(`${folder}/review.json`),
  originals = readFileSync('artifacts/world-map-files-v1/manifest.json'),
  ui = readFileSync('artifacts/ui-authority/20260928T134420Z/MANIFEST.json');
let proof: DisplayCorrectionProof;
const aliases = new Map<string, Buffer>();
beforeAll(async () => {
  proof = await loadDisplayCorrections();
  for (const e of proof.manifest.entries)
    aliases.set(e.number, readFileSync(e.original.sourcePath));
});
describe('fixed eight-country display correction source boundary', () => {
  it('binds all eight actual PNGs to independently referenced A reviews, originals and unchanged dimensions', () => {
    expect(proof.manifest.entries.map((e) => e.number)).toEqual([
      '11',
      '12',
      '13',
      '14',
      '21',
      '22',
      '23',
      '41',
    ]);
    expect(proof.review.rows.flatMap((r) => r.subjectIds)).toHaveLength(35);
    expect(proof.review.exactPixelAnchorAlignment).toBe('NOT_PROVEN');
    for (const e of proof.manifest.entries) {
      expect(() =>
        verifyCorrectionPng(readFileSync(e.sourcePath), e),
      ).not.toThrow();
      expect(displaySha256(aliases.get(e.number)!)).toBe(e.original.sha256);
    }
  });
  it.each(['manifest', 'review', 'originals', 'ui'])(
    'rejects byte changes in %s rather than replacing pinned source history',
    (which) => {
      const args = [manifest, review, originals, ui];
      const index = ['manifest', 'review', 'originals', 'ui'].indexOf(which);
      args[index] = Buffer.concat([args[index]!, Buffer.from(' ')]);
      expect(() =>
        inspectCorrectionRecords(args[0]!, args[1]!, args[2]!, args[3]!),
      ).toThrow();
    },
  );
  it('rejects invalid PNG data and dimensions without permitting a reencoded or resized substitute', () => {
    const e = proof.manifest.entries[0]!,
      bad = Buffer.from(readFileSync(e.sourcePath));
    bad[40] = bad[40]! ^ 1;
    expect(() => verifyCorrectionPng(bad, e)).toThrow(
      'CORRECTION_PNG_BYTES_MISMATCH',
    );
    expect(() =>
      verifyCorrectionPng(readFileSync(e.sourcePath), { ...e, width: 1 }),
    ).toThrow('CORRECTION_PNG_DIMENSIONS_INVALID');
  });
  it('plans all eight aliases and versioned images before writes, with immutable original download paths excluded', () => {
    const plan = preflightDisplayCorrectionPublication(proof, aliases);
    expect(plan.targets).toHaveLength(17);
    expect(
      plan.targets.some((t) =>
        t.relativePath.startsWith('official-map-source/'),
      ),
    ).toBe(false);
    expect(new Set(plan.targets.map((t) => t.relativePath)).size).toBe(17);
    expect(Object.isFrozen(plan.targets)).toBe(true);
    expect(() =>
      preflightDisplayCorrectionPublication({ ...proof }, aliases),
    ).toThrow('CORRECTION_PRIVATE_PACKAGE_REQUIRED');
  });
  it('accepts only the identical corrected version on retry, and rejects incomplete/foreign/tampered aliases all-or-none', () => {
    const current = new Map(
      proof.manifest.entries.map((e) => [e.number, readFileSync(e.sourcePath)]),
    );
    expect(
      preflightDisplayCorrectionPublication(proof, current).targets,
    ).toHaveLength(17);
    current.delete('41');
    expect(() => preflightDisplayCorrectionPublication(proof, current)).toThrow(
      'CORRECTION_ALL_ALIASES_REQUIRED',
    );
    current.set('99', Buffer.from('other'));
    expect(() => preflightDisplayCorrectionPublication(proof, current)).toThrow(
      'CORRECTION_ALIAS_REQUIRED',
    );
    const bad = new Map(aliases);
    bad.set('41', Buffer.from('bad eighth image'));
    let output: unknown = null;
    expect(() => {
      output = preflightDisplayCorrectionPublication(proof, bad);
    }).toThrow('CORRECTION_ALIAS_UNEXPECTED_BYTES');
    expect(output).toBe(null);
  });
  it('resolves corrected React display URLs under the real Vite base, preserving original download identities and all70 keys', () => {
    expect(Object.keys(countrySceneUrls)).toHaveLength(70);
    for (const e of proof.manifest.entries) {
      const c = countrySceneDisplayRecord(`${e.number}.png`)!;
      expect(countrySceneUrls[`${e.number}.png`]).toBe(c.displayUrl);
      expect(c.displayUrl).toBe(`${import.meta.env.BASE_URL}${e.displayPath}`);
      expect(c.originalUrl).toBe(
        `${import.meta.env.BASE_URL}${e.original.publicUrl}`,
      );
      expect(c.sourcePath).toBe(e.sourcePath);
      expect(c.displaySha256).not.toBe(c.originalSha256);
    }
    expect(countrySceneDisplayRecord('32.png')).toBe(null);
    expect(countrySceneDisplayRecord('../11.png')).toBe(null);
    expect(correctedCountries).toHaveLength(8);
  });
  it('keeps57 unchanged image imports after the fixed followup and does not bundle corrected PNG duplicates', () => {
    const source = readFileSync(
      'apps/world-web/src/map-explorer/country-scene-urls.ts',
      'utf8',
    );
    expect([
      ...source.matchAll(/from '\.\.\/assets\/country-scenes\/\d{2}\.png'/g),
    ]).toHaveLength(57);
    expect(source).not.toMatch(
      /from '\.\.\/assets\/country-scene-corrections\/[^']+\.png'/,
    );
  });
  it('returns truthful corrected and original source metadata, with unchanged labels for a non-target country', () => {
    for (const number of correctedCountries) {
      const scene = publicCountryScene(
        countries.find((c) => c.number === number),
      )!;
      expect(scene.correction?.sourcePath).toBe(`${folder}/${number}.png`);
      expect(scene.correction?.originalSourcePath).toBe(
        `apps/world-web/src/assets/country-scenes/${number}.png`,
      );
      expect(publicSceneLabelsFor('en', !!scene.correction).illustration).toBe(
        'Corrected scene',
      );
      expect(publicSceneLabelsFor('zh', !!scene.correction).illustration).toBe(
        '修复版场景',
      );
    }
    const original = publicCountryScene(
      countries.find((c) => c.number === '32'),
    )!;
    expect(original.correction).toBe(null);
    expect(publicSceneLabelsFor('en', !!original.correction).illustration).toBe(
      'Original scene',
    );
  });
});
