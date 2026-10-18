import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createServer } from 'vite';
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

describe('real fixed publisher destination preflight in an isolated source fixture', () => {
  let fixture: string;
  const publisher = 'scripts/country-scene-display-corrections.mjs';
  const entries = () => [
    ...base.manifest.entries,
    ...followup.manifest.entries,
  ];
  const destination = (relative: string) =>
    path.join(fixture, 'apps/world-web/dist', relative);
  const publish = () =>
    promisify(execFile)(process.execPath, [path.join(fixture, publisher)], {
      cwd: fixture,
    });

  beforeAll(async () => {
    fixture = await realpath(
      await mkdtemp(path.join(tmpdir(), 'g-fixed-scene-publisher-')),
    );
    const files = new Set([
      publisher,
      'artifacts/world-map-files-v1/manifest.json',
      'artifacts/ui-authority/20260928T134420Z/MANIFEST.json',
      ...[correctionVersion, followupVersion].flatMap((version) => [
        `apps/world-web/src/assets/country-scene-corrections/${version}/manifest.json`,
        `apps/world-web/src/assets/country-scene-corrections/${version}/review.json`,
      ]),
      ...entries().flatMap((entry) => [
        entry.sourcePath,
        entry.original.sourcePath,
      ]),
    ]);
    for (const file of files) {
      const target = path.join(fixture, file);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(file, target);
    }
  });
  beforeEach(async () => {
    await rm(destination(''), { recursive: true, force: true });
    for (const entry of entries()) {
      const target = destination(entry.legacyAlias);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(fixture, entry.original.sourcePath), target);
    }
  });
  afterAll(async () => {
    if (fixture) await rm(fixture, { recursive: true, force: true });
  });
  async function expectOriginalAliases() {
    for (const entry of entries())
      expect(
        displaySha256(await readFile(destination(entry.legacyAlias))),
      ).toBe(entry.original.sha256);
  }

  it('publishes all 28 outputs and retries identically through the real CLI', async () => {
    for (let retry = 0; retry < 2; retry++) {
      expect(JSON.parse((await publish()).stdout).verifiedDisplayAliases).toBe(
        13,
      );
      for (const entry of entries())
        for (const target of [entry.displayPath, entry.legacyAlias])
          expect(displaySha256(await readFile(destination(target)))).toBe(
            entry.sha256,
          );
      for (const version of [correctionVersion, followupVersion])
        expect(
          await readFile(
            destination(`scene-corrections/${version}/manifest.json`),
          ),
        ).toEqual(
          await readFile(
            path.join(
              fixture,
              `apps/world-web/src/assets/country-scene-corrections/${version}/manifest.json`,
            ),
          ),
        );
    }
  });
  it.each(['42.png', 'manifest.json'])(
    'rejects the late %s directory before changing any alias',
    async (leaf) => {
      await mkdir(destination(`scene-corrections/${followupVersion}/${leaf}`), {
        recursive: true,
      });
      await expect(publish()).rejects.toThrow(
        'CORRECTION_OUTPUT_REGULAR_FILE_REQUIRED',
      );
      await expectOriginalAliases();
      await expect(publish()).rejects.toThrow(
        'CORRECTION_OUTPUT_REGULAR_FILE_REQUIRED',
      );
      await expectOriginalAliases();
    },
  );
  it('rejects an existing file in the final package parent chain before changing any alias', async () => {
    const parent = destination(`scene-corrections/${followupVersion}`);
    await mkdir(path.dirname(parent), { recursive: true });
    await writeFile(parent, 'not a directory');
    await expect(publish()).rejects.toThrow(
      'CORRECTION_OUTPUT_PARENT_DIRECTORY_REQUIRED',
    );
    await expectOriginalAliases();
  });
  it('retains final target symlink denial before changing any alias or sentinel', async () => {
    const sentinel = path.join(fixture, 'sentinel');
    await writeFile(sentinel, 'unchanged');
    const target = destination(
      `scene-corrections/${followupVersion}/manifest.json`,
    );
    await mkdir(path.dirname(target), { recursive: true });
    await symlink(sentinel, target);
    await expect(publish()).rejects.toThrow('CORRECTION_OUTPUT_SYMLINK_DENIED');
    await expectOriginalAliases();
    expect(await readFile(sentinel, 'utf8')).toBe('unchanged');
  });
  it('retains corrupt final alias rejection before any publisher write', async () => {
    const last = followup.manifest.entries.at(-1)!;
    const corrupt = Buffer.from('corrupt final alias');
    await writeFile(destination(last.legacyAlias), corrupt);
    await expect(publish()).rejects.toThrow(
      'CORRECTION_ALIAS_UNEXPECTED_BYTES',
    );
    for (const entry of entries())
      expect(
        displaySha256(await readFile(destination(entry.legacyAlias))),
      ).toBe(
        entry.number === last.number
          ? displaySha256(corrupt)
          : entry.original.sha256,
      );
  });
  it('retains corrupt final source rejection before changing any alias', async () => {
    const last = followup.manifest.entries.at(-1)!;
    const source = path.join(fixture, last.sourcePath);
    const original = await readFile(source);
    try {
      await writeFile(
        source,
        Buffer.concat([original, Buffer.from('corrupt')]),
      );
      await expect(publish()).rejects.toThrow('CORRECTION_PNG_BYTES_MISMATCH');
      await expectOriginalAliases();
    } finally {
      await writeFile(source, original);
    }
  });
});

describe.each(['/', '/econmind-os-world-simulation/'])(
  'actual Vite corrected scene HTTP at base %s',
  (basePath) => {
    it('serves all pinned 13 source images selected by both actual consumers', async () => {
      const server = await createServer({
        configFile: path.resolve('apps/world-web/vite.config.ts'),
        base: basePath,
        logLevel: 'silent',
        optimizeDeps: { noDiscovery: true, include: [] },
        server: {
          host: '127.0.0.1',
          port: 0,
          strictPort: false,
          watch: null,
          hmr: false,
        },
      });
      try {
        await server.listen();
        const address = server.httpServer!.address();
        if (!address || typeof address === 'string')
          throw new Error('Expected an owned HTTP port');
        const port = address.port;
        const get = (url: string, method = 'GET') =>
          new Promise<{
            status: number | undefined;
            contentType: string | undefined;
            length: string | undefined;
            bytes: Buffer;
          }>((resolve, reject) => {
            const req = request(
              { hostname: '127.0.0.1', port, path: url, method },
              (response) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('error', reject);
                response.on('end', () =>
                  resolve({
                    status: response.statusCode,
                    contentType: response.headers['content-type'],
                    length: response.headers['content-length'],
                    bytes: Buffer.concat(chunks),
                  }),
                );
              },
            );
            req.on('error', reject);
            req.end();
          });
        const sceneModule = await server.ssrLoadModule(
          '/src/map-explorer/country-scene-urls.ts',
        );
        const { publicCountryScene, PublicWorldMap } =
          await server.ssrLoadModule('/src/world-preview/PublicWorldMap.tsx');
        const { WorldExplorer } = await server.ssrLoadModule(
          '/src/map-explorer/WorldExplorer.tsx',
        );
        const webRequire = createRequire(
          path.resolve('apps/world-web/package.json'),
        );
        const { createElement } = webRequire('react');
        const { renderToStaticMarkup } = webRequire('react-dom/server');
        const { countries, initialLayers } = await server.ssrLoadModule(
          '/src/world-preview/geography.ts',
        );
        for (const entry of [
          ...base.manifest.entries,
          ...followup.manifest.entries,
        ]) {
          const expected = `${basePath}${entry.sourcePath.replace('apps/world-web/', '')}`;
          const selected = sceneModule.countrySceneDisplayRecord(
            `${entry.number}.png`,
          );
          expect(selected.displayUrl).toBe(expected);
          expect(selected.originalUrl).toBe(
            `${basePath}${entry.original.publicUrl}`,
          );
          expect(sceneModule.countrySceneUrls[`${entry.number}.png`]).toBe(
            expected,
          );
          const country = countries.find(
            (country: { number: string }) => country.number === entry.number,
          );
          const publicSelection = publicCountryScene(country);
          expect(publicSelection.url).toBe(expected);
          const preview = renderToStaticMarkup(
            createElement(PublicWorldMap, {
              locale: 'en',
              selected: country,
              presentation: 'illustration',
              onGeography: () => {},
              allowedIds: new Set([country.id]),
              layers: initialLayers,
              onSelect: () => {},
              onMetrics: () => {},
              apiRef: { current: null },
            }),
          );
          expect(preview).toContain(`href="${expected}"`);
          expect(preview).toContain(
            `data-public-corrected-scene="${entry.number}"`,
          );
          vi.stubGlobal('window', {
            location: { search: `?country=${entry.number}` },
          });
          const explorer = renderToStaticMarkup(createElement(WorldExplorer));
          expect(explorer).toContain(`href="${expected}"`);
          expect(explorer).toContain(`data-country-scene="${entry.number}"`);
          const response = await get(expected);
          expect(response.status).toBe(200);
          expect(response.contentType).toBe('image/png');
          expect(response.bytes.length).toBe(entry.bytes);
          expect(displaySha256(response.bytes)).toBe(entry.sha256);
        }
        const last = followup.manifest.entries.at(-1)!;
        const head = await get(
          `${sceneModule.countrySceneUrls[`${last.number}.png`]}?cache=1`,
          'HEAD',
        );
        expect(head.status).toBe(200);
        expect(head.bytes.length).toBe(0);
        expect(head.length).toBe(String(last.bytes));
        for (const unknown of [
          '15.png',
          '44.png',
          '56.png',
          '61.png',
          '63.png',
          '99.png',
          '../01.png',
          '%2e%2e/01.png',
          '01.png/../../package.json',
        ])
          expect(sceneModule.countrySceneDisplayRecord(unknown)).toBe(null);
      } finally {
        vi.unstubAllGlobals();
        await server.close();
      }
    });
  },
);

describe.each(['/', '/econmind-os-world-simulation/'])(
  'fixed display resolver at base %s',
  (basePath) => {
    it.each([true, false])(
      'keeps exact DEV=%s URLs and original identities for all 13 entries',
      async (dev) => {
        vi.stubEnv('BASE_URL', basePath);
        vi.stubEnv('DEV', dev);
        vi.resetModules();
        try {
          const urls =
            await import('../../apps/world-web/src/map-explorer/country-scene-urls.js');
          expect(Object.keys(urls.countrySceneUrls)).toHaveLength(70);
          for (const entry of [
            ...base.manifest.entries,
            ...followup.manifest.entries,
          ]) {
            const record = urls.countrySceneDisplayRecord(
              `${entry.number}.png`,
            )!;
            const expected = `${basePath}${dev ? entry.sourcePath.replace('apps/world-web/', '') : entry.displayPath}`;
            expect(record.displayUrl).toBe(expected);
            expect(urls.countrySceneUrls[`${entry.number}.png`]).toBe(expected);
            expect(record.originalUrl).toBe(
              `${basePath}${entry.original.publicUrl}`,
            );
            expect(record.displaySha256).toBe(entry.sha256);
            expect(record.originalSha256).toBe(entry.original.sha256);
          }
          expect(urls.countrySceneDisplayRecord('../01.png')).toBe(null);
        } finally {
          vi.unstubAllEnvs();
        }
      },
    );
  },
);

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
        `${import.meta.env.BASE_URL}${import.meta.env.DEV ? e.sourcePath.replace('apps/world-web/', '') : e.displayPath}`,
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
