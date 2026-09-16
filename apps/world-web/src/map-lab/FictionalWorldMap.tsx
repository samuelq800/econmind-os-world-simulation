import { useState } from 'react';

import satelliteTerrainUrl from '../assets/asterra-satellite-terrain-v2.png';

import { FICTIONAL_ATLAS } from './atlas.js';
import { formatDistanceKm, validateFictionalAtlas } from './route-oracle.js';
import { svgPath } from './geometry.js';
import type {
  AtlasFeature,
  AtlasInfrastructure,
  AtlasLandUseArea,
  AtlasVisualTerritory,
} from './types.js';

import './fictional-world-map.css';

const measuredRoutes = validateFictionalAtlas(FICTIONAL_ATLAS);
const nodesById = new Map(FICTIONAL_ATLAS.nodes.map((node) => [node.id, node]));

const mapViews = [
  {
    id: 'overview',
    label: 'Full atlas',
    viewBox: `0 0 ${FICTIONAL_ATLAS.widthKm} ${FICTIONAL_ATLAS.heightKm}`,
  },
  { id: 'western', label: 'Western Arc', viewBox: '0 1500 12000 6000' },
  { id: 'interior', label: 'Uruq & Tessera', viewBox: '11000 1500 16000 8000' },
  { id: 'eastern', label: 'Eastern Wedge', viewBox: '25000 2000 11000 5500' },
  {
    id: 'southern',
    label: 'Southern Crescent',
    viewBox: '8000 9000 20000 8000',
  },
] as const;

const areaFeatures = new Set([
  'BASIN',
  'DELTA',
  'HILL_COUNTRY',
  'INLAND_LAKE',
  'PLAIN',
  'STEPPE',
]);

function featureClass(feature: AtlasFeature): string {
  return `atlas-feature atlas-feature--${feature.kind.toLowerCase()}`;
}

function featureElement(feature: AtlasFeature) {
  const path = svgPath(feature.geometry, areaFeatures.has(feature.kind));
  return (
    <path className={featureClass(feature)} d={path} key={feature.id}>
      <title>
        {feature.name}
        {feature.resourceTags.length > 0
          ? ` — ${feature.resourceTags.map((tag) => tag.label).join(', ')}`
          : ''}
      </title>
    </path>
  );
}

function landUseElement(area: AtlasLandUseArea) {
  return (
    <path
      className={`atlas-land-use atlas-land-use--${area.kind.toLowerCase()}`}
      d={svgPath(area.geometry, true)}
      key={area.id}
    >
      <title>
        {area.name} — {area.resourceTags.map((tag) => tag.label).join(', ')};
        value {area.economicValue}
      </title>
    </path>
  );
}

function visualTerritoryElement(
  territory: AtlasVisualTerritory,
  showName: boolean,
) {
  const resources = territory.resourceProfile
    .map((tag) => tag.label)
    .join(', ');
  return (
    <g className="atlas-visual-territory" key={territory.id}>
      <path d={svgPath(territory.polygon, true)} fill={territory.color} />
      <circle cx={territory.capital.xKm} cy={territory.capital.yKm} r={58} />
      {showName ? (
        <text x={territory.capital.xKm + 95} y={territory.capital.yKm - 95}>
          {territory.name}
        </text>
      ) : null}
      <title>
        {territory.name} — capital marker
        {resources
          ? `; physical resource context: ${resources}`
          : '; trade-oriented / resource-light'}
      </title>
    </g>
  );
}

function infrastructureGlyph(kind: AtlasInfrastructure['kind']) {
  switch (kind) {
    case 'PORT':
      return (
        <path
          className="atlas-infrastructure__glyph"
          d="M 0 -125 L 0 135 M -135 55 L 0 135 L 135 55 M -95 55 L -95 135 M 95 55 L 95 135"
        />
      );
    case 'FACTORY':
      return (
        <path
          className="atlas-infrastructure__glyph"
          d="M -125 120 L -125 -35 L -55 5 L -55 -115 L 10 -55 L 10 -145 L 80 -90 L 80 120 Z M -160 120 H 145"
        />
      );
    case 'FARM_COMPLEX':
      return (
        <path
          className="atlas-infrastructure__glyph"
          d="M -130 -90 H 130 M -130 -5 H 130 M -130 85 H 130 M -95 -135 V 135 M 0 -135 V 135 M 95 -135 V 135"
        />
      );
    case 'MINING_COMPLEX':
      return (
        <path
          className="atlas-infrastructure__glyph"
          d="M 0 -145 L 135 0 L 0 145 L -135 0 Z M -75 0 H 75 M 0 -75 V 75"
        />
      );
    case 'REFINERY':
      return (
        <path
          className="atlas-infrastructure__glyph"
          d="M -110 125 H 110 M -95 125 V -100 H -35 V 125 M 5 125 V -145 H 65 V 125 M -120 -100 H -10 M -20 -145 H 105"
        />
      );
    case 'ENERGY_COMPLEX':
      return (
        <path
          className="atlas-infrastructure__glyph"
          d="M 15 -150 L -95 5 H -20 L -45 150 L 105 -35 H 25 Z"
        />
      );
    case 'LOGISTICS_HUB':
      return (
        <path
          className="atlas-infrastructure__glyph"
          d="M 0 -140 V 140 M -140 0 H 140 M 0 -140 L 48 -82 M 0 -140 L -48 -82 M 140 0 L 82 48 M 140 0 L 82 -48 M 0 140 L 48 82 M 0 140 L -48 82 M -140 0 L -82 48 M -140 0 L -82 -48"
        />
      );
    case 'MOUNTAIN_PASS':
      return (
        <path
          className="atlas-infrastructure__glyph"
          d="M -140 110 L -35 -120 L 35 110 L 92 -35 L 145 110 M -140 110 H 145"
        />
      );
    default:
      return (
        <path
          className="atlas-infrastructure__glyph"
          d="M -125 0 H 125 M 0 -125 V 125"
        />
      );
  }
}

function infrastructureElement(infrastructure: AtlasInfrastructure) {
  const point = infrastructure.geometry[0]!;
  if (infrastructure.geometry.length === 1) {
    return (
      <g
        className={`atlas-infrastructure atlas-infrastructure--${infrastructure.kind.toLowerCase()}`}
        key={infrastructure.id}
        transform={`translate(${point.xKm} ${point.yKm})`}
      >
        <circle r={205} />
        {infrastructureGlyph(infrastructure.kind)}
        <title>{infrastructure.name}</title>
      </g>
    );
  }
  return (
    <path
      className={`atlas-infrastructure atlas-infrastructure--${infrastructure.kind.toLowerCase()}`}
      d={svgPath(infrastructure.geometry)}
      key={infrastructure.id}
    >
      <title>{infrastructure.name}</title>
    </path>
  );
}

export function FictionalWorldMap() {
  const [activeMapViewId, setActiveMapViewId] =
    useState<(typeof mapViews)[number]['id']>('overview');
  const activeMapView = mapViews.find((view) => view.id === activeMapViewId)!;

  return (
    <section aria-labelledby="atlas-title" className="fictional-atlas">
      <header className="fictional-atlas__header">
        <div>
          <p className="fictional-atlas__eyebrow">V25.1 parallel preparation</p>
          <h1 id="atlas-title">Asterra — fictional transport atlas</h1>
          <p>
            Local planar geometry only: every displayed route distance is
            measured from the same line shown on the map. This map is not Earth,
            a World State, or a V27 country seed.
          </p>
        </div>
        <dl className="fictional-atlas__status">
          <div>
            <dt>CRS</dt>
            <dd>{FICTIONAL_ATLAS.crs}</dd>
          </div>
          <div>
            <dt>Economic values</dt>
            <dd>UNASSIGNED_BY_V27</dd>
          </div>
        </dl>
      </header>

      <div
        aria-label="Map detail view"
        className="fictional-atlas__map-toolbar"
        role="group"
      >
        <span>Detail view</span>
        {mapViews.map((view) => (
          <button
            aria-pressed={view.id === activeMapView.id}
            className={view.id === activeMapView.id ? 'is-active' : undefined}
            key={view.id}
            onClick={() => setActiveMapViewId(view.id)}
            type="button"
          >
            {view.label}
          </button>
        ))}
      </div>

      <div className="fictional-atlas__map-frame">
        <svg
          aria-label={`Fictional physical map, ${activeMapView.label} view`}
          className="fictional-atlas__map"
          role="img"
          viewBox={activeMapView.viewBox}
        >
          <defs>
            <radialGradient cx="45%" cy="35%" id="ocean-surface" r="85%">
              <stop offset="0%" stopColor="#1d617a" />
              <stop offset="52%" stopColor="#0b3e56" />
              <stop offset="100%" stopColor="#061f31" />
            </radialGradient>
            <linearGradient id="land-surface" x1="0" x2="0.8" y1="0" y2="1">
              <stop offset="0%" stopColor="#a2ae75" />
              <stop offset="42%" stopColor="#5e875a" />
              <stop offset="76%" stopColor="#2f6549" />
              <stop offset="100%" stopColor="#1d493a" />
            </linearGradient>
            <filter
              id="terrain-relief"
              x="-12%"
              y="-12%"
              width="124%"
              height="130%"
            >
              <feTurbulence
                baseFrequency="0.006 0.032"
                numOctaves="4"
                result="terrain"
                seed="27"
                type="fractalNoise"
              />
              <feColorMatrix
                in="terrain"
                result="terrain-colour"
                type="matrix"
                values="0.6 0 0 0 0.16 0 0.55 0 0 0.25 0 0 0.45 0 0.12 0 0 0 0.82 0"
              />
              <feComposite
                in="terrain-colour"
                in2="SourceAlpha"
                operator="in"
                result="terrain-masked"
              />
              <feBlend
                in="SourceGraphic"
                in2="terrain-masked"
                mode="soft-light"
                result="relief"
              />
              <feDropShadow
                dx="0"
                dy="75"
                floodColor="#001516"
                floodOpacity="0.68"
                stdDeviation="46"
              />
            </filter>
            <pattern
              height="330"
              id="cultivation-grid"
              patternUnits="userSpaceOnUse"
              width="330"
            >
              <rect fill="#e9c96d" height="330" opacity="0.5" width="330" />
              <path
                d="M 0 82 H 330 M 0 170 H 330 M 0 254 H 330 M 82 0 V 330 M 194 0 V 330 M 280 0 V 330"
                fill="none"
                stroke="#fff0a1"
                strokeOpacity="0.65"
                strokeWidth="16"
              />
            </pattern>
            <pattern
              height="360"
              id="mineral-veins"
              patternUnits="userSpaceOnUse"
              width="360"
            >
              <rect fill="#5f5576" height="360" opacity="0.54" width="360" />
              <path
                d="M -40 60 L 100 -30 M 40 240 L 290 80 M 170 420 L 400 260"
                fill="none"
                stroke="#d9a5e9"
                strokeOpacity="0.76"
                strokeWidth="35"
              />
            </pattern>
            <marker
              id="warm-current-arrow"
              markerHeight="8"
              markerWidth="8"
              orient="auto"
              refX="7"
              refY="4"
              viewBox="0 0 8 8"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill="#f3cb70" />
            </marker>
          </defs>

          <rect
            className="atlas-ocean"
            height={FICTIONAL_ATLAS.heightKm}
            width={FICTIONAL_ATLAS.widthKm}
          />
          <image
            aria-hidden="true"
            className="atlas-satellite-base"
            height={FICTIONAL_ATLAS.heightKm}
            href={satelliteTerrainUrl}
            preserveAspectRatio="none"
            width={FICTIONAL_ATLAS.widthKm}
          />

          {FICTIONAL_ATLAS.latitudeBands.map((band) => (
            <rect
              className={`atlas-latitude atlas-latitude--${band.thermalClass.toLowerCase()}`}
              height={band.southEdgeKm - band.northEdgeKm}
              key={band.id}
              width={FICTIONAL_ATLAS.widthKm}
              y={band.northEdgeKm}
            >
              <title>{band.name}</title>
            </rect>
          ))}

          {FICTIONAL_ATLAS.oceanCurrents.map((current) => (
            <path
              className="atlas-warm-current"
              d={svgPath(current.geometry)}
              key={current.id}
              markerEnd="url(#warm-current-arrow)"
            >
              <title>{current.name} — warm subsurface current</title>
            </path>
          ))}

          {FICTIONAL_ATLAS.visualTerritories.map((territory) =>
            visualTerritoryElement(territory, activeMapView.id !== 'overview'),
          )}

          {FICTIONAL_ATLAS.landUseAreas.map(landUseElement)}
          {FICTIONAL_ATLAS.features.map(featureElement)}

          {FICTIONAL_ATLAS.routes.map((route) => (
            <path
              className={`atlas-route atlas-route--${route.mode.toLowerCase()}`}
              d={svgPath(route.path)}
              key={route.id}
            >
              <title>
                {route.id} —{' '}
                {formatDistanceKm(
                  measuredRoutes.find(
                    (measured) => measured.routeId === route.id,
                  )!.distanceKm,
                )}
              </title>
            </path>
          ))}

          {FICTIONAL_ATLAS.infrastructure.map(infrastructureElement)}
        </svg>
      </div>

      <div className="fictional-atlas__panels">
        <section aria-labelledby="corridors-title" className="atlas-panel">
          <h2 id="corridors-title">Measured corridors</h2>
          <p>
            Land roads are solid; maritime corridors are dashed. Strait-bound
            sea lanes are rejected unless their actual geometry passes through
            the named strait.
          </p>
          <ul className="atlas-route-list">
            {measuredRoutes.map((route) => {
              const from = nodesById.get(route.fromNodeId)!;
              const to = nodesById.get(route.toNodeId)!;
              return (
                <li key={route.routeId}>
                  <span
                    className={`atlas-route-chip atlas-route-chip--${route.mode.toLowerCase()}`}
                  >
                    {route.mode}
                  </span>
                  <span>
                    {from.name} → {to.name}
                  </span>
                  <strong>{formatDistanceKm(route.distanceKm)}</strong>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="layers-title" className="atlas-panel">
          <h2 id="layers-title">Physical & infrastructure layers</h2>
          <ul className="atlas-layer-list">
            <li>
              <span className="atlas-key atlas-key--mountain" /> collision
              mountain ranges
            </li>
            <li>
              <span className="atlas-key atlas-key--river" /> rivers and a small
              delta
            </li>
            <li>
              <span className="atlas-key atlas-key--current" /> warm subsurface
              currents
            </li>
            <li>
              <span className="atlas-key atlas-key--seismic" /> seismic belts
            </li>
            <li>
              <span className="atlas-key atlas-key--port" /> ports and major
              infrastructure
            </li>
            <li>
              <span className="atlas-key atlas-key--capital" /> 70
              display-territory capital markers
            </li>
          </ul>
          <p className="atlas-panel__note">
            Resource labels identify geography only. Population, crop output,
            reserves, capacity and port throughput are intentionally unavailable
            until an approved V27 seed and authorised projection exist.
          </p>
        </section>

        <section
          aria-labelledby="portfolio-title"
          className="atlas-panel atlas-panel--portfolio"
        >
          <h2 id="portfolio-title">Physical resource portfolio</h2>
          <ul className="atlas-resource-list">
            <li>
              <strong>North-west continental basin</strong>
              <span>
                collision metals upstream; grain on convergent river plains
              </span>
            </li>
            <li>
              <strong>Central endorheic interior</strong>
              <span>
                sedimentary gas, salt-basin lithium and shield uranium; low
                coast access
              </span>
            </li>
            <li>
              <strong>Eastern margin</strong>
              <span>
                margin copper, fractured harbour coast and shelf trade access
              </span>
            </li>
            <li>
              <strong>Equatorial strait arc</strong>
              <span>
                route service and limited island-arc minerals; intentionally
                resource-light
              </span>
            </li>
            <li>
              <strong>Southern fragments</strong>
              <span>temperate grain lowlands and exposed shield iron</span>
            </li>
          </ul>
        </section>
      </div>
    </section>
  );
}
