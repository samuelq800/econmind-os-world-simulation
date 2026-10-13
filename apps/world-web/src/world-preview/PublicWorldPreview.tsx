import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PublicWorldMap,
  publicCountryScene,
  publicSceneLabels,
  type PublicPresentation,
  type MapMetrics,
  type PreviewMapApi,
} from './PublicWorldMap.js';
import {
  countries,
  filterCountries,
  initialLayers,
  layerKeys,
  publicGroups,
  publicResources,
  type MapGroupId,
  type PreviewLayers,
} from './geography.js';
import {
  applyPreviewLocale,
  messages,
  readPreviewLocale,
  type PreviewLocale,
  type MessageKey,
} from './locale.js';
import sources from './source-catalog.json';
import './public-world-preview.css';

type Overlay = 'layers' | 'sources' | 'legend' | null;
const initialSelection = () => {
  if (typeof window === 'undefined') return '';
  const number = new URLSearchParams(window.location.search).get('country');
  return countries.find((country) => country.number === number)?.id ?? '';
};
export const publicPresentationForSearch = (
  search: string,
): PublicPresentation =>
  new URLSearchParams(search).get('view') === 'geography'
    ? 'geography'
    : 'illustration';
const initialPresentation = () =>
  publicPresentationForSearch(
    typeof window === 'undefined' ? '' : window.location.search,
  );

export function PublicWorldPreview() {
  const [locale, setLocale] = useState<PreviewLocale>(readPreviewLocale);
  const text = messages[locale];
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [selectedId, setSelectedId] = useState(initialSelection);
  const [presentation, setPresentation] = useState(initialPresentation);
  const sceneText = publicSceneLabels[locale];
  const [layers, setLayers] = useState<PreviewLayers>(() => ({
    ...initialLayers,
  }));
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const sourceTrigger = useRef<HTMLButtonElement>(null);
  const overlayTrigger = useRef<HTMLElement | null>(null);
  const mapApi = useRef<PreviewMapApi | null>(null);
  const [metrics, setMetrics] = useState<MapMetrics>({
    camera: { x: 887, y: 443.5, width: 1900 },
    pointer: [887, 443.5],
    texture: 'loading',
    sourcePixelsPerScreenPixel: 1,
  });
  const recordMetrics = useCallback((next: MapMetrics) => setMetrics(next), []);
  const selected = countries.find((country) => country.id === selectedId);
  const selectedScene = publicCountryScene(selected);
  const matches = filterCountries(query, group);
  const allowed = new Set(matches.map((country) => country.id));

  useEffect(() => {
    applyPreviewLocale(locale);
    document.title = `EconMind World · ${messages[locale].overview}`;
  }, [locale]);
  useEffect(() => {
    const back = () => {
      setSelectedId(initialSelection());
      setPresentation(initialPresentation());
      setOverlay(null);
      setDrawer(false);
      setMenu(false);
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const select = useCallback((id: string) => {
    const country = countries.find((item) => item.id === id);
    if (!country) return;
    setSelectedId(id);
    setPresentation('illustration');
    setDrawer(false);
    setMenu(false);
    setOverlay(null);
    const url = new URL(window.location.href);
    url.searchParams.set('atlas', 'overview');
    url.searchParams.set('country', country.number);
    url.searchParams.delete('view');
    window.history.pushState({}, '', url);
  }, []);
  const reset = () => {
    setSelectedId('');
    setPresentation('illustration');
    setOverlay(null);
    setMenu(false);
    setDrawer(false);
    mapApi.current?.reset();
    const url = new URL(window.location.href);
    url.searchParams.set('atlas', 'overview');
    url.searchParams.delete('country');
    url.searchParams.delete('view');
    window.history.pushState({}, '', url);
  };
  const changePresentation = (next: PublicPresentation) => {
    setPresentation(next);
    const url = new URL(window.location.href);
    if (next === 'geography') url.searchParams.set('view', 'geography');
    else url.searchParams.delete('view');
    window.history.pushState({}, '', url);
  };
  const openOverlay = (value: NonNullable<Overlay>) => {
    if (value === 'layers' && selected && presentation === 'illustration')
      changePresentation('geography');
    overlayTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setOverlay((current) => (current === value ? null : value));
    setDrawer(false);
    setMenu(false);
  };
  const explore = () => {
    setDrawer(true);
    setOverlay(null);
    setMenu(false);
    requestAnimationFrame(() =>
      searchInput.current?.focus({ preventScroll: true }),
    );
  };
  const dismiss = () => {
    setOverlay(null);
    overlayTrigger.current?.focus({ preventScroll: true });
  };

  return (
    <main
      className={`public-world-preview ${selected ? 'has-selection' : ''}`}
      data-public-world-preview="true"
      data-preview-status="STATIC_PUBLIC_PREVIEW_NOT_LIVE_WORLD"
      data-selected-country={selected?.number ?? ''}
      data-locale={locale}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          if (overlay) dismiss();
          setDrawer(false);
          setMenu(false);
        }
      }}
    >
      <header className="preview-header">
        <button
          className="preview-brand"
          onClick={reset}
          aria-label={`EconMind World · ${text.overview}`}
        >
          <img
            src={`${import.meta.env.BASE_URL}brand/econmind-badge-96.png`}
            alt="EconMind"
            width={46}
            height={46}
          />
          <span>
            <strong>ECONMIND WORLD</strong>
            <small>{text.atlas}</small>
          </span>
        </button>
        <nav
          className="preview-nav"
          aria-label={text.navigation}
          data-expanded={menu}
        >
          <button className="active" onClick={reset}>
            {text.overview}
          </button>
          <button onClick={explore}>{text.explore}</button>
          <button
            aria-expanded={overlay === 'layers'}
            onClick={() => openOverlay('layers')}
          >
            {text.layers}
          </button>
          <button
            ref={sourceTrigger}
            aria-expanded={overlay === 'sources'}
            onClick={() => openOverlay('sources')}
          >
            {text.sources}
          </button>
        </nav>
        <div
          className="preview-language"
          role="group"
          aria-label={text.language}
        >
          <button
            aria-pressed={locale === 'zh'}
            onClick={() => setLocale('zh')}
            lang="zh-CN"
          >
            中文
          </button>
          <button
            aria-pressed={locale === 'en'}
            onClick={() => setLocale('en')}
            lang="en"
          >
            EN
          </button>
        </div>
        <button
          className="preview-menu-toggle"
          aria-label={menu ? text.closeMenu : text.menu}
          aria-expanded={menu}
          onClick={() => {
            setMenu((value) => !value);
            setDrawer(false);
            setOverlay(null);
          }}
        >
          ☰
        </button>
      </header>

      <div className="preview-body">
        {drawer && (
          <button
            className="preview-drawer-backdrop"
            aria-label={text.filtersClose}
            onClick={() => setDrawer(false)}
          />
        )}
        <aside
          className="preview-sidebar"
          data-open={drawer}
          aria-label={text.explore}
        >
          <div className="preview-sidebar-heading">
            <h2>{text.explore}</h2>
            <button
              className="preview-drawer-close"
              aria-label={text.filtersClose}
              onClick={() => setDrawer(false)}
            >
              ×
            </button>
          </div>
          <div className="preview-search">
            <label className="sr-only" htmlFor="preview-search">
              {text.search}
            </label>
            <span aria-hidden="true">⌕</span>
            <input
              id="preview-search"
              ref={searchInput}
              value={query}
              placeholder={text.searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                aria-label={text.clearSearch}
                onClick={() => setQuery('')}
              >
                ×
              </button>
            )}
          </div>
          <section
            className="preview-group-filters"
            aria-labelledby="preview-groups-heading"
          >
            <h3 id="preview-groups-heading">{text.groups}</h3>
            <button
              aria-pressed={group === 'all'}
              onClick={() => setGroup('all')}
            >
              <span>{text.allCountries}</span>
              <b>{countries.length}</b>
            </button>
            {publicGroups.map((item) => (
              <button
                key={item.id}
                aria-pressed={group === item.id}
                onClick={() => setGroup(item.id)}
              >
                <span>{text[item.id as MapGroupId]}</span>
                <b>
                  {
                    countries.filter((country) => country.group === item.id)
                      .length
                  }
                </b>
              </button>
            ))}
            <small>{text.sourceGrouping}</small>
          </section>
          <section className="preview-country-list" aria-label={text.countries}>
            <h3>
              {text.countries}
              <span aria-live="polite">{matches.length}</span>
            </h3>
            {matches.length ? (
              matches.map((country) => (
                <button
                  key={country.id}
                  data-country-list-id={country.number}
                  aria-pressed={selectedId === country.id}
                  aria-label={`${text.selectCountry} ${country.number} ${country.name}`}
                  onClick={() => select(country.id)}
                >
                  <b>{country.number}</b>
                  <span>{country.name}</span>
                  <span aria-hidden="true">↗</span>
                </button>
              ))
            ) : (
              <div className="preview-empty" role="status">
                <p>{text.noResults}</p>
                <button
                  onClick={() => {
                    setQuery('');
                    setGroup('all');
                  }}
                >
                  {text.clearFilters}
                </button>
              </div>
            )}
          </section>
          <section className="preview-statistics" aria-label={text.statistics}>
            <h3>{text.statistics}</h3>
            <dl>
              {[
                [countries.length, text.countryCount],
                [publicGroups.length, text.groupCount],
                [publicResources.length, text.resourceCount],
                [sources.length + (selectedScene ? 2 : 0), text.sourceCount],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <p className="preview-sidebar-brand">
            ECONMIND WORLD · {text.overview}
          </p>
        </aside>

        <section
          className="preview-map-region"
          aria-labelledby="preview-map-title"
        >
          <div className="preview-map-heading">
            <button
              className="preview-filter-toggle"
              aria-label={text.filtersOpen}
              onClick={explore}
            >
              ⌕
            </button>
            <h1 id="preview-map-title">
              {selected ? `${selected.number} ${selected.name}` : text.overview}
            </h1>
            <span>{text.mapHelp}</span>
            <button
              onClick={() => openOverlay('legend')}
              aria-expanded={overlay === 'legend'}
            >
              {text.legend}
            </button>
          </div>
          <div className="preview-map-stack">
            <PublicWorldMap
              locale={locale}
              selected={selected}
              presentation={presentation}
              onGeography={() => changePresentation('geography')}
              allowedIds={allowed}
              layers={layers}
              onSelect={select}
              onMetrics={recordMetrics}
              apiRef={mapApi}
            />
            {selected && (
              <div
                className="preview-presentation-controls"
                role="group"
                aria-label={selected.name}
              >
                {(['illustration', 'geography'] as const).map((mode) => (
                  <button
                    key={mode}
                    aria-pressed={presentation === mode}
                    onClick={() => changePresentation(mode)}
                  >
                    {sceneText[mode]}
                  </button>
                ))}
                <button
                  aria-label={sceneText.fit}
                  title={sceneText.fit}
                  onClick={() => mapApi.current?.fit()}
                >
                  ⛶
                </button>
              </div>
            )}
            <div
              className="preview-map-tools"
              role="group"
              aria-label={text.map}
            >
              <button
                title={text.zoomIn}
                aria-label={text.zoomIn}
                onClick={() => mapApi.current?.zoom(0.8)}
              >
                +
              </button>
              <button
                title={text.zoomOut}
                aria-label={text.zoomOut}
                onClick={() => mapApi.current?.zoom(1.25)}
              >
                −
              </button>
              <button
                title={text.reset}
                aria-label={text.reset}
                onClick={reset}
              >
                ⌖
              </button>
              <button
                title={text.layers}
                aria-label={text.layers}
                aria-expanded={overlay === 'layers'}
                onClick={() => openOverlay('layers')}
              >
                ▱
              </button>
            </div>
            {overlay && (
              <section
                className="preview-overlay"
                role="dialog"
                aria-modal="false"
                aria-label={
                  overlay === 'layers'
                    ? text.layers
                    : overlay === 'legend'
                      ? text.legend
                      : selectedScene
                        ? sceneText.sources
                        : text.sourceTitle
                }
                onKeyDown={(event) => {
                  if (event.key === 'Escape') dismiss();
                }}
              >
                <header>
                  <h2>
                    {overlay === 'layers'
                      ? text.layers
                      : overlay === 'legend'
                        ? text.legend
                        : selectedScene
                          ? sceneText.sources
                          : text.sourceTitle}
                  </h2>
                  <button aria-label={text.close} onClick={dismiss}>
                    ×
                  </button>
                </header>
                {overlay === 'layers' && (
                  <div className="preview-layer-options">
                    {layerKeys.map((key) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={layers[key]}
                          onChange={(event) =>
                            setLayers((state) => ({
                              ...state,
                              [key]: event.target.checked,
                            }))
                          }
                        />
                        {text[key]}
                      </label>
                    ))}
                  </div>
                )}
                {overlay === 'legend' && (
                  <div className="preview-legend">
                    <p>{text.geographicNote}</p>
                    {layerKeys
                      .filter((key) => layers[key])
                      .map((key) => (
                        <p key={key}>
                          <i className={`legend-${key}`} />
                          {text[key]}
                        </p>
                      ))}
                    {!layerKeys.some((key) => layers[key]) && (
                      <p>{text.emptyLegend}</p>
                    )}
                  </div>
                )}
                {overlay === 'sources' && (
                  <div className="preview-source-records">
                    <p>
                      {selectedScene ? sceneText.sourceNote : text.sourceNote}
                    </p>
                    {selectedScene && (
                      <details>
                        <summary>
                          {sceneText.illustration} · {selectedScene.number}{' '}
                          {selectedScene.name}
                        </summary>
                        <p>
                          apps/world-web/src/assets/country-scenes/
                          {selectedScene.file}
                        </p>
                        <p>
                          apps/world-web/src/assets/country-scenes/index.json
                        </p>
                        <p>{sceneText.note}</p>
                        <a
                          href={selectedScene.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {selectedScene.file} ↗
                        </a>
                      </details>
                    )}
                    {sources.map((source) => (
                      <details key={source.key}>
                        <summary>{text[source.key as MessageKey]}</summary>
                        <p>{source.file}</p>
                        <small>{text.hash}</small>
                        <code>{source.sha256}</code>
                      </details>
                    ))}
                    <p>{text.geographicNote}</p>
                    <p>{text.coordinateHint}</p>
                  </div>
                )}
              </section>
            )}
          </div>
        </section>

        {selected && (
          <aside
            className="preview-country-details"
            aria-label={text.detailsTitle}
          >
            <header>
              <span>{text.detailsTitle}</span>
              <button aria-label={text.collapseDetails} onClick={reset}>
                ×
              </button>
            </header>
            <h2>
              <small>{selected.number}</small>
              {selected.name}
            </h2>
            <dl>
              <dt>{text.number}</dt>
              <dd>{selected.number}</dd>
              <dt>{text.name}</dt>
              <dd>{selected.name}</dd>
              <dt>{text.group}</dt>
              <dd>{text[selected.group]}</dd>
              <dt>{text.coordinate}</dt>
              <dd>
                {selected.label.join(', ')} {text.sourcePixels}
              </dd>
              <dt>{text.outlinePixels}</dt>
              <dd>
                {selected.landPixels.toLocaleString(
                  locale === 'zh' ? 'zh-CN' : 'en-US',
                )}
              </dd>
            </dl>
            <p>{text.countryNote}</p>
            <p>{text.geographicNote}</p>
            <button
              className="preview-action"
              onClick={() => openOverlay('sources')}
            >
              {text.moreSources}
            </button>
            <button className="preview-return" onClick={reset}>
              {text.returnWorld}
            </button>
          </aside>
        )}
      </div>
      <footer className="preview-footer">
        <span className="preview-footer-brand">ECONMIND WORLD</span>
        <span
          title={`${text.sourceScale}: ${metrics.sourcePixelsPerScreenPixel.toFixed(3)} ${text.sourcePixels} / ${text.screenPixels}`}
        >
          {text.zoom}{' '}
          {(
            (selected && presentation === 'illustration' ? 1.1 : 1900) /
            metrics.camera.width
          ).toFixed(2)}
          ×{' '}
          <span className="preview-footer-coordinates">
            {' '}
            ·{' '}
            {metrics.texture === 'ready'
              ? metrics.pointer.map((value) => value.toFixed(1)).join(', ')
              : '—'}{' '}
            {text.sourcePixels}
          </span>
        </span>
        <button
          title={selectedScene ? sceneText.sourceStatus : text.sourceStatus}
          onClick={() => openOverlay('sources')}
        >
          {metrics.texture === 'loading'
            ? text.textureLoading
            : text.publicStatus}
        </button>
      </footer>
    </main>
  );
}
