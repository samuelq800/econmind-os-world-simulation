import partition from '../map-lab/land-partition.json';
import artwork from '../map-lab/atlas-layers.json';
import details from '../assets/country-detail/index.json';
import groups from '../assets/continent-scenes/index.json';
import { continentFor } from '../map-explorer/continent-layout.js';
import type {
  ExplorerCamera,
  ExplorerViewport,
} from '../map-explorer/viewport-camera.js';

export const publicFrame = [partition.width, partition.height] as const;
export const geographicArtwork = {
  physical: artwork.physical,
  climates: artwork.climates,
  currents: artwork.currents,
  routes: artwork.routes.map(({ id, path }) => ({ id, path })),
  nodes: artwork.nodes.map(({ id, kind, point }) => ({ id, kind, point })),
};
export const publicDetailMaps = details;
export const publicGroups = groups;
export type MapGroupId = 'northwest' | 'southwest' | 'central' | 'east';
export const countries = partition.territories.map((country, index) => {
  const name = artwork.political.countries[index]?.name;
  if (
    !name ||
    details[index]?.id !== country.id ||
    details[index]?.number !== country.number
  )
    throw new Error('PUBLIC_GEOGRAPHY_INDEX_MISMATCH');
  const coords = (
    country.path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? []
  ).map(Number);
  const xs = coords.filter((_, i) => i % 2 === 0),
    ys = coords.filter((_, i) => i % 2 === 1);
  return {
    id: country.id,
    number: country.number,
    name,
    path: country.path,
    label: country.label,
    landPixels: country.landPixels,
    group: continentFor(country.label) as MapGroupId,
    bounds: [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ] as const,
  };
});
export type PublicCountry = (typeof countries)[number];
export const publicResources = artwork.resources.filter(
  (resource) => resource.visibility === 'PUBLIC_SCENARIO_CANDIDATE',
);

export function filterCountries(query: string, group: string) {
  const text = query.trim().toLocaleLowerCase();
  return countries.filter(
    (country) =>
      (group === 'all' || country.group === group) &&
      (!text ||
        `${country.number} ${country.name}`.toLocaleLowerCase().includes(text)),
  );
}

export const layerKeys = [
  'terrain',
  'details',
  'borders',
  'water',
  'mountains',
  'resourcesLayer',
  'settlements',
  'climate',
  'currents',
  'routes',
] as const;
export type PreviewLayer = (typeof layerKeys)[number];
export type PreviewLayers = Record<PreviewLayer, boolean>;
export const initialLayers: PreviewLayers = {
  terrain: true,
  details: true,
  borders: true,
  water: true,
  mountains: false,
  resourcesLayer: false,
  settlements: false,
  climate: false,
  currents: false,
  routes: false,
};

/** Labels may disappear on collision; geometry and original positions never move. */
export function visibleCountryLabels(
  camera: ExplorerCamera,
  size: ExplorerViewport,
  selectedId: string,
  allowed: ReadonlySet<string>,
) {
  const height = (camera.width * size.height) / size.width;
  const left = camera.x - camera.width / 2,
    top = camera.y - height / 2;
  const boxes: { x: number; y: number }[] = [];
  return [...countries]
    .sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId))
    .filter((country) => {
      if (!allowed.has(country.id) && country.id !== selectedId) return false;
      const x = ((country.label[0]! - left) / camera.width) * size.width;
      const y = ((country.label[1]! - top) / height) * size.height;
      if (x < 12 || x > size.width - 12 || y < 10 || y > size.height - 10)
        return false;
      if (
        boxes.some(
          (box) => Math.abs(box.x - x) < 29 && Math.abs(box.y - y) < 23,
        )
      )
        return false;
      boxes.push({ x, y });
      return true;
    });
}
