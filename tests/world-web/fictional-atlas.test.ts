import { describe, expect, it } from 'vitest';

import { FICTIONAL_ATLAS } from '../../apps/world-web/src/map-lab/atlas.js';
import {
  formatDistanceKm,
  validateFictionalAtlas,
} from '../../apps/world-web/src/map-lab/route-oracle.js';
import { polylineDistanceKm } from '../../apps/world-web/src/map-lab/geometry.js';
import type { FictionalAtlas } from '../../apps/world-web/src/map-lab/types.js';

describe('V25.1 fictional atlas preparation', () => {
  it('treats the east and west edges as one meridian for measured routes', () => {
    expect(
      polylineDistanceKm(
        [
          { xKm: 35_900, yKm: 9_000 },
          { xKm: 100, yKm: 9_000 },
        ],
        FICTIONAL_ATLAS.widthKm,
      ),
    ).toBe(200);

    const nonWrapping: FictionalAtlas = {
      ...FICTIONAL_ATLAS,
      wrapsHorizontally: false as true,
    };
    expect(() => validateFictionalAtlas(nonWrapping)).toThrow(
      'must wrap horizontally',
    );
  });

  it('measures every prepared road and sea lane from the rendered local geometry', () => {
    const measurements = validateFictionalAtlas(FICTIONAL_ATLAS);

    expect(FICTIONAL_ATLAS.visualTerritories).toHaveLength(70);
    expect(
      FICTIONAL_ATLAS.visualTerritories.every((territory) =>
        territory.resourceProfile.every((profile) => profile.origin.length > 0),
      ),
    ).toBe(true);
    expect(measurements).toHaveLength(FICTIONAL_ATLAS.routes.length);
    expect(measurements.every((route) => route.distanceKm > 0)).toBe(true);
    expect(
      measurements.find((route) => route.routeId === 'western-ridge-road'),
    ).toMatchObject({ mode: 'LAND', distanceKm: expect.any(Number) });
    expect(
      measurements.find((route) => route.routeId === 'tidegate-sea-lane'),
    ).toMatchObject({ mode: 'SEA', distanceKm: expect.any(Number) });

    const westernRidge = measurements.find(
      (route) => route.routeId === 'western-ridge-road',
    );
    expect(westernRidge?.distanceKm).toBeCloseTo(
      Math.hypot(1_200, -400) + Math.hypot(1_200, 200),
    );
    expect(formatDistanceKm(westernRidge!.distanceKm)).toMatch(
      /^2,?[^.]+ km$/u,
    );
  });

  it('requires each named narrow passage to be part of its sea-route geometry', () => {
    const invalid: FictionalAtlas = {
      ...FICTIONAL_ATLAS,
      routes: FICTIONAL_ATLAS.routes.map((route) =>
        route.id === 'tidegate-sea-lane'
          ? {
              ...route,
              path: [
                route.path[0]!,
                { xKm: 27_000, yKm: 7_900 },
                route.path.at(-1)!,
              ],
            }
          : route,
      ),
    };

    expect(() => validateFictionalAtlas(invalid)).toThrow(
      'does not traverse strait tidegate-strait',
    );
  });

  it('rejects a sea lane that enters fictional land', () => {
    const invalid: FictionalAtlas = {
      ...FICTIONAL_ATLAS,
      routes: FICTIONAL_ATLAS.routes.map((route) =>
        route.id === 'tidegate-sea-lane'
          ? {
              ...route,
              requiredPassageFeatureIds: [],
              path: [
                route.path[0]!,
                { xKm: 24_000, yKm: 5_000 },
                route.path.at(-1)!,
              ],
            }
          : route,
      ),
    };

    expect(() => validateFictionalAtlas(invalid)).toThrow(
      'Sea route tidegate-sea-lane crosses fictional land',
    );
  });

  it('refuses future economic seed values in this preparation fixture', () => {
    const invalid: FictionalAtlas = {
      ...FICTIONAL_ATLAS,
      cities: FICTIONAL_ATLAS.cities.map((city) =>
        city.id === 'caldria-city'
          ? { ...city, population: 1_000_000 as never }
          : city,
      ),
    };

    expect(() => validateFictionalAtlas(invalid)).toThrow(
      'Map preparation cannot set a city population',
    );
  });

  it('requires each mapped resource label to retain a plausible physical origin', () => {
    const invalid: FictionalAtlas = {
      ...FICTIONAL_ATLAS,
      features: FICTIONAL_ATLAS.features.map((feature) =>
        feature.id === 'caldria-hill-country'
          ? {
              ...feature,
              resourceTags: [
                {
                  kind: 'IRON_ORE',
                  label: 'incorrect sediment claim',
                  origin: 'SEDIMENTARY_BASIN',
                },
              ],
            }
          : feature,
      ),
    };

    expect(() => validateFictionalAtlas(invalid)).toThrow(
      'Resource IRON_ORE has an invalid origin SEDIMENTARY_BASIN',
    );
  });

  it('requires exactly 70 visual territories with a capital inside each territory', () => {
    const wrongCount: FictionalAtlas = {
      ...FICTIONAL_ATLAS,
      visualTerritories: FICTIONAL_ATLAS.visualTerritories.slice(1),
    };
    expect(() => validateFictionalAtlas(wrongCount)).toThrow(
      'exactly 70 display territories',
    );

    const displacedCapital: FictionalAtlas = {
      ...FICTIONAL_ATLAS,
      visualTerritories: FICTIONAL_ATLAS.visualTerritories.map((territory) =>
        territory.id === 'visual-territory-01'
          ? { ...territory, capital: { xKm: 35_000, yKm: 17_000 } }
          : territory,
      ),
    };
    expect(() => validateFictionalAtlas(displacedCapital)).toThrow(
      'Visual territory visual-territory-01 capital must remain in territory',
    );
  });

  it('limits visual sea envelopes to one-or-two-island display groups', () => {
    const islandGroups = FICTIONAL_ATLAS.visualTerritories.filter(
      (territory) => territory.boundaryForm === 'ISLAND_GROUP',
    );
    expect(islandGroups).toHaveLength(14);
    expect(
      islandGroups.every(
        (territory) =>
          territory.maritimeEnvelope !== undefined &&
          (territory.displayIslandCount === 1 ||
            territory.displayIslandCount === 2),
      ),
    ).toBe(true);

    const missingEnvelope: FictionalAtlas = {
      ...FICTIONAL_ATLAS,
      visualTerritories: FICTIONAL_ATLAS.visualTerritories.map((territory) =>
        territory.id === 'visual-territory-43'
          ? { ...territory, maritimeEnvelope: undefined }
          : territory,
      ),
    };
    expect(() => validateFictionalAtlas(missingEnvelope)).toThrow(
      'needs a one-or-two-island sea envelope',
    );
  });

  it('requires every mainland display boundary to name a local coastline mask', () => {
    const mainlandBoundaries = FICTIONAL_ATLAS.visualTerritories.filter(
      (territory) => territory.boundaryForm !== 'ISLAND_GROUP',
    );
    expect(
      mainlandBoundaries.every(
        (territory) => territory.landBoundaryRegion !== undefined,
      ),
    ).toBe(true);

    const missingMask: FictionalAtlas = {
      ...FICTIONAL_ATLAS,
      visualTerritories: FICTIONAL_ATLAS.visualTerritories.map((territory) =>
        territory.id === 'visual-territory-01'
          ? { ...territory, landBoundaryRegion: undefined }
          : territory,
      ),
    };
    expect(() => validateFictionalAtlas(missingMask)).toThrow(
      'needs a coastline boundary mask',
    );
  });

  it('keeps large display grainland inland rather than giving it a prepared port', () => {
    const invalid: FictionalAtlas = {
      ...FICTIONAL_ATLAS,
      nodes: [
        ...FICTIONAL_ATLAS.nodes,
        {
          id: 'maveth-prohibited-port',
          polityId: 'maveth',
          name: 'Maveth Prohibited Port',
          kind: 'SEA_PORT',
          point: { xKm: 17_100, yKm: 7_300 },
        },
      ],
    };

    expect(() => validateFictionalAtlas(invalid)).toThrow(
      'Large grainland polity maveth must have limited coast access',
    );
  });

  it('checks tectonic placement and keeps inland lakes local in scale', () => {
    const invalidSatellite: FictionalAtlas = {
      ...FICTIONAL_ATLAS,
      tectonicGroups: FICTIONAL_ATLAS.tectonicGroups.map((group) =>
        group.id === 'western-plate'
          ? { ...group, southeastSatelliteIslandId: 'northern-shards' }
          : group,
      ),
    };
    expect(() => validateFictionalAtlas(invalidSatellite)).toThrow(
      'needs a satellite island',
    );

    const invalidLake: FictionalAtlas = {
      ...FICTIONAL_ATLAS,
      features: FICTIONAL_ATLAS.features.map((feature) =>
        feature.id === 'ossara-small-lake'
          ? {
              ...feature,
              geometry: [
                { xKm: 15_000, yKm: 5_000 },
                { xKm: 17_000, yKm: 5_000 },
                { xKm: 17_000, yKm: 7_000 },
                { xKm: 15_000, yKm: 7_000 },
              ],
            }
          : feature,
      ),
    };
    expect(() => validateFictionalAtlas(invalidLake)).toThrow(
      'Ossara Mirror Lake exceeds the local-lake limit',
    );
  });
});
