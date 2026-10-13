import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PublicWorldMap,
  publicCountryScene,
  publicSceneLabels,
  type PublicPresentation,
} from '../../apps/world-web/src/world-preview/PublicWorldMap.js';
import {
  PublicWorldPreview,
  publicPresentationForSearch,
} from '../../apps/world-web/src/world-preview/PublicWorldPreview.js';
import { isPublicWorldPreview } from '../../apps/world-web/src/world-preview/public-route.js';
import {
  countries,
  filterCountries,
  geographicArtwork,
  initialLayers,
  layerKeys,
  publicFrame,
  publicResources,
  visibleCountryLabels,
} from '../../apps/world-web/src/world-preview/geography.js';
import {
  LANGUAGE_KEY,
  messages,
  resolvePreviewLocale,
} from '../../apps/world-web/src/world-preview/locale.js';
import sources from '../../apps/world-web/src/world-preview/source-catalog.json';
import partition from '../../apps/world-web/src/map-lab/land-partition.json';
import artwork from '../../apps/world-web/src/map-lab/atlas-layers.json';
import { continentFor } from '../../apps/world-web/src/map-explorer/continent-layout.js';

describe('public-only World overview routing', () => {
  it.each([
    '/',
    '/index.html',
    '/?atlas=explorer',
    '/?atlas=overview&country=58',
  ])('mounts the public shell on %s', (url) => {
    expect(isPublicWorldPreview(new URL(url, 'https://example.test'))).toBe(
      true,
    );
  });
  it.each([
    '/?atlas=explorer&country=58',
    '/?atlas=crisis',
    '/?atlas=map',
    '/?atlas=continents',
    '/command.html',
    '/season1-immersive/?role=finance&country=58',
  ])('preserves the existing downstream shell on %s', (url) => {
    expect(isPublicWorldPreview(new URL(url, 'https://example.test'))).toBe(
      false,
    );
  });
  it('handles the published base without claiming unrelated paths', () => {
    expect(
      isPublicWorldPreview(
        new URL('https://example.test/project/index.html?atlas=overview'),
        '/project/',
      ),
    ).toBe(true);
    expect(
      isPublicWorldPreview(
        new URL('https://example.test/?atlas=overview'),
        '/project/',
      ),
    ).toBe(false);
  });
});

describe('unchanged geographic source contracts', () => {
  it('preserves all 70 IDs, paths, numbers, labels, pixel counts and source spellings', () => {
    expect(publicFrame).toEqual([1774, 887]);
    expect(countries).toHaveLength(70);
    countries.forEach((country, i) => {
      const original = partition.territories[i]!;
      expect(country).toMatchObject(original);
      expect(country.name).toBe(artwork.political.countries[i]!.name);
      expect(country.group).toBe(continentFor(original.label));
    });
  });
  it('exposes only original public resource points, with no generated points or authority', () => {
    expect(publicResources).toHaveLength(320);
    expect(publicResources).toEqual(
      artwork.resources.filter(
        (r) => r.visibility === 'PUBLIC_SCENARIO_CANDIDATE',
      ),
    );
    expect(geographicArtwork.nodes).toEqual(
      artwork.nodes.map(({ id, kind, point }) => ({ id, kind, point })),
    );
    expect(geographicArtwork.routes).toEqual(
      artwork.routes.map(({ id, path }) => ({ id, path })),
    );
  });
  it('searches canonical names/numbers and intersects only the existing illustrated group', () => {
    expect(filterCountries('  fEnNa ', 'all').map((c) => c.number)).toEqual([
      '58',
    ]);
    expect(filterCountries('58', countries[57]!.group)).toHaveLength(1);
    expect(filterCountries('58', 'northwest')).toHaveLength(0);
    expect(filterCountries('nonexistent', 'all')).toEqual([]);
    expect(filterCountries('', 'all')).toHaveLength(70);
  });
  it('keeps layer state separate from filter state', () => {
    const before = { ...initialLayers };
    filterCountries('Fenna', 'east');
    expect(initialLayers).toEqual(before);
    expect(layerKeys).toHaveLength(10);
  });
  it('suppresses colliding labels without relocating any original geographic anchor', () => {
    const camera = { x: 887, y: 443.5, width: 1900 };
    const size = { width: 320, height: 700 };
    const labels = visibleCountryLabels(
      camera,
      size,
      countries[57]!.id,
      new Set(countries.map((c) => c.id)),
    );
    expect(labels.length).toBeLessThan(70);
    expect(labels).toContain(countries[57]);
    for (const label of labels)
      expect(label.label).toEqual(
        partition.territories.find((c) => c.id === label.id)!.label,
      );
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i]!.label,
          b = labels[j]!.label;
        expect(
          Math.abs(((a[0]! - b[0]!) / 1900) * 320) >= 29 ||
            Math.abs(((a[1]! - b[1]!) / 1900) * 320) >= 23,
        ).toBe(true);
      }
  });
  it('pins each displayed source file to its actual bytes', async () => {
    expect(sources).toHaveLength(5);
    for (const source of sources) {
      const bytes = await readFile(source.file);
      expect(source.sha256).toBe(
        createHash('sha256').update(bytes).digest('hex'),
      );
    }
  });
});

describe('shared bilingual preference and coverage', () => {
  it('uses the existing preference key and honors valid saved language', () => {
    expect(LANGUAGE_KEY).toBe('econmind-ui-language');
    expect(resolvePreviewLocale('en', 'zh-CN')).toBe('en');
    expect(resolvePreviewLocale('zh', 'en')).toBe('zh');
    expect(resolvePreviewLocale('invalid', 'zh-CN')).toBe('zh');
    expect(resolvePreviewLocale(null)).toBe('en');
  });
  it('covers every visible UI key in both languages without placeholder text', () => {
    expect(Object.keys(messages.zh).sort()).toEqual(
      Object.keys(messages.en).sort(),
    );
    for (const dictionary of Object.values(messages))
      for (const value of Object.values(dictionary))
        expect(value.trim().length).toBeGreaterThan(0);
    expect(messages.zh.screenPixels).toBe('屏幕像素');
    expect(messages.en.publicStatus).toContain('Not realtime');
    expect(messages.zh.publicStatus).toContain('非实时');
  });
});

describe('public homepage original country scenes', () => {
  const render = (
    number: string | undefined,
    presentation: PublicPresentation = 'illustration',
    locale: 'zh' | 'en' = 'en',
  ) =>
    renderToStaticMarkup(
      createElement(PublicWorldMap, {
        locale,
        selected: countries.find((country) => country.number === number),
        presentation,
        onGeography: () => undefined,
        allowedIds: new Set(countries.map((country) => country.id)),
        layers: initialLayers,
        onSelect: () => undefined,
        onMetrics: () => undefined,
        apiRef: { current: null },
      }),
    );

  it.each(['54', '63', '32'])(
    'renders the original %s PNG as a complete independent square, not geographic detail',
    async (number) => {
      const selected = countries.find((country) => country.number === number)!;
      const scene = publicCountryScene(selected)!;
      expect(scene.id).toBe(selected.id);
      expect(scene.file).toBe(`${number}.png`);
      const bytes = await readFile(
        `apps/world-web/src/assets/country-scenes/${scene.file}`,
      );
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
      expect(bytes.readUInt32BE(16)).toBe(bytes.readUInt32BE(20));
      const html = render(number);
      expect(html).toContain(`data-public-original-scene="${number}"`);
      expect(html).toContain(`href="${scene.url}"`);
      expect(html).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(html).toContain('NORMALIZED_INDEPENDENT_ILLUSTRATION');
      expect(html).toContain('Not to geographic scale');
      expect(html).toContain('View geography and neighbors');
      expect(html).not.toContain('data-native-detail');
      expect(html.match(/data-public-original-scene=/g)).toHaveLength(1);
    },
  );
  it('leaves world overview and explicit geographic rendering geographic', () => {
    for (const html of [render(undefined), render('54', 'geography')]) {
      expect(html.includes('data-public-original-scene')).toBe(false);
      expect(html.includes('data-presentation="geography"')).toBe(true);
    }
    const geographic = render('54', 'geography');
    expect(geographic.includes('data-native-detail="54"')).toBe(true);
    expect(geographic.includes(countries[53]!.path)).toBe(true);
  });
  it('uses only the matched source index and never invents another scene', () => {
    expect(publicCountryScene(undefined)).toBeNull();
    expect(
      publicCountryScene({ ...countries[53]!, id: 'unmatched' }),
    ).toBeNull();
    const html = renderToStaticMarkup(
      createElement(PublicWorldMap, {
        locale: 'en',
        selected: { ...countries[53]!, id: 'unmatched' },
        presentation: 'illustration',
        onGeography: () => undefined,
        allowedIds: new Set<string>(),
        layers: initialLayers,
        onSelect: () => undefined,
        onMetrics: () => undefined,
        apiRef: { current: null },
      }),
    );
    expect(html).not.toContain('data-public-original-scene');
    expect(html).toContain(publicSceneLabels.en.error);
    expect(html).toContain('data-texture-state="error"');
  });
  it('defaults public country URLs to illustration and restores only explicit geography', () => {
    expect(publicPresentationForSearch('')).toBe('illustration');
    expect(publicPresentationForSearch('?atlas=overview&country=54')).toBe(
      'illustration',
    );
    expect(
      publicPresentationForSearch('?atlas=overview&country=63&view=geography'),
    ).toBe('geography');
    expect(publicPresentationForSearch('?view=unknown')).toBe('illustration');
  });
  it('keeps scoped controls bilingual and exposes no operation/private controls', () => {
    expect(Object.keys(publicSceneLabels.zh)).toEqual(
      Object.keys(publicSceneLabels.en),
    );
    expect(render('54', 'illustration', 'zh')).toContain('非地理比例');
    const html = renderToStaticMarkup(createElement(PublicWorldPreview));
    expect(html).not.toMatch(
      /role=finance|command\.html|data-office-command|data-financial-intake|Office intent/,
    );
  });
});
