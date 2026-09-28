import './landing.css';
import { lazy, Suspense } from 'react';

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

export function App() {
  const atlas = new URLSearchParams(window.location.search).get('atlas');
  if (atlas === 'continents' || atlas === 'explorer' || atlas === 'map') {
    const view =
      atlas === 'continents' ? (
        <ContinentExplorer />
      ) : atlas === 'explorer' ? (
        <WorldExplorer />
      ) : (
        <FictionalWorldMap />
      );
    return (
      <Suspense
        fallback={<main className="world-landing">Loading atlas…</main>}
      >
        {view}
      </Suspense>
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
        <p className="world-landing__boundary">
          Public previews and illustrative planning data only. They do not
          connect to World State or establish Gate B evidence.
        </p>
      </section>
    </main>
  );
}
