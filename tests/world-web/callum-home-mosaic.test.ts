import detailMaps from '../../apps/world-web/src/assets/country-detail/index.json';
import { FICTIONAL_ATLAS } from '../../apps/world-web/src/map-lab/atlas.js';
import partition from '../../apps/world-web/src/map-lab/land-partition.json';
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
});
