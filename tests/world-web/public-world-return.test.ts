import { createElement } from '../../apps/world-web/node_modules/react';
import { renderToStaticMarkup } from '../../apps/world-web/node_modules/react-dom/server';
import { WorldExplorer } from '../../apps/world-web/src/map-explorer/WorldExplorer.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isPublicWorldPreview,
  navigateToPublicWorld,
} from '../../apps/world-web/src/world-preview/public-route.js';

describe('real document navigation across legacy/public shells', () => {
  it.each([
    [
      '/',
      'https://example.test/?atlas=explorer&country=58',
      'https://example.test/?atlas=explorer',
    ],
    [
      '/',
      'https://example.test/index.html?atlas=explorer&country=58#detail',
      'https://example.test/?atlas=explorer',
    ],
    [
      '/econmind-os-world-simulation/',
      'https://example.test/econmind-os-world-simulation/?atlas=explorer&country=58',
      'https://example.test/econmind-os-world-simulation/?atlas=explorer',
    ],
    [
      '/econmind-os-world-simulation/',
      'https://example.test/econmind-os-world-simulation/index.html?atlas=explorer&country=58&role=finance&team=old#country',
      'https://example.test/econmind-os-world-simulation/?atlas=explorer',
    ],
  ])('assigns a clean public document for base %s', (base, href, expected) => {
    const location = { href, assign: vi.fn() };
    expect(isPublicWorldPreview(new URL(href), base)).toBe(false);
    navigateToPublicWorld(location, base);
    expect(location.assign).toHaveBeenCalledExactlyOnceWith(expected);
    expect(location.href).toBe(href);
    const target = new URL(location.assign.mock.calls[0]![0]);
    expect(isPublicWorldPreview(target, base)).toBe(true);
    expect(target.searchParams.has('country')).toBe(false);
    expect(target.searchParams.has('team')).toBe(false);
    expect(target.hash).toBe('');
  });
});

afterEach(() => vi.unstubAllGlobals());
describe('visible legacy return label honors the shared language', () => {
  it.each([
    ['zh', '世界总览'],
    ['en', 'World overview'],
  ])('renders the %s return label', (locale, label) => {
    vi.stubGlobal('window', {
      location: { search: '?atlas=explorer&country=58' },
      localStorage: { getItem: () => locale },
    });
    const markup = renderToStaticMarkup(createElement(WorldExplorer));
    expect(markup).toContain(`>${label}</button>`);
    expect(markup).toContain('class="world-explorer explorer-country-view"');
  });
});
