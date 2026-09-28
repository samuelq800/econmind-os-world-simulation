import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  layoutLabels,
  overlaps,
} from '../../apps/world-web/src/map-explorer/label-layout.ts';
test('country overview labels do not cover one another, controls or facility targets', () => {
  for (const size of [
    { width: 605, height: 552 },
    { width: 1110, height: 932 },
  ]) {
    const reserved = [
      {
        x: 10,
        y: 10,
        width: Math.min(360, size.width * 0.65),
        height: size.width < 750 ? 190 : 270,
      },
      { x: size.width - 66, y: 8, width: 62, height: 170 },
    ];
    const points = [
      { id: 'port', x: size.width * 0.56, y: size.height * 0.64 },
      { id: 'hub', x: size.width * 0.4, y: size.height * 0.46 },
      { id: 'gas', x: size.width * 0.83, y: size.height * 0.51 },
    ];
    const placed = layoutLabels(points, size, reserved);
    for (const [i, a] of placed.entries()) {
      assert.ok(
        a.x >= 0 &&
          a.y >= 0 &&
          a.x + a.width <= size.width &&
          a.y + a.height <= size.height - 66,
      );
      for (const b of [...reserved, ...placed.slice(i + 1)])
        assert.ok(!overlaps(a, b), `overlap ${a.id} at ${size.width}`);
      for (const p of points)
        assert.ok(
          !overlaps(a, { x: p.x - 18, y: p.y - 18, width: 36, height: 36 }),
        );
    }
  }
});
test('labels retain exact anchors so leaders point to the facility, not the card', () => {
  const p = { id: 'mine', x: 215, y: 245 };
  const [placed] = layoutLabels([p], { width: 605, height: 552 }, []);
  assert.equal(placed.anchorX, p.x);
  assert.equal(placed.anchorY, p.y);
  assert.equal(placed.id, p.id);
});
