import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrisisActionPage } from '../../apps/world-web/src/crisis-action/CrisisActionPage.js';
import type { CrisisMapSlot } from '../../apps/world-web/src/crisis-action/CrisisActionPage.js';
import type { CrisisReadState } from '../../apps/world-web/src/crisis-action/model.js';
import { CrisisGeography } from '../../apps/world-web/src/map-explorer/CrisisGeography.js';
import {
  applyPreviewLocale,
  LANGUAGE_KEY,
  readPreviewLocale,
  subscribePreviewLocale,
} from '../../apps/world-web/src/world-preview/locale.js';

const requireWeb = createRequire(
  new URL('../../apps/world-web/package.json', import.meta.url),
);
const { createElement } = requireWeb('react') as typeof import('react');
const { renderToStaticMarkup } = requireWeb(
  'react-dom/server',
) as typeof import('react-dom/server');

// Pure offline preference/render checks, not native clicks, a seat or live data.
function preference(value: string | null = 'en') {
  const values = new Map<string, string>();
  if (value !== null) values.set(LANGUAGE_KEY, value);
  const host = Object.assign(new EventTarget(), {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, next: string) => values.set(key, next),
    },
  });
  vi.stubGlobal('window', host);
  vi.stubGlobal('document', { documentElement: { lang: '', dataset: {} } });
  return values;
}
function render(props: Parameters<typeof CrisisActionPage>[0] = {}) {
  return renderToStaticMarkup(
    createElement(CrisisActionPage, {
      countryNumber: '01',
      worldHref: '?atlas=explorer',
      countryHref: '?atlas=explorer&country=01',
      ...props,
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());

describe('existing crisis/office presentation locale continuity, OFFLINE ONLY', () => {
  it('reads the existing EN country preference and renders an honest English shell with a visible switch', () => {
    preference('en');
    const html = render();
    for (const text of [
      'lang="en"',
      'Country 01',
      'Interface language',
      'From shortfall to verified delivery',
      'Official crisis data is not connected',
      'Office is not bound',
      'No authorized tasks',
      'Unknown does not mean zero',
      '>EN</button>',
      '>中文</button>',
    ])
      expect(html).toContain(text);
    expect(html.match(/[\u3400-\u9fff]+/gu)).toEqual(['中文']);
    expect(html).not.toContain('TEST_ONLY');
  });
  it('retains the existing ZH copy and exact display-country context', () => {
    preference('zh');
    const html = render({ countryNumber: '54' });
    for (const text of [
      'lang="zh-CN"',
      '国家 54',
      '从缺口到真实交付',
      '前14天（两周）',
      '目标 10× · 尚未绑定',
    ])
      expect(html).toContain(text);
  });
  it('persists EN→ZH→EN through the original key/event so reload and returning country UI read the same preference', () => {
    const values = preference('en'),
      seen: string[] = [];
    const unsubscribe = subscribePreviewLocale(() =>
      seen.push(readPreviewLocale()),
    );
    for (const language of ['en', 'zh', 'en'] as const) {
      applyPreviewLocale(language);
      expect(values.get(LANGUAGE_KEY)).toBe(language);
      expect(render()).toContain(
        `lang="${language === 'zh' ? 'zh-CN' : 'en'}"`,
      );
    }
    expect(seen).toEqual(['en', 'zh', 'en']);
    expect(document.documentElement.lang).toBe('en');
    unsubscribe();
  });
  it('does not rewrite the existing country or world return routes', () => {
    preference('en');
    const html = render();
    expect(html).toContain('href="?atlas=explorer"');
    expect(html).toContain('href="?atlas=explorer&amp;country=01"');
    expect(html).not.toMatch(/<form|type="submit"|fetch\(/u);
  });
  it('keeps only legal zh/en preferences and the existing invalid-value fallback', () => {
    for (const value of ['en-US', 'zh-CN', 'unrecognized', null]) {
      preference(value);
      expect(readPreviewLocale()).toBe('en');
      expect(render()).toContain('From shortfall to verified delivery');
    }
  });
  it('keeps storage failure as a UI fallback, not permission or data access', () => {
    preference();
    Object.assign(window.localStorage, {
      getItem: () => {
        throw new Error('OFFLINE_STORAGE_UNAVAILABLE');
      },
      setItem: () => {
        throw new Error('OFFLINE_STORAGE_UNAVAILABLE');
      },
    });
    expect(readPreviewLocale()).toBe('en');
    expect(render()).toContain('Office is not bound');
    expect(() => applyPreviewLocale('zh')).not.toThrow();
    expect(document.documentElement.lang).toBe('zh-CN');
  });
  it('passes locale to the existing map host without inventing geometry, tasks or country identity', () => {
    preference('en');
    let observed: CrisisMapSlot | null = null;
    const html = render({
      countryNumber: '54',
      countryHref: '?atlas=explorer&country=54',
      renderMap: (slot) => {
        observed = slot;
        slot.onSelectLocation('UNRECOGNIZED_DISPLAY_LOCATION');
        return createElement(CrisisGeography, {
          countryNumber: '54',
          locale: slot.locale,
        });
      },
    });
    expect(observed).toMatchObject({
      locale: 'en',
      locations: [],
      routes: [],
      selectedTaskId: null,
      selectedLocationId: null,
    });
    expect(html).toContain('Historical static geography');
    expect(html).not.toContain('危机点位');
  });
  it.each(['LOADING', 'DENIED', 'UNAVAILABLE'] as const)(
    'keeps %s empty, honest and non-authoritative in English',
    (status) => {
      preference('en');
      const state: CrisisReadState =
        status === 'UNAVAILABLE'
          ? {
              status,
              reasons: ['ACTUAL_GAP_NOT_PROJECTED', 'MODEL_NOT_ADMITTED'],
            }
          : { status };
      const html = render({ state });
      expect(html).toContain('Office is not bound');
      expect(html).toContain(
        status === 'DENIED'
          ? 'This identity has no authorized tasks.'
          : 'No authorized tasks',
      );
      expect(html).not.toMatch(
        /crisis-task-detail|class="crisis-actions"|type="submit"/u,
      );
      if (status === 'UNAVAILABLE') {
        expect(html).toContain('Actual shortfall: not projected by the server');
        expect(html).toContain('MODEL_NOT_ADMITTED');
      }
    },
  );
  it('does not translate server/source labels or invent a current projection', () => {
    preference('en');
    const html = render({ countryLabel: 'SOURCE_NAME_原文' });
    expect(html).toContain('SOURCE_NAME_原文');
    expect(html).toContain('Official crisis data is not connected');
    expect(html).not.toContain('Server-authorized read-only projection');
  });
  it('uses the existing subscription cleanup rather than retaining a second locale listener', () => {
    preference('en');
    const seen = vi.fn(),
      unsubscribe = subscribePreviewLocale(seen);
    applyPreviewLocale('zh');
    expect(seen).toHaveBeenCalledTimes(1);
    unsubscribe();
    applyPreviewLocale('en');
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
