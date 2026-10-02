import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cssPath = 'apps/world-web/public/shared/econmind-os-visual.css';
const css = readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');

describe('shared visual adaptation boundaries', () => {
  it('loads one local stylesheet from both entry points, including a Pages subpath', () => {
    for (const [page, publicBase] of [
      ['apps/world-web/index.html', 'apps/world-web/public'],
      ['apps/world-web/public/season1-immersive/index.html', undefined],
    ] as const) {
      const html = readFileSync(page, 'utf8');
      const link = html.match(/href="([^"\n]*econmind-os-visual\.css)"/gu);
      expect(link).toHaveLength(1);
      const href = link![0].slice(6, -1);
      expect(href).not.toMatch(/^(?:\/|https?:)/u);
      expect(existsSync(resolve(publicBase ?? dirname(page), href))).toBe(true);
      const pageUrl = new URL(
        page.endsWith('/season1-immersive/index.html')
          ? 'season1-immersive/'
          : '',
        'https://example.test/econmind-os-world-simulation/',
      );
      expect(new URL(href, pageUrl).pathname).toBe(
        '/econmind-os-world-simulation/shared/econmind-os-visual.css',
      );
    }
  });

  it('cannot change map geometry, scrolling, hidden controls or runtime dependencies', () => {
    expect(css).not.toMatch(
      /(?:^|[;{])\s*(?:width|height|min-width|max-width|min-height|max-height|padding|margin|inset|top|right|bottom|left|display|visibility|position|overflow(?:-[xy])?|transform|zoom|touch-action|pointer-events|scroll-behavior|overscroll-behavior(?:-[xy])?|z-index)\s*:/u,
    );
    expect(css).not.toMatch(/@import|url\(|@font-face/u);
    const selectors = [...css.matchAll(/([^{}]+)\{/gu)]
      .map((match) => match[1]!.trim())
      .filter((selector) => !selector.startsWith('@media'));
    for (const selector of selectors) {
      for (const item of selector
        .replace(/\([^()]*\)/gu, (group) => group.replaceAll(',', '|'))
        .split(',')) {
        expect(item.trim()).toMatch(
          /^(?:html:has\(|body(?:\s|\.season1-lobby))/u,
        );
      }
    }
  });
});
