import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { facilityHitGroups } from '../../apps/world-web/src/map-explorer/WorldExplorer.js';

const country = JSON.parse(
  readFileSync(
    'apps/world-web/public/season1-immersive/countries/data/58.json',
    'utf8',
  ),
) as { facilities: { id: string; point: readonly number[] }[] };

it.each([320, 390, 1440])(
  'keeps coincident SF255 and OPEN-RES11 selectable by exact ID at %spx without moving a source point',
  (width) => {
    const sites = country.facilities;
    const before = structuredClone(sites);
    const box = { x: 600, y: 400, width: 400, height: 300 };
    const size = { width, height: width * 0.75 };
    const groups = facilityHitGroups(sites, box, size);
    const collision = groups.find((g) => g.ids.includes('SF255'))!;
    expect(collision.ids).toContain('OPEN-RES11');
    expect(groups.filter((g) => g.ids.includes('SF255'))).toHaveLength(1);
    expect(groups.filter((g) => g.ids.includes('OPEN-RES11'))).toHaveLength(1);
    expect(groups.flatMap((g) => g.ids).sort()).toEqual(
      sites
        .filter(
          (s) =>
            s.point[0]! > 600 &&
            s.point[0]! < 1000 &&
            s.point[1]! > 400 &&
            s.point[1]! < 700,
        )
        .map((s) => s.id)
        .sort(),
    );
    for (const g of groups) {
      const source = sites.find((s) => s.id === g.id)!;
      expect(g.x).toBe(((source.point[0]! - box.x) / box.width) * size.width);
      expect(g.y).toBe(((source.point[1]! - box.y) / box.height) * size.height);
      for (const other of groups.filter((o) => o !== g))
        expect(Math.hypot(g.x - other.x, g.y - other.y)).toBeGreaterThanOrEqual(
          37,
        );
    }
    expect(sites).toEqual(before);
  },
);
