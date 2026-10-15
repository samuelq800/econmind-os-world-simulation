import markup from './brand-shell.html?raw';
import css from './brand-shell.css?inline';
import crisisCss from '../crisis-action/crisis-action.css?inline';
import { mountLegacyCountryAtlas } from '../../public/country-home-surroundings.js';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CrisisSummary } from '../crisis-action/index.js';
import { isPublicWorldPreview } from '../world-preview/public-route.js';
import {
  applyPreviewLocale,
  readPreviewLocale,
} from '../world-preview/locale.js';

/** Public brand chrome only: no session, storage, source read or command access. */
export function mountEconMindBrandShell(document: Document, base: URL) {
  if (document.querySelector('[data-econmind-brand-header]')) return;
  const template = document.createElement('template');
  template.innerHTML = markup;
  const header = template.content.querySelector<HTMLElement>('header');
  const footer = template.content.querySelector<HTMLElement>('footer');
  if (!header || !footer) throw new Error('Missing EconMind brand chrome');
  for (const image of template.content.querySelectorAll<HTMLImageElement>(
    '[data-econmind-brand-asset]',
  )) {
    image.src = new URL(`brand/${image.dataset.econmindBrandAsset}`, base).href;
  }
  const style = document.createElement('style');
  style.dataset.econmindBrandStyle = '';
  style.textContent = css + '\n' + crisisCss;
  document.head.append(style);
  document.body.dataset.econmindBrandPage = '';
  document.body.prepend(header);
  document.body.append(footer);
}

if (typeof document !== 'undefined') {
  const publicPreview = isPublicWorldPreview(
    new URL(window.location.href),
    import.meta.env.BASE_URL,
  );
  if (publicPreview) {
    document.body.dataset.econmindPublicPreview = '';
    applyPreviewLocale(readPreviewLocale());
  } else {
    mountEconMindBrandShell(
      document,
      new URL(import.meta.env.BASE_URL, window.location.origin),
    );
  }
  if (
    /\/season1-immersive\/(?:index\.html)?$/u.test(window.location.pathname)
  ) {
    const mounts = new Map<HTMLElement, { host: HTMLElement; root: Root }>();
    const attach = () => {
      for (const [scene, mounted] of mounts) {
        if (!scene.isConnected || !mounted.host.isConnected) {
          mounted.root.unmount();
          mounts.delete(scene);
        }
      }
      const scene = document.querySelector<HTMLElement>('.national-world');
      if (!scene || scene.parentElement?.querySelector('.econmind-home-crisis'))
        return;
      const host = document.createElement('div');
      host.className = 'econmind-home-crisis';
      scene.before(host);
      const country = new URLSearchParams(window.location.search).get(
        'country',
      );
      const number =
        country && /^(0[1-9]|[1-6][0-9]|70)$/.test(country) ? country : null;
      const url = new URL(
        './',
        new URL(import.meta.env.BASE_URL, window.location.origin),
      );
      url.searchParams.set('atlas', 'crisis');
      if (number) url.searchParams.set('country', number);
      const root = createRoot(host);
      mounts.set(scene, { host, root });
      root.render(
        createElement(CrisisSummary, {
          ...(number ? { countryLabel: `国家 ${number}` } : {}),
          href: url.href,
        }),
      );
    };
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    attach();
  }
  // Public legacy Atlas uses the same verified geography as HOME. Its own
  // renderer continues to own country selection, records and pin interactions.
  if (/\/countries\/(?:\d{2}\/)?$/u.test(window.location.pathname)) {
    const base = new URL(import.meta.env.BASE_URL, window.location.origin);
    const attach = () => {
      const root = document.querySelector<HTMLElement>('.country-map');
      const page = window as Window & {
        CountryPage?: { country: () => unknown };
      };
      if (!root || !page.CountryPage) return;
      observer.disconnect();
      void mountLegacyCountryAtlas(root, page.CountryPage.country(), base);
    };
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    attach();
  }
}
