import {
  FICTIONAL_ATLAS_CRS,
  UNASSIGNED_BY_V27,
  type AtlasPoint,
  type FictionalAtlas,
} from './types.js';

const point = (xKm: number, yKm: number): AtlasPoint => ({ xKm, yKm });

const shape = (...coordinates: ReadonlyArray<readonly [number, number]>) =>
  coordinates.map(([xKm, yKm]) => point(xKm, yKm));

/**
 * These labels and capitals are map drawings only. They deliberately have no
 * World identity, population, state capacity, resource quantity or GDP.
 * V27 must independently accept, reject or map them before any country seed.
 */
const visualTerritoryNames = [
  'Avenor',
  'Brelis',
  'Caedon',
  'Darsin',
  'Ellovar',
  'Faren',
  'Galdra',
  'Hethen',
  'Istrel',
  'Jorun',
  'Keldan',
  'Lumer',
  'Meros',
  'Nadrin',
  'Orelis',
  'Paryn',
  'Quoran',
  'Rassel',
  'Siven',
  'Talan',
  'Uvren',
  'Vardis',
  'Wexar',
  'Xandor',
  'Ysol',
  'Zarev',
  'Adara',
  'Belm',
  'Corven',
  'Delyra',
  'Erdan',
  'Falcor',
  'Gysel',
  'Harin',
  'Inovar',
  'Jessa',
  'Koryn',
  'Lydan',
  'Mirea',
  'Norvak',
  'Ostra',
  'Pavan',
  'Qemra',
  'Ruvan',
  'Selka',
  'Tirren',
  'Ulyss',
  'Varos',
  'Wrenna',
  'Xyren',
  'Yara',
  'Zorin',
  'Alera',
  'Brin',
  'Cassa',
  'Doren',
  'Everen',
  'Fenna',
  'Garan',
  'Hylos',
  'Ivara',
  'Jalen',
  'Korra',
  'Lethis',
  'Marn',
  'Nivor',
  'Orsa',
  'Pella',
  'Quillan',
  'Rhea',
] as const;

const visualTerritoryCentres = [
  // The groups follow four unequal plate-derived landforms, not a grid.
  [20_000, 2_200],
  [22_000, 1_900],
  [24_000, 1_900],
  [26_000, 1_600],
  [28_000, 1_800],
  [30_000, 2_200],
  [20_500, 3_500],
  [22_500, 3_300],
  [24_500, 3_600],
  [26_500, 3_500],
  [28_500, 3_900],
  [30_500, 4_200],
  [21_500, 5_000],
  [24_500, 5_000],
  [26_000, 5_200],
  [28_000, 5_200],
  [30_000, 5_500],
  [22_000, 6_200],
  [24_000, 6_200],
  [26_000, 6_500],
  [28_000, 6_500],
  [30_000, 6_800],
  [23_500, 7_600],
  [25_500, 7_800],
  [27_500, 7_800],
  [29_500, 8_000],
  [25_000, 9_000],
  [27_500, 9_000],
  [28_500, 9_500],
  [30_500, 9_300],
  [32_500, 9_000],
  [33_500, 10_000],
  [28_000, 10_800],
  [30_000, 10_600],
  [32_000, 10_800],
  [33_500, 11_200],
  [29_000, 12_000],
  [31_000, 12_000],
  [33_000, 12_500],
  [30_000, 13_500],
  [32_000, 13_800],
  [27_000, 11_500],
  [3_000, 7_200],
  [5_000, 7_500],
  [7_000, 7_200],
  [9_000, 7_500],
  [11_000, 7_200],
  [4_000, 5_500],
  [6_000, 5_800],
  [8_000, 5_600],
  [10_000, 5_900],
  [12_000, 6_100],
  [4_500, 4_200],
  [6_500, 4_500],
  [8_500, 4_400],
  [10_500, 4_700],
  [2_500, 15_000],
  [5_000, 14_800],
  [7_500, 14_500],
  [10_000, 14_200],
  [3_000, 13_000],
  [5_500, 12_800],
  [8_000, 13_000],
  [10_500, 12_700],
  [4_500, 11_500],
  [7_000, 11_200],
  [13_000, 8_500],
  [15_000, 8_200],
  [17_000, 7_600],
  [19_000, 7_000],
] as const;

const visualTerritoryPalette = [
  '#d29b72',
  '#e2c96f',
  '#78aa8a',
  '#84a6b6',
  '#bd8d9e',
  '#a58bc1',
  '#9ebf72',
] as const;

function visualTerritoryResourceProfile(index: number) {
  const territoryGroup = Math.floor(index / 14);
  const groupIndex = index % 14;
  if (territoryGroup === 0) {
    if (groupIndex < 4) {
      return [
        {
          kind: 'IRON_ORE',
          label: 'northern collision belt',
          origin: 'COLLISION_OROGENY',
        },
        { kind: 'COPPER', label: 'mountain fold', origin: 'COLLISION_OROGENY' },
      ] as const;
    }
    return [
      {
        kind: 'GRAIN',
        label: 'convergent river plain',
        origin: 'ALLUVIAL_PLAIN',
      },
    ] as const;
  }
  if (territoryGroup === 1) {
    if (groupIndex < 4) {
      return [
        {
          kind: 'NATURAL_GAS',
          label: 'endorheic sedimentary basin',
          origin: 'SEDIMENTARY_BASIN',
        },
      ] as const;
    }
    if (groupIndex < 8) {
      return [
        {
          kind: 'LITHIUM',
          label: 'salt-basin margin',
          origin: 'EVAPORITIC_BASIN',
        },
      ] as const;
    }
    if (groupIndex < 10) {
      return [
        {
          kind: 'URANIUM',
          label: 'cratonic shield',
          origin: 'CRATONIC_SHIELD',
        },
      ] as const;
    }
    return [] as const;
  }
  if (territoryGroup === 2) {
    if (groupIndex < 7) {
      return [
        {
          kind: 'COPPER',
          label: 'continental-margin fold',
          origin: 'COLLISION_OROGENY',
        },
      ] as const;
    }
    return [] as const;
  }
  if (territoryGroup === 3) {
    if (groupIndex < 3) {
      return [
        {
          kind: 'COPPER',
          label: 'island-arc uplift',
          origin: 'COLLISION_OROGENY',
        },
      ] as const;
    }
    return [] as const;
  }
  if (groupIndex < 7) {
    return [
      {
        kind: 'GRAIN',
        label: 'temperate alluvial lowland',
        origin: 'ALLUVIAL_PLAIN',
      },
    ] as const;
  }
  return [
    {
      kind: 'IRON_ORE',
      label: 'southern shield outcrop',
      origin: 'CRATONIC_SHIELD',
    },
  ] as const;
}

function visualTerritoryPolygon(xKm: number, yKm: number, index: number) {
  const horizontalRadius = 760 + (index % 4) * 65;
  const verticalRadius = 560 + (index % 3) * 75;
  return shape(
    [xKm - horizontalRadius, yKm - verticalRadius * 0.24],
    [xKm - horizontalRadius * 0.62, yKm - verticalRadius],
    [xKm + horizontalRadius * 0.16, yKm - verticalRadius * 0.86],
    [xKm + horizontalRadius * 0.88, yKm - verticalRadius * 0.42],
    [xKm + horizontalRadius, yKm + verticalRadius * 0.3],
    [xKm + horizontalRadius * 0.28, yKm + verticalRadius],
    [xKm - horizontalRadius * 0.48, yKm + verticalRadius * 0.7],
    [xKm - horizontalRadius * 0.84, yKm + verticalRadius * 0.2],
  );
}

function visualTerritoryBoundaryForm(index: number) {
  if (index >= 42 && index < 56) return 'ISLAND_GROUP' as const;
  return index % 4 === 0 ? ('COASTAL' as const) : ('INLAND' as const);
}

function visualTerritoryLandBoundaryRegion(index: number) {
  if (index < 28) return 'SOUTHERN_CORE' as const;
  if (index < 42) return 'RIFTED_FRAGMENT' as const;
  if (index >= 42 && index < 56) return undefined;
  if (index < 66) return 'NORTHERN_CORE' as const;
  return 'CENTRAL_SHELF' as const;
}

function visualTerritoryMaritimeEnvelope(
  xKm: number,
  yKm: number,
  index: number,
) {
  const horizontalRadius = 1_450 + (index % 3) * 110;
  const verticalRadius = 980 + (index % 2) * 135;
  return shape(
    [xKm - horizontalRadius, yKm - verticalRadius * 0.25],
    [xKm - horizontalRadius * 0.56, yKm - verticalRadius],
    [xKm + horizontalRadius * 0.3, yKm - verticalRadius * 0.8],
    [xKm + horizontalRadius, yKm - verticalRadius * 0.16],
    [xKm + horizontalRadius * 0.64, yKm + verticalRadius * 0.72],
    [xKm - horizontalRadius * 0.22, yKm + verticalRadius],
    [xKm - horizontalRadius * 0.84, yKm + verticalRadius * 0.44],
  );
}

const visualTerritories = visualTerritoryNames.map((name, index) => {
  const [xKm, yKm] = visualTerritoryCentres[index]!;
  const boundaryForm = visualTerritoryBoundaryForm(index);
  const landBoundaryRegion = visualTerritoryLandBoundaryRegion(index);
  return {
    id: `visual-territory-${String(index + 1).padStart(2, '0')}`,
    name,
    boundaryForm,
    capital: point(xKm, yKm),
    color: visualTerritoryPalette[index % visualTerritoryPalette.length]!,
    polygon: visualTerritoryPolygon(xKm, yKm, index),
    ...(landBoundaryRegion ? { landBoundaryRegion } : {}),
    ...(boundaryForm === 'ISLAND_GROUP'
      ? {
          maritimeEnvelope: visualTerritoryMaritimeEnvelope(xKm, yKm, index),
          displayIslandCount: ((index % 2) + 1) as 1 | 2,
        }
      : {}),
    resourceProfile: visualTerritoryResourceProfile(index),
  };
});

if (visualTerritories.length !== 70) {
  throw new Error('The visual map contract requires exactly 70 territories');
}

/**
 * A new, static atlas for rendering and route-measurement experiments only.
 * It intentionally contains no Earth coordinates, real borders, World IDs,
 * quantities or economic state. V27 remains responsible for any future
 * country initialisation.
 */
export const FICTIONAL_ATLAS: FictionalAtlas = {
  crs: FICTIONAL_ATLAS_CRS,
  widthKm: 36_000,
  heightKm: 18_000,
  wrapsHorizontally: true,
  landmasses: [
    {
      id: 'western-arc',
      name: 'Western Arc',
      category: 'CONTINENT',
      polygon: shape(
        [2_600, 3_100],
        [5_200, 2_400],
        [8_700, 2_800],
        [11_100, 4_400],
        [10_500, 7_000],
        [9_200, 8_600],
        [5_500, 9_100],
        [3_000, 7_800],
        [2_000, 5_600],
      ),
    },
    {
      id: 'uruq-highlands',
      name: 'Uruq Mosaic',
      category: 'CONTINENT',
      polygon: shape(
        [13_000, 2_500],
        [16_500, 2_000],
        [19_000, 3_500],
        [18_800, 6_500],
        [17_100, 7_800],
        [14_000, 7_300],
        [12_500, 5_900],
      ),
    },
    {
      id: 'tessera-isles',
      name: 'Tessera Isles',
      category: 'CONTINENT',
      polygon: shape(
        [21_500, 3_500],
        [24_000, 2_900],
        [26_200, 4_100],
        [26_000, 6_900],
        [24_600, 8_200],
        [22_500, 7_800],
        [21_000, 6_100],
      ),
    },
    {
      id: 'eastern-wedge',
      name: 'Eastern Wedge',
      category: 'CONTINENT',
      polygon: shape(
        [28_100, 3_700],
        [31_000, 3_000],
        [33_700, 4_800],
        [32_900, 8_200],
        [30_500, 9_700],
        [28_000, 8_500],
        [27_000, 6_000],
      ),
    },
    {
      id: 'southern-crescent',
      name: 'Southern Crescent',
      category: 'CONTINENT',
      polygon: shape(
        [10_600, 11_800],
        [13_800, 10_500],
        [17_400, 11_200],
        [19_200, 13_300],
        [17_600, 15_300],
        [13_700, 15_800],
        [11_100, 14_500],
        [9_800, 13_000],
      ),
    },
    {
      id: 'pelagic-bastion',
      name: 'Pelagic Bastion',
      category: 'CONTINENT',
      polygon: shape(
        [18_500, 9_200],
        [21_500, 8_500],
        [24_500, 9_800],
        [25_100, 11_500],
        [23_800, 12_500],
        [20_700, 12_300],
        [18_500, 11_000],
      ),
    },
    {
      id: 'western-drift-island',
      name: 'Western Drift Island',
      category: 'ISLAND',
      polygon: shape(
        [11_300, 9_200],
        [12_500, 8_800],
        [13_200, 9_800],
        [12_600, 10_800],
        [11_400, 10_500],
      ),
    },
    {
      id: 'uruq-drift-island',
      name: 'Uruq Drift Island',
      category: 'ISLAND',
      polygon: shape(
        [19_300, 7_900],
        [20_400, 7_500],
        [21_100, 8_500],
        [20_400, 9_300],
        [19_300, 8_900],
      ),
    },
    {
      id: 'tessera-drift-island',
      name: 'Tessera Drift Island',
      category: 'ISLAND',
      polygon: shape(
        [26_500, 9_100],
        [27_700, 8_800],
        [28_300, 9_800],
        [27_600, 10_800],
        [26_400, 10_300],
      ),
    },
    {
      id: 'eastern-drift-island',
      name: 'Eastern Drift Island',
      category: 'ISLAND',
      polygon: shape(
        [33_700, 9_900],
        [34_800, 9_500],
        [35_400, 10_500],
        [34_800, 11_400],
        [33_600, 10_900],
      ),
    },
    {
      id: 'southern-drift-island',
      name: 'Southern Drift Island',
      category: 'ISLAND',
      polygon: shape(
        [19_400, 15_900],
        [20_600, 15_500],
        [21_200, 16_500],
        [20_500, 17_400],
        [19_300, 16_900],
      ),
    },
    {
      id: 'bastion-drift-island',
      name: 'Bastion Drift Island',
      category: 'ISLAND',
      polygon: shape(
        [25_600, 12_600],
        [26_800, 12_300],
        [27_300, 13_300],
        [26_700, 14_100],
        [25_500, 13_700],
      ),
    },
    {
      id: 'northern-shards',
      name: 'Northern Shards',
      category: 'ARCHIPELAGO_FRAGMENT',
      polygon: shape(
        [9_200, 1_800],
        [10_300, 1_550],
        [11_000, 2_300],
        [10_300, 2_900],
        [9_200, 2_600],
      ),
    },
    {
      id: 'sunward-atoll',
      name: 'Sunward Atoll',
      category: 'ARCHIPELAGO_FRAGMENT',
      polygon: shape(
        [21_300, 9_600],
        [22_300, 9_100],
        [23_100, 9_800],
        [22_800, 10_800],
        [21_600, 10_700],
      ),
    },
    {
      id: 'sunward-reef',
      name: 'Sunward Reef',
      category: 'ARCHIPELAGO_FRAGMENT',
      polygon: shape(
        [23_600, 10_100],
        [24_000, 9_900],
        [24_300, 10_300],
        [23_900, 10_600],
      ),
    },
  ],
  tectonicGroups: [
    {
      id: 'western-plate',
      continentalLandmassId: 'western-arc',
      southeastSatelliteIslandId: 'western-drift-island',
      archipelagoLandmassIds: ['northern-shards'],
    },
    {
      id: 'uruq-plate',
      continentalLandmassId: 'uruq-highlands',
      southeastSatelliteIslandId: 'uruq-drift-island',
      archipelagoLandmassIds: [],
    },
    {
      id: 'tessera-plate',
      continentalLandmassId: 'tessera-isles',
      southeastSatelliteIslandId: 'tessera-drift-island',
      archipelagoLandmassIds: ['sunward-atoll', 'sunward-reef'],
    },
    {
      id: 'eastern-plate',
      continentalLandmassId: 'eastern-wedge',
      southeastSatelliteIslandId: 'eastern-drift-island',
      archipelagoLandmassIds: [],
    },
    {
      id: 'southern-plate',
      continentalLandmassId: 'southern-crescent',
      southeastSatelliteIslandId: 'southern-drift-island',
      archipelagoLandmassIds: [],
    },
    {
      id: 'bastion-plate',
      continentalLandmassId: 'pelagic-bastion',
      southeastSatelliteIslandId: 'bastion-drift-island',
      archipelagoLandmassIds: [],
    },
  ],
  polities: [
    {
      id: 'caldria',
      name: 'Caldria',
      color: '#6e9a85',
      polygon: shape(
        [2_700, 3_300],
        [5_200, 2_650],
        [6_000, 4_200],
        [4_600, 5_400],
        [2_200, 5_300],
      ),
    },
    {
      id: 'nerith',
      name: 'Nerith',
      color: '#b3a46c',
      polygon: shape(
        [5_200, 2_650],
        [8_600, 2_950],
        [9_000, 4_800],
        [6_000, 4_200],
      ),
    },
    {
      id: 'veyra',
      name: 'Veyra',
      color: '#9b778c',
      polygon: shape(
        [6_000, 4_200],
        [9_000, 4_800],
        [10_300, 6_700],
        [8_700, 8_200],
        [5_100, 7_000],
      ),
    },
    {
      id: 'tarrin',
      name: 'Tarrin',
      color: '#8773a1',
      polygon: shape(
        [13_100, 2_700],
        [15_500, 2_250],
        [16_100, 4_700],
        [13_100, 5_800],
        [12_600, 4_200],
      ),
    },
    {
      id: 'ossara',
      name: 'Ossara',
      color: '#b38b65',
      polygon: shape(
        [15_500, 2_250],
        [18_600, 3_700],
        [17_700, 5_400],
        [16_100, 4_700],
      ),
    },
    {
      id: 'maveth',
      name: 'Maveth',
      color: '#718d73',
      polygon: shape(
        [13_100, 5_800],
        [16_100, 4_700],
        [17_700, 5_400],
        [17_000, 7_500],
        [14_100, 7_100],
      ),
    },
    {
      id: 'ilyra',
      name: 'Ilyra',
      color: '#a87578',
      polygon: shape(
        [21_600, 3_650],
        [23_700, 3_000],
        [24_100, 5_400],
        [22_200, 6_400],
        [21_100, 5_800],
      ),
    },
    {
      id: 'pelen',
      name: 'Pelen',
      color: '#8299b8',
      polygon: shape(
        [23_700, 3_000],
        [25_900, 4_200],
        [25_400, 5_900],
        [24_100, 5_400],
      ),
    },
    {
      id: 'soryn',
      name: 'Soryn',
      color: '#a88f59',
      polygon: shape(
        [22_200, 6_400],
        [24_100, 5_400],
        [25_400, 5_900],
        [24_500, 7_900],
        [22_600, 7_600],
      ),
    },
    {
      id: 'kantara',
      name: 'Kantara',
      color: '#90815b',
      polygon: shape(
        [28_200, 3_900],
        [30_600, 3_250],
        [30_700, 5_700],
        [28_000, 6_200],
        [27_100, 5_900],
      ),
    },
    {
      id: 'rhevar',
      name: 'Rhevar',
      color: '#6d8f89',
      polygon: shape(
        [30_600, 3_250],
        [33_400, 4_950],
        [32_000, 6_200],
        [30_700, 5_700],
      ),
    },
    {
      id: 'dovari',
      name: 'Dovari',
      color: '#9d6d55',
      polygon: shape(
        [30_700, 5_700],
        [32_000, 6_200],
        [32_600, 8_000],
        [30_400, 9_300],
        [29_000, 7_800],
      ),
    },
    {
      id: 'althara',
      name: 'Althara',
      color: '#806f9e',
      polygon: shape(
        [28_000, 6_200],
        [30_700, 5_700],
        [29_000, 7_800],
        [30_400, 9_300],
        [28_100, 8_400],
      ),
    },
    {
      id: 'lioran',
      name: 'Lioran',
      color: '#b08869',
      polygon: shape(
        [10_700, 12_000],
        [13_700, 10_700],
        [14_100, 12_700],
        [12_500, 14_500],
        [10_000, 13_000],
      ),
    },
    {
      id: 'myrren',
      name: 'Myrren',
      color: '#7d9b7a',
      polygon: shape(
        [13_700, 10_700],
        [17_100, 11_400],
        [16_200, 13_300],
        [14_100, 12_700],
      ),
    },
    {
      id: 'sablec',
      name: 'Sablec',
      color: '#8c7592',
      polygon: shape(
        [14_100, 12_700],
        [16_200, 13_300],
        [18_800, 13_500],
        [17_500, 15_100],
        [13_800, 15_600],
        [12_500, 14_500],
      ),
    },
  ],
  visualTerritories,
  cities: [
    {
      id: 'caldria-city',
      polityId: 'caldria',
      name: 'Caldria',
      point: point(4_300, 4_700),
      population: UNASSIGNED_BY_V27,
    },
    {
      id: 'nerith-city',
      polityId: 'nerith',
      name: 'Nerith',
      point: point(6_700, 4_500),
      population: UNASSIGNED_BY_V27,
    },
    {
      id: 'veyra-city',
      polityId: 'veyra',
      name: 'Veyra',
      point: point(8_900, 6_000),
      population: UNASSIGNED_BY_V27,
    },
    {
      id: 'tarrin-city',
      polityId: 'tarrin',
      name: 'Tarrin',
      point: point(14_500, 3_900),
      population: UNASSIGNED_BY_V27,
    },
    {
      id: 'ossara-city',
      polityId: 'ossara',
      name: 'Ossara',
      point: point(16_000, 4_600),
      population: UNASSIGNED_BY_V27,
    },
    {
      id: 'maveth-city',
      polityId: 'maveth',
      name: 'Maveth',
      point: point(17_500, 6_100),
      population: UNASSIGNED_BY_V27,
    },
    {
      id: 'ilyra-city',
      polityId: 'ilyra',
      name: 'Ilyra',
      point: point(22_200, 5_200),
      population: UNASSIGNED_BY_V27,
    },
    {
      id: 'pelen-city',
      polityId: 'pelen',
      name: 'Pelen',
      point: point(24_000, 5_000),
      population: UNASSIGNED_BY_V27,
    },
    {
      id: 'soryn-city',
      polityId: 'soryn',
      name: 'Soryn',
      point: point(25_100, 6_500),
      population: UNASSIGNED_BY_V27,
    },
    {
      id: 'kantara-city',
      polityId: 'kantara',
      name: 'Kantara',
      point: point(28_500, 5_400),
      population: UNASSIGNED_BY_V27,
    },
    {
      id: 'rhevar-city',
      polityId: 'rhevar',
      name: 'Rhevar',
      point: point(30_700, 5_000),
      population: UNASSIGNED_BY_V27,
    },
    {
      id: 'dovari-city',
      polityId: 'dovari',
      name: 'Dovari',
      point: point(31_700, 7_000),
      population: UNASSIGNED_BY_V27,
    },
    {
      id: 'althara-city',
      polityId: 'althara',
      name: 'Althara',
      point: point(30_000, 8_300),
      population: UNASSIGNED_BY_V27,
    },
    {
      id: 'lioran-city',
      polityId: 'lioran',
      name: 'Lioran',
      point: point(12_000, 12_800),
      population: UNASSIGNED_BY_V27,
    },
    {
      id: 'myrren-city',
      polityId: 'myrren',
      name: 'Myrren',
      point: point(14_500, 12_700),
      population: UNASSIGNED_BY_V27,
    },
    {
      id: 'sablec-city',
      polityId: 'sablec',
      name: 'Sablec',
      point: point(16_500, 14_000),
      population: UNASSIGNED_BY_V27,
    },
  ],
  landUseAreas: [
    {
      id: 'maveth-grainlands',
      polityId: 'maveth',
      kind: 'AGRICULTURAL_AREA',
      name: 'Maveth Inland Grainlands',
      geometry: shape(
        [14_300, 5_600],
        [15_900, 5_250],
        [16_700, 6_400],
        [14_800, 6_900],
      ),
      resourceTags: [
        { kind: 'GRAIN', label: 'inland grainland', origin: 'ALLUVIAL_PLAIN' },
      ],
      economicValue: UNASSIGNED_BY_V27,
    },
    {
      id: 'nerith-ridges',
      polityId: 'nerith',
      kind: 'MINERAL_AREA',
      name: 'Nerith Ridge Minerals',
      geometry: shape(
        [6_300, 3_400],
        [8_300, 3_500],
        [8_700, 4_400],
        [6_600, 4_250],
      ),
      resourceTags: [
        {
          kind: 'IRON_ORE',
          label: 'ferrous ridge',
          origin: 'COLLISION_OROGENY',
        },
        { kind: 'COPPER', label: 'copper fold', origin: 'COLLISION_OROGENY' },
      ],
      economicValue: UNASSIGNED_BY_V27,
    },
    {
      id: 'ossara-substrates',
      polityId: 'ossara',
      kind: 'MINERAL_AREA',
      name: 'Ossara Deep Substrates',
      geometry: shape(
        [15_800, 4_550],
        [17_400, 4_450],
        [17_500, 5_350],
        [16_100, 5_600],
      ),
      resourceTags: [
        { kind: 'NATURAL_GAS', label: 'deep gas', origin: 'SEDIMENTARY_BASIN' },
        { kind: 'LITHIUM', label: 'salt rock', origin: 'EVAPORITIC_BASIN' },
      ],
      economicValue: UNASSIGNED_BY_V27,
    },
    {
      id: 'dovari-copperbelt',
      polityId: 'dovari',
      kind: 'MINERAL_AREA',
      name: 'Dovari Copperbelt',
      geometry: shape(
        [30_900, 6_000],
        [32_000, 6_300],
        [32_200, 7_500],
        [31_200, 7_200],
      ),
      resourceTags: [
        {
          kind: 'COPPER',
          label: 'mountain copperbelt',
          origin: 'COLLISION_OROGENY',
        },
      ],
      economicValue: UNASSIGNED_BY_V27,
    },
  ],
  latitudeBands: [
    {
      id: 'north-cold',
      name: 'Northern cold belt',
      northEdgeKm: 0,
      southEdgeKm: 3_000,
      thermalClass: 'COLD',
    },
    {
      id: 'north-cool',
      name: 'Northern cool belt',
      northEdgeKm: 3_000,
      southEdgeKm: 6_000,
      thermalClass: 'COOL',
    },
    {
      id: 'central-temperate',
      name: 'Central temperate belt',
      northEdgeKm: 6_000,
      southEdgeKm: 10_000,
      thermalClass: 'TEMPERATE',
    },
    {
      id: 'southern-warm',
      name: 'Southern warm belt',
      northEdgeKm: 10_000,
      southEdgeKm: 14_000,
      thermalClass: 'WARM',
    },
    {
      id: 'south-cool',
      name: 'Southern cool belt',
      northEdgeKm: 14_000,
      southEdgeKm: 18_000,
      thermalClass: 'COOL',
    },
  ],
  oceanCurrents: [
    {
      id: 'azure-undercurrent',
      name: 'Azure Undercurrent',
      geometry: shape(
        [1_400, 10_700],
        [7_000, 11_600],
        [12_000, 10_500],
        [17_000, 9_600],
      ),
      waterLayer: 'SUBSURFACE',
      thermalClass: 'WARM',
    },
    {
      id: 'tidegate-undercurrent',
      name: 'Tidegate Undercurrent',
      geometry: shape(
        [35_000, 12_000],
        [30_500, 11_300],
        [27_000, 10_900],
        [25_300, 12_800],
      ),
      waterLayer: 'SUBSURFACE',
      thermalClass: 'WARM',
    },
  ],
  features: [
    {
      id: 'rimefire-divide',
      kind: 'MOUNTAIN_RANGE',
      name: 'Rimefire Divide',
      geometry: shape([4_300, 3_600], [6_200, 3_400], [8_500, 4_900]),
      collisionPlateIds: ['western-plate', 'uruq-plate'],
      resourceTags: [
        {
          kind: 'IRON_ORE',
          label: 'ferrous ridges',
          origin: 'COLLISION_OROGENY',
        },
        { kind: 'COPPER', label: 'copper folds', origin: 'COLLISION_OROGENY' },
      ],
    },
    {
      id: 'sablewall-range',
      kind: 'MOUNTAIN_RANGE',
      name: 'Sablewall Range',
      geometry: shape([14_000, 3_000], [15_600, 3_700], [17_700, 5_700]),
      collisionPlateIds: ['uruq-plate', 'bastion-plate'],
      resourceTags: [
        { kind: 'URANIUM', label: 'shield seams', origin: 'CRATONIC_SHIELD' },
      ],
    },
    {
      id: 'dawnspine-range',
      kind: 'MOUNTAIN_RANGE',
      name: 'Dawnspine',
      geometry: shape([28_900, 4_300], [30_900, 5_100], [32_200, 7_400]),
      collisionPlateIds: ['tessera-plate', 'eastern-plate'],
      resourceTags: [
        {
          kind: 'COPPER',
          label: 'eastern cordillera',
          origin: 'COLLISION_OROGENY',
        },
      ],
    },
    {
      id: 'maveth-grain-basin',
      kind: 'BASIN',
      name: 'Maveth Inland Basin',
      geometry: shape(
        [14_300, 5_600],
        [15_900, 5_250],
        [16_700, 6_400],
        [14_800, 6_900],
      ),
      resourceTags: [
        {
          kind: 'GRAIN',
          label: 'alluvial grainland',
          origin: 'ALLUVIAL_PLAIN',
        },
      ],
    },
    {
      id: 'maveth-alluvial-plain',
      kind: 'PLAIN',
      name: 'Maveth Alluvial Plain',
      geometry: shape(
        [14_300, 5_600],
        [15_900, 5_250],
        [16_700, 6_400],
        [14_800, 6_900],
      ),
      resourceTags: [
        {
          kind: 'GRAIN',
          label: 'inland alluvial plain',
          origin: 'ALLUVIAL_PLAIN',
        },
      ],
    },
    {
      id: 'tarrin-wind-steppe',
      kind: 'STEPPE',
      name: 'Tarrin Wind Steppe',
      geometry: shape(
        [13_300, 3_100],
        [15_200, 2_700],
        [15_700, 3_650],
        [14_100, 4_100],
      ),
      resourceTags: [],
    },
    {
      id: 'caldria-hill-country',
      kind: 'HILL_COUNTRY',
      name: 'Caldria Hill Country',
      geometry: shape(
        [3_000, 4_000],
        [4_400, 3_300],
        [5_100, 4_100],
        [4_200, 5_000],
      ),
      resourceTags: [
        {
          kind: 'IRON_ORE',
          label: 'lowland iron seam',
          origin: 'CRATONIC_SHIELD',
        },
      ],
    },
    {
      id: 'ossara-deep-basin',
      kind: 'BASIN',
      name: 'Ossara Deep Basin',
      geometry: shape(
        [15_600, 4_700],
        [17_400, 4_500],
        [17_600, 6_200],
        [15_700, 6_500],
      ),
      resourceTags: [
        {
          kind: 'NATURAL_GAS',
          label: 'deep gas basin',
          origin: 'SEDIMENTARY_BASIN',
        },
        {
          kind: 'CRUDE_OIL',
          label: 'oil-bearing margin',
          origin: 'SEDIMENTARY_BASIN',
        },
      ],
    },
    {
      id: 'ossara-small-lake',
      kind: 'INLAND_LAKE',
      name: 'Ossara Mirror Lake',
      geometry: shape(
        [16_150, 5_650],
        [16_470, 5_610],
        [16_520, 5_780],
        [16_210, 5_830],
      ),
      resourceTags: [],
    },
    {
      id: 'southern-river',
      kind: 'RIVER',
      name: 'Morrow River',
      geometry: shape(
        [13_200, 11_000],
        [13_700, 12_300],
        [14_300, 13_800],
        [15_700, 15_200],
      ),
      resourceTags: [
        { kind: 'GRAIN', label: 'river plain', origin: 'ALLUVIAL_PLAIN' },
      ],
    },
    {
      id: 'morrow-delta',
      kind: 'DELTA',
      name: 'Morrow Delta',
      geometry: shape(
        [15_050, 14_650],
        [15_850, 14_900],
        [16_100, 15_350],
        [15_250, 15_250],
      ),
      resourceTags: [
        { kind: 'GRAIN', label: 'small delta plain', origin: 'ALLUVIAL_PLAIN' },
      ],
    },
    {
      id: 'eastern-river',
      kind: 'RIVER',
      name: 'Selu River',
      geometry: shape(
        [29_200, 4_300],
        [29_800, 5_900],
        [30_300, 7_300],
        [30_300, 9_200],
      ),
      resourceTags: [
        { kind: 'GRAIN', label: 'delta farmland', origin: 'ALLUVIAL_PLAIN' },
      ],
    },
    {
      id: 'tidegate-strait',
      kind: 'STRAIT',
      name: 'Tidegate Strait',
      geometry: shape([26_300, 6_900], [27_300, 7_300], [27_600, 7_800]),
      resourceTags: [],
    },
    {
      id: 'windglass-passage',
      kind: 'STRAIT',
      name: 'Windglass Passage',
      geometry: shape([18_000, 8_200], [20_500, 7_200], [20_800, 7_200]),
      resourceTags: [],
    },
    {
      id: 'bastion-south-gate',
      kind: 'STRAIT',
      name: 'Bastion South Gate',
      geometry: shape([25_300, 12_800], [24_000, 13_000], [22_600, 13_200]),
      resourceTags: [],
    },
    {
      id: 'crescent-narrows',
      kind: 'STRAIT',
      name: 'Crescent Narrows',
      geometry: shape([13_000, 14_900], [12_000, 13_500], [10_600, 11_800]),
      resourceTags: [],
    },
    {
      id: 'tessera-east-seismic-belt',
      kind: 'SEISMIC_BELT',
      name: 'Tessera–Eastern Seismic Belt',
      geometry: shape([26_400, 4_500], [26_800, 6_000], [27_300, 7_300]),
      collisionPlateIds: ['tessera-plate', 'eastern-plate'],
      resourceTags: [],
    },
    {
      id: 'bastion-shear-belt',
      kind: 'SEISMIC_BELT',
      name: 'Bastion Shear Belt',
      geometry: shape([18_500, 9_200], [21_500, 8_500], [24_500, 9_800]),
      collisionPlateIds: ['uruq-plate', 'bastion-plate'],
      resourceTags: [],
    },
  ],
  infrastructure: [
    {
      id: 'caldria-port',
      kind: 'PORT',
      name: 'Caldria Outer Port',
      polityIds: ['caldria'],
      geometry: shape([3_000, 7_800]),
    },
    {
      id: 'uruq-port',
      kind: 'PORT',
      name: 'Tarrin Steppe Port',
      polityIds: ['tarrin'],
      geometry: shape([12_500, 5_900]),
    },
    {
      id: 'tessera-west-port',
      kind: 'PORT',
      name: 'Ilyra Channel Port',
      polityIds: ['ilyra'],
      geometry: shape([21_000, 6_100]),
    },
    {
      id: 'tessera-east-port',
      kind: 'PORT',
      name: 'Pelen Outer Port',
      polityIds: ['pelen'],
      geometry: shape([26_000, 6_900]),
    },
    {
      id: 'eastern-port',
      kind: 'PORT',
      name: 'Althara Tide Port',
      polityIds: ['althara'],
      geometry: shape([28_000, 8_500]),
    },
    {
      id: 'southern-port',
      kind: 'PORT',
      name: 'Lioran Crescent Port',
      polityIds: ['lioran'],
      geometry: shape([10_600, 11_800]),
    },
    {
      id: 'western-ridge-rail',
      kind: 'RAIL_CORRIDOR',
      name: 'Ridge Rail Corridor',
      polityIds: ['caldria', 'nerith', 'veyra'],
      geometry: shape([4_300, 4_700], [6_700, 4_500], [8_900, 6_000]),
    },
    {
      id: 'uruq-pass',
      kind: 'MOUNTAIN_PASS',
      name: 'Sablewall Pass',
      polityIds: ['tarrin', 'ossara'],
      geometry: shape([15_200, 3_900]),
    },
    {
      id: 'tidegate-link',
      kind: 'BRIDGE_TUNNEL',
      name: 'Tidegate Link',
      polityIds: ['pelen', 'soryn'],
      geometry: shape([24_000, 5_000], [25_000, 6_300]),
    },
    {
      id: 'morrow-logistics',
      kind: 'LOGISTICS_HUB',
      name: 'Morrow Logistics Node',
      polityIds: ['myrren', 'sablec'],
      geometry: shape([14_500, 13_100]),
    },
    {
      id: 'ossara-trunkline',
      kind: 'PIPELINE',
      name: 'Ossara Trunkline',
      polityIds: ['ossara', 'maveth'],
      geometry: shape([16_100, 4_700], [16_700, 6_800]),
    },
    {
      id: 'dawnspine-energy',
      kind: 'ENERGY_COMPLEX',
      name: 'Dawnspine Energy Site',
      polityIds: ['rhevar', 'dovari'],
      geometry: shape([31_100, 6_200]),
    },
    {
      id: 'nerith-mine',
      kind: 'MINING_COMPLEX',
      name: 'Nerith Ridge Mine Marker',
      polityIds: ['nerith'],
      geometry: shape([7_300, 3_750]),
    },
    {
      id: 'maveth-farm',
      kind: 'FARM_COMPLEX',
      name: 'Maveth Inland Farm Marker',
      polityIds: ['maveth'],
      geometry: shape([15_450, 6_100]),
    },
    {
      id: 'ossara-refinery',
      kind: 'REFINERY',
      name: 'Ossara Refinery Marker',
      polityIds: ['ossara'],
      geometry: shape([16_350, 5_000]),
    },
    {
      id: 'pelen-factory',
      kind: 'FACTORY',
      name: 'Pelen Factory Marker',
      polityIds: ['pelen'],
      geometry: shape([24_550, 5_400]),
    },
  ],
  nodes: [
    {
      id: 'caldria-hub',
      polityId: 'caldria',
      name: 'Caldria Hub',
      kind: 'LAND_HUB',
      point: point(4_300, 4_700),
    },
    {
      id: 'nerith-hub',
      polityId: 'nerith',
      name: 'Nerith Hub',
      kind: 'LAND_HUB',
      point: point(6_700, 4_500),
    },
    {
      id: 'veyra-hub',
      polityId: 'veyra',
      name: 'Veyra Hub',
      kind: 'LAND_HUB',
      point: point(8_900, 6_000),
    },
    {
      id: 'caldria-port-node',
      polityId: 'caldria',
      name: 'Caldria Outer Port',
      kind: 'SEA_PORT',
      point: point(3_000, 7_800),
    },
    {
      id: 'tarrin-hub',
      polityId: 'tarrin',
      name: 'Tarrin Hub',
      kind: 'LAND_HUB',
      point: point(14_500, 3_900),
    },
    {
      id: 'ossara-hub',
      polityId: 'ossara',
      name: 'Ossara Hub',
      kind: 'LAND_HUB',
      point: point(16_000, 4_600),
    },
    {
      id: 'maveth-hub',
      polityId: 'maveth',
      name: 'Maveth Hub',
      kind: 'LAND_HUB',
      point: point(17_500, 6_100),
    },
    {
      id: 'tarrin-port-node',
      polityId: 'tarrin',
      name: 'Tarrin Steppe Port',
      kind: 'SEA_PORT',
      point: point(12_500, 5_900),
    },
    {
      id: 'ilyra-hub',
      polityId: 'ilyra',
      name: 'Ilyra Hub',
      kind: 'LAND_HUB',
      point: point(22_200, 5_200),
    },
    {
      id: 'pelen-hub',
      polityId: 'pelen',
      name: 'Pelen Hub',
      kind: 'LAND_HUB',
      point: point(24_000, 5_000),
    },
    {
      id: 'soryn-hub',
      polityId: 'soryn',
      name: 'Soryn Hub',
      kind: 'LAND_HUB',
      point: point(25_100, 6_500),
    },
    {
      id: 'ilyra-port-node',
      polityId: 'ilyra',
      name: 'Ilyra Channel Port',
      kind: 'SEA_PORT',
      point: point(21_000, 6_100),
    },
    {
      id: 'pelen-port-node',
      polityId: 'pelen',
      name: 'Pelen Outer Port',
      kind: 'SEA_PORT',
      point: point(26_000, 6_900),
    },
    {
      id: 'kantara-hub',
      polityId: 'kantara',
      name: 'Kantara Hub',
      kind: 'LAND_HUB',
      point: point(28_500, 5_400),
    },
    {
      id: 'rhevar-hub',
      polityId: 'rhevar',
      name: 'Rhevar Hub',
      kind: 'LAND_HUB',
      point: point(30_700, 5_000),
    },
    {
      id: 'dovari-hub',
      polityId: 'dovari',
      name: 'Dovari Hub',
      kind: 'LAND_HUB',
      point: point(31_700, 7_000),
    },
    {
      id: 'althara-hub',
      polityId: 'althara',
      name: 'Althara Hub',
      kind: 'LAND_HUB',
      point: point(30_000, 8_300),
    },
    {
      id: 'althara-port-node',
      polityId: 'althara',
      name: 'Althara Tide Port',
      kind: 'SEA_PORT',
      point: point(28_000, 8_500),
    },
    {
      id: 'lioran-hub',
      polityId: 'lioran',
      name: 'Lioran Hub',
      kind: 'LAND_HUB',
      point: point(12_000, 12_800),
    },
    {
      id: 'myrren-hub',
      polityId: 'myrren',
      name: 'Myrren Hub',
      kind: 'LAND_HUB',
      point: point(14_500, 12_700),
    },
    {
      id: 'sablec-hub',
      polityId: 'sablec',
      name: 'Sablec Hub',
      kind: 'LAND_HUB',
      point: point(16_500, 14_000),
    },
    {
      id: 'lioran-port-node',
      polityId: 'lioran',
      name: 'Lioran Crescent Port',
      kind: 'SEA_PORT',
      point: point(10_600, 11_800),
    },
  ],
  routes: [
    {
      id: 'western-ridge-road',
      fromNodeId: 'caldria-hub',
      toNodeId: 'nerith-hub',
      mode: 'LAND',
      path: shape([4_300, 4_700], [5_500, 4_300], [6_700, 4_500]),
    },
    {
      id: 'western-south-road',
      fromNodeId: 'nerith-hub',
      toNodeId: 'veyra-hub',
      mode: 'LAND',
      path: shape([6_700, 4_500], [8_200, 5_000], [8_900, 6_000]),
    },
    {
      id: 'caldria-port-road',
      fromNodeId: 'caldria-hub',
      toNodeId: 'caldria-port-node',
      mode: 'LAND',
      path: shape([4_300, 4_700], [3_700, 6_300], [3_000, 7_800]),
    },
    {
      id: 'uruq-high-road',
      fromNodeId: 'tarrin-hub',
      toNodeId: 'ossara-hub',
      mode: 'LAND',
      path: shape([14_500, 3_900], [15_200, 4_100], [16_000, 4_600]),
    },
    {
      id: 'uruq-basin-road',
      fromNodeId: 'ossara-hub',
      toNodeId: 'maveth-hub',
      mode: 'LAND',
      path: shape([16_000, 4_600], [16_800, 5_300], [17_500, 6_100]),
    },
    {
      id: 'tarrin-port-road',
      fromNodeId: 'tarrin-hub',
      toNodeId: 'tarrin-port-node',
      mode: 'LAND',
      path: shape([14_500, 3_900], [13_200, 4_900], [12_500, 5_900]),
    },
    {
      id: 'tessera-inner-road',
      fromNodeId: 'ilyra-hub',
      toNodeId: 'pelen-hub',
      mode: 'LAND',
      path: shape([22_200, 5_200], [23_100, 4_600], [24_000, 5_000]),
    },
    {
      id: 'tessera-south-road',
      fromNodeId: 'pelen-hub',
      toNodeId: 'soryn-hub',
      mode: 'LAND',
      path: shape([24_000, 5_000], [24_600, 5_700], [25_100, 6_500]),
    },
    {
      id: 'ilyra-port-road',
      fromNodeId: 'ilyra-hub',
      toNodeId: 'ilyra-port-node',
      mode: 'LAND',
      path: shape([22_200, 5_200], [21_500, 5_600], [21_000, 6_100]),
    },
    {
      id: 'pelen-port-road',
      fromNodeId: 'pelen-hub',
      toNodeId: 'pelen-port-node',
      mode: 'LAND',
      path: shape([24_000, 5_000], [25_400, 5_900], [26_000, 6_900]),
    },
    {
      id: 'eastern-crown-road',
      fromNodeId: 'kantara-hub',
      toNodeId: 'rhevar-hub',
      mode: 'LAND',
      path: shape([28_500, 5_400], [29_600, 4_800], [30_700, 5_000]),
    },
    {
      id: 'eastern-river-road',
      fromNodeId: 'rhevar-hub',
      toNodeId: 'dovari-hub',
      mode: 'LAND',
      path: shape([30_700, 5_000], [31_200, 6_000], [31_700, 7_000]),
    },
    {
      id: 'eastern-coast-road',
      fromNodeId: 'dovari-hub',
      toNodeId: 'althara-hub',
      mode: 'LAND',
      path: shape([31_700, 7_000], [30_900, 7_700], [30_000, 8_300]),
    },
    {
      id: 'althara-port-road',
      fromNodeId: 'althara-hub',
      toNodeId: 'althara-port-node',
      mode: 'LAND',
      path: shape([30_000, 8_300], [29_000, 8_200], [28_000, 8_500]),
    },
    {
      id: 'southern-river-road',
      fromNodeId: 'lioran-hub',
      toNodeId: 'myrren-hub',
      mode: 'LAND',
      path: shape([12_000, 12_800], [13_200, 12_300], [14_500, 12_700]),
    },
    {
      id: 'southern-crescent-road',
      fromNodeId: 'myrren-hub',
      toNodeId: 'sablec-hub',
      mode: 'LAND',
      path: shape([14_500, 12_700], [15_700, 13_200], [16_500, 14_000]),
    },
    {
      id: 'lioran-port-road',
      fromNodeId: 'lioran-hub',
      toNodeId: 'lioran-port-node',
      mode: 'LAND',
      path: shape([12_000, 12_800], [11_200, 12_300], [10_600, 11_800]),
    },
    {
      id: 'crescent-current',
      fromNodeId: 'caldria-port-node',
      toNodeId: 'lioran-port-node',
      mode: 'SEA',
      path: shape([3_000, 7_800], [7_000, 10_300], [10_600, 11_800]),
    },
    {
      id: 'inner-sea-lane',
      fromNodeId: 'tarrin-port-node',
      toNodeId: 'ilyra-port-node',
      mode: 'SEA',
      requiredPassageFeatureIds: ['windglass-passage'],
      path: shape(
        [12_500, 5_900],
        [11_600, 7_900],
        [14_500, 8_300],
        [18_000, 8_200],
        [20_500, 7_200],
        [20_800, 7_200],
        [21_000, 6_100],
      ),
    },
    {
      id: 'tidegate-sea-lane',
      fromNodeId: 'pelen-port-node',
      toNodeId: 'althara-port-node',
      mode: 'SEA',
      requiredPassageFeatureIds: ['tidegate-strait'],
      path: shape(
        [26_000, 6_900],
        [26_300, 6_900],
        [27_300, 7_300],
        [28_000, 8_500],
      ),
    },
    {
      id: 'southern-open-lane',
      fromNodeId: 'althara-port-node',
      toNodeId: 'lioran-port-node',
      mode: 'SEA',
      requiredPassageFeatureIds: ['bastion-south-gate'],
      path: shape(
        [28_000, 8_500],
        [29_000, 9_100],
        [29_500, 10_500],
        [26_000, 11_800],
        [25_300, 12_800],
        [24_000, 13_000],
        [22_600, 13_200],
        [20_200, 14_500],
        [18_400, 15_800],
        [15_500, 16_500],
        [11_000, 15_700],
        [9_400, 14_000],
        [9_100, 13_500],
        [10_600, 11_800],
      ),
    },
  ],
};
