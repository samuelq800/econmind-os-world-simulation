import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { OfficialSourceConnectionPanel } from '../../apps/world-web/src/components/OfficialSourceConnectionStatus.js';
import {
  sourceDossierCountry,
  sourceDossierHref,
  SOURCE_DOSSIER_OFFICES,
} from '../../apps/world-web/src/official-data/official-source-status-dossier.js';

// Resolve the web app's declared React dependencies without adding root packages.
const requireWeb = createRequire(
  new URL('../../apps/world-web/package.json', import.meta.url),
);
const { createElement } = requireWeb('react') as typeof import('react');
const { renderToStaticMarkup } = requireWeb(
  'react-dom/server',
) as typeof import('react-dom/server');

describe('catalog connection display and public office entries', () => {
  it.each([
    'NOT_CONFIGURED',
    'LOADING',
    'SELECTED_SOURCE_CATALOG_VERIFIED',
    'UNAVAILABLE',
  ] as const)('presents %s with the exact scope boundary', (kind) => {
    const html = renderToStaticMarkup(
      createElement(OfficialSourceConnectionPanel, {
        state: { kind },
        countryNumber: '70',
      }),
    );
    expect(html).toContain(`data-source-connection="${kind}"`);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('来源，非实时 World');
    expect(html).toContain('地图数字仍来自锁定的官方静态文件');
    expect(html).toContain('不验证全部原始字节');
    expect(html).toContain('不代表经济状态刷新');
    for (const [office] of SOURCE_DOSSIER_OFFICES)
      expect(html).toContain(`role=${office}&amp;country=70#country`);
  });
  it('preserves all valid country selections in all six public-role links', () => {
    for (let n = 1; n <= 70; n++)
      for (const [office] of SOURCE_DOSSIER_OFFICES) {
        const country = String(n).padStart(2, '0');
        expect(
          sourceDossierCountry(`?country=visual-territory-${country}`),
        ).toBe(country);
        const href = sourceDossierHref(
          office,
          sourceDossierCountry(`?country=${country}`),
        );
        const link = new URL(
          href!,
          'https://pages.example/econmind-os-world-simulation/',
        );
        expect(link.searchParams.get('country')).toBe(country);
        expect(link.searchParams.get('role')).toBe(office);
        expect(link.pathname).toBe(
          '/econmind-os-world-simulation/season1-immersive/',
        );
      }
  });
  it('makes the no-selection default explicit and does not replace invalid countries with 01', () => {
    expect(sourceDossierCountry('')).toBe('01');
    for (const invalid of ['unknown', '00', '71', '01<script>'])
      expect(sourceDossierCountry(`?country=${invalid}`)).toBeNull();
    expect(sourceDossierHref('finance', null)).toBeUndefined();
    const html = renderToStaticMarkup(
      createElement(OfficialSourceConnectionPanel, {
        state: { kind: 'NOT_CONFIGURED' },
        countryNumber: null,
      }),
    );
    expect(html).toContain('国家参数无效');
    expect(html).not.toContain('href=');
  });
});
