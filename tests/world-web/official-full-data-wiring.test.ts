import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from '../../apps/world-web/node_modules/react';
import { renderToStaticMarkup } from '../../apps/world-web/node_modules/react-dom/server';
import { describe, expect, it } from 'vitest';

import { OFFICIAL_DATASETS } from '../../apps/world-api/src/integration/official-dataset-registry.js';
import {
  OFFICIAL_MAP_ASSETS,
  OFFICIAL_MAP_MANIFEST_SHA256,
} from '../../apps/world-api/src/integration/generated/official-map-catalog.js';
import { OfficialSourceStatus } from '../../apps/world-web/src/official-data/OfficialSourceStatus.js';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const matrix = JSON.parse(
  readFileSync(
    new URL(
      '../../apps/world-web/src/official-data/full-data-wiring-matrix.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  pageState: string;
  apiState: string;
  runtimeState: string;
  datasets: {
    slug: string;
    sourcePath: string;
    kind: string;
    filter: string;
    nature: string;
    surfaces: string[];
    focusFields: string[];
  }[];
  mapAssets: { packageFiles: number; countryAssociatedFiles: number };
};

describe('D selected-source full-data wiring matrix', () => {
  it('records the mounted page reader without claiming a verified live API', () => {
    expect(matrix.pageState).toBe('CODE_WIRED_LIVE_API_NOT_VERIFIED');
    expect(matrix.apiState).toBe('CODE_MERGED_OPT_IN_DEPLOYMENT_NOT_VERIFIED');
    expect(matrix.runtimeState).toBe('NOT_LIVE_WORLD');
  });

  it('covers each of A’s 34 fixed datasets and real source fields exactly once', () => {
    const specs = new Map(OFFICIAL_DATASETS.map((item) => [item.slug, item]));
    expect(matrix.datasets).toHaveLength(34);
    expect(new Set(matrix.datasets.map((item) => item.slug)).size).toBe(34);
    expect(matrix.datasets.map((item) => item.slug).sort()).toEqual(
      [...specs.keys()].sort(),
    );
    for (const item of matrix.datasets) {
      const spec = specs.get(item.slug)!;
      expect(item.sourcePath, item.slug).toBe(spec.sourcePath);
      expect(item.kind, item.slug).toBe(spec.kind);
      expect(item.surfaces.length, item.slug).toBeGreaterThan(0);
      expect(item.nature.length, item.slug).toBeGreaterThan(0);
      const raw = readFileSync(
        `${repository}artifacts/world-balanced-candidate-v1/${item.sourcePath}`,
        'utf8',
      );
      expect(Buffer.byteLength(raw), item.slug).toBe(spec.bytes);
      expect(createHash('sha256').update(raw).digest('hex'), item.slug).toBe(
        spec.sha256,
      );
      const source = JSON.parse(raw) as Record<string, unknown> | unknown[];
      const rows = Array.isArray(source) ? source : [source];
      const fields = new Set(
        rows.flatMap((row) => Object.keys(row as Record<string, unknown>)),
      );
      for (const field of item.focusFields) {
        expect(fields.has(field), `${item.slug}.${field}`).toBe(true);
      }
      if (item.filter.startsWith('countryId')) {
        expect(
          spec.countryFields.length > 0 ||
            item.slug === 'seasonal-water' ||
            item.slug === 'changes',
          item.slug,
        ).toBe(true);
      }
      if (item.filter === 'none') expect(spec.countryFields).toHaveLength(0);
    }
    const surfaces = new Set(matrix.datasets.flatMap((item) => item.surfaces));
    expect([...surfaces].sort()).toEqual([
      'bank',
      'captain',
      'finance',
      'industry',
      'map',
      'national',
      'social',
      'trade',
    ]);
  });

  it('preserves map asset IDs and manifest metadata without inventing public URLs', () => {
    const manifestText = readFileSync(
      `${repository}artifacts/world-map-files-v1/manifest.json`,
      'utf8',
    );
    expect(createHash('sha256').update(manifestText).digest('hex')).toBe(
      OFFICIAL_MAP_MANIFEST_SHA256,
    );
    const manifest = JSON.parse(manifestText) as {
      files: { path: string; sha256: string; bytes: number }[];
    };
    expect(OFFICIAL_MAP_ASSETS).toHaveLength(matrix.mapAssets.packageFiles);
    expect(manifest.files).toHaveLength(matrix.mapAssets.packageFiles);
    const byPath = new Map(manifest.files.map((item) => [item.path, item]));
    const byCountry = new Map<string, string[]>();
    for (const asset of OFFICIAL_MAP_ASSETS) {
      const file = byPath.get(asset.path);
      expect(file, asset.path).toMatchObject({
        sha256: asset.sha256,
        bytes: asset.bytes,
      });
      expect(statSync(`${repository}${asset.path}`).size).toBe(asset.bytes);
      if (asset.sourceCountryId) {
        const paths = byCountry.get(asset.sourceCountryId) ?? [];
        paths.push(asset.path);
        byCountry.set(asset.sourceCountryId, paths);
      }
    }
    expect([...byCountry.values()].flat()).toHaveLength(
      matrix.mapAssets.countryAssociatedFiles,
    );
    expect(byCountry.size).toBe(70);
    for (const paths of byCountry.values()) {
      expect(paths).toHaveLength(2);
      expect(paths.some((path) => path.endsWith('.png'))).toBe(true);
      expect(paths.some((path) => path.endsWith('.svg'))).toBe(true);
    }
  });

  it('keeps site and region joins grounded in selected stable IDs', () => {
    const source = (slug: string) =>
      JSON.parse(
        readFileSync(
          `${repository}artifacts/world-balanced-candidate-v1/data/${slug}.json`,
          'utf8',
        ),
      ) as Record<string, string>[];
    const countries = new Set(source('countries').map((row) => row.id));
    const regions = new Map(
      source('regions').map((row) => [row.id, row.countryId]),
    );
    const facilities = new Map(
      source('facilities').map((row) => [row.id, row.countryId]),
    );
    const nodes = new Set(source('nodes').map((row) => row.id));
    expect(countries.size).toBe(70);
    for (const row of source('facility-map-links')) {
      expect(facilities.get(row.facilityId), row.facilityId).toBe(
        row.countryId,
      );
      expect(countries.has(row.countryId), row.facilityId).toBe(true);
    }
    for (const row of source('seasonal-water')) {
      expect(regions.has(row.regionId), row.regionId).toBe(true);
    }
    for (const row of source('changes')) {
      expect(regions.has(row.objectId), row.objectId).toBe(true);
    }
    for (const row of source('transport-routes')) {
      expect(nodes.has(row.fromNodeId), row.id).toBe(true);
      expect(nodes.has(row.toNodeId), row.id).toBe(true);
    }
  });

  it('renders missing, disconnected and invalid source without numeric or action fallback', () => {
    for (const kind of ['NOT_CONNECTED', 'UNAVAILABLE', 'INVALID'] as const) {
      const html = renderToStaticMarkup(
        createElement(OfficialSourceStatus, { view: { kind } }),
      );
      expect(html).toContain('OFFICIAL SOURCE · NOT LIVE');
      expect(html).toContain(`data-source-state="${kind}"`);
      expect(html).not.toContain('source records');
      expect(html).not.toContain('LOCAL_FIXTURE');
      expect(html).not.toContain('<button');
    }
    const empty = renderToStaticMarkup(
      createElement(OfficialSourceStatus, {
        view: { kind: 'EMPTY', dataset: 'stocks' },
      }),
    );
    expect(empty).toContain('No source row here');
    expect(empty).not.toContain('0 source records');
    const available = renderToStaticMarkup(
      createElement(OfficialSourceStatus, {
        view: { kind: 'SOURCE', dataset: 'stocks', rowCount: 3 },
      }),
    );
    expect(available).toContain('3 source records');
    expect(available).toContain('NOT LIVE');
  });
});
