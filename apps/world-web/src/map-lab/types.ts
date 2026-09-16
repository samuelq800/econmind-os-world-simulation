/**
 * A deliberately local metric coordinate system. It is not WGS84, not a
 * projection of Earth, and must never be joined to a production World ID.
 */
export const FICTIONAL_ATLAS_CRS = 'FICTIONAL_ATLAS_KM_V1' as const;

export type AtlasPoint = Readonly<{ xKm: number; yKm: number }>;

export type AtlasPolygon = readonly AtlasPoint[];

export type AtlasResourceKind =
  | 'COPPER'
  | 'CRUDE_OIL'
  | 'GRAIN'
  | 'IRON_ORE'
  | 'LITHIUM'
  | 'NATURAL_GAS'
  | 'URANIUM';

export type AtlasResourceOrigin =
  | 'ALLUVIAL_PLAIN'
  | 'COLLISION_OROGENY'
  | 'CRATONIC_SHIELD'
  | 'EVAPORITIC_BASIN'
  | 'SEDIMENTARY_BASIN';

/**
 * Display metadata only. Deliberately no reserve, capacity, price, stock,
 * output, yield, probability or other economic quantity belongs here.
 */
export type AtlasResourceTag = Readonly<{
  kind: AtlasResourceKind;
  label: string;
  origin: AtlasResourceOrigin;
}>;

/** A required future seed value, intentionally not a fabricated number. */
export const UNASSIGNED_BY_V27 = 'UNASSIGNED_BY_V27' as const;

export type UnassignedByV27 = typeof UNASSIGNED_BY_V27;

export type AtlasLandmass = Readonly<{
  id: string;
  name: string;
  category: 'ARCHIPELAGO_FRAGMENT' | 'CONTINENT' | 'ISLAND';
  polygon: AtlasPolygon;
}>;

export type FictionalPolity = Readonly<{
  id: string;
  name: string;
  polygon: AtlasPolygon;
  color: string;
}>;

/**
 * A territorial drawing and its capital marker. This is intentionally not a
 * V27 country record: it has no World ID, population, Government or economy.
 */
export type AtlasVisualTerritory = Readonly<{
  id: string;
  name: string;
  /** A display boundary category, never a V27 sovereignty classification. */
  boundaryForm: 'COASTAL' | 'INLAND' | 'ISLAND_GROUP';
  polygon: AtlasPolygon;
  capital: AtlasPoint;
  color: string;
  /**
   * Optional visual sea envelope around one or two named display islands.
   * It does not establish a legal maritime claim, EEZ or country record.
   */
  maritimeEnvelope?: AtlasPolygon;
  displayIslandCount?: 1 | 2;
  /** Display-only geology/climate rationale with no quantity or capacity. */
  resourceProfile: readonly AtlasResourceTag[];
}>;

export type AtlasCity = Readonly<{
  id: string;
  polityId: string;
  name: string;
  point: AtlasPoint;
  population: UnassignedByV27;
}>;

export type AtlasLandUseKind = 'AGRICULTURAL_AREA' | 'MINERAL_AREA';

export type AtlasLandUseArea = Readonly<{
  id: string;
  polityId: string;
  kind: AtlasLandUseKind;
  name: string;
  geometry: AtlasPolygon;
  resourceTags: readonly AtlasResourceTag[];
  economicValue: UnassignedByV27;
}>;

export type AtlasFeatureKind =
  | 'BASIN'
  | 'DELTA'
  | 'HILL_COUNTRY'
  | 'INLAND_LAKE'
  | 'MOUNTAIN_RANGE'
  | 'PLAIN'
  | 'RIVER'
  | 'SEISMIC_BELT'
  | 'STEPPE'
  | 'STRAIT';

export type AtlasFeature = Readonly<{
  id: string;
  kind: AtlasFeatureKind;
  name: string;
  /** A polygon for a basin, or a polyline for mountains and straits. */
  geometry: readonly AtlasPoint[];
  /** Present only for a mountain range drawn at a plate-collision belt. */
  collisionPlateIds?: readonly string[];
  resourceTags: readonly AtlasResourceTag[];
}>;

export type AtlasThermalClass = 'COLD' | 'COOL' | 'TEMPERATE' | 'WARM';

export type AtlasLatitudeBand = Readonly<{
  id: string;
  name: string;
  northEdgeKm: number;
  southEdgeKm: number;
  thermalClass: AtlasThermalClass;
}>;

export type AtlasOceanCurrent = Readonly<{
  id: string;
  name: string;
  geometry: readonly AtlasPoint[];
  waterLayer: 'SUBSURFACE';
  thermalClass: 'WARM';
}>;

export type TransportNodeKind = 'LAND_HUB' | 'SEA_PORT';

export type TransportNode = Readonly<{
  id: string;
  polityId: string;
  name: string;
  kind: TransportNodeKind;
  point: AtlasPoint;
}>;

export type TransportMode = 'LAND' | 'SEA';

export type InfrastructureKind =
  | 'BRIDGE_TUNNEL'
  | 'ENERGY_COMPLEX'
  | 'FACTORY'
  | 'FARM_COMPLEX'
  | 'LOGISTICS_HUB'
  | 'MOUNTAIN_PASS'
  | 'MINING_COMPLEX'
  | 'PIPELINE'
  | 'PORT'
  | 'RAIL_CORRIDOR'
  | 'REFINERY';

/**
 * Rendering-only infrastructure. `geometry` is a point or a line; its
 * presence says nothing about construction, ownership, capacity or operation.
 */
export type AtlasInfrastructure = Readonly<{
  id: string;
  kind: InfrastructureKind;
  name: string;
  polityIds: readonly string[];
  geometry: readonly AtlasPoint[];
}>;

/** A visual tectonic relation, not a geological or economic simulation. */
export type AtlasTectonicGroup = Readonly<{
  id: string;
  continentalLandmassId: string;
  southeastSatelliteIslandId: string;
  archipelagoLandmassIds: readonly string[];
}>;

export type TransportRoute = Readonly<{
  id: string;
  fromNodeId: string;
  toNodeId: string;
  mode: TransportMode;
  /** Named display-only straits that this prepared sea centre line traverses. */
  requiredPassageFeatureIds?: readonly string[];
  /** The exactly measured centre line in FICTIONAL_ATLAS_KM_V1 coordinates. */
  path: readonly AtlasPoint[];
}>;

export type FictionalAtlas = Readonly<{
  crs: typeof FICTIONAL_ATLAS_CRS;
  widthKm: number;
  heightKm: number;
  /** The west and east borders meet at the same fictional meridian. */
  wrapsHorizontally: true;
  landmasses: readonly AtlasLandmass[];
  tectonicGroups: readonly AtlasTectonicGroup[];
  polities: readonly FictionalPolity[];
  visualTerritories: readonly AtlasVisualTerritory[];
  cities: readonly AtlasCity[];
  landUseAreas: readonly AtlasLandUseArea[];
  latitudeBands: readonly AtlasLatitudeBand[];
  oceanCurrents: readonly AtlasOceanCurrent[];
  features: readonly AtlasFeature[];
  infrastructure: readonly AtlasInfrastructure[];
  nodes: readonly TransportNode[];
  routes: readonly TransportRoute[];
}>;

export type MeasuredRoute = Readonly<{
  routeId: string;
  mode: TransportMode;
  fromNodeId: string;
  toNodeId: string;
  distanceKm: number;
}>;
