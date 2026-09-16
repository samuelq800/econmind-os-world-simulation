import {
  isFinitePoint,
  polygonAreaKm2,
  polygonCentroid,
  pointInPolygon,
  polylineDistanceKm,
  samplePolyline,
} from './geometry.js';
import type {
  AtlasPoint,
  AtlasResourceTag,
  AtlasTectonicGroup,
  AtlasThermalClass,
  FictionalAtlas,
  MeasuredRoute,
  TransportNode,
  TransportRoute,
} from './types.js';

const forbiddenEconomicResourceFields = new Set([
  'capacity',
  'output',
  'price',
  'probability',
  'quantity',
  'reserve',
  'stock',
  'yield',
]);

function indexById<T extends { id: string }>(
  items: readonly T[],
): Map<string, T> {
  const indexed = new Map<string, T>();
  for (const item of items) {
    if (indexed.has(item.id)) throw new Error(`Duplicate atlas ID: ${item.id}`);
    indexed.set(item.id, item);
  }
  return indexed;
}

function requireNode(
  nodeIndex: ReadonlyMap<string, TransportNode>,
  nodeId: string,
): TransportNode {
  const node = nodeIndex.get(nodeId);
  if (!node) throw new Error(`Unknown transport node: ${nodeId}`);
  return node;
}

function samePoint(left: AtlasPoint, right: AtlasPoint): boolean {
  return left.xKm === right.xKm && left.yKm === right.yKm;
}

function isLand(atlas: FictionalAtlas, point: AtlasPoint): boolean {
  return atlas.landmasses.some((landmass) =>
    pointInPolygon(point, landmass.polygon),
  );
}

function validateResourceTags(atlas: FictionalAtlas): void {
  const resourceCollections = [
    ...atlas.features.map((feature) => feature.resourceTags),
    ...atlas.landUseAreas.map((area) => area.resourceTags),
    ...atlas.visualTerritories.map((territory) => territory.resourceProfile),
  ];
  for (const resources of resourceCollections) {
    for (const resource of resources) {
      for (const field of Object.keys(resource)) {
        if (forbiddenEconomicResourceFields.has(field)) {
          throw new Error(
            `Display resource ${resource.kind} cannot carry economic field ${field}`,
          );
        }
      }
    }
  }
}

function hasPlausibleResourceOrigin(tag: AtlasResourceTag): boolean {
  return (
    (tag.kind === 'GRAIN' && tag.origin === 'ALLUVIAL_PLAIN') ||
    (tag.kind === 'COPPER' && tag.origin === 'COLLISION_OROGENY') ||
    (tag.kind === 'IRON_ORE' &&
      ['COLLISION_OROGENY', 'CRATONIC_SHIELD'].includes(tag.origin)) ||
    (tag.kind === 'URANIUM' && tag.origin === 'CRATONIC_SHIELD') ||
    (tag.kind === 'LITHIUM' && tag.origin === 'EVAPORITIC_BASIN') ||
    ((tag.kind === 'CRUDE_OIL' || tag.kind === 'NATURAL_GAS') &&
      tag.origin === 'SEDIMENTARY_BASIN')
  );
}

function geometryCentre(points: readonly AtlasPoint[]): AtlasPoint {
  if (points.length === 0) throw new Error('Mapped geography needs a geometry');
  return points.reduce(
    (centre, point) => ({
      xKm: centre.xKm + point.xKm / points.length,
      yKm: centre.yKm + point.yKm / points.length,
    }),
    { xKm: 0, yKm: 0 },
  );
}

function thermalClassAt(
  atlas: FictionalAtlas,
  point: AtlasPoint,
): AtlasThermalClass {
  const band = atlas.latitudeBands.find(
    (candidate) =>
      point.yKm >= candidate.northEdgeKm && point.yKm <= candidate.southEdgeKm,
  );
  if (!band) throw new Error('Mapped geography has no latitude band');
  return band.thermalClass;
}

function validateResourceRationale(
  atlas: FictionalAtlas,
  surfaceKind: string,
  geometry: readonly AtlasPoint[],
  tags: readonly AtlasResourceTag[],
): void {
  for (const tag of tags) {
    if (!hasPlausibleResourceOrigin(tag)) {
      throw new Error(
        `Resource ${tag.kind} has an invalid origin ${tag.origin}`,
      );
    }

    const validSurface =
      (tag.origin === 'ALLUVIAL_PLAIN' &&
        ['AGRICULTURAL_AREA', 'BASIN', 'DELTA', 'PLAIN', 'RIVER'].includes(
          surfaceKind,
        )) ||
      (tag.origin === 'COLLISION_OROGENY' &&
        ['MINERAL_AREA', 'MOUNTAIN_RANGE'].includes(surfaceKind)) ||
      (tag.origin === 'CRATONIC_SHIELD' &&
        ['HILL_COUNTRY', 'MOUNTAIN_RANGE'].includes(surfaceKind)) ||
      (tag.origin === 'EVAPORITIC_BASIN' &&
        ['BASIN', 'MINERAL_AREA'].includes(surfaceKind)) ||
      (tag.origin === 'SEDIMENTARY_BASIN' &&
        ['BASIN', 'MINERAL_AREA'].includes(surfaceKind));
    if (!validSurface) {
      throw new Error(
        `Resource ${tag.kind} is not plausible on ${surfaceKind} geography`,
      );
    }

    if (
      tag.kind === 'GRAIN' &&
      thermalClassAt(atlas, geometryCentre(geometry)) === 'COLD'
    ) {
      throw new Error('Mapped grainland cannot be in a cold latitude band');
    }
  }
}

function validatePointInExtent(atlas: FictionalAtlas, point: AtlasPoint): void {
  if (!isFinitePoint(point))
    throw new Error('Atlas coordinates must be finite');
  if (
    point.xKm < 0 ||
    point.xKm > atlas.widthKm ||
    point.yKm < 0 ||
    point.yKm > atlas.heightKm
  ) {
    throw new Error(
      'Atlas coordinates must stay inside the fictional map extent',
    );
  }
}

function validateRouteSurface(
  atlas: FictionalAtlas,
  route: TransportRoute,
): void {
  const samples = samplePolyline(route.path, 75);
  const endpointOffset = route.mode === 'SEA' ? 1 : 0;
  const inspected = samples.slice(
    endpointOffset,
    samples.length - endpointOffset,
  );

  for (const point of inspected) {
    const onLand = isLand(atlas, point);
    if (route.mode === 'LAND' && !onLand) {
      throw new Error(`Land route ${route.id} leaves fictional land`);
    }
    if (route.mode === 'SEA' && onLand) {
      throw new Error(
        `Sea route ${route.id} crosses fictional land at ${point.xKm},${point.yKm}`,
      );
    }
  }
}

function validateRequiredPassages(
  atlas: FictionalAtlas,
  route: TransportRoute,
): void {
  if (route.mode === 'LAND' && route.requiredPassageFeatureIds?.length) {
    throw new Error(`Land route ${route.id} cannot require a sea passage`);
  }
  const features = indexById(atlas.features);
  for (const passageId of route.requiredPassageFeatureIds ?? []) {
    const passage = features.get(passageId);
    if (!passage || passage.kind !== 'STRAIT') {
      throw new Error(
        `Route ${route.id} requires an unknown strait ${passageId}`,
      );
    }
    const passesFeature = route.path.some((routePoint) =>
      passage.geometry.some((featurePoint) =>
        samePoint(routePoint, featurePoint),
      ),
    );
    if (!passesFeature) {
      throw new Error(
        `Route ${route.id} does not traverse strait ${passageId}`,
      );
    }
  }
}

function validateTectonicGroup(
  landmasses: ReadonlyMap<string, FictionalAtlas['landmasses'][number]>,
  group: AtlasTectonicGroup,
): void {
  const continent = landmasses.get(group.continentalLandmassId);
  const satellite = landmasses.get(group.southeastSatelliteIslandId);
  if (!continent || continent.category !== 'CONTINENT') {
    throw new Error(`Tectonic group ${group.id} needs a continental plate`);
  }
  if (!satellite || satellite.category !== 'ISLAND') {
    throw new Error(`Tectonic group ${group.id} needs a satellite island`);
  }
  const continentCentre = polygonCentroid(continent.polygon);
  const satelliteCentre = polygonCentroid(satellite.polygon);
  if (
    satelliteCentre.xKm <= continentCentre.xKm ||
    satelliteCentre.yKm <= continentCentre.yKm
  ) {
    throw new Error(
      `Satellite island ${satellite.id} must lie south-east of its plate`,
    );
  }
  if (group.archipelagoLandmassIds.length > 3) {
    throw new Error(
      `Tectonic group ${group.id} has too many archipelago fragments`,
    );
  }
  for (const archipelagoId of group.archipelagoLandmassIds) {
    const fragment = landmasses.get(archipelagoId);
    if (!fragment || fragment.category !== 'ARCHIPELAGO_FRAGMENT') {
      throw new Error(`Unknown archipelago fragment ${archipelagoId}`);
    }
  }
}

export function measureRoute(
  atlas: FictionalAtlas,
  route: TransportRoute,
): MeasuredRoute {
  const nodes = indexById(atlas.nodes);
  const from = requireNode(nodes, route.fromNodeId);
  const to = requireNode(nodes, route.toNodeId);

  if (route.path.length < 2) {
    throw new Error(`Route ${route.id} has no measurable path`);
  }
  if (!samePoint(route.path[0]!, from.point)) {
    throw new Error(`Route ${route.id} does not begin at ${from.id}`);
  }
  if (!samePoint(route.path.at(-1)!, to.point)) {
    throw new Error(`Route ${route.id} does not end at ${to.id}`);
  }
  for (const point of route.path) validatePointInExtent(atlas, point);
  validateRouteSurface(atlas, route);
  validateRequiredPassages(atlas, route);

  return {
    routeId: route.id,
    mode: route.mode,
    fromNodeId: from.id,
    toNodeId: to.id,
    distanceKm: polylineDistanceKm(route.path, atlas.widthKm),
  };
}

export function validateFictionalAtlas(
  atlas: FictionalAtlas,
): readonly MeasuredRoute[] {
  if (atlas.crs !== 'FICTIONAL_ATLAS_KM_V1') {
    throw new Error(
      'Only the local FICTIONAL_ATLAS_KM_V1 coordinate system is allowed',
    );
  }
  if (
    !Number.isFinite(atlas.widthKm) ||
    !Number.isFinite(atlas.heightKm) ||
    atlas.widthKm <= 0 ||
    atlas.heightKm <= 0
  ) {
    throw new Error('Fictional atlas extent must be positive and finite');
  }
  if (atlas.wrapsHorizontally !== true) {
    throw new Error('Fictional atlas must wrap horizontally at its map edges');
  }

  indexById(atlas.landmasses);
  const landmasses = indexById(atlas.landmasses);
  const polities = indexById(atlas.polities);
  const visualTerritories = indexById(atlas.visualTerritories);
  indexById(atlas.features);
  indexById(atlas.cities);
  indexById(atlas.landUseAreas);
  indexById(atlas.infrastructure);
  indexById(atlas.nodes);
  indexById(atlas.routes);
  const tectonicGroups = indexById(atlas.tectonicGroups);
  validateResourceTags(atlas);

  if (visualTerritories.size !== 70) {
    throw new Error(
      'The visual atlas must contain exactly 70 display territories',
    );
  }

  for (const landmass of atlas.landmasses) {
    for (const point of landmass.polygon) validatePointInExtent(atlas, point);
  }
  for (const polity of atlas.polities) {
    for (const point of polity.polygon) validatePointInExtent(atlas, point);
  }
  for (const territory of atlas.visualTerritories) {
    for (const point of territory.polygon) validatePointInExtent(atlas, point);
    validatePointInExtent(atlas, territory.capital);
    if (!pointInPolygon(territory.capital, territory.polygon)) {
      throw new Error(
        `Visual territory ${territory.id} capital must remain in territory`,
      );
    }
    if (territory.boundaryForm === 'ISLAND_GROUP') {
      if (
        !territory.maritimeEnvelope ||
        (territory.displayIslandCount !== 1 &&
          territory.displayIslandCount !== 2)
      ) {
        throw new Error(
          `Island-group visual territory ${territory.id} needs a one-or-two-island sea envelope`,
        );
      }
      if (territory.landBoundaryRegion !== undefined) {
        throw new Error(
          `Island-group visual territory ${territory.id} cannot use a mainland boundary mask`,
        );
      }
    } else if (
      territory.maritimeEnvelope !== undefined ||
      territory.displayIslandCount !== undefined
    ) {
      throw new Error(
        `Non-island visual territory ${territory.id} cannot claim a display sea envelope`,
      );
    } else if (territory.landBoundaryRegion === undefined) {
      throw new Error(
        `Land visual territory ${territory.id} needs a coastline boundary mask`,
      );
    }
    if (territory.maritimeEnvelope) {
      for (const point of territory.maritimeEnvelope)
        validatePointInExtent(atlas, point);
      if (!pointInPolygon(territory.capital, territory.maritimeEnvelope)) {
        throw new Error(
          `Visual territory ${territory.id} sea envelope must contain its capital marker`,
        );
      }
    }
    for (const resource of territory.resourceProfile) {
      if (!hasPlausibleResourceOrigin(resource)) {
        throw new Error(
          `Visual territory ${territory.id} resource ${resource.kind} has an invalid origin`,
        );
      }
    }
  }
  for (const feature of atlas.features) {
    for (const point of feature.geometry) validatePointInExtent(atlas, point);
    validateResourceRationale(
      atlas,
      feature.kind,
      feature.geometry,
      feature.resourceTags,
    );
    if (
      (feature.kind === 'MOUNTAIN_RANGE' || feature.kind === 'SEISMIC_BELT') &&
      feature.collisionPlateIds?.length !== 2
    ) {
      throw new Error(`${feature.name} must name exactly two collision plates`);
    }
    if (
      feature.kind === 'INLAND_LAKE' &&
      polygonAreaKm2(feature.geometry) > 100_000
    ) {
      throw new Error(
        `Inland lake ${feature.name} exceeds the local-lake limit`,
      );
    }
  }
  for (const city of atlas.cities) {
    if (!polities.has(city.polityId))
      throw new Error(`Unknown city polity ${city.polityId}`);
    if (city.population !== 'UNASSIGNED_BY_V27') {
      throw new Error('Map preparation cannot set a city population');
    }
    validatePointInExtent(atlas, city.point);
  }
  for (const area of atlas.landUseAreas) {
    if (!polities.has(area.polityId))
      throw new Error(`Unknown land-use polity ${area.polityId}`);
    if (area.economicValue !== 'UNASSIGNED_BY_V27') {
      throw new Error('Map preparation cannot set an economic land-use value');
    }
    for (const point of area.geometry) validatePointInExtent(atlas, point);
    validateResourceRationale(
      atlas,
      area.kind,
      area.geometry,
      area.resourceTags,
    );
  }
  for (const infrastructure of atlas.infrastructure) {
    for (const polityId of infrastructure.polityIds) {
      if (!polities.has(polityId)) {
        throw new Error(`Unknown infrastructure polity ${polityId}`);
      }
    }
    for (const point of infrastructure.geometry)
      validatePointInExtent(atlas, point);
  }
  for (const node of atlas.nodes) {
    if (!polities.has(node.polityId))
      throw new Error(`Unknown node polity ${node.polityId}`);
    validatePointInExtent(atlas, node.point);
  }
  for (const polity of atlas.polities) {
    if (!atlas.cities.some((city) => city.polityId === polity.id)) {
      throw new Error(`Polity ${polity.id} needs a mapped city`);
    }
    if (!atlas.nodes.some((node) => node.polityId === polity.id)) {
      throw new Error(`Polity ${polity.id} needs a mapped transport node`);
    }
  }
  for (const area of atlas.landUseAreas) {
    const isLargeGrainland =
      area.kind === 'AGRICULTURAL_AREA' &&
      area.resourceTags.some((resource) => resource.kind === 'GRAIN') &&
      polygonAreaKm2(area.geometry) >= 1_000_000;
    if (
      isLargeGrainland &&
      atlas.nodes.some(
        (node) => node.polityId === area.polityId && node.kind === 'SEA_PORT',
      )
    ) {
      throw new Error(
        `Large grainland polity ${area.polityId} must have limited coast access`,
      );
    }
  }
  for (const group of tectonicGroups.values())
    validateTectonicGroup(landmasses, group);
  const sortedBands = [...atlas.latitudeBands].sort(
    (left, right) => left.northEdgeKm - right.northEdgeKm,
  );
  if (
    sortedBands[0]?.northEdgeKm !== 0 ||
    sortedBands.at(-1)?.southEdgeKm !== atlas.heightKm
  ) {
    throw new Error(
      'Latitude bands must cover the complete local atlas height',
    );
  }
  for (let index = 0; index < sortedBands.length; index += 1) {
    const band = sortedBands[index]!;
    if (band.northEdgeKm >= band.southEdgeKm) {
      throw new Error(`Latitude band ${band.id} must have positive width`);
    }
    if (index > 0 && sortedBands[index - 1]!.southEdgeKm !== band.northEdgeKm) {
      throw new Error('Latitude bands must be continuous');
    }
  }
  for (const current of atlas.oceanCurrents) {
    if (
      current.waterLayer !== 'SUBSURFACE' ||
      current.thermalClass !== 'WARM'
    ) {
      throw new Error(
        `Ocean current ${current.id} must remain a warm subsurface layer`,
      );
    }
    for (const point of current.geometry) validatePointInExtent(atlas, point);
  }

  return atlas.routes.map((route) => measureRoute(atlas, route));
}

export function formatDistanceKm(distanceKm: number): string {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error('Distance must be a non-negative finite kilometre value');
  }
  return `${Math.round(distanceKm).toLocaleString('en-US')} km`;
}
