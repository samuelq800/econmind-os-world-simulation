import { execFileSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  findOfficialMapSource,
  loadOfficialMapPublication,
  readVerifiedSource,
  renderOfficialMapDirectory,
  repositoryRoot,
  resolveOfficialMapPublicUrl,
  serializeOfficialMapIndex,
  sha256,
  type OfficialMapPublication,
} from '../../scripts/official-map-publication-index.mjs';
import {
  assertStaticOutputBudget,
  measureStaticOutput,
  publishOfficialMapSources,
  verifyOfficialMapOutput,
} from '../../scripts/official-map-publication-build.mjs';

describe('selected official map source publication (not live World State)', () => {
  let index: OfficialMapPublication;
  let output: string;
  beforeAll(async () => {
    index = await loadOfficialMapPublication();
    output = await mkdtemp(
      path.join(tmpdir(), 'econmind-map-publication-test-'),
    );
    await publishOfficialMapSources(repositoryRoot, output);
  }, 30_000);
  afterAll(async () => {
    if (output) await rm(output, { recursive: true, force: true });
  });

  it('derives exactly the selected 203 rows, without another handwritten inventory', async () => {
    const selection = JSON.parse(
      await readFile(path.join(repositoryRoot, index.selectionPath), 'utf8'),
    ) as {
      mapFiles: {
        manifestPath: string;
        manifestSha256: string;
        fileCount: number;
      };
    };
    const bytes = await readFile(
      path.join(repositoryRoot, selection.mapFiles.manifestPath),
    );
    expect(sha256(bytes)).toBe(selection.mapFiles.manifestSha256);
    expect(index.manifestSha256).toBe(selection.mapFiles.manifestSha256);
    const manifest = JSON.parse(bytes.toString('utf8')) as {
      files: { path: string; bytes: number; sha256: string }[];
    };
    expect(
      index.files.map((file) => ({
        path: file.sourcePath,
        bytes: file.bytes,
        sha256: file.sha256,
      })),
    ).toEqual(manifest.files);
    expect(index.counts).toEqual({
      files: 203,
      images: 160,
      support: 43,
      countries: 70,
      countryAssociatedFiles: 140,
      totalBytes: 302234965,
    });
    expect(new Set(index.files.map((file) => file.publicUrl)).size).toBe(203);
  });

  it('copies every original byte and hash to its content-versioned static URL', async () => {
    for (const file of index.files) {
      const original = await readVerifiedSource(repositoryRoot, file);
      const published = await readFile(path.join(output, file.publicationPath));
      expect(published.equals(original), file.sourcePath).toBe(true);
      expect(published.length, file.sourcePath).toBe(file.bytes);
      expect(sha256(published), file.sourcePath).toBe(file.sha256);
      expect(file.publicUrl).toBe(
        `official-map-source/${index.manifestSha256}/files/${file.sourcePath.split('/').map(encodeURIComponent).join('/')}`,
      );
    }
    expect(await verifyOfficialMapOutput(index, output)).toMatchObject({
      status: 'PASS',
      files: 203,
      deploymentVerified: false,
    });
  }, 30_000);

  it('retains exactly the existing filename-based country associations for 01 through 70', () => {
    for (let n = 1; n <= 70; n += 1) {
      const number = String(n).padStart(2, '0');
      const files = index.files.filter((file) => file.countryNumber === number);
      expect(files, number).toHaveLength(2);
      expect(files.map((file) => file.classification)).toEqual([
        'COUNTRY_DETAIL',
        'COUNTRY_SCENE',
      ]);
      for (const file of files) {
        expect(file.sourceCountryId).toBe(`visual-territory-${number}`);
        expect(file.coreCountryId).toBe(`COUNTRY_${number}`);
      }
    }
    for (const file of index.files.filter(
      (file) => file.countryNumber === null,
    )) {
      expect(file.sourceCountryId).toBeNull();
      expect(file.coreCountryId).toBeNull();
      expect(file.classification).toBe('GLOBAL_OR_SUPPORT');
    }
  });

  it('preserves null coordinates and source-only semantics, never synthesizing geometry or execution', () => {
    expect(index.authority).toBe('VERSIONED_FILE_ASSETS_ONLY_NOT_WORLD_STATE');
    expect(index.liveWorldState).toBe(false);
    expect(index.proposalFieldsAreExecuted).toBe(false);
    expect(index.sourceFilesModified).toBe(false);
    expect(index.thirdPartyRights).toBe('UNKNOWN');
    expect(index.thirdPartyRightsProofProvided).toBe(false);
    expect(index.supportFilesExecuted).toBe(false);
    expect(index.publicationState).toBe(
      'BUILD_OUTPUT_REQUIRED_NOT_DEPLOYMENT_EVIDENCE',
    );
    for (const file of index.files) {
      expect(file.coordinates).toBeNull();
      expect(file.coordinateStatus).toBe('NOT_PROJECTED_SOURCE_FILE_ONLY');
      expect(file.nature).toBe('OFFICIAL_VERSIONED_SOURCE_FILE_NOT_LIVE');
      expect(file.thirdPartyRights).toBe('UNKNOWN');
    }
  });

  it('publishes deterministic identical catalogues at the discovery and immutable URLs', async () => {
    const serialized = serializeOfficialMapIndex(index);
    expect(
      await readFile(
        path.join(
          repositoryRoot,
          'apps/world-web/public/official-map-source/index.json',
        ),
        'utf8',
      ),
    ).toBe(serialized);
    expect(
      await readFile(
        path.join(output, 'official-map-source/index.json'),
        'utf8',
      ),
    ).toBe(serialized);
    expect(
      await readFile(path.join(output, index.immutableIndexUrl), 'utf8'),
    ).toBe(serialized);
    expect(Object.isFrozen(index)).toBe(true);
    expect(Object.isFrozen(index.files)).toBe(true);
    expect(Object.isFrozen(index.files[0])).toBe(true);
    execFileSync(
      process.execPath,
      ['scripts/official-map-publication-generate.mjs', '--check'],
      { cwd: repositoryRoot },
    );
  });

  it('exposes 203 real directory links without loading images, frameworks or changing the game', () => {
    const html = renderOfficialMapDirectory(index);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('not live World State');
    expect(html).toContain(
      'No coordinates or economic permissions are inferred',
    );
    expect(html.match(/<tr><td>/gu)).toHaveLength(203);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('<body class="official-map-directory">');
    expect(html).toContain(
      '.official-map-directory table { width: 100%; table-layout: fixed;',
    );
    expect(html).toContain('overflow-wrap: anywhere');
    expect(html).toContain('@media (max-width: 480px)');
    expect(html).toContain(
      'white-space: nowrap; font-variant-numeric: tabular-nums;',
    );
    expect(html).not.toMatch(/text-overflow|line-clamp|overflow:\s*hidden/gu);
    for (const file of index.files) {
      expect(html).toContain(
        `href="./${file.publicUrl.slice('official-map-source/'.length)}"`,
      );
      expect(html).toContain(`<code>${file.sha256}</code>`);
      expect(html).toContain(`>${file.sourcePath}</a>`);
    }
  });

  it('resolves the same relative URLs at local and GitHub Pages project bases', () => {
    const file = index.files[0]!;
    for (const base of [
      'http://127.0.0.1:4123/',
      'https://samuelq800.github.io/econmind-os-world-simulation/',
    ]) {
      expect(resolveOfficialMapPublicUrl(index, file.sourcePath, base)).toBe(
        `${base}${file.publicUrl}`,
      );
    }
  });

  it.each([
    'apps/world-web/src/assets/unknown.png',
    'apps/world-web/src/assets/country-scenes/00.png',
    'apps/world-web/src/assets/country-scenes/71.png',
    'apps/world-web/src/assets/country-scenes/1.png',
    'apps/world-web/src/assets/country-scenes/01.png?download=1',
    'apps/world-web/src/assets/country-scenes/%30%31.png',
    'apps/world-web/src/assets/../secret.txt',
    '/apps/world-web/src/assets/country-scenes/01.png',
    'apps\\world-web\\src\\assets\\country-scenes\\01.png',
    'status/world-data-selection.json',
  ])('rejects unknown or noncanonical source paths: %s', (sourcePath) => {
    expect(() => findOfficialMapSource(index, sourcePath)).toThrow(
      /OFFICIAL_MAP_SOURCE_/u,
    );
    expect(() =>
      resolveOfficialMapPublicUrl(index, sourcePath, 'https://example.com/'),
    ).toThrow(/OFFICIAL_MAP_SOURCE_/u);
  });

  it.each([
    'https://example.com/project',
    'file:///tmp/',
    'https://user:password@example.com/',
    'https://example.com/?query=1',
    'https://example.com/#hash',
  ])('rejects ambiguous or non-web site bases: %s', (base) => {
    expect(() =>
      resolveOfficialMapPublicUrl(index, index.files[0]!.sourcePath, base),
    ).toThrow('OFFICIAL_MAP_SITE_BASE_INVALID');
  });

  it('detects a source checksum mismatch before accepting a file', async () => {
    await expect(
      readVerifiedSource(repositoryRoot, {
        ...index.files[0]!,
        sha256: '0'.repeat(64),
      }),
    ).rejects.toThrow('OFFICIAL_MAP_SOURCE_BYTES_MISMATCH');
  });

  it('rejects selection drift and a changed source manifest before publication', async () => {
    const fixture = await mkdtemp(
      path.join(tmpdir(), 'econmind-map-selection-test-'),
    );
    try {
      await mkdir(path.join(fixture, 'status'), { recursive: true });
      const selectionBytes = await readFile(
        path.join(repositoryRoot, index.selectionPath),
      );
      const selection = JSON.parse(selectionBytes.toString('utf8')) as {
        mapFiles: { fileCount: number };
      };
      selection.mapFiles.fileCount = 204;
      await writeFile(
        path.join(fixture, index.selectionPath),
        JSON.stringify(selection),
      );
      await expect(loadOfficialMapPublication(fixture)).rejects.toThrow(
        'OFFICIAL_MAP_SELECTION_INVALID',
      );
      await writeFile(path.join(fixture, index.selectionPath), selectionBytes);
      await mkdir(path.dirname(path.join(fixture, index.manifestPath)), {
        recursive: true,
      });
      const manifestBytes = await readFile(
        path.join(repositoryRoot, index.manifestPath),
      );
      await writeFile(
        path.join(fixture, index.manifestPath),
        Buffer.concat([manifestBytes, Buffer.from('\n')]),
      );
      await expect(loadOfficialMapPublication(fixture)).rejects.toThrow(
        'OFFICIAL_MAP_MANIFEST_HASH_MISMATCH',
      );
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it('rejects source symlinks escaping the selected repository', async () => {
    const fixture = await mkdtemp(
      path.join(tmpdir(), 'econmind-map-symlink-test-'),
    );
    try {
      const entry = index.files[0]!;
      await mkdir(path.dirname(path.join(fixture, entry.sourcePath)), {
        recursive: true,
      });
      await symlink(
        path.join(repositoryRoot, entry.sourcePath),
        path.join(fixture, entry.sourcePath),
      );
      await expect(readVerifiedSource(fixture, entry)).rejects.toThrow(
        'OFFICIAL_MAP_SOURCE_OUTSIDE_REPOSITORY',
      );
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it('rejects extra unselected output paths and corrupted delivered bytes', async () => {
    const extra = path.join(output, 'official-map-source/unselected.json');
    await writeFile(extra, '{}');
    await expect(verifyOfficialMapOutput(index, output)).rejects.toThrow(
      'OFFICIAL_MAP_OUTPUT_INVENTORY_MISMATCH',
    );
    await rm(extra);
    const file = index.files.find((entry) =>
      entry.sourcePath.endsWith('continent-scenes/index.json'),
    )!;
    const destination = path.join(output, file.publicationPath);
    const original = await readFile(destination);
    await writeFile(destination, Buffer.from('corrupted source copy'));
    await expect(verifyOfficialMapOutput(index, output)).rejects.toThrow(
      'OFFICIAL_MAP_OUTPUT_BYTES_MISMATCH',
    );
    await writeFile(destination, original);
    expect((await verifyOfficialMapOutput(index, output)).status).toBe('PASS');
  });

  it('measures all output files and rejects a site exceeding the conservative Pages budget', async () => {
    const measured = await measureStaticOutput(output);
    expect(measured.staticOutputFiles).toBe(206);
    expect(measured.staticOutputBytes).toBe(
      index.counts.totalBytes +
        Buffer.byteLength(serializeOfficialMapIndex(index)) * 2 +
        Buffer.byteLength(renderOfficialMapDirectory(index)),
    );
    expect(assertStaticOutputBudget(measured).staticOutputRemainingBytes).toBe(
      1_000_000_000 - measured.staticOutputBytes,
    );
    expect(() =>
      assertStaticOutputBudget({ staticOutputBytes: 1_000_000_001 }),
    ).toThrow('OFFICIAL_MAP_PAGES_STATIC_OUTPUT_BUDGET_EXCEEDED');
  });

  it('keeps the old 140-asset copy and official reader steps in the real build', async () => {
    const pkg = JSON.parse(
      await readFile(
        path.join(repositoryRoot, 'apps/world-web/package.json'),
        'utf8',
      ),
    ) as { scripts: { build: string } };
    expect(pkg.scripts.build).toBe(
      'tsc -b && vite build && node ../../scripts/publish-authoritative-ui-map-assets.mjs && node ../../scripts/configure-official-page-read.mjs && node ../../scripts/official-map-publication-build.mjs',
    );
  });
});
