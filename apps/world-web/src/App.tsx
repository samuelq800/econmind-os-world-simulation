import './landing.css';
import { lazy, Suspense } from 'react';
import { OfficialSourceConnectionStatus } from './components/OfficialSourceConnectionStatus.js';
import { CrisisActionPage } from './crisis-action/index.js';
import { CrisisGeography } from './map-explorer/CrisisGeography.js';
import { isPublicWorldPreview } from './world-preview/public-route.js';
import {
  PublicWorldLoading,
  PublicWorldErrorBoundary,
} from './world-preview/Loading.js';

const PublicWorldPreview = lazy(async () => ({
  default: (await import('./world-preview/PublicWorldPreview.js'))
    .PublicWorldPreview,
}));

const ContinentExplorer = lazy(async () => ({
  default: (await import('./map-explorer/ContinentExplorer.js'))
    .ContinentExplorer,
}));
const FictionalWorldMap = lazy(async () => ({
  default: (await import('./map-lab/FictionalWorldMap.js')).FictionalWorldMap,
}));
const WorldExplorer = lazy(async () => ({
  default: (await import('./map-explorer/WorldExplorer.js')).WorldExplorer,
}));
const previewBoundary =
  'This public preview uses illustrative planning data only and does not connect to World State or establish Gate B evidence.';

export function App() {
  if (
    isPublicWorldPreview(
      new URL(window.location.href),
      import.meta.env.BASE_URL,
    )
  ) {
    return (
      <PublicWorldErrorBoundary>
        <Suspense fallback={<PublicWorldLoading />}>
          <PublicWorldPreview />
        </Suspense>
      </PublicWorldErrorBoundary>
    );
  }
  const atlas = new URLSearchParams(window.location.search).get('atlas');
  if (atlas === 'crisis') {
    const value = new URLSearchParams(window.location.search).get('country');
    const country =
      value && /^(0[1-9]|[1-6][0-9]|70)$/.test(value) ? value : null;
    return (
      <CrisisActionPage
        {...(country ? { countryLabel: `国家 ${country}` } : {})}
        worldHref="?atlas=explorer"
        {...(country
          ? { countryHref: `?atlas=explorer&country=${country}` }
          : {})}
        renderMap={() => <CrisisGeography countryNumber={country} />}
      />
    );
  }
  if (
    atlas === null ||
    atlas === 'continents' ||
    atlas === 'explorer' ||
    atlas === 'map'
  ) {
    const view =
      atlas === 'continents' ? (
        <ContinentExplorer />
      ) : atlas === 'map' ? (
        <FictionalWorldMap />
      ) : (
        <WorldExplorer />
      );
    const map = (
      <Suspense
        fallback={<main className="world-landing">Loading atlas…</main>}
      >
        {view}
      </Suspense>
    );
    return atlas === null || atlas === 'explorer' ? (
      <div className="official-source-map-shell">
        <OfficialSourceConnectionStatus />
        {map}
      </div>
    ) : (
      map
    );
  }

  return (
    <main className="world-landing">
      <section className="world-landing__panel" aria-labelledby="world-title">
        <p className="world-landing__eyebrow">ECONMIND WORLD</p>
        <h1 id="world-title">A living nation, ready for audit.</h1>
        <p className="world-landing__copy">
          Open the national command preview to inspect the country scene,
          office-bound action path, relationship map, replay strip, and local
          transfer journey.
        </p>
        <a className="world-landing__action" href="./command.html">
          Open national command
        </a>
        <nav
          className="world-landing__atlas-links"
          aria-label="World atlas previews"
        >
          <a href="?atlas=explorer">Explore 70 country maps</a>
          <a href="?atlas=continents">Explore four continents</a>
          <a href="?atlas=map">Open layered world map</a>
        </nav>
        <p className="world-landing__boundary">{previewBoundary}</p>
      </section>
    </main>
  );
}
