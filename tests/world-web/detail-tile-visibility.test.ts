import {
  DETAIL_TILE_SCALE_KM,
  shouldMountDetailTile,
} from '../../apps/world-web/src/map-explorer/detail-tile-visibility.js';
import { describe, expect, it } from 'vitest';

const territory = [400, 300, 550, 470] as const;

describe('country detail tile loading', () => {
  it('shows the four-continent global overview without eager SVG requests', () => {
    expect(
      shouldMountDetailTile(
        { x: 0, y: 0, width: 1900, height: 1000 },
        territory,
        false,
      ),
    ).toBe(false);
    expect(DETAIL_TILE_SCALE_KM).toBeLessThan(700);
  });

  it('mounts original high-detail SVGs at close zoom or explicit art-off mode', () => {
    expect(
      shouldMountDetailTile(
        { x: 200, y: 200, width: 600, height: 400 },
        territory,
        false,
      ),
    ).toBe(true);
    expect(
      shouldMountDetailTile(
        { x: 0, y: 0, width: 1900, height: 1000 },
        territory,
        true,
      ),
    ).toBe(true);
  });

  it('does not request off-screen countries and prefetches a narrow edge', () => {
    const view = { x: 0, y: 0, width: 600, height: 500 };
    expect(shouldMountDetailTile(view, [700, 100, 740, 180], false)).toBe(
      false,
    );
    expect(shouldMountDetailTile(view, [620, 100, 660, 180], false)).toBe(true);
  });
});
