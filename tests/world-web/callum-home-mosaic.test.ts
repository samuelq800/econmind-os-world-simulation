import detailMaps from '../../apps/world-web/src/assets/country-detail/index.json';
import continentScenes from '../../apps/world-web/src/assets/continent-scenes/index.json';
import { continentFor } from '../../apps/world-web/src/map-explorer/continent-layout.js';
import { FICTIONAL_ATLAS } from '../../apps/world-web/src/map-lab/atlas.js';
import partition from '../../apps/world-web/src/map-lab/land-partition.json';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function area(points: readonly { xKm: number; yKm: number }[]) {
  return (
    Math.abs(
      points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length]!;
        return sum + point.xKm * next.yKm - next.xKm * point.yKm;
      }, 0),
    ) / 2
  );
}

describe('Callum Island and the 70-country home mosaic', () => {
  it('names the largest prepared island Callum Island', () => {
    const islands = FICTIONAL_ATLAS.landmasses.filter(
      (landmass) => landmass.category === 'ISLAND',
    );
    const largest = [...islands].sort(
      (left, right) => area(right.polygon) - area(left.polygon),
    )[0];
    expect(largest?.id).toBe('western-drift-island');
    expect(largest?.name).toBe('Callum Island');
  });

  it('has one georeferenced high-detail map for every display country', () => {
    expect(detailMaps).toHaveLength(70);
    expect(new Set(detailMaps.map((map) => map.id)).size).toBe(70);
    expect(new Set(partition.territories.map((item) => item.id))).toEqual(
      new Set(detailMaps.map((map) => map.id)),
    );
    for (const map of detailMaps) {
      const territory = partition.territories.find(
        (item) => item.id === map.id,
      )!;
      const [x, y, width, height] = map.viewBox;
      expect(x).toBeLessThanOrEqual(territory.label[0]);
      expect(y).toBeLessThanOrEqual(territory.label[1]);
      expect(x + width).toBeGreaterThanOrEqual(territory.label[0]);
      expect(y + height).toBeGreaterThanOrEqual(territory.label[1]);
    }
  });

  it('uses all four original continent scenes without dropping a country', () => {
    const sceneIds = new Set(continentScenes.map((scene) => scene.id));
    expect(sceneIds).toEqual(
      new Set(['northwest', 'southwest', 'central', 'east']),
    );
    expect(partition.territories).toHaveLength(70);
    for (const territory of partition.territories) {
      expect(sceneIds.has(continentFor(territory.label))).toBe(true);
    }
    for (const scene of continentScenes) {
      const png = readFileSync(
        `apps/world-web/src/assets/continent-scenes/${scene.file}`,
      );
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png.readUInt32BE(16)).toBe(1536);
      expect(png.readUInt32BE(20)).toBe(1024);
    }
  });
});
