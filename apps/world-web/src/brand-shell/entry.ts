import markup from './brand-shell.html?raw';
import css from './brand-shell.css?inline';
import { mountLegacyCountryAtlas } from '../../public/country-home-surroundings.js';

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
  style.textContent = css;
  document.head.append(style);
  document.body.dataset.econmindBrandPage = '';
  document.body.prepend(header);
  document.body.append(footer);
}

if (typeof document !== 'undefined') {
  mountEconMindBrandShell(
    document,
    new URL(import.meta.env.BASE_URL, window.location.origin),
  );
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
