import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  correctionVersion,
  followupVersion,
  followupCountries,
  displaySha256,
  loadDisplayCorrections,
  loadFollowupDisplayCorrections,
  inspectFollowupCorrectionRecords,
  preflightDisplayCorrectionPublication,
  preflightAllDisplayCorrectionPublication,
  verifyCorrectionPng,
  type DisplayCorrectionProof,
  type FollowupDisplayCorrectionProof,
} from '../../scripts/country-scene-display-corrections.mjs';
import {
  countrySceneDisplayRecord,
  countrySceneUrls,
} from '../../apps/world-web/src/map-explorer/country-scene-urls.js';

const folder =
  'apps/world-web/src/assets/country-scene-corrections/geography-followup-20261018-v1';
const manifest = readFileSync(`${folder}/manifest.json`);
const review = readFileSync(`${folder}/review.json`);
const originals = readFileSync('artifacts/world-map-files-v1/manifest.json');
const ui = readFileSync(
  'artifacts/ui-authority/20260928T134420Z/MANIFEST.json',
);
const selectedPins = {
  '01': '9efd5fbf45d68ed01bd1789720bcfbbcbc259aa401231143bb8ac00197560816',
  '09': 'f07098b15198587544868ba1a5029b6ce253925cbda285b8745ed9810fe35511',
  '38': '18699d3056480624a4bf0b263f7bfa537cdda87973832da2228b82f6309bd9f9',
  '40': '3987a930d5eb0747531b75ef3422e830a86634c5d57979426b57fc5beea08bf8',
  '42': '1e2cd39d7921f28552f8dc9a101a843497acf23a91deff110e21d54c7cd32235',
};
let base: DisplayCorrectionProof;
let followup: FollowupDisplayCorrectionProof;
const aliases = new Map<string, Buffer>();
beforeAll(async () => {
  base = await loadDisplayCorrections();
  followup = await loadFollowupDisplayCorrections();
  for (const proof of [base, followup])
    for (const e of proof.manifest.entries)
      aliases.set(e.number, readFileSync(e.original.sourcePath));
});

describe('fixed five followup illustrations, separate from the published eight', () => {
  it('binds only the five actual independent-review candidates without granting code/publication approval', () => {
    expect(followupCountries).toEqual(['01', '09', '38', '40', '42']);
    expect(followup.manifest.entries.map((e) => e.number)).toEqual(
      followupCountries,
    );
    expect(
      Object.fromEntries(
        followup.manifest.entries.map((e) => [e.number, e.sha256]),
      ),
    ).toEqual(selectedPins);
    expect(followup.review.rows).toHaveLength(5);
    expect(followup.review.decision).toBe(
      'APPROVED_FOR_ILLUSTRATIVE_ASSET_CANDIDATE_ONLY',
    );
    expect(followup.review.codeApproval).toBe(false);
    expect(followup.review.publicationApproval).toBe(false);
    expect(followup.review.exactPixelAnchorAlignment).toBe('NOT_PROVEN');
    expect(
      followup.review.rows.every(
        (r) =>
          r.principalLandmarksPreservedVisually &&
          r.requiredChanges.length === 0,
      ),
    ).toBe(true);
    expect(followup.manifest.entries.reduce((n, e) => n + e.bytes, 0)).toBe(
      18_369_787,
    );
    for (const e of followup.manifest.entries)
      expect(() =>
        verifyCorrectionPng(readFileSync(e.sourcePath), e),
      ).not.toThrow();
  });
  it.each(['manifest', 'review', 'originals', 'ui'])(
    'rejects changed %s bytes instead of re-approving a current file dynamically',
    (which) => {
      const values = [manifest, review, originals, ui];
      const index = ['manifest', 'review', 'originals', 'ui'].indexOf(which);
      values[index] = Buffer.concat([values[index]!, Buffer.from(' ')]);
      expect(() =>
        inspectFollowupCorrectionRecords(
          values[0]!,
          values[1]!,
          values[2]!,
          values[3]!,
        ),
      ).toThrow();
    },
  );
  it('rejects an unreviewed country even if a caller supplies a rewritten catalogue', () => {
    const changed = JSON.parse(manifest.toString());
    changed.entries.push({ ...changed.entries[0], number: '15' });
    expect(() =>
      inspectFollowupCorrectionRecords(
        Buffer.from(JSON.stringify(changed)),
        review,
        originals,
        ui,
      ),
    ).toThrow('FOLLOWUP_MANIFEST_PIN_MISMATCH');
    for (const n of ['15', '44', '56', '61', '63'])
      expect(countrySceneDisplayRecord(`${n}.png`)).toBe(null);
  });
  it('preserves the original eight immutable records and their qualified 35-subject review', () => {
    expect(base.manifest.version).toBe(correctionVersion);
    expect(base.review.rows.flatMap((r) => r.subjectIds)).toHaveLength(35);
    expect(
      displaySha256(
        readFileSync(
          'apps/world-web/src/assets/country-scene-corrections/lake-repair-20261018-v1/manifest.json',
        ),
      ),
    ).toBe('f94d25e60d0d3dd6d2e36093a17be456a1522db152e6e05ab8fb702156193833');
    expect(
      displaySha256(
        readFileSync(
          'apps/world-web/src/assets/country-scene-corrections/lake-repair-20261018-v1/review.json',
        ),
      ),
    ).toBe('7051d650e2582f3c96f74e0f70e957ddc831f508da3cc92d1218d3b4ade768fc');
    for (const e of base.manifest.entries)
      expect(countrySceneDisplayRecord(`${e.number}.png`)?.version).toBe(
        correctionVersion,
      );
  });
  it('plans both fixed packages and all thirteen aliases before exposing any writable output plan', () => {
    const followupAliases = new Map(
      followupCountries.map((n) => [n, aliases.get(n)!]),
    );
    expect(
      preflightDisplayCorrectionPublication(followup, followupAliases).targets,
    ).toHaveLength(11);
    const batch = preflightAllDisplayCorrectionPublication(
      base,
      followup,
      aliases,
    );
    expect(batch.targets).toHaveLength(28);
    expect(Object.isFrozen(batch.targets)).toBe(true);
    expect(new Set(batch.targets.map((t) => t.relativePath)).size).toBe(28);
    expect(
      batch.targets.some((t) =>
        t.relativePath.startsWith('official-map-source/'),
      ),
    ).toBe(false);
    expect(() =>
      preflightAllDisplayCorrectionPublication(base, { ...followup }, aliases),
    ).toThrow('CORRECTION_FIXED_TWO_PACKAGES_AND_ALL_ALIASES_REQUIRED');
    const bad = new Map(aliases);
    bad.set('42', Buffer.from('bad final followup image'));
    let output: unknown = null;
    expect(() => {
      output = preflightAllDisplayCorrectionPublication(base, followup, bad);
    }).toThrow('CORRECTION_ALIAS_UNEXPECTED_BYTES');
    expect(output).toBe(null);
    bad.delete('42');
    expect(() =>
      preflightAllDisplayCorrectionPublication(base, followup, bad),
    ).toThrow('CORRECTION_FIXED_TWO_PACKAGES_AND_ALL_ALIASES_REQUIRED');
  });
  it('accepts identical retries but rejects missing or foreign aliases in the fixed followup', () => {
    const current = new Map(
      followup.manifest.entries.map((e) => [
        e.number,
        readFileSync(e.sourcePath),
      ]),
    );
    expect(
      preflightDisplayCorrectionPublication(followup, current).targets,
    ).toHaveLength(11);
    current.delete('42');
    current.set('15', Buffer.from('unreviewed'));
    expect(() =>
      preflightDisplayCorrectionPublication(followup, current),
    ).toThrow('CORRECTION_ALIAS_REQUIRED');
  });
  it('selects the new version only for five keys and keeps every original download identity', () => {
    expect(Object.keys(countrySceneUrls)).toHaveLength(70);
    for (const e of followup.manifest.entries) {
      const r = countrySceneDisplayRecord(`${e.number}.png`)!;
      expect(r.version).toBe(followupVersion);
      expect(r.sourcePath).toBe(e.sourcePath);
      expect(countrySceneUrls[`${e.number}.png`]).toBe(
        `${import.meta.env.BASE_URL}${e.displayPath}`,
      );
      expect(r.originalUrl).toBe(
        `${import.meta.env.BASE_URL}${e.original.publicUrl}`,
      );
      expect(r.originalSha256).toBe(e.original.sha256);
      expect(r.displaySha256).not.toBe(r.originalSha256);
    }
    expect(countrySceneDisplayRecord('../01.png')).toBe(null);
  });
});
