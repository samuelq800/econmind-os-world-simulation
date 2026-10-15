import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrisisSummary } from '../../apps/world-web/src/crisis-action/CrisisActionPage.js';
import {
  applyPreviewLocale,
  LANGUAGE_EVENT,
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

afterEach(() => vi.unstubAllGlobals());

describe('explicit crisis summary locale', () => {
  it.each(['zh', 'en'] as const)(
    'renders complete %s UNBOUND copy without a translator',
    (locale) => {
      const html = renderToStaticMarkup(
        createElement(CrisisSummary, {
          locale,
          countryNumber: '54',
          href: '/?atlas=crisis&country=54',
        }),
      );
      expect(html).toContain('data-no-translate=""');
      expect(html).toContain(`lang="${locale === 'zh' ? 'zh-CN' : 'en'}"`);
      expect(html).toContain('href="/?atlas=crisis&amp;country=54"');
      expect(html).not.toContain('TEST_ONLY');
      if (locale === 'en') {
        for (const copy of [
          'Crisis action and feedback summary',
          'Post-war reconstruction',
          'Crisis action',
          'Country 54',
          'Official crisis data is not connected',
          'Actual shortfall: ',
          'No data',
          'Verified contributions: ',
          'No verified records',
          'Citizen voices: No authorized content',
          'Other governments · System simulation',
          'No simulated responses',
          'Player diplomacy',
          'No player diplomacy records',
          'Enter crisis action →',
        ])
          expect(html).toContain(copy);
        expect(html).not.toMatch(/[\u3400-\u9fff]/u);
      } else {
        for (const copy of [
          '危机行动与反馈摘要',
          '战后重建',
          '国家 54',
          '正式危机数据尚未接入',
          '实际缺口：',
          '暂无数据',
          '核验贡献：',
          '暂无核验记录',
          '民众声音：暂无授权内容',
          '他国回应 · 系统模拟',
          '暂无模拟回应',
          '玩家外交',
          '暂无玩家外交记录',
          '进入危机行动 →',
        ])
          expect(html).toContain(copy);
        expect(html).not.toContain('Crisis');
        expect(html).not.toContain('Shortfall');
      }
    },
  );

  it.each([
    ['LOADING', 'Reading the authorized crisis projection'],
    ['DENIED', 'This identity is not authorized to read crisis details'],
  ] as const)('keeps %s empty and read-only in English', (status, label) => {
    const html = renderToStaticMarkup(
      createElement(CrisisSummary, { locale: 'en', state: { status } }),
    );
    expect(html).toContain(label);
    expect(html).toContain('Select a country for crisis context');
    expect(html).not.toMatch(/[\u3400-\u9fff]|<button/u);
    expect(html).toContain('No authorized content');
  });

  it('retains source labels literally instead of translating source content', () => {
    const label = 'SOURCE_NAME_原文';
    const html = renderToStaticMarkup(
      createElement(CrisisSummary, { locale: 'en', countryLabel: label }),
    );
    expect(html).toContain(label);
    expect(html).toContain('Official crisis data is not connected');
  });
});

describe('existing locale preference and change contract', () => {
  function preference() {
    const values = new Map([[LANGUAGE_KEY, 'zh']]);
    const target = Object.assign(new EventTarget(), {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    vi.stubGlobal('window', target);
    vi.stubGlobal('document', { documentElement: { lang: '', dataset: {} } });
    return { values, target };
  }

  it('notifies on the immutable page ZH→EN→ZH event and unsubscribes', () => {
    const p = preference();
    const seen: string[] = [];
    const unsubscribe = subscribePreviewLocale(() =>
      seen.push(readPreviewLocale()),
    );
    for (const locale of ['zh', 'en', 'zh']) {
      p.values.set(LANGUAGE_KEY, locale);
      p.target.dispatchEvent(
        new CustomEvent(LANGUAGE_EVENT, { detail: { language: locale } }),
      );
    }
    expect(seen).toEqual(['zh', 'en', 'zh']);
    unsubscribe();
    p.target.dispatchEvent(new Event(LANGUAGE_EVENT));
    expect(seen).toHaveLength(3);
  });

  it('shares the same event from React language controls without another store', () => {
    preference();
    const seen: string[] = [];
    const unsubscribe = subscribePreviewLocale(() =>
      seen.push(readPreviewLocale()),
    );
    applyPreviewLocale('en');
    applyPreviewLocale('zh');
    expect(seen).toEqual(['en', 'zh']);
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.documentElement.dataset.language).toBe('zh');
    unsubscribe();
  });

  it('responds only to this storage key or storage clear and cleans up', () => {
    const p = preference();
    const changed = vi.fn();
    const unsubscribe = subscribePreviewLocale(changed);
    for (const key of ['UNRELATED', LANGUAGE_KEY, null]) {
      const event = new Event('storage');
      Object.defineProperty(event, 'key', { value: key });
      p.target.dispatchEvent(event);
    }
    expect(changed).toHaveBeenCalledTimes(2);
    unsubscribe();
    const event = new Event('storage');
    Object.defineProperty(event, 'key', { value: LANGUAGE_KEY });
    p.target.dispatchEvent(event);
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
